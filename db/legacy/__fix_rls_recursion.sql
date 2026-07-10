-- =============================================================================
-- DEPRECATED — DO NOT RUN. Superseded by db/schema.sql and supabase/migrations/.
-- Kept only for historical reference (see db/README.md). Running this file
-- against a project that has already had db/schema.sql applied can reintroduce
-- fixed vulnerabilities (client-writable role checks, RLS recursion, duplicate
-- permissive policies, etc.) — see docs/audit/2026-07-10/.
-- =============================================================================

-- =====================================================
-- FIX RLS Recursion — Use JWT Claims Instead of Subqueries
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. FIX user_profiles policies
DROP POLICY IF EXISTS "Leads can read all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admin read all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admin update profiles" ON user_profiles;
DROP POLICY IF EXISTS "Select own profile" ON user_profiles;
DROP POLICY IF EXISTS "Insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Update own profile" ON user_profiles;

-- Non-recursive: Users can read their own profile
CREATE POLICY "Select own profile" ON user_profiles
  FOR SELECT USING (id = auth.uid());

-- Non-recursive: Users can insert their own profile (during signup)
CREATE POLICY "Insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- Non-recursive: Users can update their own profile
CREATE POLICY "Update own profile" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

-- Non-recursive: Admins/leads can read all profiles
-- Uses auth.jwt() instead of querying user_profiles recursively
CREATE POLICY "Admin read all profiles" ON user_profiles
  FOR SELECT USING (
    auth.jwt() ->> 'role' IN ('academic_head', 'lead_instructor', 'onboarding_lead')
    OR id = auth.uid()
  );

-- Non-recursive: Admins/leads can update any profile
CREATE POLICY "Admin update profiles" ON user_profiles
  FOR UPDATE USING (
    auth.jwt() ->> 'role' IN ('academic_head', 'lead_instructor', 'onboarding_lead')
    OR id = auth.uid()
  );

-- 2. FIX worksheet_submissions policies
DROP POLICY IF EXISTS "Read worksheet access" ON worksheet_submissions;
DROP POLICY IF EXISTS "Reviewers can update worksheets" ON worksheet_submissions;
DROP POLICY IF EXISTS "Select own submissions" ON worksheet_submissions;
DROP POLICY IF EXISTS "Insert own submissions" ON worksheet_submissions;
DROP POLICY IF EXISTS "Update own submissions" ON worksheet_submissions;
DROP POLICY IF EXISTS "Reviewers select submissions" ON worksheet_submissions;
DROP POLICY IF EXISTS "Reviewers update submissions" ON worksheet_submissions;

-- Joinees can read their own submissions
CREATE POLICY "Select own submissions" ON worksheet_submissions
  FOR SELECT USING (auth.uid() = user_id);

-- Joinees can insert their own submissions
CREATE POLICY "Insert own submissions" ON worksheet_submissions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Joinees can update their own submissions
CREATE POLICY "Update own submissions" ON worksheet_submissions
  FOR UPDATE USING (auth.uid() = user_id);

-- Reviewers can read all submissions (non-recursive via JWT)
CREATE POLICY "Reviewers select submissions" ON worksheet_submissions
  FOR SELECT USING (
    auth.jwt() ->> 'role' IN ('lead_instructor', 'academic_head', 'onboarding_lead')
    OR auth.uid() = user_id
    OR auth.uid() IN (
      SELECT assigned_lead_id FROM user_profiles WHERE id = worksheet_submissions.user_id
    )
    OR auth.uid() IN (
      SELECT assigned_buddy_id FROM user_profiles WHERE id = worksheet_submissions.user_id
    )
  );

-- Reviewers can update submissions (for approve/revision)
CREATE POLICY "Reviewers update submissions" ON worksheet_submissions
  FOR UPDATE USING (
    auth.jwt() ->> 'role' IN ('lead_instructor', 'academic_head', 'onboarding_lead')
    OR auth.uid() IN (
      SELECT assigned_lead_id FROM user_profiles WHERE id = worksheet_submissions.user_id
    )
    OR auth.uid() IN (
      SELECT assigned_buddy_id FROM user_profiles WHERE id = worksheet_submissions.user_id
    )
  );

-- 3. FIX onboarding_submissions policies
DROP POLICY IF EXISTS "Users can read own submissions" ON onboarding_submissions;
CREATE POLICY "Users can read own submissions" ON onboarding_submissions
  FOR SELECT USING (
    auth.uid() = user_id
    OR auth.jwt() ->> 'role' IN ('academic_head', 'lead_instructor', 'onboarding_lead')
  );

-- =====================================================
-- ✅ DONE
-- =====================================================
