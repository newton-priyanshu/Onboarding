-- =============================================================================
-- Migration: fix get_user_role() — fall back to user_profiles when JWT
-- app_metadata is missing the role, plus re-sync all existing roles.
--
-- Problem: get_user_role() reads exclusively from auth.jwt() -> app_metadata.
-- If the sync_role_to_app_metadata trigger never fired for a user (e.g.,
-- profiles created directly via SQL before the trigger existed, or the
-- trigger failed silently), the JWT has no "role" key, get_user_role()
-- returns '', and every RLS policy that checks
--   public.get_user_role() IN ('academic_head', ...)
-- fails — the user can only see their own row.
--
-- Fix: switch from pure-JWT to a fallback chain:
--   1. JWT app_metadata (fast path, avoids DB query for most users)
--   2. DB query on user_profiles (SECURITY DEFINER — bypasses RLS)
--   3. Empty string fallback
--
-- Also re-runs the role-backfill UPDATE so existing users get their role
-- pushed into app_metadata immediately.
-- =============================================================================

-- ── Update get_user_role with DB fallback ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''),
    (SELECT role FROM public.user_profiles WHERE id = auth.uid()),
    ''
  );
$$;

-- ── Backfill: sync all existing user_profiles.role into auth.users ─────────
-- Safe to re-run: only touches rows where the two are out of sync.

UPDATE auth.users u
SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', up.role)
FROM public.user_profiles up
WHERE up.id = u.id
  AND (u.raw_app_meta_data ->> 'role') IS DISTINCT FROM up.role;
