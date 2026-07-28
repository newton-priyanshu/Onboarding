-- =============================================================================
-- Migration: Add start_date column to user_profiles
-- =============================================================================
-- The canonical schema (db/schema.sql) defines start_date on user_profiles,
-- but it was never added via a migration. The useAutoSave and useDueDates
-- hooks read this column to calculate due dates.
-- =============================================================================

-- ── 1. Add start_date column ────────────────────────────────────────────
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS start_date DATE;

-- Default start_date to the user's created_at for existing rows
-- (run only if column was just added)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_profiles'
    AND column_name = 'start_date'
  ) THEN
    UPDATE public.user_profiles
    SET start_date = created_at::date
    WHERE start_date IS NULL;
  END IF;
END $$;

-- Make sure handle_new_user sets start_date correctly
-- (replaces the version from fix_handle_new_user.sql)
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

  INSERT INTO public.user_profiles (id, email, full_name, role, campus_id, start_date)
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
    NOW()::date  -- start_date = today
  )
  ON CONFLICT (id)
  DO UPDATE SET
    campus_id = COALESCE(EXCLUDED.campus_id, public.user_profiles.campus_id),
    start_date = COALESCE(EXCLUDED.start_date, public.user_profiles.start_date)
  WHERE public.user_profiles.campus_id IS NULL;

  RETURN NEW;
END;
$$;
