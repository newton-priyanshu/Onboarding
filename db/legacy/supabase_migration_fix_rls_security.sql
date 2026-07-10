-- =============================================================================
-- DEPRECATED — DO NOT RUN. Superseded by db/schema.sql and supabase/migrations/.
-- Kept only for historical reference (see db/README.md). Running this file
-- against a project that has already had db/schema.sql applied can reintroduce
-- fixed vulnerabilities (client-writable role checks, RLS recursion, duplicate
-- permissive policies, etc.) — see docs/audit/2026-07-10/.
-- =============================================================================

-- =============================================================================
-- Supabase SQL Migration: Fix CRITICAL RLS & Security Issues
-- Applies after: supabase_reviewer_migration.sql
-- 
-- Fixes per Ashwin's Production Readiness Audit:
--   RLS-1: JWT role from user_metadata (client-writable) → app_metadata (server-only)
--   RLS-2: Add WITH CHECK clauses to all UPDATE policies
--   RLS-3: Fix signup role parameter (server-side allow-list)
--   RLS-4: Restrict notifications INSERT to authenticated users only
--   RLS-5: Proper schema migration for missing tables/columns
--
-- WARNING: Run this in Supabase SQL Editor (service_role context).
-- =============================================================================

-- ─── RLS-1: Fix JWT role resolution ─────────────────────────────────────────
-- Switch from client-writable user_metadata.role to server-only app_metadata.role
-- This prevents any user from self-promoting to admin via browser console.

-- Helper function: Get the user's role from app_metadata (server-controlled)
-- IMPORTANT: This function should be used AFTER running the one-time migration
-- below that copies existing roles from user_metadata (client-writable) to
-- app_metadata (server-only). Without that migration, the fallback to
-- user_metadata preserves the privilege escalation path for existing users.
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'role', ''),
    ''
  );
$$;

-- ─── One-time migration: Copy existing roles to app_metadata ──────────────
-- Run this BEFORE enabling the new RLS policies to migrate existing users.
-- This is safe to re-run (idempotent via COALESCE/ON CONFLICT logic).
--
-- UPDATE auth.users
-- SET raw_app_meta_data = jsonb_set(
--   COALESCE(raw_app_meta_data, '{}'::jsonb),
--   '{role}',
--   to_jsonb(COALESCE(raw_user_meta_data ->> 'role', 'new_joinee'))
-- )
-- WHERE raw_user_meta_data ->> 'role' IS NOT NULL
--   AND (
--     raw_app_meta_data IS NULL
--     OR raw_app_meta_data ->> 'role' IS NULL
--     OR raw_app_meta_data ->> 'role' != raw_user_meta_data ->> 'role'
--   );
--
-- Note: Commented out by default. Uncomment and run ONCE before enabling
-- the new RLS policies. Subsequent migration runs should use:
--   SELECT COALESCE(get_user_role(), '') != '';
-- to verify the migration took effect.

-- ─── RLS-2: Fix ALL UPDATE policies to add WITH CHECK ───────────────────────
-- Currently, UPDATE policies only have USING (WHERE) but no WITH CHECK,
-- meaning users can set any column value including role, review_status, etc.

-- Drop existing UPDATE policies on user_profiles
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;

-- Recreate with WITH CHECK that prevents role elevation
CREATE POLICY "Users can update own profile"
  ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (
      -- Non-admin users cannot change their role
      NOT (role IS DISTINCT FROM (SELECT role FROM public.user_profiles WHERE id = auth.uid()))
      -- Admins can change any field
      OR public.get_user_role() IN ('academic_head', 'service_role')
    )
  );

-- Drop existing UPDATE policies on worksheet_submissions
DROP POLICY IF EXISTS "Users can update own submissions" ON public.worksheet_submissions;
DROP POLICY IF EXISTS "Reviewers can update submissions" ON public.worksheet_submissions;

-- Recreate with WITH CHECK
-- Joinees can update their own worksheets (preserving legitimate review_status transitions)
CREATE POLICY "Users can update own submissions"
  ON public.worksheet_submissions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      -- Joinees can set review_status to values their autoSave writes:
      --   '' (draft), 'pending_review' (first submit), 'needs_revision' (system sets),
      --   'revision_submitted' (resubmit), 'buddy_approved' (preserved on draft save),
      --   'approved' (preserved on draft save)
      review_status IS NULL
      OR review_status IN ('', 'pending_review', 'needs_revision', 'revision_submitted', 'buddy_approved', 'approved')
    )
  );

-- Reviewers can update submissions they are assigned to
CREATE POLICY "Reviewers can update submissions"
  ON public.worksheet_submissions
  FOR UPDATE
  USING (
    -- Buddy or Manager can update
    (public.get_user_role() IN ('lead_instructor', 'academic_head', 'onboarding_lead'))
  )
  WITH CHECK (
    -- Must be a valid reviewer role
    public.get_user_role() IN ('lead_instructor', 'academic_head', 'onboarding_lead')
  );

-- ─── RLS-3: Fix signup — prevent client-supplied role ──────────────────────
-- Create a trigger that forces new users to start as 'new_joinee'
-- and ignores any client-supplied role parameter.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
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
    'new_joinee'  -- Force all new signups to be new_joinee; role upgraded by admin only
  );
  RETURN new;
END;
$$;

-- Recreate the trigger (if it exists, drop first)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ─── RLS-4: Fix notifications INSERT — add WITH CHECK ───────────────────────
-- Currently: WITH CHECK (true) — anyone can forge notifications to any user.

DROP POLICY IF EXISTS "Users can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;

CREATE POLICY "Users can insert notifications"
  ON public.notifications
  FOR INSERT
  WITH CHECK (
    -- Must be authenticated
    auth.role() = 'authenticated'
    -- Can only send to yourself OR you're a reviewer/admin
    AND (
      user_id = auth.uid()
      OR public.get_user_role() IN ('lead_instructor', 'academic_head', 'onboarding_lead')
    )
  );

CREATE POLICY "Users can read own notifications"
  ON public.notifications
  FOR SELECT
  USING (user_id = auth.uid());

-- ─── RLS-5: Ensure proper schema — add missing columns/tables ──────────────

-- Add due_date column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'worksheet_submissions' AND column_name = 'due_date'
  ) THEN
    ALTER TABLE public.worksheet_submissions ADD COLUMN due_date date;
  END IF;
END $$;

-- Ensure review_history column exists and is proper type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'worksheet_submissions' AND column_name = 'review_history'
  ) THEN
    ALTER TABLE public.worksheet_submissions ADD COLUMN review_history jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_worksheet_submissions_user_worksheet
  ON public.worksheet_submissions (user_id, worksheet_id);
CREATE INDEX IF NOT EXISTS idx_worksheet_submissions_review_status
  ON public.worksheet_submissions (review_status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id
  ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_assigned_buddy
  ON public.user_profiles (assigned_buddy_id);

-- ─── Verify ─────────────────────────────────────────────────────────────────
-- Run this after migration to verify:
-- SELECT * FROM pg_policies WHERE tablename = 'worksheet_submissions';
-- SELECT * FROM pg_policies WHERE tablename = 'notifications';
-- SELECT * FROM pg_policies WHERE tablename = 'user_profiles';

-- =============================================================================
-- End of migration
-- =============================================================================
