-- =====================================================
-- COMPLETE SETUP: RLS Policies + Test Users + Data
-- Run this ENTIRE file at once in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- PART 1: RLS Policy Fixes (using user_metadata JWT path)
-- =====================================================

-- Drop existing policies on user_profiles
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

-- 4. Leads/admins can read all profiles (uses user_metadata since role is NOT in top-level JWT)
CREATE POLICY "Admin read all profiles" ON user_profiles
  FOR SELECT USING (
    auth.jwt() -> 'user_metadata' ->> 'role' IN ('academic_head', 'lead_instructor', 'onboarding_lead')
    OR id = auth.uid()
  );

-- 5. Leads/admins can update any profile
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

-- 9. Reviewers can read all submissions (including assigned ones)
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

-- 10. Reviewers can update submissions
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

-- Drop and fix onboarding_submissions policies
DROP POLICY IF EXISTS "Users can read own submissions" ON onboarding_submissions;
CREATE POLICY "Users can read own submissions" ON onboarding_submissions
  FOR SELECT USING (
    auth.uid() = user_id
    OR auth.jwt() -> 'user_metadata' ->> 'role' IN ('academic_head', 'lead_instructor', 'onboarding_lead')
  );

-- =====================================================
-- PART 2: Add missing columns
-- =====================================================

ALTER TABLE worksheet_submissions ADD COLUMN IF NOT EXISTS reviewer_name TEXT;
ALTER TABLE worksheet_submissions ADD COLUMN IF NOT EXISTS review_history JSONB DEFAULT '[]'::jsonb;

-- =====================================================
-- PART 3: Confirm emails for ALL test users
-- =====================================================

UPDATE auth.users SET email_confirmed_at = NOW()
  WHERE email IN (
    'joinee1_wgh2@newton.edu','joinee2_wgh2@newton.edu','joinee3_wgh2@newton.edu',
    'joinee4_wgh2@newton.edu','joinee5_wgh2@newton.edu',
    'labinstr1_wgh2@newton.edu','labinstr2_wgh2@newton.edu',
    'buddy1_wgh2@newton.edu','buddy2_wgh2@newton.edu',
    'acadhead1_wgh2@newton.edu','acadhead2_wgh2@newton.edu',
    'onboard1_wgh2@newton.edu','onboard2_wgh2@newton.edu',
    'acadops1_wgh2@newton.edu','acadops2_wgh2@newton.edu',
    'arjun.test@newton.edu','priya.manager@newton.edu',
    'neha.buddy@newton.edu','ravi.lead@newton.edu'
  );

-- =====================================================
-- PART 4: Create user profiles (LOOK UP actual UUIDs from auth.users)
-- =====================================================

INSERT INTO user_profiles (id, email, full_name, role)
SELECT au.id, au.email, sub.full_name, sub.role
FROM auth.users au
JOIN (VALUES
  -- 5 New Joinees
  ('joinee1_wgh2@newton.edu', 'Arjun Mehta', 'new_joinee'),
  ('joinee2_wgh2@newton.edu', 'Sneha Patel', 'new_joinee'),
  ('joinee3_wgh2@newton.edu', 'Vikram Singh', 'new_joinee'),
  ('joinee4_wgh2@newton.edu', 'Ananya Gupta', 'new_joinee'),
  ('joinee5_wgh2@newton.edu', 'Rohit Sharma', 'new_joinee'),
  -- 2 Lab Instructors
  ('labinstr1_wgh2@newton.edu', 'Kavita Reddy', 'lab_instructor'),
  ('labinstr2_wgh2@newton.edu', 'Amit Verma', 'lab_instructor'),
  -- 2 Buddies (lead_instructor)
  ('buddy1_wgh2@newton.edu', 'Neha Kapoor', 'lead_instructor'),
  ('buddy2_wgh2@newton.edu', 'Rajesh Kumar', 'lead_instructor'),
  -- 2 Academic Heads (Managers)
  ('acadhead1_wgh2@newton.edu', 'Dr. Priya Sharma', 'academic_head'),
  ('acadhead2_wgh2@newton.edu', 'Prof. Sanjay Joshi', 'academic_head'),
  -- 2 Onboarding Leads
  ('onboard1_wgh2@newton.edu', 'Ravi Deshmukh', 'onboarding_lead'),
  ('onboard2_wgh2@newton.edu', 'Meera Nair', 'onboarding_lead'),
  -- 2 Acad Ops
  ('acadops1_wgh2@newton.edu', 'Suresh Iyer', 'acad_ops'),
  ('acadops2_wgh2@newton.edu', 'Lakshmi Krishnan', 'acad_ops'),
  -- 4 simpler test users
  ('arjun.test@newton.edu', 'Arjun Test Joinee', 'new_joinee'),
  ('priya.manager@newton.edu', 'Priya Lead Manager', 'lead_instructor'),
  ('neha.buddy@newton.edu', 'Neha Buddy Mentor', 'lead_instructor'),
  ('ravi.lead@newton.edu', 'Ravi Onboarding Lead', 'onboarding_lead')
) AS sub(email, full_name, role) ON au.email = sub.email
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role;

-- =====================================================
-- PART 5: Assign Managers & Buddies to Joinees
-- (subqueries by email so no hardcoded UUID issues)
-- =====================================================

-- Manager assignments for wgh2 joinees
UPDATE user_profiles SET assigned_lead_id = (SELECT id FROM user_profiles WHERE email = 'acadhead1_wgh2@newton.edu')
  WHERE email = 'joinee1_wgh2@newton.edu';
UPDATE user_profiles SET assigned_lead_id = (SELECT id FROM user_profiles WHERE email = 'acadhead1_wgh2@newton.edu')
  WHERE email = 'joinee2_wgh2@newton.edu';
UPDATE user_profiles SET assigned_lead_id = (SELECT id FROM user_profiles WHERE email = 'acadhead2_wgh2@newton.edu')
  WHERE email = 'joinee3_wgh2@newton.edu';
UPDATE user_profiles SET assigned_lead_id = (SELECT id FROM user_profiles WHERE email = 'acadhead2_wgh2@newton.edu')
  WHERE email = 'joinee4_wgh2@newton.edu';
UPDATE user_profiles SET assigned_lead_id = (SELECT id FROM user_profiles WHERE email = 'acadhead1_wgh2@newton.edu')
  WHERE email = 'joinee5_wgh2@newton.edu';

-- Buddy assignments for wgh2 joinees
UPDATE user_profiles SET assigned_buddy_id = (SELECT id FROM user_profiles WHERE email = 'buddy1_wgh2@newton.edu')
  WHERE email = 'joinee1_wgh2@newton.edu';
UPDATE user_profiles SET assigned_buddy_id = (SELECT id FROM user_profiles WHERE email = 'buddy1_wgh2@newton.edu')
  WHERE email = 'joinee2_wgh2@newton.edu';
UPDATE user_profiles SET assigned_buddy_id = (SELECT id FROM user_profiles WHERE email = 'buddy2_wgh2@newton.edu')
  WHERE email = 'joinee3_wgh2@newton.edu';
UPDATE user_profiles SET assigned_buddy_id = (SELECT id FROM user_profiles WHERE email = 'buddy2_wgh2@newton.edu')
  WHERE email = 'joinee4_wgh2@newton.edu';
UPDATE user_profiles SET assigned_buddy_id = (SELECT id FROM user_profiles WHERE email = 'buddy1_wgh2@newton.edu')
  WHERE email = 'joinee5_wgh2@newton.edu';

-- Manager & buddy for arjun.test
UPDATE user_profiles SET
  assigned_lead_id = (SELECT id FROM user_profiles WHERE email = 'priya.manager@newton.edu'),
  assigned_buddy_id = (SELECT id FROM user_profiles WHERE email = 'neha.buddy@newton.edu')
WHERE email = 'arjun.test@newton.edu';

-- =====================================================
-- PART 6: Create Worksheet Submissions (for Arjun Test Joinee)
-- =====================================================

INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status, reviewer_type, worksheet_data)
SELECT u.id, w.worksheet_id, w.phase, w.status, w.review_status, w.reviewer_type, w.worksheet_data::jsonb
FROM user_profiles u
CROSS JOIN (VALUES
  -- Buddy-reviewed worksheets
  ('p1_w1', 'phase-1', 'Submitted', 'pending_review', 'buddy', '{"employeeName":"Arjun Test","reflections":"Stakeholder mapping completed.","mentorName":"Neha Buddy","department":"Computer Science"}'),
  ('p1_w2', 'phase-1', 'Submitted', 'pending_review', 'buddy', '{"employeeName":"Arjun Test","syncDate":"2026-06-10","keyTakeaways":"Weekly syncs going well."}'),
  ('p1_w6', 'phase-1', 'Submitted', 'pending_review', 'buddy', '{"employeeName":"Arjun Test","lecturesObserved":2,"labsObserved":1,"keyLearning":"Classroom management techniques."}'),
  -- Manager-reviewed worksheets
  ('p1_w3', 'phase-1', 'Submitted', 'pending_review', 'manager', '{"employeeName":"Arjun Test","teachingPhilosophy":"Project-based learning.","coreValues":"Student-first approach."}'),
  ('p1_w7', 'phase-1', 'Submitted', 'pending_review', 'manager', '{"employeeName":"Arjun Test","pptsReviewed":5,"worksheetsReviewed":3,"qualityScore":"Good"}'),
  -- Onboarding Lead-reviewed worksheets
  ('p1_w4', 'phase-1', 'Submitted', 'pending_review', 'onboarding_lead', '{"employeeName":"Arjun Test","governanceStructure":"Understood policies.","escalationPath":"Faculty → HOD → Academic Council"}'),
  ('p1_w5', 'phase-1', 'Submitted', 'pending_review', 'onboarding_lead', '{"employeeName":"Arjun Test","portalAccess":"Verified.","quizConfigured":"Yes"}')
) AS w(worksheet_id, phase, status, review_status, reviewer_type, worksheet_data)
WHERE u.email = 'arjun.test@newton.edu'
ON CONFLICT (user_id, worksheet_id) DO UPDATE SET
  review_status = EXCLUDED.review_status,
  reviewer_type = EXCLUDED.reviewer_type,
  status = EXCLUDED.status,
  worksheet_data = EXCLUDED.worksheet_data;

-- =====================================================
-- PART 7: Verify Everything
-- =====================================================

-- Verify users
SELECT '✅ USERS' as section, email, full_name, role
FROM user_profiles
WHERE email LIKE '%@newton.edu'
ORDER BY role, email;

-- Verify assignments
SELECT '✅ ASSIGNMENTS' as section, u.email, u.role,
  (SELECT full_name FROM user_profiles WHERE id = u.assigned_lead_id) as manager,
  (SELECT full_name FROM user_profiles WHERE id = u.assigned_buddy_id) as buddy
FROM user_profiles u
WHERE u.assigned_lead_id IS NOT NULL OR u.assigned_buddy_id IS NOT NULL
ORDER BY u.email;

-- Verify submissions
SELECT '✅ SUBMISSIONS' as section, u.email, s.worksheet_id, s.reviewer_type, s.review_status
FROM worksheet_submissions s
JOIN user_profiles u ON s.user_id = u.id
WHERE u.email IN ('arjun.test@newton.edu')
ORDER BY s.reviewer_type, s.worksheet_id;
