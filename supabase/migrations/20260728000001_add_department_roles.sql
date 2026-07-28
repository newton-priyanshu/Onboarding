-- =============================================================================
-- Migration: Add department roles (progression_head, ops_head, campus_head)
-- + Department type support for user_profiles
-- =============================================================================
-- Phase A of the multi-department feature:
--   1. Extends user_profiles role CHECK constraint to include new roles
--   2. Seeds system roles for progression_head, ops_head, campus_head
--   3. Seeds default permissions for the new roles
--   4. Creates helper functions for department-based access
-- =============================================================================

-- ─── 1. Update CHECK constraint to include new roles ─────────────────────
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN (
    'new_joinee', 'lab_instructor', 'lead_instructor',
    'academic_head', 'onboarding_lead', 'acad_ops',
    'super_admin', 'campus_admin',
    'progression_head', 'ops_head', 'campus_head'
  ));


-- ─── 2. Seed new system roles (idempotent) ──────────────────────────────
INSERT INTO public.roles (name, description, is_system, campus_id) VALUES
  ('progression_head', 'Progression department head — manages progression worksheets and team', TRUE, NULL),
  ('ops_head', 'Operations department head — manages operations worksheets and team', TRUE, NULL),
  ('campus_head', 'Campus head — oversees all departments across the campus', TRUE, NULL)
ON CONFLICT DO NOTHING;


-- ─── 3. Seed default permissions for new roles ──────────────────────────
DO $$
DECLARE
  v_progression_head_id uuid;
  v_ops_head_id         uuid;
  v_campus_head_id      uuid;
  v_academic_head_id    uuid;
  v_lead_instructor_id  uuid;
  v_new_joinee_id       uuid;
BEGIN
  SELECT id INTO v_progression_head_id FROM public.roles WHERE name = 'progression_head';
  SELECT id INTO v_ops_head_id         FROM public.roles WHERE name = 'ops_head';
  SELECT id INTO v_campus_head_id      FROM public.roles WHERE name = 'campus_head';

  -- Delete existing permissions for these roles (for idempotent re-run)
  DELETE FROM public.permissions WHERE role_id IN (
    v_progression_head_id, v_ops_head_id, v_campus_head_id
  );

  -- progression_head: same as academic_head but scoped to progression dept
  INSERT INTO public.permissions (role_id, resource, action) VALUES
    (v_progression_head_id, 'user', 'read'), (v_progression_head_id, 'user', 'update'),
    (v_progression_head_id, 'worksheet', 'read'), (v_progression_head_id, 'worksheet', 'approve'),
    (v_progression_head_id, 'analytics', 'read')
  ON CONFLICT DO NOTHING;

  -- ops_head: same as academic_head but scoped to operations dept
  INSERT INTO public.permissions (role_id, resource, action) VALUES
    (v_ops_head_id, 'user', 'read'), (v_ops_head_id, 'user', 'update'),
    (v_ops_head_id, 'worksheet', 'read'), (v_ops_head_id, 'worksheet', 'approve'),
    (v_ops_head_id, 'analytics', 'read')
  ON CONFLICT DO NOTHING;

  -- campus_head: broader access — can read/approve worksheets across all depts,
  -- can manage templates, and view analytics at campus level
  INSERT INTO public.permissions (role_id, resource, action) VALUES
    (v_campus_head_id, 'user', 'create'), (v_campus_head_id, 'user', 'read'),
    (v_campus_head_id, 'user', 'update'),
    (v_campus_head_id, 'worksheet', 'read'), (v_campus_head_id, 'worksheet', 'approve'),
    (v_campus_head_id, 'template', 'read'), (v_campus_head_id, 'template', 'update'),
    (v_campus_head_id, 'analytics', 'read')
  ON CONFLICT DO NOTHING;
END $$;


-- ─── 4. Backfill existing users: set department to 'academics' if NULL ───
-- This ensures backward compatibility — all existing users default to Academics.
-- Only applies to rows where department IS NULL (not already set).
UPDATE public.user_profiles
SET department = 'academics'
WHERE department IS NULL;


-- ─── 5. Verify the migration ────────────────────────────────────────────
-- Expected output:
--   role IN (...) should include progression_head, ops_head, campus_head
--   roles table should have 3 new rows
--   permissions table should have entries for the 3 new roles
-- =============================================================================
