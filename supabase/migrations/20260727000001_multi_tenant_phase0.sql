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
