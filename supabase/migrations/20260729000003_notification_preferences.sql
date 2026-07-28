-- =============================================================================
-- Migration: Notification Preferences
-- =============================================================================
-- Adds a notification_preferences table so users can control which types of
-- notifications they receive. Also updates the campus_id FK for the
-- notifications table to support multi-tenant isolation.
-- =============================================================================

-- ── 1. Create notification_preferences table ────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- JSONB of enabled notification types:
  -- { "submitted": true, "approved": true, "due_soon": true, ... }
  -- null/empty = all enabled (default)
  preferences JSONB DEFAULT NULL,
  desktop_enabled BOOLEAN DEFAULT TRUE,
  email_enabled BOOLEAN DEFAULT FALSE,      -- future: email notifications
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_notif_prefs_user ON public.notification_preferences (user_id);


-- ── 2. RLS for notification_preferences ─────────────────────────────
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can read own notification preferences" ON public.notification_preferences;
  DROP POLICY IF EXISTS "Users can insert own notification preferences" ON public.notification_preferences;
  DROP POLICY IF EXISTS "Users can update own notification preferences" ON public.notification_preferences;
END $$;

-- Users can read their own preferences
CREATE POLICY "Users can read own notification preferences"
  ON public.notification_preferences
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own preferences
CREATE POLICY "Users can insert own notification preferences"
  ON public.notification_preferences
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND user_id = auth.uid());

-- Users can update their own preferences
CREATE POLICY "Users can update own notification preferences"
  ON public.notification_preferences
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ── 3. Add campus_id to notifications if not already present ────────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES public.campuses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_campus ON public.notifications (campus_id);


-- ── 4. Helper function to check if a user wants a notification type ──
CREATE OR REPLACE FUNCTION public.user_wants_notification(
  p_user_id UUID,
  p_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prefs JSONB;
BEGIN
  SELECT preferences INTO prefs
  FROM public.notification_preferences
  WHERE user_id = p_user_id;

  -- No preferences row = all enabled
  IF prefs IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Specific check: if the type is explicitly set, use that
  IF prefs ? p_type THEN
    RETURN (prefs ->> p_type)::boolean;
  END IF;

  -- Default to enabled
  RETURN TRUE;
END;
$$;


-- ── 5. Auto-create preferences row on user signup ──────────────────
CREATE OR REPLACE FUNCTION public.auto_create_notification_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id, preferences, desktop_enabled)
  VALUES (NEW.id, NULL, TRUE)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_create_notification_preferences ON public.user_profiles;
CREATE TRIGGER auto_create_notification_preferences
  AFTER INSERT ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_notification_preferences();


-- ── 6. Backfill: create preferences for existing users ────────────
INSERT INTO public.notification_preferences (user_id, preferences, desktop_enabled)
SELECT id, NULL, TRUE
FROM public.user_profiles
WHERE id NOT IN (SELECT user_id FROM public.notification_preferences)
ON CONFLICT (user_id) DO NOTHING;
