-- =============================================================================
-- Migration: Kudos Table — Buddy recognition / shoutouts
-- =============================================================================
-- Enables buddies, managers, and heads to send kudos (recognition messages)
-- to joinees. Kudos appear in the milestone feed on the dashboard.
-- =============================================================================

-- 1. Create the kudos table
CREATE TABLE IF NOT EXISTS kudos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (char_length(message) >= 2 AND char_length(message) <= 500),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Index for fast feed queries
CREATE INDEX IF NOT EXISTS idx_kudos_to_user ON kudos (to_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kudos_from_user ON kudos (from_user_id, created_at DESC);

-- 3. Row Level Security
ALTER TABLE kudos ENABLE ROW LEVEL SECURITY;

-- Users can see kudos they received or sent
CREATE POLICY "kudos_select_own" ON kudos
  FOR SELECT
  USING (to_user_id = auth.uid() OR from_user_id = auth.uid());

-- Users can only send kudos as themselves
CREATE POLICY "kudos_insert_self" ON kudos
  FOR INSERT
  WITH CHECK (from_user_id = auth.uid());
