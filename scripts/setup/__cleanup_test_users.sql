-- =============================================================================
-- Cleanup: Delete all test users and their associated data
--
-- Run this BEFORE enabling email confirmation.
-- This deletes test user data from all tables and removes the users from auth.
--
-- WARNING: This deletes ALL data in the database except the schema itself.
-- Only run this when you want a clean slate for real users.
-- =============================================================================

-- ─── 1. Delete notifications for test users ─────────────────────────────────
DELETE FROM notifications
WHERE user_id IN (SELECT id FROM user_profiles);

DELETE FROM notifications
WHERE from_user_id IN (SELECT id FROM user_profiles);

-- ─── 2. Delete worksheet submissions ─────────────────────────────────────────
DELETE FROM worksheet_submissions
WHERE user_id IN (SELECT id FROM user_profiles);

-- ─── 3. Delete onboarding submissions ────────────────────────────────────────
DELETE FROM onboarding_submissions
WHERE user_id IN (SELECT id FROM user_profiles);

-- ─── 4. Delete user profiles ────────────────────────────────────────────────
DELETE FROM user_profiles;

-- ─── 5. Delete auth users (service_role required) ────────────────────────────
-- Note: This requires the service_role key. You can run this in:
--   Supabase Dashboard → SQL Editor (authenticated as service_role by default)
--
-- Or run via the Management API:
--   This SQL Editor session runs as superuser, so this should work.
DELETE FROM auth.users;

-- ─── 6. Verify everything is clean ───────────────────────────────────────────
SELECT 'user_profiles' AS table_name, COUNT(*) AS remaining FROM user_profiles
UNION ALL
SELECT 'worksheet_submissions', COUNT(*) FROM worksheet_submissions
UNION ALL
SELECT 'onboarding_submissions', COUNT(*) FROM onboarding_submissions
UNION ALL
SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL
SELECT 'auth.users', COUNT(*) FROM auth.users;

-- ✅ Cleanup complete. All test data removed.
-- =============================================================================
-- Next Step: Enable email confirmation
--   Supabase Dashboard → Authentication → Settings → "Confirm email" → ON
-- =============================================================================
