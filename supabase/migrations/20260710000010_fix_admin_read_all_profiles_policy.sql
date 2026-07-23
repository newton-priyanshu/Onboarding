-- =============================================================================
-- Migration: fix "Admin read all profiles" and related RLS policies to read
-- role directly from the JWT instead of calling get_user_role().
--
-- Problem: get_user_role() works correctly when called via RPC (returns
-- 'academic_head') but when called from within an RLS policy context on
-- user_profiles, it fails to permit row visibility for academic_head users
-- while lead_instructor users work fine. Root cause is unclear — could be
-- a Postgres RLS recursion guard, a search_path subtlety, or a Supabase
-- platform-specific behavior where SECURITY DEFINER functions behave
-- differently inside a policy evaluation vs. direct invocation.
--
-- Fix: replace every public.get_user_role() call in FOR SELECT USING
-- policies with auth.jwt() -> 'app_metadata' ->> 'role' directly, which
-- eliminates the function-call layer and reads the role straight from the
-- session JWT. The role was already backfilled into app_metadata by
-- migration 09, so the JWT always has it for correctly configured users.
-- =============================================================================

-- ── user_profiles ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admin read all profiles" ON public.user_profiles;
CREATE POLICY "Admin read all profiles" ON public.user_profiles
  FOR SELECT USING (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('academic_head', 'lead_instructor', 'onboarding_lead')
  );

DROP POLICY IF EXISTS "Admin update profiles" ON public.user_profiles;
CREATE POLICY "Admin update profiles" ON public.user_profiles
  FOR UPDATE
  USING (COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('academic_head', 'lead_instructor', 'onboarding_lead'))
  WITH CHECK (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('academic_head', 'lead_instructor', 'onboarding_lead')
    AND role = (SELECT p.role FROM public.user_profiles p WHERE p.id = user_profiles.id)
  );

-- Update own profile policy still needs get_user_role for the WITH CHECK
-- (role-changing logic), but we can replace it too for consistency
DROP POLICY IF EXISTS "Update own profile" ON public.user_profiles;
CREATE POLICY "Update own profile" ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (
      role = (SELECT p.role FROM public.user_profiles p WHERE p.id = user_profiles.id)
      OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'academic_head'
    )
  );

-- ── onboarding_submissions ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can read own submissions" ON public.onboarding_submissions;
CREATE POLICY "Users can read own submissions" ON public.onboarding_submissions
  FOR SELECT USING (
    auth.uid() = user_id
    OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('academic_head', 'lead_instructor', 'onboarding_lead')
  );

-- ── worksheet_submissions ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "Reviewers select submissions" ON public.worksheet_submissions;
CREATE POLICY "Reviewers select submissions" ON public.worksheet_submissions
  FOR SELECT USING (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('lead_instructor', 'academic_head', 'onboarding_lead')
    OR auth.uid() = user_id
    OR auth.uid() IN (SELECT assigned_lead_id FROM public.user_profiles WHERE id = worksheet_submissions.user_id)
    OR auth.uid() IN (SELECT assigned_buddy_id FROM public.user_profiles WHERE id = worksheet_submissions.user_id)
  );

DROP POLICY IF EXISTS "Buddy update submissions" ON public.worksheet_submissions;
CREATE POLICY "Buddy update submissions" ON public.worksheet_submissions
  FOR UPDATE
  USING (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'lead_instructor'
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = worksheet_submissions.user_id
        AND (up.assigned_buddy_id = auth.uid() OR up.assigned_buddy_id IS NULL)
    )
  )
  WITH CHECK (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'lead_instructor'
    AND review_status IN ('buddy_approved', 'needs_revision')
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = worksheet_submissions.user_id
        AND (up.assigned_buddy_id = auth.uid() OR up.assigned_buddy_id IS NULL)
    )
  );

DROP POLICY IF EXISTS "Manager update submissions" ON public.worksheet_submissions;
CREATE POLICY "Manager update submissions" ON public.worksheet_submissions
  FOR UPDATE
  USING (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'academic_head'
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = worksheet_submissions.user_id
        AND (up.assigned_lead_id = auth.uid() OR up.assigned_lead_id IS NULL)
    )
  )
  WITH CHECK (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'academic_head'
    AND review_status = 'approved'
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = worksheet_submissions.user_id
        AND (up.assigned_lead_id = auth.uid() OR up.assigned_lead_id IS NULL)
    )
  );

-- ── Re-run backfill for safety ──────────────────────────────────────────────

UPDATE auth.users u
SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', up.role)
FROM public.user_profiles up
WHERE up.id = u.id
  AND (u.raw_app_meta_data ->> 'role') IS DISTINCT FROM up.role;
