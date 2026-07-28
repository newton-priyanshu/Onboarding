-- =============================================================================
-- Migration: promote_user_if_eligible() SECURITY DEFINER RPC + optional due-date notification utility
--
-- This is an ordered, verbatim slice of db/schema.sql (the canonical full
-- snapshot — see db/README.md for how these two are kept in sync and which
-- one to run). Every statement here is idempotent and safe to re-run.
-- =============================================================================

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
-- Migration: multi-tenant phase 0 — campuses, templates, roles, permissions,
--             audit_logs tables + campus_id columns on existing tables.
--
-- This migration adds the foundational multi-tenant infrastructure:
--   1. Creates new tables: campuses, onboarding_templates, roles, permissions, audit_logs
--   2. Adds campus_id FK columns to user_profiles, worksheet_submissions, notifications,
--      promotion_required_worksheets
--   3. Extends the user_profiles role CHECK constraint to include super_admin + campus_admin
--   4. Creates indexes for performance
--   5. Seeds default system roles and permissions
--   6. Seeds a default campus and a default onboarding template
--   7. Adds helper SQL functions for campus context resolution
--   8. Updates sync_role_to_app_metadata to also sync campus_id
--   9. Creates updated_at triggers for new tables
--   10. Enables RLS on new tables and creates initial policies
--
-- Every statement is idempotent and safe to re-run.
-- =============================================================================

-- =============================================================================
-- 1. NEW TABLES
-- =============================================================================

-- ── campuses ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  domain TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  branding JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique slug (case-insensitive via unique index)
-- Drop & recreate idempotently
DROP INDEX IF EXISTS idx_campuses_slug;
CREATE UNIQUE INDEX idx_campuses_slug ON public.campuses (lower(slug));

-- ── onboarding_templates ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.onboarding_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  -- Structure: { weeks: [{ num, title, subtitle, theme, phases: [{ name, worksheets: [{ id, title, reviewer, ... }] }] }] }
  structure JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Approval chain: ordered list of reviewer roles, e.g. ["lead_instructor","academic_head"]
  approval_chain JSONB DEFAULT '["lead_instructor","academic_head"]'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── roles ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT FALSE,
  campus_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique role name (per campus or global)
DROP INDEX IF EXISTS idx_roles_name;
CREATE UNIQUE INDEX idx_roles_name ON public.roles (name) WHERE campus_id IS NULL;

-- ── permissions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  constraint_type TEXT DEFAULT 'allow',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint to prevent duplicate permissions and enable idempotent inserts
ALTER TABLE public.permissions DROP CONSTRAINT IF EXISTS permissions_role_resource_action_key;
ALTER TABLE public.permissions
  ADD CONSTRAINT permissions_role_resource_action_key UNIQUE (role_id, resource, action);

CREATE INDEX IF NOT EXISTS idx_permissions_role ON public.permissions (role_id);

-- ── audit_logs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID,
  user_id UUID,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_campus ON public.audit_logs (campus_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs (created_at DESC);


-- =============================================================================
-- 2. ADD campus_id COLUMNS TO EXISTING TABLES
-- =============================================================================

-- user_profiles — each user belongs to a campus
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS campus_id UUID;

-- worksheet_submissions — each submission belongs to a campus
ALTER TABLE public.worksheet_submissions ADD COLUMN IF NOT EXISTS campus_id UUID;

-- notifications — each notification belongs to a campus
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS campus_id UUID;

-- promotion_required_worksheets — campus-scoped (each campus can define its own)
ALTER TABLE public.promotion_required_worksheets ADD COLUMN IF NOT EXISTS campus_id UUID;


-- =============================================================================
-- 3. FOREIGN KEYS
-- =============================================================================

-- campuses (no parent FK needed — top-level entity)

ALTER TABLE public.onboarding_templates DROP CONSTRAINT IF EXISTS onboarding_templates_campus_id_fkey;
ALTER TABLE public.onboarding_templates
  ADD CONSTRAINT onboarding_templates_campus_id_fkey
  FOREIGN KEY (campus_id) REFERENCES public.campuses(id) ON DELETE CASCADE;

ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_campus_id_fkey;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_campus_id_fkey
  FOREIGN KEY (campus_id) REFERENCES public.campuses(id) ON DELETE SET NULL;

ALTER TABLE public.worksheet_submissions DROP CONSTRAINT IF EXISTS worksheet_submissions_campus_id_fkey;
ALTER TABLE public.worksheet_submissions
  ADD CONSTRAINT worksheet_submissions_campus_id_fkey
  FOREIGN KEY (campus_id) REFERENCES public.campuses(id) ON DELETE SET NULL;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_campus_id_fkey;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_campus_id_fkey
  FOREIGN KEY (campus_id) REFERENCES public.campuses(id) ON DELETE SET NULL;

ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_campus_id_fkey;
ALTER TABLE public.roles
  ADD CONSTRAINT roles_campus_id_fkey
  FOREIGN KEY (campus_id) REFERENCES public.campuses(id) ON DELETE CASCADE;

ALTER TABLE public.permissions DROP CONSTRAINT IF EXISTS permissions_role_id_fkey;
ALTER TABLE public.permissions
  ADD CONSTRAINT permissions_role_id_fkey
  FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;

ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_campus_id_fkey;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_campus_id_fkey
  FOREIGN KEY (campus_id) REFERENCES public.campuses(id) ON DELETE SET NULL;

ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


-- =============================================================================
-- 4. UPDATE CHECK CONSTRAINTS
-- =============================================================================

-- Extend user_profiles role check to include super_admin and campus_admin
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN (
    'new_joinee', 'lab_instructor', 'lead_instructor',
    'academic_head', 'onboarding_lead', 'acad_ops',
    'super_admin', 'campus_admin'
  ));


-- =============================================================================
-- 5. INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_campus ON public.user_profiles (campus_id);
CREATE INDEX IF NOT EXISTS idx_worksheets_campus ON public.worksheet_submissions (campus_id);
CREATE INDEX IF NOT EXISTS idx_notifications_campus ON public.notifications (campus_id);
CREATE INDEX IF NOT EXISTS idx_promotion_worksheets_campus ON public.promotion_required_worksheets (campus_id);
CREATE INDEX IF NOT EXISTS idx_templates_campus ON public.onboarding_templates (campus_id);


-- =============================================================================
-- 6. AUTO-UPDATE updated_at TRIGGERS FOR NEW TABLES
-- =============================================================================

-- uses the existing update_updated_at_column() function from the initial schema

DROP TRIGGER IF EXISTS update_campuses_updated_at ON public.campuses;
CREATE TRIGGER update_campuses_updated_at
  BEFORE UPDATE ON public.campuses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_onboarding_templates_updated_at ON public.onboarding_templates;
CREATE TRIGGER update_onboarding_templates_updated_at
  BEFORE UPDATE ON public.onboarding_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =============================================================================
-- 7. HELPER FUNCTIONS
-- =============================================================================

-- ── get_user_campus() — Returns campus_id from JWT app_metadata ────────────
CREATE OR REPLACE FUNCTION public.get_user_campus()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT nullif(auth.jwt() -> 'app_metadata' ->> 'campus_id', '')::uuid;
$$;

-- ── is_super_admin() — Returns true if the current user has super_admin role ─
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.get_user_role() = 'super_admin';
$$;

-- ── assert_campus_access(campus_id uuid) — Raises exception if user is
--    not a super_admin AND their campus doesn't match the given campus_id. ──
CREATE OR REPLACE FUNCTION public.assert_campus_access(target_campus_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  user_campus_id uuid;
  user_role text;
BEGIN
  -- Super admin can access any campus
  IF public.is_super_admin() THEN
    RETURN;
  END IF;

  user_campus_id := public.get_user_campus();
  user_role := public.get_user_role();

  IF user_campus_id IS NULL OR user_campus_id <> target_campus_id THEN
    RAISE EXCEPTION 'Access denied: user campus % does not match target campus %',
      user_campus_id, target_campus_id;
  END IF;
END;
$$;


-- =============================================================================
-- 8. UPDATE sync_role_to_app_metadata — also sync campus_id
-- =============================================================================

-- Backfill campus_id into app_metadata for existing users
UPDATE auth.users u
SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('campus_id', up.campus_id)
FROM public.user_profiles up
WHERE up.id = u.id
  AND (u.raw_app_meta_data ->> 'campus_id') IS DISTINCT FROM up.campus_id::text;

-- Replace sync_role_to_app_metadata with a version that also syncs campus_id
CREATE OR REPLACE FUNCTION public.sync_role_to_app_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.role IS DISTINCT FROM OLD.role OR NEW.campus_id IS DISTINCT FROM OLD.campus_id THEN
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object(
           'role', NEW.role,
           'campus_id', NEW.campus_id
         )
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;


-- =============================================================================
-- 9. SEED DATA — DEFAULT ROLES & PERMISSIONS
-- =============================================================================

-- Insert system roles (campus_id = NULL = global). Safe to re-run.
INSERT INTO public.roles (name, description, is_system, campus_id) VALUES
  ('super_admin', 'Global platform administrator — access to all campuses', TRUE, NULL),
  ('campus_admin', 'Campus-level administrator — manage own campus', TRUE, NULL),
  ('academic_head', 'Campus academic head / manager — final approval authority', TRUE, NULL),
  ('onboarding_lead', 'Onboarding programme lead — monitor and guide onboarding', TRUE, NULL),
  ('lead_instructor', 'Buddy / mentor — reviews and approves buddy worksheets', TRUE, NULL),
  ('new_joinee', 'New joiner completing onboarding worksheets', TRUE, NULL),
  ('lab_instructor', 'Lab instructor role', TRUE, NULL),
  ('acad_ops', 'Academic operations support', TRUE, NULL)
ON CONFLICT DO NOTHING;

-- Insert default permissions for each system role.
-- Using a DO block to handle idempotent inserts.

DO $$
DECLARE
  v_super_admin_id     uuid;
  v_campus_admin_id    uuid;
  v_academic_head_id   uuid;
  v_onboarding_lead_id uuid;
  v_lead_instructor_id uuid;
  v_new_joinee_id      uuid;
BEGIN
  SELECT id INTO v_super_admin_id     FROM public.roles WHERE name = 'super_admin';
  SELECT id INTO v_campus_admin_id    FROM public.roles WHERE name = 'campus_admin';
  SELECT id INTO v_academic_head_id   FROM public.roles WHERE name = 'academic_head';
  SELECT id INTO v_onboarding_lead_id FROM public.roles WHERE name = 'onboarding_lead';
  SELECT id INTO v_lead_instructor_id FROM public.roles WHERE name = 'lead_instructor';
  SELECT id INTO v_new_joinee_id      FROM public.roles WHERE name = 'new_joinee';

  -- Clear any existing seeded permissions for idempotency
  -- (this DO block runs once per migration, so we delete and re-insert safely)
  DELETE FROM public.permissions WHERE role_id IN (
    v_super_admin_id, v_campus_admin_id, v_academic_head_id,
    v_onboarding_lead_id, v_lead_instructor_id, v_new_joinee_id
  );

  -- super_admin: full access to everything
  INSERT INTO public.permissions (role_id, resource, action) VALUES
    (v_super_admin_id, 'campus', 'create'), (v_super_admin_id, 'campus', 'read'),
    (v_super_admin_id, 'campus', 'update'), (v_super_admin_id, 'campus', 'delete'),
    (v_super_admin_id, 'template', 'create'), (v_super_admin_id, 'template', 'read'),
    (v_super_admin_id, 'template', 'update'), (v_super_admin_id, 'template', 'delete'),
    (v_super_admin_id, 'user', 'create'), (v_super_admin_id, 'user', 'read'),
    (v_super_admin_id, 'user', 'update'), (v_super_admin_id, 'user', 'delete'),
    (v_super_admin_id, 'worksheet', 'read'), (v_super_admin_id, 'worksheet', 'approve'),
    (v_super_admin_id, 'role', 'create'), (v_super_admin_id, 'role', 'read'),
    (v_super_admin_id, 'role', 'update'), (v_super_admin_id, 'role', 'delete'),
    (v_super_admin_id, 'analytics', 'read')
  ON CONFLICT DO NOTHING;

  -- campus_admin: manage their own campus
  INSERT INTO public.permissions (role_id, resource, action) VALUES
    (v_campus_admin_id, 'user', 'read'), (v_campus_admin_id, 'user', 'update'),
    (v_campus_admin_id, 'user', 'create'),
    (v_campus_admin_id, 'template', 'read'), (v_campus_admin_id, 'template', 'update'),
    (v_campus_admin_id, 'worksheet', 'read'), (v_campus_admin_id, 'worksheet', 'approve'),
    (v_campus_admin_id, 'analytics', 'read')
  ON CONFLICT DO NOTHING;

  -- academic_head (manager): final approval + read access
  INSERT INTO public.permissions (role_id, resource, action) VALUES
    (v_academic_head_id, 'worksheet', 'read'), (v_academic_head_id, 'worksheet', 'approve'),
    (v_academic_head_id, 'user', 'read'), (v_academic_head_id, 'user', 'update'),
    (v_academic_head_id, 'analytics', 'read')
  ON CONFLICT DO NOTHING;

  -- onboarding_lead: read + monitor access
  INSERT INTO public.permissions (role_id, resource, action) VALUES
    (v_onboarding_lead_id, 'worksheet', 'read'),
    (v_onboarding_lead_id, 'user', 'read'),
    (v_onboarding_lead_id, 'analytics', 'read')
  ON CONFLICT DO NOTHING;

  -- lead_instructor (buddy): review assigned worksheets
  INSERT INTO public.permissions (role_id, resource, action) VALUES
    (v_lead_instructor_id, 'worksheet', 'read'), (v_lead_instructor_id, 'worksheet', 'approve'),
    (v_lead_instructor_id, 'user', 'read')
  ON CONFLICT DO NOTHING;

  -- new_joinee: own worksheet access only
  INSERT INTO public.permissions (role_id, resource, action) VALUES
    (v_new_joinee_id, 'worksheet', 'read'), (v_new_joinee_id, 'worksheet', 'create'),
    (v_new_joinee_id, 'worksheet', 'update')
  ON CONFLICT DO NOTHING;

  -- lab_instructor: worksheet access (same as new_joinee)
  INSERT INTO public.permissions (role_id, resource, action)
  SELECT id, 'worksheet', 'read' FROM public.roles WHERE name = 'lab_instructor'
  ON CONFLICT DO NOTHING;
  INSERT INTO public.permissions (role_id, resource, action)
  SELECT id, 'worksheet', 'create' FROM public.roles WHERE name = 'lab_instructor'
  ON CONFLICT DO NOTHING;
  INSERT INTO public.permissions (role_id, resource, action)
  SELECT id, 'worksheet', 'update' FROM public.roles WHERE name = 'lab_instructor'
  ON CONFLICT DO NOTHING;

  -- acad_ops: read-only worksheet access
  INSERT INTO public.permissions (role_id, resource, action)
  SELECT id, 'worksheet', 'read' FROM public.roles WHERE name = 'acad_ops'
  ON CONFLICT DO NOTHING;
  INSERT INTO public.permissions (role_id, resource, action)
  SELECT id, 'user', 'read' FROM public.roles WHERE name = 'acad_ops'
  ON CONFLICT DO NOTHING;
END $$;


-- =============================================================================
-- 10. SEED DATA — DEFAULT CAMPUS & ONBOARDING TEMPLATE
-- =============================================================================

-- Insert a default campus. Safe to re-run (checks slug).
INSERT INTO public.campuses (name, slug, domain, branding)
SELECT 'Default Campus', 'default', NULL,
  '{"name":"NST BLR · AARAMBH","theme_color":"#D4A853","welcome_message":"Welcome to NST BLR · AARAMBH"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.campuses WHERE slug = 'default');

-- Insert the default onboarding template with the full hardcoded structure
-- migrated from worksheetConfigData.ts and weeklyWorksheets.ts.
-- Structure format:
-- {
--   "weeks": [
--     {
--       "num": 1, "title": "Anchor", "subtitle": "Observe begins", "days": "Week 1",
--       "theme": "Context before content — functional means operational",
--       "worksheets": [
--         { "id": "p1_w5", "num": 1, "title": "Systems & Platform Walkthrough", "reviewer": "onboarding_lead" },
--         ...
--       ]
--     }
--   ],
--   "phases": [
--     {
--       "num": 1, "title": "Phase 1 — Orientation", "days": "Days 1–30",
--       "worksheets": ["p1_w5", "p1_w6", ...]
--     }
--   ],
--   "worksheetInfo": { "p1_w1": { "title": "...", "phase": "Phase 1" }, ... },
--   "gateArtifacts": { "w1_g1": [...], ... },
--   "engineTags": { "p1_w3": "B", ... }
-- }
DO $$
DECLARE
  v_default_campus_id uuid;
  v_template_exists   boolean;
BEGIN
  SELECT id INTO v_default_campus_id FROM public.campuses WHERE slug = 'default';

  SELECT EXISTS (SELECT 1 FROM public.onboarding_templates WHERE is_default = TRUE) INTO v_template_exists;

  IF NOT v_template_exists THEN
    INSERT INTO public.onboarding_templates (campus_id, name, description, structure, approval_chain, is_active, is_default)
    VALUES (
      v_default_campus_id,
      'Default Onboarding',
      'The standard NST BLR · AARAMBH onboarding programme with 4 FTP weeks and 3 legacy phases.',
      '{
        "weeks": [
          {
            "num": 1,
            "title": "Anchor",
            "subtitle": "Observe begins",
            "days": "Week 1",
            "theme": "Context before content — functional means operational",
            "worksheets": [
              { "id": "p1_w5", "num": 1, "title": "Systems & Platform Walkthrough", "reviewer": "onboarding_lead", "engineTag": "K" },
              { "id": "p1_w6", "num": 2, "title": "Structured Observation — Recorded Lectures", "reviewer": "buddy", "engineTag": "K" },
              { "id": "p1_w3", "num": 3, "title": "Culture-in-Delivery Opening", "reviewer": "buddy", "engineTag": "B" },
              { "id": "w1_o1", "num": 4, "title": "Day 1 Logistics & Access", "reviewer": "buddy", "engineTag": "K" },
              { "id": "w1_e1", "num": 5, "title": "Contest Guidelines V3 Pre-read", "reviewer": "buddy", "engineTag": "K" },
              { "id": "w1_o2", "num": 6, "title": "Playbook Scavenger Exercise", "reviewer": "buddy", "engineTag": "K" },
              { "id": "w1_g1", "num": 7, "title": "Gate 1 — Anchor Artifacts", "reviewer": "buddy", "engineTag": "K", "isGate": true }
            ]
          },
          {
            "num": 2,
            "title": "Co-create",
            "subtitle": "Observe deepens",
            "days": "Week 2",
            "theme": "Content creation to the zero-error standard",
            "worksheets": [
              { "id": "p2_w3", "num": 1, "title": "Question Creation Mechanics", "reviewer": "buddy", "engineTag": "K" },
              { "id": "p1_w7", "num": 2, "title": "The Quality Standard", "reviewer": "buddy", "engineTag": "K" },
              { "id": "p1_w6", "num": 3, "title": "Recorded Lectures — TLAC Lens", "reviewer": "buddy", "engineTag": "K" },
              { "id": "w2_e1", "num": 4, "title": "Bloom''s Two-Pens Session", "reviewer": "buddy", "engineTag": "K" },
              { "id": "w2_c3", "num": 5, "title": "Create & Peer Review", "reviewer": "buddy", "engineTag": "K" },
              { "id": "w2_d2", "num": 6, "title": "Micro-Teach #1", "reviewer": "buddy", "engineTag": "K" },
              { "id": "w2_b1", "num": 7, "title": "Discipline Consistency", "reviewer": "buddy", "engineTag": "B" },
              { "id": "w2_o1", "num": 8, "title": "Invigilation & Exam Formalities", "reviewer": "buddy", "engineTag": "K" },
              { "id": "w2_g1", "num": 9, "title": "Gate 2 — Co-create Artifacts", "reviewer": "buddy", "engineTag": "K", "isGate": true }
            ]
          },
          {
            "num": 3,
            "title": "Co-deliver",
            "subtitle": "Deliver under observation",
            "days": "Week 3",
            "theme": "The rubric enters the room",
            "worksheets": [
              { "id": "p2_w1", "num": 1, "title": "Engagement & Active Learning", "reviewer": "buddy", "engineTag": "K" },
              { "id": "p2_w2", "num": 2, "title": "Demo Dry-Run", "reviewer": "buddy", "engineTag": "K" },
              { "id": "p2_w4", "num": 3, "title": "Slot Creation & Attendance Flow", "reviewer": "onboarding_lead", "engineTag": "K" },
              { "id": "p3_w5", "num": 4, "title": "Build Full Lecture Package", "reviewer": "buddy", "engineTag": "K" },
              { "id": "w3_d1", "num": 5, "title": "Classroom Tech Hands-on", "reviewer": "buddy", "engineTag": "K" },
              { "id": "w3_d2", "num": 6, "title": "Planning & Time Management", "reviewer": "buddy", "engineTag": "K" },
              { "id": "w3_e1", "num": 7, "title": "Design Mini-Contest", "reviewer": "buddy", "engineTag": "K" },
              { "id": "w3_b1", "num": 8, "title": "Student Dialoguing Rehearsal", "reviewer": "buddy", "engineTag": "B" },
              { "id": "w3_g1", "num": 9, "title": "Gate 3 — Co-deliver Artifacts", "reviewer": "buddy", "engineTag": "K", "isGate": true }
            ]
          },
          {
            "num": 4,
            "title": "Independence Review",
            "subtitle": "Co-deliver closes",
            "days": "Week 4",
            "theme": "Feedback incorporated, real conditions rehearsed, release decided",
            "worksheets": [
              { "id": "p3_w1", "num": 1, "title": "Demo Final", "reviewer": "buddy", "engineTag": "K" },
              { "id": "w4_d2", "num": 2, "title": "Co-Teach / Mock Classroom", "reviewer": "buddy", "engineTag": "B" },
              { "id": "p3_w5", "num": 3, "title": "Lecture Package v2 — Final Approval", "reviewer": "buddy", "engineTag": "K" },
              { "id": "w4_e1", "num": 4, "title": "Post-Contest Analysis & Calibration", "reviewer": "buddy", "engineTag": "K" },
              { "id": "w4_o1", "num": 5, "title": "Pre-Semester Checklist", "reviewer": "buddy", "engineTag": "K" },
              { "id": "w4_b1", "num": 6, "title": "Why We Reflect", "reviewer": "buddy", "engineTag": "B" },
              { "id": "w4_g1", "num": 7, "title": "Gate 4 — Independence Readiness", "reviewer": "buddy", "engineTag": "K", "isGate": true }
            ]
          }
        ],
        "phases": [
          {
            "num": 1,
            "title": "Phase 1 — Orientation",
            "days": "Days 1–30",
            "worksheets": ["p1_w5", "p1_w6", "p1_w3", "w1_o1", "w1_e1", "w1_o2", "w1_g1", "p1_w1", "p1_w2", "p1_w4", "p1_w8", "gc1"]
          },
          {
            "num": 2,
            "title": "Phase 2 — Contribution",
            "days": "Days 31–60",
            "worksheets": ["p2_w1", "p2_w2", "p2_w3", "p2_w4", "gc2"]
          },
          {
            "num": 3,
            "title": "Phase 3 — Ownership",
            "days": "Days 61–90",
            "worksheets": ["p3_w1", "p3_w2", "p3_w3", "p3_w4", "p3_w5", "gc3"]
          }
        ],
        "gateArtifacts": {
          "w1_g1": [
            { "label": "Operational checklist complete (Lakshita''s list)", "required": true },
            { "label": "3 structured observation logs (TLAC-lens)", "required": true },
            { "label": "Completed playbook scavenger sheet", "required": true },
            { "label": "Written reflection #0 in why-we-reflect format", "required": true },
            { "label": "Platform walkthrough verification complete", "required": false }
          ],
          "w2_g1": [
            { "label": "Question set (3 MCQ, 2 coding) created & peer-reviewed", "required": true },
            { "label": "Peer reviews authored for another hire", "required": true },
            { "label": "Bloom''s two-pens tagging sheet on real past questions", "required": true },
            { "label": "Class Discipline Customisation Sheet draft", "required": true },
            { "label": "Micro-teach #1 completed with rubric-lite feedback", "required": false }
          ],
          "w3_g1": [
            { "label": "Demo dry-run delivered + rubric sheets filed", "required": true },
            { "label": "Written response to demo feedback", "required": true },
            { "label": "Lecture package v1 (slides + quiz + assignment + notes)", "required": true },
            { "label": "Mini-contest paper with peer L1 pass", "required": true },
            { "label": "Customisation Sheet complete and submitted", "required": true }
          ],
          "w4_g1": [
            { "label": "Demo final delivered — Course Lead signed rubric", "required": true },
            { "label": "Lecture package v2 approved (20% rule applied)", "required": true },
            { "label": "Own pre-semester checklist completed", "required": true },
            { "label": "Reflection #1 filed", "required": true },
            { "label": "Customisation Sheet signed by Course Lead", "required": true }
          ]
        }
      }'::jsonb,
      '["lead_instructor", "academic_head"]'::jsonb,
      TRUE,
      TRUE
    );
  END IF;
END $$;


-- =============================================================================
-- 11. ROW LEVEL SECURITY FOR NEW TABLES
-- =============================================================================

ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ── Drop any stale policies for clean slate ──
DO $$
DECLARE
  tbl text;
  pol text;
  new_policies text[] := ARRAY[
    'Super admin manage campuses', 'Users can read active campuses',
    'Super admin manage templates', 'Users can read campus templates',
    'Super admin manage roles', 'Users can read roles',
    'Users can read permissions',
    'Super admin manage audit logs', 'Users can insert audit logs'
  ];
  tables text[] := ARRAY['campuses', 'onboarding_templates', 'roles', 'permissions', 'audit_logs'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    FOREACH pol IN ARRAY new_policies LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, tbl);
    END LOOP;
  END LOOP;
END $$;

-- ── campuses ──────────────────────────────────────────────────────────────

-- Super admin can do everything
CREATE POLICY "Super admin manage campuses" ON public.campuses
  FOR ALL USING (public.is_super_admin());

-- Authenticated users can read active campuses (needed for campus selection UI)
CREATE POLICY "Users can read active campuses" ON public.campuses
  FOR SELECT USING (
    is_active = TRUE
    OR public.is_super_admin()
  );

-- ── onboarding_templates ──────────────────────────────────────────────────

CREATE POLICY "Super admin manage templates" ON public.onboarding_templates
  FOR ALL USING (public.is_super_admin());

-- Users can read templates for their own campus (via campus_id from JWT)
CREATE POLICY "Users can read campus templates" ON public.onboarding_templates
  FOR SELECT USING (
    campus_id = public.get_user_campus()
    OR public.is_super_admin()
  );

-- ── roles ─────────────────────────────────────────────────────────────────

CREATE POLICY "Super admin manage roles" ON public.roles
  FOR ALL USING (public.is_super_admin());

CREATE POLICY "Users can read roles" ON public.roles
  FOR SELECT USING (TRUE);

-- ── permissions ───────────────────────────────────────────────────────────

CREATE POLICY "Users can read permissions" ON public.permissions
  FOR SELECT USING (TRUE);

-- ── audit_logs ────────────────────────────────────────────────────────────

CREATE POLICY "Super admin manage audit logs" ON public.audit_logs
  FOR ALL USING (public.is_super_admin());

-- Authenticated users can insert audit logs
CREATE POLICY "Users can insert audit logs" ON public.audit_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');


-- =============================================================================
-- 12. UPDATE handle_new_user — set campus_id on new signups
-- =============================================================================

-- Update the handle_new_user trigger to also set campus_id from the signup
-- context or default to the default campus. This runs on every new auth.users
-- insert, AFTER the row is created.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_default_campus_id uuid;
  v_signup_campus_id  uuid;
BEGIN
  -- Try to get campus_id from user_metadata (set by client during signup)
  v_signup_campus_id := (NEW.raw_user_meta_data ->> 'campus_id')::uuid;

  -- Fall back to default campus
  IF v_signup_campus_id IS NULL THEN
    SELECT id INTO v_default_campus_id FROM public.campuses WHERE slug = 'default';
    v_signup_campus_id := v_default_campus_id;
  END IF;

  INSERT INTO public.user_profiles (id, email, full_name, role, campus_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      split_part(NEW.email, '@', 1)
    ),
    'new_joinee',
    v_signup_campus_id
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


-- =============================================================================
-- 13. BACKFILL — Set campus_id for existing rows (first run only)
-- =============================================================================

DO $$
DECLARE
  v_default_id uuid;
BEGIN
  SELECT id INTO v_default_id FROM public.campuses WHERE slug = 'default';

  -- Set campus_id on user_profiles rows that don't have one
  UPDATE public.user_profiles
  SET campus_id = v_default_id
  WHERE campus_id IS NULL;

  -- Set campus_id on worksheet_submissions from the user's profile
  UPDATE public.worksheet_submissions ws
  SET campus_id = up.campus_id
  FROM public.user_profiles up
  WHERE ws.user_id = up.id
    AND ws.campus_id IS NULL;

  -- Set campus_id on notifications from the user's profile
  UPDATE public.notifications n
  SET campus_id = up.campus_id
  FROM public.user_profiles up
  WHERE n.user_id = up.id
    AND n.campus_id IS NULL;

  -- Re-sync app_metadata for all existing users
  UPDATE auth.users u
  SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
         'role', up.role,
         'campus_id', up.campus_id
       )
  FROM public.user_profiles up
  WHERE up.id = u.id
    AND (
      (u.raw_app_meta_data ->> 'role') IS DISTINCT FROM up.role
      OR (u.raw_app_meta_data ->> 'campus_id') IS DISTINCT FROM up.campus_id::text
    );
END $$;
-- =============================================================================
-- Migration: multi-tenant phase 3 — RLS policies for campus isolation,
--              super_admin bypass, and audit logging.
--
-- This migration adds campus-level data isolation to all existing RLS
-- policies. It does NOT break existing functionality — rows without a
-- campus_id are still visible (backward compatible until Phase 9 data
-- migration backfills all campus_ids).
--
-- Changes:
--   1. Updates notify_reviewer_on_submission & notify_managers_of_new_signup
--      triggers to set campus_id on notification rows
--   2. Drops all legacy RLS policies on the 4 main tables
--   3. Recreates policies with campus filtering on every FOR SELECT/FOR
--      UPDATE/FOR INSERT policy
--   4. Adds super_admin bypass to every read policy
--   5. Adds campus_admin to admin policies
--   6. Creates audit logging triggers on worksheet_submissions and user_profiles
--
-- Campus filtering pattern:
--   - Tables with campus_id column:
--       (target.campus_id IS NULL OR target.campus_id = public.get_user_campus())
--   - onboarding_submissions (no campus_id, join via user_id):
--       EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = t.user_id
--               AND (up.campus_id IS NULL OR up.campus_id = public.get_user_campus()))
--   - Super admin bypass on all read policies: OR public.is_super_admin()
-- =============================================================================

-- =============================================================================
-- 1. UPDATE NOTIFICATION TRIGGERS — set campus_id
-- =============================================================================

-- Update notify_reviewer_on_submission to also set campus_id on notifications
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
  v_campus_id uuid;
BEGIN
  IF NEW.review_status NOT IN ('pending_review', 'revision_submitted') THEN
    RETURN NEW;
  END IF;
  -- Only notify on the actual transition INTO these states
  IF TG_OP = 'UPDATE' AND OLD.review_status = NEW.review_status THEN
    RETURN NEW;
  END IF;

  SELECT full_name, campus_id INTO joinee_name, v_campus_id
  FROM public.user_profiles WHERE id = NEW.user_id;

  IF NEW.reviewer_type = 'manager' THEN
    SELECT array_remove(array_agg(assigned_lead_id), NULL) INTO reviewer_ids
    FROM public.user_profiles WHERE id = NEW.user_id;
    IF reviewer_ids IS NULL OR array_length(reviewer_ids, 1) IS NULL THEN
      SELECT array_agg(id) INTO reviewer_ids
      FROM public.user_profiles WHERE role = 'academic_head'
        AND (campus_id IS NULL OR campus_id = v_campus_id);
    END IF;
  ELSIF NEW.reviewer_type = 'onboarding_lead' THEN
    SELECT array_agg(id) INTO reviewer_ids
    FROM public.user_profiles WHERE role = 'onboarding_lead'
      AND (campus_id IS NULL OR campus_id = v_campus_id);
  ELSE
    SELECT array_remove(array_agg(assigned_buddy_id), NULL) INTO reviewer_ids
    FROM public.user_profiles WHERE id = NEW.user_id;
    IF reviewer_ids IS NULL OR array_length(reviewer_ids, 1) IS NULL THEN
      SELECT array_agg(id) INTO reviewer_ids
      FROM public.user_profiles WHERE role = 'lead_instructor'
        AND (campus_id IS NULL OR campus_id = v_campus_id);
    END IF;
  END IF;

  IF reviewer_ids IS NOT NULL THEN
    FOREACH rid IN ARRAY reviewer_ids LOOP
      INSERT INTO public.notifications (user_id, from_user_id, worksheet_id, type, message, campus_id)
      VALUES (
        rid,
        NEW.user_id,
        NEW.worksheet_id,
        CASE WHEN NEW.review_status = 'revision_submitted' THEN 'revision_submitted' ELSE 'submitted' END,
        format('A worksheet (%s) was submitted by %s and is ready for review.', NEW.worksheet_id, COALESCE(joinee_name, 'a joinee')),
        COALESCE(v_campus_id, (SELECT campus_id FROM public.user_profiles WHERE id = rid))
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- Update notify_managers_of_new_signup to also set campus_id on notifications
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
    SELECT id FROM public.user_profiles
    WHERE role IN ('academic_head', 'onboarding_lead')
      AND id <> NEW.id
      AND (campus_id IS NULL OR campus_id = NEW.campus_id)
  LOOP
    INSERT INTO public.notifications (user_id, from_user_id, worksheet_id, type, message, campus_id)
    VALUES (
      rid, NEW.id, '', 'submitted',
      format('%s has signed up and started onboarding.', COALESCE(NEW.full_name, NEW.email, 'A new joinee')),
      NEW.campus_id
    );
  END LOOP;
  RETURN NEW;
END;
$$;

-- Update handle_new_user signup trigger to also set campus_id from user_metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_campus_id uuid;
BEGIN
  -- Attempt to resolve campus_id from user_metadata
  BEGIN
    v_campus_id := (new.raw_user_meta_data ->> 'campus_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_campus_id := NULL;
  END;

  -- Fallback: use the default campus if none specified
  IF v_campus_id IS NULL THEN
    SELECT id INTO v_campus_id FROM public.campuses WHERE slug = 'default' LIMIT 1;
  END IF;

  INSERT INTO public.user_profiles (id, email, full_name, role, campus_id)
  VALUES (
    new.id,
    new.email,
    COALESCE(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    'new_joinee',
    v_campus_id
  )
  ON CONFLICT (id)
  DO UPDATE SET campus_id = COALESCE(EXCLUDED.campus_id, public.user_profiles.campus_id)
    WHERE public.user_profiles.campus_id IS NULL;

  RETURN new;
END;
$$;

-- Update promotion required worksheets backfill trigger to include campus_id
CREATE OR REPLACE FUNCTION public.promote_user_if_eligible()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller uuid := auth.uid();
  existing_role text;
  v_campus_id uuid;
  total_required int;
  approved_count int;
BEGIN
  IF caller IS NULL THEN
    RETURN jsonb_build_object('promoted', false, 'message', 'Not authenticated');
  END IF;

  SELECT role, campus_id INTO existing_role, v_campus_id
  FROM public.user_profiles WHERE id = caller;

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

  -- Notify the promoted user
  INSERT INTO public.notifications (user_id, from_user_id, worksheet_id, type, message, campus_id)
  VALUES (
    caller, NULL, '', 'promoted',
    format('Congratulations! All %s worksheets across all phases have been approved. You have been promoted to Buddy/Mentor (lead_instructor).', total_required),
    v_campus_id
  );

  -- Notify academic heads in the same campus
  INSERT INTO public.notifications (user_id, from_user_id, worksheet_id, type, message, campus_id)
  SELECT id, caller, '', 'promoted',
    'A joinee has completed all phases and been promoted to lead_instructor. They can now serve as a buddy/mentor.',
    v_campus_id
  FROM public.user_profiles
  WHERE role = 'academic_head'
    AND (campus_id IS NULL OR campus_id = v_campus_id);

  RETURN jsonb_build_object(
    'promoted', true,
    'message', format('All %s worksheets approved! User promoted to Buddy/Mentor (lead_instructor).', total_required)
  );
END;
$$;

-- Update the upsert_gate_submission RPC to set campus_id
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
  v_campus_id uuid;
  result public.worksheet_submissions;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT up.assigned_buddy_id = caller, up.campus_id
  INTO is_assigned_buddy, v_campus_id
  FROM public.user_profiles up
  WHERE up.id = p_user_id;

  IF NOT (COALESCE(is_assigned_buddy, false) OR caller_role = 'academic_head') THEN
    RAISE EXCEPTION 'Not authorized to submit a gate pass for this joinee';
  END IF;

  -- Fallback: get campus_id from caller's profile
  IF v_campus_id IS NULL THEN
    SELECT campus_id INTO v_campus_id FROM public.user_profiles WHERE id = p_user_id;
  END IF;
  IF v_campus_id IS NULL THEN
    SELECT campus_id INTO v_campus_id FROM public.user_profiles WHERE id = caller;
  END IF;

  v_phase := CASE p_worksheet_id
    WHEN 'gc1' THEN 'phase1'
    WHEN 'gc2' THEN 'phase2'
    WHEN 'gc3' THEN 'phase3'
    ELSE 'phase1'
  END;

  INSERT INTO public.worksheet_submissions (
    user_id, worksheet_id, worksheet_data, phase, status,
    review_status, reviewer_type, reviewed_by, reviewed_at, campus_id
  )
  VALUES (
    p_user_id, p_worksheet_id, p_data, v_phase, 'Submitted',
    p_status, 'buddy', caller, now(), v_campus_id
  )
  ON CONFLICT (user_id, worksheet_id) DO UPDATE
  SET worksheet_data = p_data,
      review_status = p_status,
      reviewed_by = caller,
      reviewed_at = now(),
      campus_id = COALESCE(EXCLUDED.campus_id, public.worksheet_submissions.campus_id)
  RETURNING * INTO result;

  RETURN result;
END;
$$;


-- =============================================================================
-- 2. UPDATE PROMOTION REQUIRED WORKSHEETS TRIGGER — set campus_id
-- =============================================================================

-- Add campus_id to the check_due_date_notifications and promotion functions
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
  v_campus_id uuid;
BEGIN
  FOR ws_record IN
    SELECT ws.user_id, ws.worksheet_id, ws.due_date, ws.campus_id
    FROM public.worksheet_submissions ws
    WHERE ws.due_date IS NOT NULL
      AND ws.review_status NOT IN ('approved', 'buddy_approved')
  LOOP
    v_campus_id := ws_record.campus_id;

    IF ws_record.due_date < CURRENT_DATE THEN
      SELECT COUNT(*) INTO existing_count
      FROM public.notifications n
      WHERE n.user_id = ws_record.user_id
        AND n.worksheet_id = ws_record.worksheet_id
        AND n.type = 'overdue'
        AND n.created_at >= CURRENT_DATE - INTERVAL '7 days';

      IF existing_count = 0 THEN
        INSERT INTO public.notifications (user_id, from_user_id, worksheet_id, type, message, campus_id)
        VALUES (
          ws_record.user_id, NULL, ws_record.worksheet_id, 'overdue',
          format('Your worksheet (%s) is overdue! It was due on %s. Please submit it as soon as possible.',
            ws_record.worksheet_id, to_char(ws_record.due_date, 'Mon DD, YYYY')),
          v_campus_id
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
        INSERT INTO public.notifications (user_id, from_user_id, worksheet_id, type, message, campus_id)
        VALUES (
          ws_record.user_id, NULL, ws_record.worksheet_id, 'due_soon',
          format('Your worksheet (%s) is due on %s (%s day(s) remaining).',
            ws_record.worksheet_id, to_char(ws_record.due_date, 'Mon DD, YYYY'),
            GREATEST(0, (ws_record.due_date - CURRENT_DATE)::int)),
          v_campus_id
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


-- =============================================================================
-- 3. ROW LEVEL SECURITY — Update ALL existing policies with campus filtering
-- =============================================================================

-- ── Drop every policy name that has EVER existed ────────────────────────────
-- Extended list includes all legacy names plus new names this migration creates.
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
    'Users can update own submissions', 'Users can update own worksheets',
    -- Phase 3 policy names (cleanup on re-run)
    'Super admin manage profiles', 'Campus admin read profiles',
    'Super admin manage submissions', 'Super admin manage notifications'
  ];
  tables text[] := ARRAY['user_profiles', 'onboarding_submissions', 'worksheet_submissions', 'notifications'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    FOREACH pol IN ARRAY legacy_policies LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, tbl);
    END LOOP;
  END LOOP;
END $$;

-- =============================================================================
-- 3A. user_profiles POLICIES
-- =============================================================================

-- Self-read: user can read their own profile or super_admin can read any
CREATE POLICY "Select own profile" ON public.user_profiles
  FOR SELECT USING (
    id = auth.uid()
    OR public.is_super_admin()
  );

-- Signup insert: unchanged — handle_new_user trigger creates the row
CREATE POLICY "Insert own profile" ON public.user_profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- Self-update: user can update their own row; super_admin bypass
CREATE POLICY "Update own profile" ON public.user_profiles
  FOR UPDATE
  USING (
    auth.uid() = id
    OR public.is_super_admin()
  )
  WITH CHECK (
    (auth.uid() = id OR public.is_super_admin())
    AND (
      role = (SELECT p.role FROM public.user_profiles p WHERE p.id = user_profiles.id)
      OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'academic_head'
    )
  );

-- Admin read: super_admin can read all; campus-scoped for admin roles
CREATE POLICY "Admin read all profiles" ON public.user_profiles
  FOR SELECT USING (
    public.is_super_admin()
    OR (
      COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '')
        IN ('academic_head', 'lead_instructor', 'onboarding_lead', 'campus_admin')
      AND (
        user_profiles.campus_id IS NULL
        OR user_profiles.campus_id = public.get_user_campus()
      )
    )
  );

-- Admin update: super_admin can update all; campus-scoped for admin roles
CREATE POLICY "Admin update profiles" ON public.user_profiles
  FOR UPDATE
  USING (
    public.is_super_admin()
    OR (
      COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '')
        IN ('academic_head', 'lead_instructor', 'onboarding_lead', 'campus_admin')
      AND (
        user_profiles.campus_id IS NULL
        OR user_profiles.campus_id = public.get_user_campus()
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '')
        IN ('academic_head', 'lead_instructor', 'onboarding_lead', 'campus_admin')
      AND (
        user_profiles.campus_id IS NULL
        OR user_profiles.campus_id = public.get_user_campus()
      )
      AND role = (SELECT p.role FROM public.user_profiles p WHERE p.id = user_profiles.id)
    )
  );

-- =============================================================================
-- 3B. onboarding_submissions POLICIES (no campus_id column — join via user_id)
-- =============================================================================

-- Read: owner can read own; admin roles can read same-campus; super_admin can read all
CREATE POLICY "Users can read own submissions" ON public.onboarding_submissions
  FOR SELECT USING (
    auth.uid() = user_id
    OR public.is_super_admin()
    OR (
      COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '')
        IN ('academic_head', 'lead_instructor', 'onboarding_lead', 'campus_admin')
      AND EXISTS (
        SELECT 1 FROM public.user_profiles up
        WHERE up.id = onboarding_submissions.user_id
          AND (up.campus_id IS NULL OR up.campus_id = public.get_user_campus())
      )
    )
  );

-- Insert: self-insert only (unchanged)
CREATE POLICY "Users can insert own submissions" ON public.onboarding_submissions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Update: self-update only (unchanged)
CREATE POLICY "Users can update own submissions" ON public.onboarding_submissions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- 3C. worksheet_submissions POLICIES
-- =============================================================================

-- Self-read: owner can read their own submissions; super_admin can read any
CREATE POLICY "Select own submissions" ON public.worksheet_submissions
  FOR SELECT USING (
    auth.uid() = user_id
    OR public.is_super_admin()
  );

-- Insert: self-insert with campus scope (joiner can only create in their campus)
CREATE POLICY "Insert own submissions" ON public.worksheet_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND review_status IN ('', 'pending_review')
    AND reviewed_by IS NULL
    AND (
      worksheet_submissions.campus_id IS NULL
      OR worksheet_submissions.campus_id = public.get_user_campus()
      OR public.is_super_admin()
    )
  );

-- Self-update: owner updates their own submissions (campus scope by default)
CREATE POLICY "Update own submissions" ON public.worksheet_submissions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Reviewers read: super_admin bypass; admin roles + assigned buddies/managers, campus-scoped
CREATE POLICY "Reviewers select submissions" ON public.worksheet_submissions
  FOR SELECT USING (
    public.is_super_admin()
    OR (
      (
        COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '')
          IN ('lead_instructor', 'academic_head', 'onboarding_lead', 'campus_admin')
        OR auth.uid() = user_id
        OR auth.uid() IN (
          SELECT assigned_lead_id FROM public.user_profiles WHERE id = worksheet_submissions.user_id
        )
        OR auth.uid() IN (
          SELECT assigned_buddy_id FROM public.user_profiles WHERE id = worksheet_submissions.user_id
        )
      )
      AND (
        worksheet_submissions.campus_id IS NULL
        OR worksheet_submissions.campus_id = public.get_user_campus()
      )
    )
  );

-- Buddy update: campus-scoped
CREATE POLICY "Buddy update submissions" ON public.worksheet_submissions
  FOR UPDATE
  USING (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'lead_instructor'
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = worksheet_submissions.user_id
        AND (up.assigned_buddy_id = auth.uid() OR up.assigned_buddy_id IS NULL)
        AND (up.campus_id IS NULL OR up.campus_id = public.get_user_campus() OR public.is_super_admin())
    )
  )
  WITH CHECK (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'lead_instructor'
    AND review_status IN ('buddy_approved', 'needs_revision')
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = worksheet_submissions.user_id
        AND (up.assigned_buddy_id = auth.uid() OR up.assigned_buddy_id IS NULL)
        AND (up.campus_id IS NULL OR up.campus_id = public.get_user_campus() OR public.is_super_admin())
    )
  );

-- Manager update: campus-scoped
CREATE POLICY "Manager update submissions" ON public.worksheet_submissions
  FOR UPDATE
  USING (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'academic_head'
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = worksheet_submissions.user_id
        AND (up.assigned_lead_id = auth.uid() OR up.assigned_lead_id IS NULL)
        AND (up.campus_id IS NULL OR up.campus_id = public.get_user_campus() OR public.is_super_admin())
    )
  )
  WITH CHECK (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'academic_head'
    AND review_status = 'approved'
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = worksheet_submissions.user_id
        AND (up.assigned_lead_id = auth.uid() OR up.assigned_lead_id IS NULL)
        AND (up.campus_id IS NULL OR up.campus_id = public.get_user_campus() OR public.is_super_admin())
    )
  );

-- =============================================================================
-- 3D. notifications POLICIES
-- =============================================================================

-- Read own notifications: user reads their own; super_admin reads any
CREATE POLICY "Users can read own notifications" ON public.notifications
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_super_admin()
  );

-- Insert self-notifications (unchanged)
CREATE POLICY "Users can insert notifications" ON public.notifications
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND user_id = auth.uid());

-- Update own notifications (unchanged)
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- =============================================================================
-- 4. AUDIT LOGGING TRIGGERS
-- =============================================================================

-- ── log_worksheet_review_action: log review status changes ─────────────────
CREATE OR REPLACE FUNCTION public.log_worksheet_review_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.review_status IS DISTINCT FROM NEW.review_status THEN
    INSERT INTO public.audit_logs (
      campus_id, user_id, action, resource_type, resource_id, details
    ) VALUES (
      COALESCE(NEW.campus_id, OLD.campus_id),
      auth.uid(),
      'worksheet_submissions.review_status_changed',
      'worksheet_submission',
      NEW.id::text,
      jsonb_build_object(
        'worksheet_id', NEW.worksheet_id,
        'user_id', NEW.user_id,
        'old_status', OLD.review_status,
        'new_status', NEW.review_status,
        'reviewer_name', NEW.reviewer_name
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_worksheet_review_action ON public.worksheet_submissions;
CREATE TRIGGER log_worksheet_review_action
  AFTER UPDATE OF review_status ON public.worksheet_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.log_worksheet_review_action();

-- ── log_profile_change: log role and assignment changes ────────────────────
CREATE OR REPLACE FUNCTION public.log_profile_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    v_changes := v_changes || jsonb_build_object('role', jsonb_build_object('from', OLD.role, 'to', NEW.role));
  END IF;
  IF OLD.assigned_lead_id IS DISTINCT FROM NEW.assigned_lead_id THEN
    v_changes := v_changes || jsonb_build_object('assigned_lead', jsonb_build_object('from', OLD.assigned_lead_id, 'to', NEW.assigned_lead_id));
  END IF;
  IF OLD.assigned_buddy_id IS DISTINCT FROM NEW.assigned_buddy_id THEN
    v_changes := v_changes || jsonb_build_object('assigned_buddy', jsonb_build_object('from', OLD.assigned_buddy_id, 'to', NEW.assigned_buddy_id));
  END IF;

  IF v_changes <> '{}'::jsonb THEN
    INSERT INTO public.audit_logs (
      campus_id, user_id, action, resource_type, resource_id, details
    ) VALUES (
      COALESCE(NEW.campus_id, OLD.campus_id),
      auth.uid(),
      CASE
        WHEN v_changes ? 'role' THEN 'user_profiles.role_changed'
        WHEN v_changes ? 'assigned_lead' THEN 'user_profiles.lead_assigned'
        WHEN v_changes ? 'assigned_buddy' THEN 'user_profiles.buddy_assigned'
        ELSE 'user_profiles.updated'
      END,
      'user_profile',
      NEW.id::text,
      v_changes
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_profile_change ON public.user_profiles;
CREATE TRIGGER log_profile_change
  AFTER UPDATE OF role, assigned_lead_id, assigned_buddy_id ON public.user_profiles
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.log_profile_change();

-- ── log_campus_change: log campus CRUD operations ─────────────────────────
CREATE OR REPLACE FUNCTION public.log_campus_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_action text;
  v_details jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'campus.created';
    v_details := jsonb_build_object('name', NEW.name, 'slug', NEW.slug);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'campus.updated';
    v_details := jsonb_build_object(
      'name', CASE WHEN OLD.name IS DISTINCT FROM NEW.name THEN jsonb_build_object('from', OLD.name, 'to', NEW.name) ELSE NULL END,
      'is_active', CASE WHEN OLD.is_active IS DISTINCT FROM NEW.is_active THEN jsonb_build_object('from', OLD.is_active, 'to', NEW.is_active) ELSE NULL END
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'campus.deleted';
    v_details := jsonb_build_object('name', OLD.name, 'slug', OLD.slug);
  END IF;

  IF v_details IS NOT NULL AND v_details <> '{}'::jsonb THEN
    INSERT INTO public.audit_logs (campus_id, user_id, action, resource_type, resource_id, details)
    VALUES (
      COALESCE(NEW.id, OLD.id),
      auth.uid(),
      v_action,
      'campus',
      COALESCE(NEW.id::text, OLD.id::text),
      v_details
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS log_campus_change ON public.campuses;
CREATE TRIGGER log_campus_change
  AFTER INSERT OR UPDATE OR DELETE ON public.campuses
  FOR EACH ROW
  EXECUTE FUNCTION public.log_campus_change();


-- =============================================================================
-- 5. BACKFILL campus_id FOR EXISTING NOTIFICATIONS
-- =============================================================================

-- For existing notifications without campus_id, try to derive it from the
-- user's profile. This is safe to re-run.
UPDATE public.notifications n
SET campus_id = up.campus_id
FROM public.user_profiles up
WHERE n.user_id = up.id
  AND n.campus_id IS NULL
  AND up.campus_id IS NOT NULL;

-- For existing worksheet_submissions without campus_id
UPDATE public.worksheet_submissions ws
SET campus_id = up.campus_id
FROM public.user_profiles up
WHERE ws.user_id = up.id
  AND ws.campus_id IS NULL
  AND up.campus_id IS NOT NULL;


-- =============================================================================
-- 6. GRANT PERMISSIONS
-- =============================================================================

-- Ensure authenticated users can call helper functions
GRANT EXECUTE ON FUNCTION public.get_user_campus() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_campus_access(uuid) TO authenticated;
