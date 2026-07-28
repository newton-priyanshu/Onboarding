-- =============================================================================
-- Fix: handle_new_user trigger should NOT auto-assign default campus
-- =============================================================================
-- Problem: When a new user signs up without specifying a campus_id in metadata
-- (which is correct — the campus dropdown was removed from signup), the
-- handle_new_user trigger falls back to the "Default Campus". This causes
-- HomeRoute to see campus_id is already set, and never redirects to
-- /select-campus.
--
-- Fix: Remove the default campus fallback. Only set campus_id if one was
-- explicitly provided in the signup metadata.
-- =============================================================================

-- ── 1. Update handle_new_user to NOT auto-assign a default campus ─────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_campus_id uuid;
BEGIN
  -- Only set campus_id if explicitly provided in signup metadata
  BEGIN
    v_campus_id := (NEW.raw_user_meta_data ->> 'campus_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_campus_id := NULL;
  END;

  -- NO default campus fallback — user must select campus on first login
  -- via the /select-campus page.

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
    v_campus_id  -- NULL if not provided — user picks campus after login
  )
  ON CONFLICT (id)
  DO UPDATE SET
    campus_id = COALESCE(EXCLUDED.campus_id, public.user_profiles.campus_id)
  WHERE public.user_profiles.campus_id IS NULL;

  RETURN NEW;
END;
$$;


-- ── 2. Create get_active_campuses() RPC for anonymous users ──────────────
-- This SECURITY DEFINER function bypasses RLS so anonymous users on the
-- signup page and new users on the /select-campus page can read active campuses.
CREATE OR REPLACE FUNCTION public.get_active_campuses()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result json;
BEGIN
  SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json) INTO result
  FROM (
    SELECT id, name, slug, domain, is_active, branding, created_at, updated_at
    FROM public.campuses
    WHERE is_active = TRUE
    ORDER BY name ASC
  ) c;
  RETURN result;
END;
$$;

-- Grant execute to PUBLIC (including anonymous users)
GRANT EXECUTE ON FUNCTION public.get_active_campuses() TO PUBLIC;


-- ── 3. Verify the fix ───────────────────────────────────────────────────
-- Run this query to confirm the function was updated:
--   SELECT proname, prosrc FROM pg_proc WHERE proname = 'handle_new_user';
--
-- The function should NOT contain 'campuses WHERE slug' anymore.
-- =============================================================================
