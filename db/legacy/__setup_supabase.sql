-- =============================================================================
-- DEPRECATED — DO NOT RUN. Superseded by db/schema.sql and supabase/migrations/.
-- Kept only for historical reference (see db/README.md). Running this file
-- against a project that has already had db/schema.sql applied can reintroduce
-- fixed vulnerabilities (client-writable role checks, RLS recursion, duplicate
-- permissive policies, etc.) — see docs/audit/2026-07-10/.
-- =============================================================================

-- ============================================================
-- RUN THIS ENTIRE SCRIPT IN SUPABASE SQL EDITOR
-- 1. Go to https://supabase.com/dashboard/project/fuoqoryqndtdooujslee/sql/new
-- 2. Paste this entire script
-- 3. Click "Run"
-- ============================================================

-- =====================================================
-- 1. CLEAR OLD TEST DATA
-- =====================================================

-- Delete worksheet submissions for test users
DELETE FROM worksheet_submissions
WHERE user_id IN (
  SELECT id FROM user_profiles
  WHERE email LIKE 'joinee_%@newton.edu'
     OR email LIKE 'manager_%@newton.edu'
     OR email LIKE 'onboard_%@newton.edu'
     OR email LIKE 'browsertest%@newton.edu'
     OR email LIKE 'checkstatus_%@newton.edu'
);

-- Delete test user profiles
DELETE FROM user_profiles
WHERE email LIKE 'joinee_%@newton.edu'
   OR email LIKE 'manager_%@newton.edu'
   OR email LIKE 'onboard_%@newton.edu'
   OR email LIKE 'browsertest%@newton.edu'
   OR email LIKE 'checkstatus_%@newton.edu';

-- Delete test auth users
DELETE FROM auth.users
WHERE email LIKE 'joinee_%@newton.edu'
   OR email LIKE 'manager_%@newton.edu'
   OR email LIKE 'onboard_%@newton.edu'
   OR email LIKE 'browsertest%@newton.edu'
   OR email LIKE 'checkstatus_%@newton.edu';

-- =====================================================
-- 2. FIX RLS POLICIES ON user_profiles
--    Drop ALL existing policies and create clean ones
-- =====================================================

-- Drop all existing policies to clear recursive ones
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Enable insert for own profile" ON user_profiles;
DROP POLICY IF EXISTS "Enable update for own profile" ON user_profiles;
DROP POLICY IF EXISTS "Select own profile" ON user_profiles;
DROP POLICY IF EXISTS "Insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admin read all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Onboarding lead update profiles" ON user_profiles;
DROP POLICY IF EXISTS "Allow select own" ON user_profiles;
DROP POLICY IF EXISTS "Allow insert own" ON user_profiles;
DROP POLICY IF EXISTS "Allow update own" ON user_profiles;

-- Create proper NON-RECURSIVE policies

-- 1. Users can read their own profile
CREATE POLICY "Select own profile" ON user_profiles
  FOR SELECT USING (id = auth.uid());

-- 2. Users can insert their own profile (during signup)
CREATE POLICY "Insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- 3. Users can update their own profile
CREATE POLICY "Update own profile" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

-- 4. Admins (academic_head, onboarding_lead) can read ALL profiles
CREATE POLICY "Admin read all profiles" ON user_profiles
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM user_profiles WHERE role IN ('academic_head', 'onboarding_lead')
    )
  );

-- 5. Admins can update any profile (for assigning leads, etc.)
CREATE POLICY "Admin update profiles" ON user_profiles
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT id FROM user_profiles WHERE role IN ('academic_head', 'onboarding_lead')
    )
  );

-- =====================================================
-- 3. ADD assigned_lead_id COLUMN (for manager assignment)
-- =====================================================

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS assigned_lead_id UUID REFERENCES user_profiles(id);

-- =====================================================
-- 4. ADD review_history COLUMN (for review history timeline)
-- =====================================================

ALTER TABLE worksheet_submissions
ADD COLUMN IF NOT EXISTS review_history JSONB DEFAULT '[]'::jsonb;

-- =====================================================
-- 5. FIX RLS POLICIES ON worksheet_submissions
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own submissions" ON worksheet_submissions;
DROP POLICY IF EXISTS "Users can insert own submissions" ON worksheet_submissions;
DROP POLICY IF EXISTS "Users can update own submissions" ON worksheet_submissions;
DROP POLICY IF EXISTS "Enable insert for own submissions" ON worksheet_submissions;
DROP POLICY IF EXISTS "Enable select for own submissions" ON worksheet_submissions;
DROP POLICY IF EXISTS "Enable update for own submissions" ON worksheet_submissions;
DROP POLICY IF EXISTS "Select own submissions" ON worksheet_submissions;
DROP POLICY IF EXISTS "Insert own submissions" ON worksheet_submissions;
DROP POLICY IF EXISTS "Update own submissions" ON worksheet_submissions;
DROP POLICY IF EXISTS "Reviewers select submissions" ON worksheet_submissions;
DROP POLICY IF EXISTS "Reviewers update submissions" ON worksheet_submissions;

-- 1. Joinees can read their own submissions
CREATE POLICY "Select own submissions" ON worksheet_submissions
  FOR SELECT USING (auth.uid() = user_id);

-- 2. Joinees can insert their own submissions (for auto-save & submit)
CREATE POLICY "Insert own submissions" ON worksheet_submissions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 3. Joinees can update their own submissions (for auto-save & revision)
CREATE POLICY "Update own submissions" ON worksheet_submissions
  FOR UPDATE USING (auth.uid() = user_id);

-- 4. Reviewers (lead_instructor, academic_head, onboarding_lead) can read any submission
CREATE POLICY "Reviewers select submissions" ON worksheet_submissions
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM user_profiles
      WHERE role IN ('lead_instructor', 'academic_head', 'onboarding_lead')
    )
  );

-- 5. Reviewers can update any submission (for approve/revision actions)
CREATE POLICY "Reviewers update submissions" ON worksheet_submissions
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT id FROM user_profiles
      WHERE role IN ('lead_instructor', 'academic_head', 'onboarding_lead')
    )
  );

-- ============================================================
-- ✅ DONE! Now test by signing up fresh accounts through the app
-- ============================================================
