-- =====================================================
-- Role Migration: Newton School Org Structure
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Drop the old CHECK constraint
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;

-- 2. Add new CHECK constraint with updated roles
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check 
  CHECK (role IN ('lab_instructor', 'lead_instructor', 'academic_head', 'acad_ops'));

-- 3. Update any existing users to new role names
UPDATE user_profiles SET role = 'lab_instructor' WHERE role = 'new_instructor';
UPDATE user_profiles SET role = 'lead_instructor' WHERE role = 'buddy_mentor';
UPDATE user_profiles SET role = 'academic_head' WHERE role = 'onboarding_lead';
UPDATE user_profiles SET role = 'academic_head' WHERE role = 'faculty_lead';
UPDATE user_profiles SET role = 'acad_ops' WHERE role = 'ops_manager';

-- 4. Update RLS policies that reference old role names
-- Drop old policies
DROP POLICY IF EXISTS "Leads can read all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Read worksheet access" ON worksheet_submissions;
DROP POLICY IF EXISTS "Reviewers can update worksheets" ON worksheet_submissions;
DROP POLICY IF EXISTS "Users can read own submissions" ON onboarding_submissions;

-- Recreate with new role names
CREATE POLICY "Leads can read all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM user_profiles WHERE role IN ('academic_head', 'lead_instructor'))
    OR id = auth.uid()
  );

CREATE POLICY "Read worksheet access"
  ON worksheet_submissions FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id 
    OR auth.uid() IN (SELECT id FROM user_profiles WHERE role IN ('academic_head', 'lead_instructor'))
    OR auth.uid() IN (
      SELECT assigned_lead_id FROM user_profiles WHERE id = worksheet_submissions.user_id
    )
  );

CREATE POLICY "Reviewers can update worksheets"
  ON worksheet_submissions FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM user_profiles WHERE role IN ('academic_head', 'lead_instructor'))
    OR auth.uid() IN (
      SELECT assigned_lead_id FROM user_profiles WHERE id = worksheet_submissions.user_id
    )
  );

CREATE POLICY "Users can read own submissions"
  ON onboarding_submissions FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id 
    OR auth.uid() IN (SELECT id FROM user_profiles WHERE role IN ('academic_head', 'lead_instructor'))
  );
