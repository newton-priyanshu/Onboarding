-- =============================================================================
-- Migration: role resolution (app_metadata-only get_user_role, role<->app_metadata sync) and forced-new_joinee signup
--
-- This is an ordered, verbatim slice of db/schema.sql (the canonical full
-- snapshot — see db/README.md for how these two are kept in sync and which
-- one to run). Every statement here is idempotent and safe to re-run.
-- =============================================================================

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


