-- =============================================================================
-- Migration: initial schema — tables, foreign keys, check constraints, indexes, updated_at triggers
--
-- This is an ordered, verbatim slice of db/schema.sql (the canonical full
-- snapshot — see db/README.md for how these two are kept in sync and which
-- one to run). Every statement here is idempotent and safe to re-run.
-- =============================================================================

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


