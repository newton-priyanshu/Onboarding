-- =============================================================================
-- Newton School of Technology - Faculty Onboarding Portal
-- DEFINITIVE DATABASE SCHEMA
--
-- This is the ONE FILE you need to run. It incorporates all migrations:
--   - supabase_schema.sql (original)
--   - supabase_role_migration.sql (roles)
--   - supabase_reviewer_migration.sql (buddy + onboarding_lead reviewer system)
--   - __setup_supabase.sql (RLS fixes, review_history, assigned_lead_id)
--   - __fix_review_columns.sql (reviewer_name)
--   - __fix_rls_recursion.sql (JWT-based RLS)
--   - __fix_rls_jwt.sql (corrected JWT user_metadata path)
--
-- How to run:
--   Go to https://supabase.com/dashboard/project/fuoqoryqndtdooujslee/sql/new
--   Paste this entire file and click "Run"
-- =============================================================================


-- =============================================================================
-- 1. TRIGGER FUNCTION (auto-update updated_at)
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';


-- =============================================================================
-- 2. USER PROFILES TABLE
-- =============================================================================

-- Drop old constraint if it exists so we can recreate it with all roles
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT,
  full_name TEXT,
  role TEXT DEFAULT 'new_joinee'
    CHECK (role IN ('new_joinee', 'lab_instructor', 'lead_instructor', 'academic_head', 'onboarding_lead', 'acad_ops')),
  department TEXT,
  assigned_lead_id UUID REFERENCES user_profiles(id),
  assigned_buddy_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- 2a. Users can read their own profile
CREATE POLICY "Select own profile" ON user_profiles
  FOR SELECT USING (id = auth.uid());

-- 2b. Users can insert their own profile (during signup)
CREATE POLICY "Insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- 2c. Users can update their own profile
CREATE POLICY "Update own profile" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

-- 2d. Admins/leads can read ALL profiles
--     Uses auth.jwt() -> 'user_metadata' ->> 'role' to avoid RLS recursion
CREATE POLICY "Admin read all profiles" ON user_profiles
  FOR SELECT USING (
    auth.jwt() -> 'user_metadata' ->> 'role' IN ('academic_head', 'lead_instructor', 'onboarding_lead')
    OR id = auth.uid()
  );

-- 2e. Admins/leads can update any profile (for assigning leads/buddies)
CREATE POLICY "Admin update profiles" ON user_profiles
  FOR UPDATE USING (
    auth.jwt() -> 'user_metadata' ->> 'role' IN ('academic_head', 'lead_instructor', 'onboarding_lead')
    OR id = auth.uid()
  );


-- =============================================================================
-- 3. ONBOARDING SUBMISSIONS TABLE (final assessment)
-- =============================================================================

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

-- 3a. Users can read own submissions; leads can read all
CREATE POLICY "Users can read own submissions" ON onboarding_submissions
  FOR SELECT USING (
    auth.uid() = user_id
    OR auth.jwt() -> 'user_metadata' ->> 'role' IN ('academic_head', 'lead_instructor', 'onboarding_lead')
  );

-- 3b. Users can insert their own submissions
CREATE POLICY "Users can insert own submissions" ON onboarding_submissions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 3c. Users can update their own submissions
CREATE POLICY "Users can update own submissions" ON onboarding_submissions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);


-- =============================================================================
-- 4. WORKSHEET SUBMISSIONS TABLE (core data + review workflow)
-- =============================================================================

CREATE TABLE IF NOT EXISTS worksheet_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  worksheet_id TEXT NOT NULL,

  -- The form content (flexible — each worksheet has different fields)
  worksheet_data JSONB DEFAULT '{}',

  -- Which onboarding phase this belongs to
  phase TEXT NOT NULL,

  -- Instructor-facing status
  status TEXT DEFAULT 'Not Started',

  -- Review workflow state machine:
  --   ''                → Not submitted / In Progress
  --   'pending_review'  → Submitted, awaiting reviewer
  --   'buddy_approved'  → Buddy has approved this worksheet (NEW)
  --   'needs_revision'  → Reviewer requested changes
  --   'revision_submitted' → Instructor resubmitted after revision
  --   'approved'        → Worksheet is complete (manager approved entire phase)
  review_status TEXT DEFAULT ''
    CHECK (review_status IN ('', 'pending_review', 'buddy_approved', 'needs_revision', 'revision_submitted', 'approved')),

  -- Who is responsible for reviewing this worksheet
  reviewer_type TEXT DEFAULT 'manager'
    CHECK (reviewer_type IN ('buddy', 'manager', 'onboarding_lead')),

  -- Reviewer metadata
  reviewed_by UUID REFERENCES auth.users(id),
  reviewer_name TEXT,
  review_comment TEXT,
  reviewed_at TIMESTAMPTZ,

  -- Append-only review history timeline
  review_history JSONB DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One submission per user per worksheet (enables upsert)
  UNIQUE(user_id, worksheet_id)
);

ALTER TABLE worksheet_submissions ENABLE ROW LEVEL SECURITY;

-- 4a. Joinees can read their own submissions
CREATE POLICY "Select own submissions" ON worksheet_submissions
  FOR SELECT USING (auth.uid() = user_id);

-- 4b. Joinees can insert their own submissions (for auto-save & submit)
CREATE POLICY "Insert own submissions" ON worksheet_submissions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 4c. Joinees can update their own submissions (for auto-save & revision)
CREATE POLICY "Update own submissions" ON worksheet_submissions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- 4d. Reviewers can read any submission
--     Includes role-based access AND assigned-lead/buddy access
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

-- 4e. Reviewers can update submissions (for approve/revision actions)
--     lead_instructor (buddy) can update: approve to buddy_approved or request revision
--     academic_head (manager) can update: approve phase (change buddy_approved → approved) or request revision
--     onboarding_lead: read-only, cannot update
CREATE POLICY "Reviewers update submissions" ON worksheet_submissions
  FOR UPDATE USING (
    auth.jwt() -> 'user_metadata' ->> 'role' IN ('lead_instructor', 'academic_head')
    OR auth.uid() IN (
      SELECT assigned_lead_id FROM user_profiles WHERE id = worksheet_submissions.user_id
    )
    OR auth.uid() IN (
      SELECT assigned_buddy_id FROM user_profiles WHERE id = worksheet_submissions.user_id
    )
  );


-- =============================================================================
-- 5. INDEXES
-- =============================================================================

-- onboarding_submissions
CREATE INDEX IF NOT EXISTS idx_onboarding_email      ON onboarding_submissions (email);
CREATE INDEX IF NOT EXISTS idx_onboarding_status      ON onboarding_submissions (overall_status);

-- worksheet_submissions
CREATE INDEX IF NOT EXISTS idx_worksheets_user         ON worksheet_submissions (user_id);
CREATE INDEX IF NOT EXISTS idx_worksheets_id           ON worksheet_submissions (worksheet_id);
CREATE INDEX IF NOT EXISTS idx_worksheets_review       ON worksheet_submissions (review_status);
CREATE INDEX IF NOT EXISTS idx_worksheets_reviewer_type ON worksheet_submissions (reviewer_type);

-- user_profiles
CREATE INDEX IF NOT EXISTS idx_profiles_role           ON user_profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_lead           ON user_profiles (assigned_lead_id);
CREATE INDEX IF NOT EXISTS idx_profiles_buddy          ON user_profiles (assigned_buddy_id);


-- =============================================================================
-- 6. AUTO-UPDATE TRIGGERS
-- =============================================================================

CREATE TRIGGER update_onboarding_submissions_updated_at
  BEFORE UPDATE ON onboarding_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_worksheet_submissions_updated_at
  BEFORE UPDATE ON worksheet_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- =============================================================================
-- ✅ SCHEMA COMPLETE
-- =============================================================================
