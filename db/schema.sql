-- =============================================================================
-- Newton School of Technology - Faculty Onboarding Portal
-- CANONICAL DATABASE SCHEMA (idempotent full snapshot)
--
-- This file is the single source of truth for the schema. It supersedes every
-- other *.sql file in this repo (see db/legacy/ and db/README.md). It is safe
-- to run, in full, against:
--   (a) a brand-new/empty Supabase project, or
--   (b) an existing project that already ran any earlier ad-hoc migration.
-- Every DDL statement is guarded (CREATE ... IF NOT EXISTS / DROP ... IF EXISTS
-- before CREATE / ADD CONSTRAINT after the owning table exists), so re-running
-- this file is always safe and always converges to the same end state.
--
-- HOW TO APPLY
--   1. Prefer the ordered migrations in supabase/migrations/ via the Supabase
--      CLI (`supabase db push`) for a real project — that gives you migration
--      history tracking. This file exists as:
--        - the fast path for a throwaway/local Postgres or the SQL editor, and
--        - the definitive "what does the schema look like" reference.
--   2. If applying this file directly: paste the ENTIRE file into the Supabase
--      SQL editor (or `psql -f db/schema.sql`) and run it once. Re-running is
--      safe and is how you pick up schema changes going forward.
--   3. Optional seed data (never required, never run against production):
--        db/create_32_users.sql, db/__setup_test_data.sql,
--        db/seed_worksheets.sql, db/seed_ftp_worksheets.sql
--      See db/README.md for details and ordering.
--   4. See db/legacy/ for every superseded ad-hoc script this file replaces —
--      they are kept only for historical reference and MUST NOT be run against
--      any environment this file has already been applied to.
--
-- SECURITY MODEL (see docs/audit/2026-07-10 for the full audit this fixes)
--   - Role of record lives in user_profiles.role AND auth.users.app_metadata.
--     auth.users.user_metadata (client-writable) is NEVER trusted for authz.
--   - get_user_role() resolves role from app_metadata ONLY.
--   - A trigger keeps app_metadata.role in sync with user_profiles.role any
--     time the row is inserted or its role column changes.
--   - The worksheet review state machine (pending_review -> buddy_approved ->
--     approved, with needs_revision/revision_submitted side branches) is
--     enforced in Postgres by a BEFORE UPDATE trigger, not just by RLS.
--   - Promotion to lead_instructor happens only through the SECURITY DEFINER
--     RPC promote_user_if_eligible(), which acts only on auth.uid() (never on
--     behalf of another session).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- 1. TRIGGER FUNCTION (auto-update updated_at)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- =============================================================================
-- 2. TABLES (columns only — constraints, FKs, indexes, RLS all added below so
--    this section is identical whether the table is being created fresh or
--    already exists)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  role TEXT DEFAULT 'new_joinee',
  department TEXT,
  assigned_lead_id UUID,
  assigned_buddy_id UUID,
  start_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- H23: due dates derive from start_date (falls back to created_at for
-- existing rows created before this column existed).
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE public.user_profiles ALTER COLUMN start_date SET DEFAULT NOW();
UPDATE public.user_profiles SET start_date = created_at::date WHERE start_date IS NULL;

CREATE TABLE IF NOT EXISTS public.onboarding_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  new_instructor_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phase1_completed BOOLEAN DEFAULT FALSE,
  phase2_completed BOOLEAN DEFAULT FALSE,
  phase3_completed BOOLEAN DEFAULT FALSE,
  phase1_data JSONB DEFAULT '{}',
  phase2_data JSONB DEFAULT '{}',
  phase3_data JSONB DEFAULT '{}',
  assessment_level TEXT,
  assessment_data JSONB DEFAULT '{}',
  overall_status TEXT DEFAULT 'not_started',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.worksheet_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  worksheet_id TEXT NOT NULL,
  worksheet_data JSONB DEFAULT '{}',
  phase TEXT NOT NULL,
  status TEXT DEFAULT 'Not Started',

  -- Review workflow state machine (enforced by validate_review_transition()):
  --   ''                   -> Not submitted / In Progress
  --   'pending_review'     -> Submitted, awaiting buddy review
  --   'buddy_approved'     -> Buddy approved; awaiting manager phase approval
  --   'needs_revision'     -> Reviewer requested changes
  --   'revision_submitted' -> Instructor resubmitted after revision
  --   'approved'           -> Manager approved (terminal state)
  review_status TEXT DEFAULT '',

  -- Which reviewer track this worksheet nominally belongs to. Informational /
  -- used for dashboard filtering — the actual approval workflow is the
  -- universal buddy -> manager pipeline enforced by validate_review_transition().
  reviewer_type TEXT DEFAULT 'manager',

  -- Reviewer metadata — server-authoritative; see validate_review_transition().
  reviewed_by UUID,
  reviewer_name TEXT,
  review_comment TEXT,
  reviewed_at TIMESTAMPTZ,

  -- Append-only review history timeline — written only by
  -- validate_review_transition(), never trusted from the client.
  review_history JSONB DEFAULT '[]'::jsonb,

  due_date DATE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- One submission per user per worksheet (enables upsert).
ALTER TABLE public.worksheet_submissions ADD COLUMN IF NOT EXISTS reviewer_name TEXT;
ALTER TABLE public.worksheet_submissions ADD COLUMN IF NOT EXISTS review_history JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.worksheet_submissions ADD COLUMN IF NOT EXISTS due_date DATE;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'worksheet_submissions_user_id_worksheet_id_key'
  ) THEN
    ALTER TABLE public.worksheet_submissions
      ADD CONSTRAINT worksheet_submissions_user_id_worksheet_id_key UNIQUE (user_id, worksheet_id);
  END IF;
END $$;

-- H09: single canonical notifications table. Its CHECK (added in section 4)
-- is the union of every type ever written by app code or DB functions —
-- superseding the two conflicting ad-hoc definitions this replaces.
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  from_user_id UUID,
  worksheet_id TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'submitted',
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notifications ALTER COLUMN user_id SET NOT NULL;


-- =============================================================================
-- 3. FOREIGN KEYS (H11 — explicit ON DELETE rules on every FK)
--    CASCADE for user-owned rows, SET NULL for reference-only columns.
--    Named explicitly and re-created idempotently so this section converges
--    regardless of whether the table was just created or already existed.
-- =============================================================================

ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_id_fkey;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_assigned_lead_id_fkey;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_assigned_lead_id_fkey
  FOREIGN KEY (assigned_lead_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_assigned_buddy_id_fkey;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_assigned_buddy_id_fkey
  FOREIGN KEY (assigned_buddy_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.onboarding_submissions DROP CONSTRAINT IF EXISTS onboarding_submissions_user_id_fkey;
ALTER TABLE public.onboarding_submissions
  ADD CONSTRAINT onboarding_submissions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.worksheet_submissions DROP CONSTRAINT IF EXISTS worksheet_submissions_user_id_fkey;
ALTER TABLE public.worksheet_submissions
  ADD CONSTRAINT worksheet_submissions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.worksheet_submissions DROP CONSTRAINT IF EXISTS worksheet_submissions_reviewed_by_fkey;
ALTER TABLE public.worksheet_submissions
  ADD CONSTRAINT worksheet_submissions_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_from_user_id_fkey;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_from_user_id_fkey
  FOREIGN KEY (from_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


-- =============================================================================
-- 4. CHECK CONSTRAINTS (H08 — explicitly (re)added after the owning table is
--    guaranteed to exist; safe to re-run; this is how you change an allowed
--    value set going forward)
-- =============================================================================

ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('new_joinee', 'lab_instructor', 'lead_instructor', 'academic_head', 'onboarding_lead', 'acad_ops'));

ALTER TABLE public.onboarding_submissions DROP CONSTRAINT IF EXISTS onboarding_submissions_assessment_level_check;
ALTER TABLE public.onboarding_submissions
  ADD CONSTRAINT onboarding_submissions_assessment_level_check
  CHECK (assessment_level IN ('fully_independent', 'needs_minor_support', 'needs_development') OR assessment_level IS NULL);

ALTER TABLE public.onboarding_submissions DROP CONSTRAINT IF EXISTS onboarding_submissions_overall_status_check;
ALTER TABLE public.onboarding_submissions
  ADD CONSTRAINT onboarding_submissions_overall_status_check
  CHECK (overall_status IN ('not_started', 'phase1_complete', 'phase2_complete', 'phase3_complete', 'assessed'));

ALTER TABLE public.worksheet_submissions DROP CONSTRAINT IF EXISTS worksheet_submissions_review_status_check;
ALTER TABLE public.worksheet_submissions
  ADD CONSTRAINT worksheet_submissions_review_status_check
  CHECK (review_status IN ('', 'pending_review', 'buddy_approved', 'needs_revision', 'revision_submitted', 'approved'));

ALTER TABLE public.worksheet_submissions DROP CONSTRAINT IF EXISTS worksheet_submissions_reviewer_type_check;
ALTER TABLE public.worksheet_submissions
  ADD CONSTRAINT worksheet_submissions_reviewer_type_check
  CHECK (reviewer_type IN ('buddy', 'manager', 'onboarding_lead'));

-- H09: union of every type written anywhere (app code + due-date cron function).
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'submitted', 'revision_submitted', 'approved', 'buddy_approved',
    'needs_revision', 'phase_approved', 'promoted', 'due_soon', 'overdue'
  ));


-- =============================================================================
-- 5. INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_onboarding_email       ON public.onboarding_submissions (email);
CREATE INDEX IF NOT EXISTS idx_onboarding_status       ON public.onboarding_submissions (overall_status);

CREATE INDEX IF NOT EXISTS idx_worksheets_user               ON public.worksheet_submissions (user_id);
CREATE INDEX IF NOT EXISTS idx_worksheets_id                 ON public.worksheet_submissions (worksheet_id);
CREATE INDEX IF NOT EXISTS idx_worksheets_review             ON public.worksheet_submissions (review_status);
CREATE INDEX IF NOT EXISTS idx_worksheets_reviewer_type       ON public.worksheet_submissions (reviewer_type);

CREATE INDEX IF NOT EXISTS idx_profiles_role           ON public.user_profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_lead           ON public.user_profiles (assigned_lead_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_assigned_buddy ON public.user_profiles (assigned_buddy_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id   ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read  ON public.notifications (user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created    ON public.notifications (created_at DESC);


-- =============================================================================
-- 6. AUTO-UPDATE updated_at TRIGGERS
-- =============================================================================

DROP TRIGGER IF EXISTS update_onboarding_submissions_updated_at ON public.onboarding_submissions;
CREATE TRIGGER update_onboarding_submissions_updated_at
  BEFORE UPDATE ON public.onboarding_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_worksheet_submissions_updated_at ON public.worksheet_submissions;
CREATE TRIGGER update_worksheet_submissions_updated_at
  BEFORE UPDATE ON public.worksheet_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =============================================================================
-- 7. ROLE RESOLUTION (C04/H12/H14 — app_metadata ONLY, no user_metadata
--    fallback) + keeping app_metadata in sync with user_profiles.role
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''), '');
$$;

-- H12: one-time (and self-healing on every re-run) backfill copying the
-- authoritative user_profiles.role into app_metadata for every existing user.
-- Safe to re-run: only touches rows where the two are out of sync.
UPDATE auth.users u
SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', up.role)
FROM public.user_profiles up
WHERE up.id = u.id
  AND (u.raw_app_meta_data ->> 'role') IS DISTINCT FROM up.role;

-- Keep app_metadata.role in lockstep with user_profiles.role going forward,
-- for ANY path that changes it (admin reassignment, the promote RPC, seeds).
CREATE OR REPLACE FUNCTION public.sync_role_to_app_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.role IS DISTINCT FROM OLD.role THEN
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', NEW.role)
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_role_to_app_metadata ON public.user_profiles;
CREATE TRIGGER sync_role_to_app_metadata
  AFTER INSERT OR UPDATE OF role ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_role_to_app_metadata();


-- =============================================================================
-- 8. SIGNUP — role is always server-forced to 'new_joinee' (H01/H05/H14)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    'new_joinee'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- =============================================================================
-- 9. REVIEW STATE MACHINE (C02/H03/H04/H13/H15/H24) + server-authoritative
--    review_history (contract item 4)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.validate_review_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  actor_role text;
  is_owner boolean;
  status_changed boolean;
  actor_name text;
BEGIN
  -- Trusted server-side contexts (service_role / SQL editor / seed scripts)
  -- have no JWT and therefore no auth.uid(); let them through unchanged so
  -- seeding and admin operations are not blocked by this trigger.
  IF actor IS NULL THEN
    RETURN NEW;
  END IF;

  actor_role := public.get_user_role();
  is_owner := (actor = OLD.user_id);
  status_changed := (NEW.review_status IS DISTINCT FROM OLD.review_status);

  -- H15: the row owner can never rewrite reviewer-identity columns, no matter
  -- what the client sends (autosave upserts, forged form-state keys, etc).
  IF is_owner THEN
    NEW.reviewed_by := OLD.reviewed_by;
    NEW.reviewed_at := OLD.reviewed_at;
    NEW.reviewer_name := OLD.reviewer_name;
  END IF;

  -- review_history is append-only and server-written. Never trust the
  -- client's copy — always start from what is already persisted.
  NEW.review_history := OLD.review_history;

  IF NOT status_changed THEN
    RETURN NEW;
  END IF;

  IF is_owner THEN
    -- C02/H13/H24: once a reviewer has acted (buddy_approved/approved), the
    -- owner can never mutate review_status again — not even to '' or
    -- 'pending_review', both otherwise-legal owner values.
    IF OLD.review_status IN ('buddy_approved', 'approved') THEN
      RAISE EXCEPTION 'This worksheet has already been reviewed and can no longer be changed by its owner';
    END IF;
    -- Otherwise the owner may only ever move within {'', 'pending_review',
    -- 'revision_submitted'} — reviewer-only states can never be freshly set
    -- by the owner. This is the sole enforcement of that value set: RLS's
    -- WITH CHECK deliberately does not duplicate it (see "Update own
    -- submissions" — a self-correlated subquery there would trip Postgres's
    -- RLS infinite-recursion guard).
    IF NEW.review_status NOT IN ('', 'pending_review', 'revision_submitted') THEN
      RAISE EXCEPTION 'Illegal review_status transition % -> % for the submission owner', OLD.review_status, NEW.review_status;
    END IF;
    RETURN NEW;
  END IF;

  -- Reviewer-initiated transition. WHO may act on this specific row (buddy
  -- assigned to this joinee vs. their manager) is scoped by RLS; this trigger
  -- enforces WHICH transitions that role is allowed to make.
  IF actor_role = 'lead_instructor' THEN
    IF NOT (
      (OLD.review_status IN ('pending_review', 'revision_submitted') AND NEW.review_status = 'buddy_approved')
      OR (OLD.review_status IN ('pending_review', 'revision_submitted', 'buddy_approved') AND NEW.review_status = 'needs_revision')
    ) THEN
      RAISE EXCEPTION 'Illegal review_status transition % -> % for a buddy reviewer', OLD.review_status, NEW.review_status;
    END IF;
  ELSIF actor_role = 'academic_head' THEN
    IF NOT (OLD.review_status = 'buddy_approved' AND NEW.review_status = 'approved') THEN
      RAISE EXCEPTION 'Illegal review_status transition % -> % for a manager reviewer', OLD.review_status, NEW.review_status;
    END IF;
  ELSE
    -- H03/H24: onboarding_lead (and every other role) is SELECT-only and has
    -- no RLS UPDATE policy at all, so reaching here would mean RLS itself
    -- regressed. Fail closed regardless.
    RAISE EXCEPTION 'Role % is not permitted to change review_status', actor_role;
  END IF;

  actor_name := COALESCE(nullif(NEW.reviewer_name, ''), actor_role);
  NEW.review_history := OLD.review_history || jsonb_build_array(jsonb_build_object(
    'action', NEW.review_status,
    'reviewer_name', actor_name,
    'reviewer_id', actor::text,
    'comment', NEW.review_comment,
    'timestamp', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_review_transition ON public.worksheet_submissions;
CREATE TRIGGER validate_review_transition
  BEFORE UPDATE ON public.worksheet_submissions
  FOR EACH ROW EXECUTE FUNCTION public.validate_review_transition();


-- =============================================================================
-- 10. SERVER-SIDE NOTIFICATIONS (H22 + contract item 5) — clients no longer
--     need to (and per the contract, must not) insert submission/signup
--     notifications; the DB creates them directly, bypassing RLS via
--     SECURITY DEFINER, so they can never be blocked or forged by the client.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_reviewer_on_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  reviewer_ids uuid[];
  rid uuid;
  joinee_name text;
BEGIN
  IF NEW.review_status NOT IN ('pending_review', 'revision_submitted') THEN
    RETURN NEW;
  END IF;
  -- Only notify on the actual transition INTO these states, not on every
  -- subsequent autosave that merely re-persists the same review_status.
  IF TG_OP = 'UPDATE' AND OLD.review_status = NEW.review_status THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO joinee_name FROM public.user_profiles WHERE id = NEW.user_id;

  IF NEW.reviewer_type = 'manager' THEN
    SELECT array_remove(array_agg(assigned_lead_id), NULL) INTO reviewer_ids
    FROM public.user_profiles WHERE id = NEW.user_id;
    IF reviewer_ids IS NULL OR array_length(reviewer_ids, 1) IS NULL THEN
      SELECT array_agg(id) INTO reviewer_ids FROM public.user_profiles WHERE role = 'academic_head';
    END IF;
  ELSIF NEW.reviewer_type = 'onboarding_lead' THEN
    SELECT array_agg(id) INTO reviewer_ids FROM public.user_profiles WHERE role = 'onboarding_lead';
  ELSE
    SELECT array_remove(array_agg(assigned_buddy_id), NULL) INTO reviewer_ids
    FROM public.user_profiles WHERE id = NEW.user_id;
    IF reviewer_ids IS NULL OR array_length(reviewer_ids, 1) IS NULL THEN
      SELECT array_agg(id) INTO reviewer_ids FROM public.user_profiles WHERE role = 'lead_instructor';
    END IF;
  END IF;

  IF reviewer_ids IS NOT NULL THEN
    FOREACH rid IN ARRAY reviewer_ids LOOP
      INSERT INTO public.notifications (user_id, from_user_id, worksheet_id, type, message)
      VALUES (
        rid,
        NEW.user_id,
        NEW.worksheet_id,
        CASE WHEN NEW.review_status = 'revision_submitted' THEN 'revision_submitted' ELSE 'submitted' END,
        format('A worksheet (%s) was submitted by %s and is ready for review.', NEW.worksheet_id, COALESCE(joinee_name, 'a joinee'))
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_reviewer_on_submission ON public.worksheet_submissions;
CREATE TRIGGER notify_reviewer_on_submission
  AFTER INSERT OR UPDATE OF review_status ON public.worksheet_submissions
  FOR EACH ROW EXECUTE FUNCTION public.notify_reviewer_on_submission();

CREATE OR REPLACE FUNCTION public.notify_managers_of_new_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  rid uuid;
BEGIN
  IF NEW.role <> 'new_joinee' THEN
    RETURN NEW;
  END IF;
  FOR rid IN
    SELECT id FROM public.user_profiles WHERE role IN ('academic_head', 'onboarding_lead') AND id <> NEW.id
  LOOP
    INSERT INTO public.notifications (user_id, from_user_id, worksheet_id, type, message)
    VALUES (
      rid, NEW.id, '', 'submitted',
      format('%s has signed up and started onboarding.', COALESCE(NEW.full_name, NEW.email, 'A new joinee'))
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_managers_of_new_signup ON public.user_profiles;
CREATE TRIGGER notify_managers_of_new_signup
  AFTER INSERT ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.notify_managers_of_new_signup();


-- =============================================================================
-- 11. AUTO-PROMOTION RPC (contract item 3) — SECURITY DEFINER, acts only on
--     auth.uid() (the caller), never on behalf of another session.
-- =============================================================================

-- Canonical list of worksheets required for auto-promotion to lead_instructor.
-- NOTE: this must be kept in sync with PHASE_WORKSHEETS_MAP (phases 1-3) in
-- src/config/worksheetConfigData.ts — the DB has no way to import that TS
-- config, so this table is the server-side mirror of it. If that map changes,
-- update this table too (flagged as a cross-stream risk).
CREATE TABLE IF NOT EXISTS public.promotion_required_worksheets (
  worksheet_id TEXT PRIMARY KEY
);

INSERT INTO public.promotion_required_worksheets (worksheet_id) VALUES
  ('p1_w1'), ('p1_w2'), ('p1_w3'), ('p1_w4'), ('p1_w5'), ('p1_w6'), ('p1_w8'),
  ('w1_o1'), ('w1_e1'), ('w1_o2'), ('w1_g1'), ('gc1'),
  ('p2_w1'), ('p2_w2'), ('p2_w3'), ('p2_w4'), ('gc2'),
  ('p3_w1'), ('p3_w2'), ('p3_w3'), ('p3_w4'), ('p3_w5'), ('gc3')
ON CONFLICT (worksheet_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.promote_user_if_eligible()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller uuid := auth.uid();
  existing_role text; -- NOTE: never name this "current_role" — that's a
                       -- reserved Postgres keyword (CURRENT_ROLE) and silently
                       -- shadows/resolves to the session role, not this value.
  total_required int;
  approved_count int;
BEGIN
  IF caller IS NULL THEN
    RETURN jsonb_build_object('promoted', false, 'message', 'Not authenticated');
  END IF;

  SELECT role INTO existing_role FROM public.user_profiles WHERE id = caller;

  IF existing_role IS DISTINCT FROM 'new_joinee' THEN
    RETURN jsonb_build_object('promoted', false, 'message', 'Only new joinees are eligible for auto-promotion');
  END IF;

  SELECT count(*) INTO total_required FROM public.promotion_required_worksheets;

  SELECT count(*) INTO approved_count
  FROM public.promotion_required_worksheets rw
  JOIN public.worksheet_submissions ws
    ON ws.worksheet_id = rw.worksheet_id
   AND ws.user_id = caller
   AND ws.review_status = 'approved';

  IF total_required = 0 OR approved_count < total_required THEN
    RETURN jsonb_build_object(
      'promoted', false,
      'message', format('%s/%s worksheets approved — not yet complete', approved_count, total_required)
    );
  END IF;

  UPDATE public.user_profiles SET role = 'lead_instructor' WHERE id = caller;
  -- app_metadata is kept in sync automatically by sync_role_to_app_metadata().

  INSERT INTO public.notifications (user_id, from_user_id, worksheet_id, type, message)
  VALUES (
    caller, NULL, '', 'promoted',
    format('Congratulations! All %s worksheets across all phases have been approved. You have been promoted to Buddy/Mentor (lead_instructor).', total_required)
  );

  INSERT INTO public.notifications (user_id, from_user_id, worksheet_id, type, message)
  SELECT id, caller, '', 'promoted',
    'A joinee has completed all phases and been promoted to lead_instructor. They can now serve as a buddy/mentor.'
  FROM public.user_profiles WHERE role = 'academic_head';

  RETURN jsonb_build_object(
    'promoted', true,
    'message', format('All %s worksheets approved! User promoted to Buddy/Mentor (lead_instructor).', total_required)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_user_if_eligible() TO authenticated;


-- =============================================================================
-- 11B. GATE SUBMISSION RPC (H2 fix) — SECURITY DEFINER, lets a buddy create
--     or update a gate-control (gc1/gc2/gc3) worksheet_submissions row on
--     behalf of their assigned joinee. Gate-control worksheets are buddy-
--     authored (excluded from joinee routes) — a joinee never has a row for
--     them until their buddy files one. Every other worksheet type is
--     client-upserted directly by its owner, which is exactly why that path
--     cannot work here: "Insert own submissions" (section 13) requires
--     auth.uid() = user_id, which is never true when a buddy is the one
--     writing a row owned by their joinee. This RPC performs its own
--     authorization check (must be the joinee's assigned buddy, or
--     academic_head) and then does the upsert with elevated privileges —
--     the two RLS INSERT/UPDATE policies on worksheet_submissions are
--     irrelevant to this path since SECURITY DEFINER bypasses RLS entirely.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.upsert_gate_submission(
  p_user_id uuid,
  p_worksheet_id text,
  p_data jsonb,
  p_status text DEFAULT 'buddy_approved'
)
RETURNS public.worksheet_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller uuid := auth.uid();
  caller_role text := public.get_user_role();
  is_assigned_buddy boolean;
  v_phase text;
  result public.worksheet_submissions;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT (up.assigned_buddy_id = caller) INTO is_assigned_buddy
  FROM public.user_profiles up
  WHERE up.id = p_user_id;

  IF NOT (COALESCE(is_assigned_buddy, false) OR caller_role = 'academic_head') THEN
    RAISE EXCEPTION 'Not authorized to submit a gate pass for this joinee';
  END IF;

  -- Gate-control worksheet ids are fixed (gc1/gc2/gc3); derive the owning
  -- phase from the id itself since the caller only supplies worksheet_id.
  v_phase := CASE p_worksheet_id
    WHEN 'gc1' THEN 'phase1'
    WHEN 'gc2' THEN 'phase2'
    WHEN 'gc3' THEN 'phase3'
    ELSE 'phase1'
  END;

  INSERT INTO public.worksheet_submissions (
    user_id, worksheet_id, worksheet_data, phase, status,
    review_status, reviewer_type, reviewed_by, reviewed_at
  )
  VALUES (
    p_user_id, p_worksheet_id, p_data, v_phase, 'Submitted',
    p_status, 'buddy', caller, now()
  )
  ON CONFLICT (user_id, worksheet_id) DO UPDATE
  SET worksheet_data = p_data,
      review_status = p_status,
      reviewed_by = caller,
      reviewed_at = now()
  RETURNING * INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_gate_submission(uuid, text, jsonb, text) TO authenticated;


-- =============================================================================
-- 12. DUE-DATE NOTIFICATIONS (optional utility; unchanged behavior, aligned
--     to the unified notifications CHECK from section 4). Not scheduled by
--     default — see the commented pg_cron block at the end of this section.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_due_date_notifications()
RETURNS TABLE (
  action TEXT,
  user_id UUID,
  worksheet_id TEXT,
  due_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ws_record RECORD;
  existing_count INT;
BEGIN
  FOR ws_record IN
    SELECT ws.user_id, ws.worksheet_id, ws.due_date
    FROM public.worksheet_submissions ws
    WHERE ws.due_date IS NOT NULL
      AND ws.review_status NOT IN ('approved', 'buddy_approved')
  LOOP
    IF ws_record.due_date < CURRENT_DATE THEN
      SELECT COUNT(*) INTO existing_count
      FROM public.notifications n
      WHERE n.user_id = ws_record.user_id
        AND n.worksheet_id = ws_record.worksheet_id
        AND n.type = 'overdue'
        AND n.created_at >= CURRENT_DATE - INTERVAL '7 days';

      IF existing_count = 0 THEN
        INSERT INTO public.notifications (user_id, from_user_id, worksheet_id, type, message)
        VALUES (
          ws_record.user_id, NULL, ws_record.worksheet_id, 'overdue',
          format('Your worksheet (%s) is overdue! It was due on %s. Please submit it as soon as possible.',
            ws_record.worksheet_id, to_char(ws_record.due_date, 'Mon DD, YYYY'))
        );
        action := 'overdue'; user_id := ws_record.user_id;
        worksheet_id := ws_record.worksheet_id; due_date := ws_record.due_date;
        RETURN NEXT;
      END IF;
    END IF;

    IF ws_record.due_date >= CURRENT_DATE AND ws_record.due_date <= CURRENT_DATE + INTERVAL '3 days' THEN
      SELECT COUNT(*) INTO existing_count
      FROM public.notifications n
      WHERE n.user_id = ws_record.user_id
        AND n.worksheet_id = ws_record.worksheet_id
        AND n.type = 'due_soon'
        AND n.created_at >= CURRENT_DATE;

      IF existing_count = 0 THEN
        INSERT INTO public.notifications (user_id, from_user_id, worksheet_id, type, message)
        VALUES (
          ws_record.user_id, NULL, ws_record.worksheet_id, 'due_soon',
          format('Your worksheet (%s) is due on %s (%s day(s) remaining).',
            ws_record.worksheet_id, to_char(ws_record.due_date, 'Mon DD, YYYY'),
            GREATEST(0, (ws_record.due_date - CURRENT_DATE)::int))
        );
        action := 'due_soon'; user_id := ws_record.user_id;
        worksheet_id := ws_record.worksheet_id; due_date := ws_record.due_date;
        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;

  IF NOT FOUND THEN
    action := 'no_action_needed'; user_id := NULL; worksheet_id := NULL; due_date := NULL;
    RETURN NEXT;
  END IF;
END;
$$;

-- To schedule (requires pg_cron enabled — Supabase Dashboard → Database →
-- Extensions → pg_cron):
--   SELECT cron.schedule('check-due-date-notifications', '30 2 * * *',
--     $$SELECT public.check_due_date_notifications()$$);


-- =============================================================================
-- 13. ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worksheet_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ── C05/C07: drop every policy name that has EVER existed anywhere in this
-- repo's history (across all four tables), so the final CREATE POLICY set
-- below always wins outright — no name-mismatch can leave a stale permissive
-- policy alive alongside the hardened one. DROP POLICY IF EXISTS is a no-op
-- when the name never existed on that table, so this is always safe.
DO $$
DECLARE
  tbl text;
  pol text;
  legacy_policies text[] := ARRAY[
    'Admin read all profiles', 'Admin update profiles',
    'Allow anon profile insert', 'Allow profile insert',
    'Insert notifications', 'Insert own profile', 'Insert own submissions',
    'Leads can read all profiles', 'Read worksheet access',
    'Reviewers can update submissions', 'Reviewers can update worksheets',
    'Reviewers select submissions', 'Reviewers update submissions',
    'Buddy update submissions', 'Manager update submissions',
    'Select own notifications', 'Select own profile', 'Select own submissions',
    'Update own notifications', 'Update own profile', 'Update own submissions',
    'Users can insert notifications', 'Users can insert own submissions',
    'Users can insert own worksheets', 'Users can read own notifications',
    'Users can read own profile', 'Users can read own submissions',
    'Users can update own notifications', 'Users can update own profile',
    'Users can update own submissions', 'Users can update own worksheets'
  ];
  tables text[] := ARRAY['user_profiles', 'onboarding_submissions', 'worksheet_submissions', 'notifications'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    FOREACH pol IN ARRAY legacy_policies LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, tbl);
    END LOOP;
  END LOOP;
END $$;

-- ── user_profiles ───────────────────────────────────────────────────────────

CREATE POLICY "Select own profile" ON public.user_profiles
  FOR SELECT USING (id = auth.uid());

-- Signup: client never supplies a role (INSERT policy doesn't reference role
-- at all — handle_new_user is what actually creates the row; this exists for
-- any legitimate client-side profile-completion insert, e.g. OAuth flows).
CREATE POLICY "Insert own profile" ON public.user_profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- C05/C04: the ONLY self-update policy. A user may update their own row but
-- can never change their own role unless they are already academic_head.
CREATE POLICY "Update own profile" ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (
      role = (SELECT p.role FROM public.user_profiles p WHERE p.id = user_profiles.id)
      OR public.get_user_role() = 'academic_head'
    )
  );

CREATE POLICY "Admin read all profiles" ON public.user_profiles
  FOR SELECT USING (
    public.get_user_role() IN ('academic_head', 'lead_instructor', 'onboarding_lead')
  );

-- H12/M07: admin-on-others updates (e.g. AssignmentsTab assigning
-- leads/buddies). Role can never be changed through this policy — role
-- changes only ever happen via promote_user_if_eligible() or the row owner
-- (academic_head only) above.
CREATE POLICY "Admin update profiles" ON public.user_profiles
  FOR UPDATE
  USING (public.get_user_role() IN ('academic_head', 'lead_instructor', 'onboarding_lead'))
  WITH CHECK (
    public.get_user_role() IN ('academic_head', 'lead_instructor', 'onboarding_lead')
    AND role = (SELECT p.role FROM public.user_profiles p WHERE p.id = user_profiles.id)
  );

-- ── onboarding_submissions (legacy assessment table) ────────────────────────

CREATE POLICY "Users can read own submissions" ON public.onboarding_submissions
  FOR SELECT USING (
    auth.uid() = user_id
    OR public.get_user_role() IN ('academic_head', 'lead_instructor', 'onboarding_lead')
  );

CREATE POLICY "Users can insert own submissions" ON public.onboarding_submissions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own submissions" ON public.onboarding_submissions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── worksheet_submissions ────────────────────────────────────────────────────

CREATE POLICY "Select own submissions" ON public.worksheet_submissions
  FOR SELECT USING (auth.uid() = user_id);

-- C02/H13: first-time insert may only start a submission in a draft or
-- pending-review state, and can never carry reviewer-identity fields.
CREATE POLICY "Insert own submissions" ON public.worksheet_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND review_status IN ('', 'pending_review')
    AND reviewed_by IS NULL
  );

-- C02/C05/H13/H24: ownership only here. Deliberately NOT re-validating
-- review_status transition legality with a self-correlated subquery — doing
-- so (WHERE ws.id = worksheet_submissions.id) trips Postgres's RLS
-- infinite-recursion guard, unlike the non-correlated auth.uid()-keyed
-- subquery used for user_profiles.role above. validate_review_transition()
-- (a BEFORE UPDATE trigger, which has clean OLD/NEW access with no recursion
-- risk) is the sole and authoritative enforcement of which review_status
-- transitions the owner may make, including blocking any change at all once
-- a reviewer has acted (H15/H24) while still allowing a routine autosave
-- that leaves an already-reviewed review_status untouched. The column CHECK
-- constraint additionally bounds review_status to its legal enum domain.
CREATE POLICY "Update own submissions" ON public.worksheet_submissions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Broad read access for all reviewer roles (incl. onboarding_lead, which is
-- SELECT-only — H03/H24) plus the assigned buddy/manager for a given joinee.
CREATE POLICY "Reviewers select submissions" ON public.worksheet_submissions
  FOR SELECT USING (
    public.get_user_role() IN ('lead_instructor', 'academic_head', 'onboarding_lead')
    OR auth.uid() = user_id
    OR auth.uid() IN (SELECT assigned_lead_id FROM public.user_profiles WHERE id = worksheet_submissions.user_id)
    OR auth.uid() IN (SELECT assigned_buddy_id FROM public.user_profiles WHERE id = worksheet_submissions.user_id)
  );

-- H03/H24: buddy may only act on their assigned joinees (or any joinee left
-- unassigned, matching the app's existing "no buddy assigned yet" fallback).
-- WHICH transitions are legal is enforced by validate_review_transition().
CREATE POLICY "Buddy update submissions" ON public.worksheet_submissions
  FOR UPDATE
  USING (
    public.get_user_role() = 'lead_instructor'
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = worksheet_submissions.user_id
        AND (up.assigned_buddy_id = auth.uid() OR up.assigned_buddy_id IS NULL)
    )
  )
  WITH CHECK (
    public.get_user_role() = 'lead_instructor'
    AND review_status IN ('buddy_approved', 'needs_revision')
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = worksheet_submissions.user_id
        AND (up.assigned_buddy_id = auth.uid() OR up.assigned_buddy_id IS NULL)
    )
  );

-- H03/H24: manager may only act on their assigned joinees (or unassigned),
-- and only to move a buddy-approved worksheet to fully approved.
CREATE POLICY "Manager update submissions" ON public.worksheet_submissions
  FOR UPDATE
  USING (
    public.get_user_role() = 'academic_head'
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = worksheet_submissions.user_id
        AND (up.assigned_lead_id = auth.uid() OR up.assigned_lead_id IS NULL)
    )
  )
  WITH CHECK (
    public.get_user_role() = 'academic_head'
    AND review_status = 'approved'
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = worksheet_submissions.user_id
        AND (up.assigned_lead_id = auth.uid() OR up.assigned_lead_id IS NULL)
    )
  );

-- NOTE: onboarding_lead intentionally has NO update policy on
-- worksheet_submissions (H03/H24 — read-only monitoring role only).

-- ── notifications ────────────────────────────────────────────────────────────

CREATE POLICY "Users can read own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

-- Contract item 5: almost all notifications are now created server-side
-- (SECURITY DEFINER triggers/RPC bypass RLS entirely). The only remaining
-- legitimate client-side insert is a user notifying themselves; reviewers no
-- longer get a blanket "insert to anyone" allowance (that was a
-- privilege-escalation / phishing vector — a "reviewer" could otherwise spam
-- forged notifications to any user).
CREATE POLICY "Users can insert notifications" ON public.notifications
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND user_id = auth.uid());

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
