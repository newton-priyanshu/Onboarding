-- =====================================================
-- SETUP TEST DATA FOR REVIEWER FLOW TEST
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Create profiles for existing test users (if auth users exist, this will create profiles)
-- First, let's find the auth users and create profiles for them

-- Create the New Joinee profile
INSERT INTO user_profiles (id, email, full_name, role)
SELECT id, email, 'Arjun Test Joinee', 'new_joinee'
FROM auth.users WHERE email = 'joinee_NIZX@newton.edu'
ON CONFLICT (id) DO UPDATE SET full_name = 'Arjun Test Joinee', role = 'new_joinee';

-- Create the Buddy profile
INSERT INTO user_profiles (id, email, full_name, role)
SELECT id, email, 'Neha Buddy Mentor', 'lead_instructor'
FROM auth.users WHERE email = 'buddy_NIZX@newton.edu'
ON CONFLICT (id) DO UPDATE SET full_name = 'Neha Buddy Mentor', role = 'lead_instructor';

-- Create the Manager profile
INSERT INTO user_profiles (id, email, full_name, role)
SELECT id, email, 'Priya Lead Manager', 'lead_instructor'
FROM auth.users WHERE email = 'manager_NIZX@newton.edu'
ON CONFLICT (id) DO UPDATE SET full_name = 'Priya Lead Manager', role = 'lead_instructor';

-- Create the Onboarding Lead profile
INSERT INTO user_profiles (id, email, full_name, role)
SELECT id, email, 'Ravi Onboarding Lead', 'onboarding_lead'
FROM auth.users WHERE email = 'onboard_NIZX@newton.edu'
ON CONFLICT (id) DO UPDATE SET full_name = 'Ravi Onboarding Lead', role = 'onboarding_lead';

-- 2. Assign Manager & Buddy to Joinee
UPDATE user_profiles 
SET assigned_lead_id = (SELECT id FROM user_profiles WHERE email = 'manager_NIZX@newton.edu'),
    assigned_buddy_id = (SELECT id FROM user_profiles WHERE email = 'buddy_NIZX@newton.edu')
WHERE email = 'joinee_NIZX@newton.edu';

-- 3. Create Worksheet Submissions for the Joinee

-- Buddy worksheets
INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status, reviewer_type, worksheet_data)
SELECT id, 'p1_w1', 'phase-1', 'Submitted', 'pending_review', 'buddy', 
  '{"employeeName":"Arjun Test Joinee","mentorName":"Neha Buddy","department":"Computer Science","reflections":"Completed stakeholder mapping."}'::jsonb
FROM user_profiles WHERE email = 'joinee_NIZX@newton.edu'
ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review', reviewer_type = 'buddy', status = 'Submitted';

INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status, reviewer_type, worksheet_data)
SELECT id, 'p1_w2', 'phase-1', 'Submitted', 'pending_review', 'buddy',
  '{"employeeName":"Arjun Test Joinee","syncDate":"2026-06-10","keyTakeaways":"Weekly syncs going well with mentor."}'::jsonb
FROM user_profiles WHERE email = 'joinee_NIZX@newton.edu'
ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review', reviewer_type = 'buddy', status = 'Submitted';

INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status, reviewer_type, worksheet_data)
SELECT id, 'p1_w6', 'phase-1', 'Submitted', 'pending_review', 'buddy',
  '{"employeeName":"Arjun Test Joinee","lecturesObserved":2,"labsObserved":1,"keyLearning":"Effective classroom management."}'::jsonb
FROM user_profiles WHERE email = 'joinee_NIZX@newton.edu'
ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review', reviewer_type = 'buddy', status = 'Submitted';

-- Manager worksheets
INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status, reviewer_type, worksheet_data)
SELECT id, 'p1_w3', 'phase-1', 'Submitted', 'pending_review', 'manager',
  '{"employeeName":"Arjun Test Joinee","teachingPhilosophy":"Project-based learning with real-world applications.","coreValues":"Student-first approach."}'::jsonb
FROM user_profiles WHERE email = 'joinee_NIZX@newton.edu'
ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review', reviewer_type = 'manager', status = 'Submitted';

INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status, reviewer_type, worksheet_data)
SELECT id, 'p1_w7', 'phase-1', 'Submitted', 'pending_review', 'manager',
  '{"employeeName":"Arjun Test Joinee","pptsReviewed":5,"worksheetsReviewed":3,"qualityScore":"Good"}'::jsonb
FROM user_profiles WHERE email = 'joinee_NIZX@newton.edu'
ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review', reviewer_type = 'manager', status = 'Submitted';

-- Onboarding Lead worksheets
INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status, reviewer_type, worksheet_data)
SELECT id, 'p1_w4', 'phase-1', 'Submitted', 'pending_review', 'onboarding_lead',
  '{"employeeName":"Arjun Test Joinee","governanceStructure":"Understood university policies.","escalationPath":"Faculty → HOD → Academic Council"}'::jsonb
FROM user_profiles WHERE email = 'joinee_NIZX@newton.edu'
ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review', reviewer_type = 'onboarding_lead', status = 'Submitted';

INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status, reviewer_type, worksheet_data)
SELECT id, 'p1_w5', 'phase-1', 'Submitted', 'pending_review', 'onboarding_lead',
  '{"employeeName":"Arjun Test Joinee","portalAccess":"Verified all modules.","quizConfigured":"Yes"}'::jsonb
FROM user_profiles WHERE email = 'joinee_NIZX@newton.edu'
ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review', reviewer_type = 'onboarding_lead', status = 'Submitted';

-- 4. Verify
SELECT '✅ Users:' as info, u.email, u.full_name, u.role
FROM user_profiles u
WHERE u.email IN ('joinee_NIZX@newton.edu', 'buddy_NIZX@newton.edu', 'manager_NIZX@newton.edu', 'onboard_NIZX@newton.edu');

SELECT '✅ Assignments:' as info, u.email, u.assigned_lead_id, u.assigned_buddy_id
FROM user_profiles u
WHERE u.email = 'joinee_NIZX@newton.edu';

SELECT '✅ Worksheets:' as info, s.worksheet_id, s.reviewer_type, s.review_status
FROM worksheet_submissions s
JOIN user_profiles u ON s.user_id = u.id
WHERE u.email = 'joinee_NIZX@newton.edu'
ORDER BY s.reviewer_type, s.worksheet_id;
