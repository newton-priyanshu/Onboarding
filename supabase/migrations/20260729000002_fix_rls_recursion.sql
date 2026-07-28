-- =============================================================================
-- Migration: Fix RLS infinite recursion in get_user_role() + sync_role trigger
-- =============================================================================
-- Root cause: get_user_role() has a DB query fallback:
--   (SELECT role FROM public.user_profiles WHERE id = auth.uid())
-- When called from within an RLS policy (via is_super_admin()), this
-- subquery triggers ANOTHER RLS evaluation on user_profiles, which may
-- again call is_super_admin() → infinite recursion.
--
-- Fix:
--   1. Remove DB fallback from get_user_role() — only read from JWT
--   2. Re-sync all roles into app_metadata (the sync_role_to_app_metadata
--      trigger handles future updates automatically)
--   3. Verify the sync_role_to_app_metadata trigger exists and is active
--
-- Backward compatibility: get_user_role() now returns '' (empty string)
-- when the JWT lacks the role key. Since sync_role_to_app_metadata runs
-- on every INSERT and UPDATE of user_profiles.role, every user with a
-- profile row will have the role in their JWT. The backfill below handles
-- all existing users.
-- =============================================================================

-- ── 1. Fix get_user_role() — remove DB fallback, only read JWT ─────────────
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''),
    ''
  );
$$;


-- ── 2. Ensure sync_role_to_app_metadata trigger is active ──────────────────
-- Recreate the trigger function (latest version from multi-tenant migrations)
CREATE OR REPLACE FUNCTION public.sync_role_to_app_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.campus_id IS DISTINCT FROM OLD.campus_id
     OR NEW.assigned_template_id IS DISTINCT FROM OLD.assigned_template_id
  THEN
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object(
           'role', NEW.role,
           'campus_id', NEW.campus_id,
           'assigned_template_id', NEW.assigned_template_id
         )
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Ensure the trigger is attached (idempotent)
DROP TRIGGER IF EXISTS sync_role_to_app_metadata ON public.user_profiles;
CREATE TRIGGER sync_role_to_app_metadata
  AFTER INSERT OR UPDATE OF role, campus_id, assigned_template_id
  ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_role_to_app_metadata();


-- ── 3. Backfill: sync ALL existing user roles into auth.users.app_metadata ─
-- This ensures every existing user has role + campus_id in their JWT.
UPDATE auth.users u
SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object(
       'role', up.role,
       'campus_id', up.campus_id,
       'assigned_template_id', up.assigned_template_id
     )
FROM public.user_profiles up
WHERE up.id = u.id
  AND (
    (u.raw_app_meta_data ->> 'role') IS DISTINCT FROM up.role
    OR (u.raw_app_meta_data ->> 'campus_id') IS DISTINCT FROM up.campus_id::text
    OR (u.raw_app_meta_data ->> 'assigned_template_id') IS DISTINCT FROM up.assigned_template_id::text
  );


-- ── 4. Verify ──────────────────────────────────────────────────────────────
-- Run these queries in Supabase SQL Editor to verify the fix:
--
--   -- Check that get_user_role() no longer has a DB fallback:
--   SELECT prosrc FROM pg_proc WHERE proname = 'get_user_role';
--   -- The result should NOT contain 'user_profiles'
--
--   -- Check sync trigger exists:
--   SELECT tgname FROM pg_trigger WHERE tgname = 'sync_role_to_app_metadata';
--
--   -- Count users with missing role in app_metadata (should be 0 after backfill):
--   SELECT count(*) FROM auth.users u
--   LEFT JOIN public.user_profiles up ON up.id = u.id
--   WHERE (u.raw_app_meta_data ->> 'role') IS DISTINCT FROM up.role;
-- =============================================================================
