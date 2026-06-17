-- =====================================================
-- Reviewer Assignment Migration
-- Adds columns for differentiated reviewer routing
-- =====================================================

-- 1. Add assigned_buddy_id to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS assigned_buddy_id UUID REFERENCES auth.users(id);

-- 2. Add reviewer_type to worksheet_submissions
--    Values: 'buddy', 'manager', 'onboarding_lead'
ALTER TABLE worksheet_submissions ADD COLUMN IF NOT EXISTS reviewer_type TEXT DEFAULT 'manager'
  CHECK (reviewer_type IN ('buddy', 'manager', 'onboarding_lead'));

-- 3. Index for filtering by reviewer_type
CREATE INDEX IF NOT EXISTS idx_worksheets_reviewer_type ON worksheet_submissions (reviewer_type);

-- 4. Index for assigned_buddy_id
CREATE INDEX IF NOT EXISTS idx_profiles_buddy ON user_profiles (assigned_buddy_id);

-- 5. Update RLS policy for worksheet_submissions to include assigned_buddy_id
DROP POLICY IF EXISTS "Read worksheet access" ON worksheet_submissions;
CREATE POLICY "Read worksheet access"
  ON worksheet_submissions FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id 
    OR auth.uid() IN (SELECT id FROM user_profiles WHERE role IN ('academic_head', 'lead_instructor', 'onboarding_lead'))
    OR auth.uid() IN (
      SELECT assigned_lead_id FROM user_profiles WHERE id = worksheet_submissions.user_id
    )
    OR auth.uid() IN (
      SELECT assigned_buddy_id FROM user_profiles WHERE id = worksheet_submissions.user_id
    )
  );

-- 6. Update RLS policy for reviewers to include assigned_buddy_id
DROP POLICY IF EXISTS "Reviewers can update worksheets" ON worksheet_submissions;
CREATE POLICY "Reviewers can update worksheets"
  ON worksheet_submissions FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM user_profiles WHERE role IN ('academic_head', 'lead_instructor', 'onboarding_lead'))
    OR auth.uid() IN (
      SELECT assigned_lead_id FROM user_profiles WHERE id = worksheet_submissions.user_id
    )
    OR auth.uid() IN (
      SELECT assigned_buddy_id FROM user_profiles WHERE id = worksheet_submissions.user_id
    )
  );

-- 7. Update user_profiles RLS to allow onboarding_lead to read all profiles
DROP POLICY IF EXISTS "Leads can read all profiles" ON user_profiles;
CREATE POLICY "Leads can read all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM user_profiles WHERE role IN ('academic_head', 'lead_instructor', 'onboarding_lead'))
    OR id = auth.uid()
  );

-- 8. Update onboarding_submissions RLS
DROP POLICY IF EXISTS "Users can read own submissions" ON onboarding_submissions;
CREATE POLICY "Users can read own submissions"
  ON onboarding_submissions FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id 
    OR auth.uid() IN (SELECT id FROM user_profiles WHERE role IN ('academic_head', 'lead_instructor', 'onboarding_lead'))
  );

-- 9. Allow onboarding_lead role in check constraint (if not already present)
-- (Check if constraint exists first — may already be updated from role migration)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_role_check'
  ) THEN
    -- Drop and recreate with onboarding_lead included
    ALTER TABLE user_profiles DROP CONSTRAINT user_profiles_role_check;
    ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check 
      CHECK (role IN ('new_joinee', 'lab_instructor', 'lead_instructor', 'academic_head', 'onboarding_lead', 'acad_ops'));
  END IF;
END $$;
