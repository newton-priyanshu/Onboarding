-- =====================================================
-- Newton School of Technology - Faculty Onboarding Schema
-- Run this SQL in your Supabase SQL Editor
-- =====================================================

-- 1. USER PROFILES TABLE (for auth)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT,
  full_name TEXT,
  role TEXT CHECK (role IN ('lab_instructor', 'lead_instructor', 'academic_head', 'acad_ops')) DEFAULT 'lab_instructor',
  department TEXT,
  assigned_lead_id UUID REFERENCES auth.users(id),
  assigned_buddy_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own profile
CREATE POLICY "Users can read own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Allow onboarding leads to read all profiles
CREATE POLICY "Leads can read all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM user_profiles WHERE role IN ('academic_head', 'lead_instructor'))
    OR id = auth.uid()
  );

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- Allow insert during signup
CREATE POLICY "Allow profile insert"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Allow profile creation during OAuth signup
CREATE POLICY "Allow anon profile insert"
  ON user_profiles FOR INSERT
  TO anon
  WITH CHECK (true);

-- 2. ONBOARDING SUBMISSIONS TABLE
CREATE TABLE IF NOT EXISTS onboarding_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  new_instructor_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phase1_completed BOOLEAN DEFAULT FALSE,
  phase2_completed BOOLEAN DEFAULT FALSE,
  phase3_completed BOOLEAN DEFAULT FALSE,
  phase1_data JSONB DEFAULT '{}',
  phase2_data JSONB DEFAULT '{}',
  phase3_data JSONB DEFAULT '{}',
  assessment_level TEXT CHECK (assessment_level IN ('fully_independent', 'needs_minor_support', 'needs_development')),
  assessment_data JSONB DEFAULT '{}',
  overall_status TEXT DEFAULT 'not_started' 
    CHECK (overall_status IN ('not_started', 'phase1_complete', 'phase2_complete', 'phase3_complete', 'assessed')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE onboarding_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own submissions"
  ON onboarding_submissions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() IN (SELECT id FROM user_profiles WHERE role IN ('academic_head', 'lead_instructor')));

CREATE POLICY "Users can insert own submissions"
  ON onboarding_submissions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own submissions"
  ON onboarding_submissions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- 3. WORKSHEET SUBMISSIONS TABLE (with review support)
CREATE TABLE IF NOT EXISTS worksheet_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  worksheet_id TEXT NOT NULL,
  worksheet_data JSONB DEFAULT '{}',
  phase TEXT NOT NULL,
  status TEXT DEFAULT 'Not Started',
  review_status TEXT DEFAULT '' 
    CHECK (review_status IN ('', 'pending_review', 'needs_revision', 'revision_submitted', 'approved')),
  reviewer_type TEXT DEFAULT 'manager'
    CHECK (reviewer_type IN ('buddy', 'manager', 'onboarding_lead')),
  reviewed_by UUID REFERENCES auth.users(id),
  review_comment TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, worksheet_id)
);

ALTER TABLE worksheet_submissions ENABLE ROW LEVEL SECURITY;

-- Instructors can read own worksheets; leads/buddies can read their assigned instructors' worksheets
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

CREATE POLICY "Users can insert own worksheets"
  ON worksheet_submissions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own worksheets"
  ON worksheet_submissions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Leads and buddies can update review fields
CREATE POLICY "Reviewers can update worksheets"
  ON worksheet_submissions FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM user_profiles WHERE role IN ('academic_head', 'lead_instructor'))
    OR auth.uid() IN (
      SELECT assigned_lead_id FROM user_profiles WHERE id = worksheet_submissions.user_id
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_onboarding_email ON onboarding_submissions (email);
CREATE INDEX IF NOT EXISTS idx_onboarding_status ON onboarding_submissions (overall_status);
CREATE INDEX IF NOT EXISTS idx_worksheets_user ON worksheet_submissions (user_id);
CREATE INDEX IF NOT EXISTS idx_worksheets_id ON worksheet_submissions (worksheet_id);
CREATE INDEX IF NOT EXISTS idx_worksheets_review ON worksheet_submissions (review_status);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON user_profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_lead ON user_profiles (assigned_lead_id);
CREATE INDEX IF NOT EXISTS idx_profiles_buddy ON user_profiles (assigned_buddy_id);
CREATE INDEX IF NOT EXISTS idx_worksheets_reviewer_type ON worksheet_submissions (reviewer_type);

-- Auto-update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_onboarding_submissions_updated_at
  BEFORE UPDATE ON onboarding_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_worksheet_submissions_updated_at
  BEFORE UPDATE ON worksheet_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
