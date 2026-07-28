-- =============================================================================
-- Migration: Auto-assign campus onboarding template on signup / campus selection
-- =============================================================================
-- When a user signs up (or when an existing user sets their campus_id via the
-- /select-campus page), this migration auto-assigns the campus's default or
-- active onboarding template to their profile.
--
-- Changes:
--   1. Adds assigned_template_id column to user_profiles (FK → onboarding_templates)
--   2. Creates a trigger function that auto-assigns the campus template when
--      campus_id is set/updated
--   3. Updates handle_new_user() to also set assigned_template_id
--   4. Creates a trigger on user_profiles.campus_id changes
--   5. Creates a helper function get_campus_template_id(campus_id)
--   6. Backfills assigned_template_id for existing users
--   7. Updates sync_role_to_app_metadata to also sync assigned_template_id
--
-- Every statement is idempotent and safe to re-run.
-- =============================================================================

-- =============================================================================
-- 1. ADD assigned_template_id COLUMN TO user_profiles
-- =============================================================================

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS assigned_template_id UUID;

-- Add foreign key (idempotent)
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_assigned_template_id_fkey;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_assigned_template_id_fkey
  FOREIGN KEY (assigned_template_id)
  REFERENCES public.onboarding_templates(id)
  ON DELETE SET NULL;


-- =============================================================================
-- 2. HELPER: get_campus_template_id(campus_id) — returns the best template
--    for a given campus. Priority: active template → default template → NULL.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_campus_template_id(p_campus_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- Try active template first, then default template
  SELECT COALESCE(
    (SELECT id FROM public.onboarding_templates
     WHERE campus_id = p_campus_id AND is_active = TRUE
     ORDER BY is_default DESC, created_at DESC LIMIT 1),
    (SELECT id FROM public.onboarding_templates
     WHERE campus_id = p_campus_id AND is_default = TRUE
     LIMIT 1)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_campus_template_id(uuid) TO authenticated;


-- =============================================================================
-- 3. TRIGGER FUNCTION: auto_assign_template_on_campus_change
-- =============================================================================
-- Fires when campus_id is set or changed on user_profiles.
-- Finds the campus's default/active template and stores its ID.

CREATE OR REPLACE FUNCTION public.auto_assign_template_on_campus_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only act when campus_id changes to a non-null value
  IF NEW.campus_id IS NOT NULL
     AND (OLD.campus_id IS DISTINCT FROM NEW.campus_id)
  THEN
    NEW.assigned_template_id := public.get_campus_template_id(NEW.campus_id);
  END IF;

  -- If campus_id is cleared, also clear the template assignment
  IF NEW.campus_id IS NULL AND OLD.campus_id IS NOT NULL THEN
    NEW.assigned_template_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Create the trigger (BEFORE UPDATE so we modify NEW before it's written)
DROP TRIGGER IF EXISTS auto_assign_template_on_campus_change ON public.user_profiles;
CREATE TRIGGER auto_assign_template_on_campus_change
  BEFORE UPDATE OF campus_id ON public.user_profiles
  FOR EACH ROW
  WHEN (OLD.campus_id IS DISTINCT FROM NEW.campus_id)
  EXECUTE FUNCTION public.auto_assign_template_on_campus_change();


-- =============================================================================
-- 4. UPDATE handle_new_user — auto-assign template on signup
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_campus_id uuid;
  v_template_id uuid;
BEGIN
  -- Only set campus_id if explicitly provided in signup metadata
  BEGIN
    v_campus_id := (NEW.raw_user_meta_data ->> 'campus_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_campus_id := NULL;
  END;

  -- Auto-assign template if campus_id is known
  IF v_campus_id IS NOT NULL THEN
    v_template_id := public.get_campus_template_id(v_campus_id);
  END IF;

  INSERT INTO public.user_profiles (id, email, full_name, role, campus_id, start_date, assigned_template_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      split_part(NEW.email, '@', 1)
    ),
    'new_joinee',
    v_campus_id,
    NOW()::date,
    v_template_id
  )
  ON CONFLICT (id)
  DO UPDATE SET
    campus_id = COALESCE(EXCLUDED.campus_id, public.user_profiles.campus_id),
    start_date = COALESCE(EXCLUDED.start_date, public.user_profiles.start_date),
    assigned_template_id = COALESCE(EXCLUDED.assigned_template_id, public.user_profiles.assigned_template_id)
  WHERE public.user_profiles.campus_id IS NULL;

  RETURN NEW;
END;
$$;


-- =============================================================================
-- 5. UPDATE sync_role_to_app_metadata — also sync assigned_template_id
-- =============================================================================

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

-- Ensure the sync trigger also fires on assigned_template_id changes
DROP TRIGGER IF EXISTS sync_role_to_app_metadata ON public.user_profiles;
CREATE TRIGGER sync_role_to_app_metadata
  AFTER INSERT OR UPDATE OF role, campus_id, assigned_template_id
  ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_role_to_app_metadata();


-- =============================================================================
-- 6. BACKFILL assigned_template_id FOR EXISTING USERS
-- =============================================================================
-- For users who already have a campus_id but no assigned_template_id.
-- Safe to re-run (updates only where NULL or where the template has changed).

UPDATE public.user_profiles up
SET assigned_template_id = public.get_campus_template_id(up.campus_id)
WHERE up.campus_id IS NOT NULL
  AND (up.assigned_template_id IS NULL OR up.assigned_template_id NOT IN (
    SELECT id FROM public.onboarding_templates WHERE campus_id = up.campus_id
  ));


-- =============================================================================
-- 7. GRANT PERMISSIONS
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.get_campus_template_id(uuid) TO PUBLIC;

-- =============================================================================
-- Verify with:
--   SELECT id, email, campus_id, assigned_template_id
--   FROM public.user_profiles
--   WHERE campus_id IS NOT NULL
--   ORDER BY created_at DESC;
-- =============================================================================
