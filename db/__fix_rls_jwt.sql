-- =====================================================
-- FIX RLS JWT Path — Role is in user_metadata, not top-level JWT
-- Run this in Supabase SQL Editor
-- =====================================================

-- Drop all existing policies on user_profiles
DROP POLICY IF EXISTS "Select own profile" ON user_profiles;
DROP POLICY IF EXISTS "Insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admin read all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admin update profiles" ON user_profiles;

-- 1. Users can read their own profile
CREATE POLICY "Select own profile" ON user_profiles
  FOR SELECT USING (id = auth.uid());

-- 2. Users can insert their own profile (during signup)
CREATE POLICY "Insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- 3. Users can update their own profile
CREATE POLICY "Update own profile" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

-- 4. Admins/leads can read all profiles (FIXED: using user_metadata)
CREATE POLICY "Admin read all profiles" ON user_profiles
  FOR SELECT USING (
    auth.jwt() -> 'user_metadata' ->> 'role' IN ('academic_head', 'lead_instructor', 'onboarding_lead')
    OR id = auth.uid()
  );

-- 5. Admins/leads can update any profile (FIXED: using user_metadata)
CREATE POLICY "Admin update profiles" ON user_profiles
  FOR UPDATE USING (
    auth.jwt() -> 'user_metadata' ->> 'role' IN ('academic_head', 'lead_instructor', 'onboarding_lead')
    OR id = auth.uid()
  );

-- Drop existing policies on worksheet_submissions
DROP POLICY IF EXISTS "Select own submissions" ON worksheet_submissions;
DROP POLICY IF EXISTS "Insert own submissions" ON worksheet_submissions;
DROP POLICY IF EXISTS "Update own submissions" ON worksheet_submissions;
DROP POLICY IF EXISTS "Reviewers select submissions" ON worksheet_submissions;
DROP POLICY IF EXISTS "Reviewers update submissions" ON worksheet_submissions;

-- 6. Joinees can read their own submissions
CREATE POLICY "Select own submissions" ON worksheet_submissions
  FOR SELECT USING (auth.uid() = user_id);

-- 7. Joinees can insert their own submissions
CREATE POLICY "Insert own submissions" ON worksheet_submissions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 8. Joinees can update their own submissions
CREATE POLICY "Update own submissions" ON worksheet_submissions
  FOR UPDATE USING (auth.uid() = user_id);

-- 9. Reviewers can read all submissions (FIXED: using user_metadata)
CREATE POLICY "Reviewers select submissions" ON worksheet_submissions
  FOR SELECT USING (
    auth.jwt() -> 'user_metadata' ->> 'role' IN ('lead_instructor', 'academic_head', 'onboarding_lead')
    OR auth.uid() = user_id
    OR auth.uid() IN (
      SELECT assigned_lead_id FROM user_profiles WHERE id = worksheet_submissions.user_id
    )
    OR auth.uid() IN (
      SELECT assigned_buddy_id FROM user_profiles WHERE id = worksheet_submissions.user_id
    )
  );

-- 10. Reviewers can update submissions (FIXED: using user_metadata)
CREATE POLICY "Reviewers update submissions" ON worksheet_submissions
  FOR UPDATE USING (
    auth.jwt() -> 'user_metadata' ->> 'role' IN ('lead_instructor', 'academic_head', 'onboarding_lead')
    OR auth.uid() IN (
      SELECT assigned_lead_id FROM user_profiles WHERE id = worksheet_submissions.user_id
    )
    OR auth.uid() IN (
      SELECT assigned_buddy_id FROM user_profiles WHERE id = worksheet_submissions.user_id
    )
  );

-- 11. FIX onboarding_submissions policies
DROP POLICY IF EXISTS "Users can read own submissions" ON onboarding_submissions;
CREATE POLICY "Users can read own submissions" ON onboarding_submissions
  FOR SELECT USING (
    auth.uid() = user_id
    OR auth.jwt() -> 'user_metadata' ->> 'role' IN ('academic_head', 'lead_instructor', 'onboarding_lead')
  );

-- =====================================================
-- ✅ Verify the fix
-- =====================================================
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('user_profiles', 'worksheet_submissions', 'onboarding_submissions')
ORDER BY tablename, policyname;
