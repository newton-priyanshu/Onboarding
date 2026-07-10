-- =============================================================================
-- SEED DATA — optional, non-production. Apply db/schema.sql (or
-- supabase/migrations/) FIRST. See db/README.md for details. Never run this
-- against a production project — it creates/updates real rows via direct
-- INSERT/UPDATE (bypassing RLS, as intended for service-role/SQL-editor use).
-- =============================================================================

-- =============================================================================
-- Seed Worksheet Submissions for Key Test Users
-- Run this in Supabase SQL Editor after users + assignments are created
-- =============================================================================

-- Helper: Get user ID by email
CREATE OR REPLACE FUNCTION get_id(email TEXT) RETURNS UUID AS $$
  SELECT id FROM user_profiles WHERE user_profiles.email = get_id.email LIMIT 1;
$$ LANGUAGE SQL;

-- =============================================================================
-- SCENARIO A: arjun.qa@newton.edu — Full Phase 1 + some Phase 2 (mixed states)
-- =============================================================================
DO $$
DECLARE
  uid UUID := get_id('arjun.qa@newton.edu');
  bid UUID := get_id('neha.qa@newton.edu');
  mid UUID := get_id('priya.qa@newton.edu');
  bname TEXT := 'Neha Kapoor';
  mname TEXT := 'Dr. Priya Sharma';
  ws TEXT; data JSONB;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'arjun.qa not found'; END IF;

  -- Phase 1 worksheets
  -- p1_w1: buddy_approved → ready for manager
  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data, reviewed_by, reviewed_at, reviewer_name, review_comment, review_history)
  VALUES (uid, 'p1_w1', 'phase-1', 'submitted', 'buddy_approved',
    '{"employeeName":"Arjun Mehta","department":"Computer Science","mentorName":"Neha Kapoor","reflections":"Stakeholder mapping completed successfully. Met all key team members.","stakeholders":[{"name":"Dr. Sharma","role":"Manager","team":"Faculty","responsibility":"Mentorship"},{"name":"Prof. Verma","role":"Senior Instructor","team":"Physics","responsibility":"Lab coordination"},{"name":"Ms. Kapoor","role":"Admin","team":"Operations","responsibility":"Scheduling"}],"conversations":[{"instructorName":"Prof. Mehta","date":"2026-06-01","takeaways":"Understood onboarding process"},{"instructorName":"Dr. Sharma","date":"2026-06-03","takeaways":"Discussed teaching methodology"}],"buddyName":"Neha Kapoor","buddyAssignmentDate":"2026-06-01","buddyChannel":"Slack","buddySyncDay":"Monday 11 AM"}',
    bid, NOW() - INTERVAL '3 days', bname, 'Great stakeholder mapping. Approved as buddy.', 
    ('[{"action":"buddy_approved","reviewer_name":"Neha Kapoor","comment":"Great stakeholder mapping.","timestamp":"' || (NOW() - INTERVAL '3 days')::TEXT || '"}]')::jsonb
  ) ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'buddy_approved', reviewed_by = bid, reviewer_name = bname;

  -- p1_w2: buddy_approved → ready for manager
  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data, reviewed_by, reviewed_at, reviewer_name, review_comment, review_history)
  VALUES (uid, 'p1_w2', 'phase-1', 'submitted', 'buddy_approved',
    '{"employeeName":"Arjun Mehta","mentorName":"Neha Kapoor","weeks":[{"date":"2026-06-01","topics":"Onboarding","actions":"Met team","mentorSignoff":true},{"date":"2026-06-08","topics":"Curriculum review","actions":"Reviewed materials","mentorSignoff":true},{"date":"2026-06-15","topics":"Classroom observation","actions":"Shadowed instructor","mentorSignoff":true},{"date":"2026-06-22","topics":"Student engagement","actions":"Planned session","mentorSignoff":true}],"mentorStrengths":"Quick learner, good communication","mentorReadiness":"Ready for more responsibility"}',
    bid, NOW() - INTERVAL '2 days', bname, 'Weekly syncs well documented.', 
    ('[{"action":"buddy_approved","reviewer_name":"Neha Kapoor","comment":"Weekly syncs well documented.","timestamp":"' || (NOW() - INTERVAL '2 days')::TEXT || '"}]')::jsonb
  ) ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'buddy_approved';

  -- p1_w3: pending_review (manager review)
  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data)
  VALUES (uid, 'p1_w3', 'phase-1', 'submitted', 'pending_review',
    '{"employeeName":"Arjun Mehta","teachingPhilosophy":"Student-centered learning through hands-on practice.","culturePsychSafety":"Students feel safe asking questions.","behaviour1":"Start each class with a recap","behaviour2":"Use think-pair-share every 15 min","behaviour3":"End with 2-min reflection prompt","employeeSignature":"Arjun Mehta"}'
  ) ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review';

  -- p1_w4: submitted (onboarding_lead review)
  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data)
  VALUES (uid, 'p1_w4', 'phase-1', 'submitted', 'pending_review',
    '{"employeeName":"Arjun Mehta","semesters":[{"semester":"Sem 1","startDate":"2026-06-01","endDate":"2026-09-30","keyEvents":"Mid-sem Aug"},{"semester":"Sem 2","startDate":"2027-01-01","endDate":"2027-04-30","keyEvents":"Mid-sem Mar"}],"cohorts":[{"name":"CS Batch A","students":"60","semesterYear":"Y1S1","notes":"Mixed ability"},{"name":"CS Batch B","students":"55","semesterYear":"Y1S1","notes":"Good analytical skills"}],"escalationPath":"Instructor → Faculty Lead → Academic Head → Dean","gradeProcess":"Grades via portal within 7 days.","employeeSignature":"Arjun Mehta"}'
  ) ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review';

  -- p1_w5: submitted (onboarding_lead review)
  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data)
  VALUES (uid, 'p1_w5', 'phase-1', 'submitted', 'pending_review',
    '{"employeeName":"Arjun Mehta","portalModules":["Attendance","Grades","Assignments","Quizzes"],"walkthroughComplete":true,"adminAccess":true,"quizConfigured":true,"walkthroughDate":"2026-06-05","quizSteps":["Created quiz","Added questions","Set time","Published"]}'
  ) ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review';

  -- p1_w6: buddy_approved
  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data, reviewed_by, reviewed_at, reviewer_name, review_comment, review_history)
  VALUES (uid, 'p1_w6', 'phase-1', 'submitted', 'buddy_approved',
    '{"employeeName":"Arjun Mehta","mentorName":"Neha Kapoor","observations":[{"date":"2026-06-05","instructor":"Dr. Sharma","class":"CS 101","strengths":"Clear explanations","improvements":"More interaction"},{"date":"2026-06-10","instructor":"Prof. Verma","class":"DS Lab","strengths":"Excellent facilitation","improvements":"Time mgmt"}]}',
    bid, NOW() - INTERVAL '1 day', bname, 'Good observation notes.', 
    ('[{"action":"buddy_approved","reviewer_name":"Neha Kapoor","comment":"Good observation notes.","timestamp":"' || (NOW() - INTERVAL '1 day')::TEXT || '"}]')::jsonb
  ) ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'buddy_approved';

  -- p1_w7: pending (manager review)
  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data)
  VALUES (uid, 'p1_w7', 'phase-1', 'submitted', 'pending_review',
    '{"employeeName":"Arjun Mehta","courseReviewed":"CS 101","questionBankStatus":"Adequate","contentGaps":"Modern paradigms not in depth","recommendations":"Add Python exercises, update examples"}'
  ) ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review';

  -- p1_w8: pending (onboarding_lead review)
  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data)
  VALUES (uid, 'p1_w8', 'phase-1', 'submitted', 'pending_review',
    '{"employeeName":"Arjun Mehta","channelsAudited":["#general","#cs101","#faculty","#doubt-sessions"],"bottlenecksIdentified":["Evening query response time","Duplicate questions"],"resolution":"Created FAQ channel, set office hours","auditCompleted":true}'
  ) ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review';

  -- GC1: buddy_approved → ready for manager
  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data, reviewed_by, reviewed_at, reviewer_name, review_comment, review_history)
  VALUES (uid, 'gc1', 'phase-1', 'submitted', 'buddy_approved',
    '{"employeeName":"Arjun Mehta","employeeSignature":"Arjun Mehta","portalRating":4,"courseRating":4,"readinessRating":4,"milestones":["Met","Met","Met","Partial","Met"],"readinessDecision":"approved","managerSignature":"Dr. Priya Sharma","instructorSignature":"Arjun Mehta"}',
    bid, NOW() - INTERVAL '1 day', bname, 'Buddy approved. Ready for manager sign-off.',
    ('[{"action":"buddy_approved","reviewer_name":"Neha Kapoor","comment":"Buddy approved. Ready for manager.","timestamp":"' || (NOW() - INTERVAL '1 day')::TEXT || '"}]')::jsonb
  ) ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'buddy_approved';

  -- Phase 2 p2_w1: pending (manager review)
  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data)
  VALUES (uid, 'p2_w1', 'phase-2', 'submitted', 'pending_review',
    '{"employeeName":"Arjun Mehta","entries":[{"date":"2026-07-01","channel":"Portal","query":"Recursion?","resolution":"Explained with examples"},{"date":"2026-07-03","channel":"Lab","query":"Linked list issue","resolution":"Walked through code"},{"date":"2026-07-05","channel":"Slack","query":"ArrayList vs LinkedList?","resolution":"Compared both"}],"keyInsight":"Students struggle with abstract concepts.","employeeSignature":"Arjun Mehta"}'
  ) ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review';

  RAISE NOTICE '✅ Created Phase 1 + Phase 2 worksheets for arjun.qa@newton.edu';
END;
$$;

-- =============================================================================
-- SCENARIO B: sneha.qa@newton.edu — Phase 1 with needs_revision example
-- =============================================================================
DO $$
DECLARE
  uid UUID := get_id('sneha.qa@newton.edu');
  bid UUID := get_id('neha.qa@newton.edu');
  bname TEXT := 'Neha Kapoor';
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'sneha.qa not found'; END IF;

  -- p1_w1: needs_revision
  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data, reviewed_by, reviewed_at, reviewer_name, review_comment, review_history)
  VALUES (uid, 'p1_w1', 'phase-1', 'submitted', 'needs_revision',
    '{"employeeName":"Sneha Patel","department":"Computer Science","reflections":"Met some team members. Still need to complete stakeholder mapping.","stakeholders":[{"name":"Dr. Sharma","role":"Manager","team":"Faculty","responsibility":"Mentorship"}],"buddyName":"Neha Kapoor"}',
    bid, NOW() - INTERVAL '4 days', bname, 'Please complete all stakeholder interviews. Missing 3 key stakeholders.', 
    ('[{"action":"needs_revision","reviewer_name":"Neha Kapoor","comment":"Please complete all stakeholder interviews. Missing 3 key stakeholders.","timestamp":"' || (NOW() - INTERVAL '4 days')::TEXT || '"}]')::jsonb
  ) ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'needs_revision';

  -- p1_w2: pending (buddy review)
  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data)
  VALUES (uid, 'p1_w2', 'phase-1', 'submitted', 'pending_review',
    '{"employeeName":"Sneha Patel","mentorName":"Neha Kapoor","weeks":[{"date":"2026-06-01","topics":"Onboarding","actions":"Met team","mentorSignoff":true}],"mentorStrengths":"Good communication","mentorReadiness":"In progress"}'
  ) ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review';

  -- p1_w3: needs_revision (manager requested)
  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data, reviewed_by, reviewed_at, reviewer_name, review_comment, review_history)
  VALUES (uid, 'p1_w3', 'phase-1', 'submitted', 'needs_revision',
    '{"employeeName":"Sneha Patel","teachingPhilosophy":"I believe in student-first approach.","behaviour1":"Start with recap","behaviour2":"Group discussion","employeeSignature":"Sneha Patel"}',
    get_id('priya.qa@newton.edu'), NOW() - INTERVAL '2 days', 'Dr. Priya Sharma',
    'Please expand with specific examples from your classroom experience.',
    ('[{"action":"needs_revision","reviewer_name":"Dr. Priya Sharma","comment":"Please expand with specific examples.","timestamp":"' || (NOW() - INTERVAL '2 days')::TEXT || '"}]')::jsonb
  ) ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'needs_revision';

  -- p1_w6: pending (buddy review)
  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data)
  VALUES (uid, 'p1_w6', 'phase-1', 'submitted', 'pending_review',
    '{"employeeName":"Sneha Patel","mentorName":"Neha Kapoor","observations":[{"date":"2026-06-05","instructor":"Dr. Sharma","class":"CS 101","strengths":"Clear","improvements":"More demos"}]}'
  ) ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review';

  RAISE NOTICE '✅ Created worksheets for sneha.qa@newton.edu (needs_revision examples)';
END;
$$;

-- =============================================================================
-- SCENARIO C: vikram.qa@newton.edu — Phase 1 fully submitted (pending)
-- =============================================================================
DO $$
DECLARE
  uid UUID := get_id('vikram.qa@newton.edu');
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'vikram.qa not found'; END IF;

  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status, worksheet_data)
  VALUES 
    (uid, 'p1_w1', 'phase-1', 'submitted', 'pending_review',
      '{"employeeName":"Vikram Singh","department":"Computer Science","reflections":"Started stakeholder mapping. Meeting team members.","buddyName":"Rajesh Kumar"}'),
    (uid, 'p1_w2', 'phase-1', 'submitted', 'pending_review',
      '{"employeeName":"Vikram Singh","mentorName":"Rajesh Kumar","weeks":[{"date":"2026-06-01","topics":"Intro","actions":"Met team","mentorSignoff":true}],"mentorStrengths":"Learning fast"}'),
    (uid, 'p1_w3', 'phase-1', 'submitted', 'pending_review',
      '{"employeeName":"Vikram Singh","teachingPhilosophy":"Learning by doing.","employeeSignature":"Vikram Singh"}'),
    (uid, 'p1_w4', 'phase-1', 'submitted', 'pending_review',
      '{"employeeName":"Vikram Singh","escalationPath":"Instructor → Lead → Head","gradeProcess":"7 days","employeeSignature":"Vikram Singh"}'),
    (uid, 'p1_w5', 'phase-1', 'submitted', 'pending_review',
      '{"employeeName":"Vikram Singh","walkthroughComplete":true,"portalModules":["Attendance","Grades"]}'),
    (uid, 'p1_w6', 'phase-1', 'submitted', 'pending_review',
      '{"employeeName":"Vikram Singh","mentorName":"Rajesh Kumar","observations":[{"date":"2026-06-05","instructor":"Dr. Sharma","class":"CS 101","strengths":"Clear","improvements":"Pacing"}]}'),
    (uid, 'p1_w7', 'phase-1', 'submitted', 'pending_review',
      '{"employeeName":"Vikram Singh","courseReviewed":"CS 101","recommendations":"Add examples"}'),
    (uid, 'p1_w8', 'phase-1', 'submitted', 'pending_review',
      '{"employeeName":"Vikram Singh","channelsAudited":["#general"],"auditCompleted":true}')
  ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review';

  RAISE NOTICE '✅ Created Phase 1 worksheets for vikram.qa@newton.edu';
END;
$$;

-- =============================================================================
-- Insert notifications for review actions
-- =============================================================================
INSERT INTO notifications (user_id, from_user_id, worksheet_id, type, message)
SELECT get_id('arjun.qa@newton.edu'), get_id('neha.qa@newton.edu'), 'p1_w1', 'buddy_approved',
  'Neha Kapoor approved your worksheet: Team Introduction & Stakeholder Mapping Log (p1_w1)'
WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE user_id = get_id('arjun.qa@newton.edu') AND worksheet_id = 'p1_w1' AND type = 'buddy_approved');

INSERT INTO notifications (user_id, from_user_id, worksheet_id, type, message)
SELECT get_id('sneha.qa@newton.edu'), get_id('neha.qa@newton.edu'), 'p1_w1', 'needs_revision',
  'Neha Kapoor requested revision on: Team Introduction & Stakeholder Mapping Log (p1_w1) — Please complete all stakeholder interviews.'
WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE user_id = get_id('sneha.qa@newton.edu') AND worksheet_id = 'p1_w1' AND type = 'needs_revision');

-- =============================================================================
-- Final verification
-- =============================================================================
SELECT '✅ WORKSHEETS' as section, u.email, count(*) as total,
  count(*) FILTER (WHERE s.review_status = 'pending_review') as pending,
  count(*) FILTER (WHERE s.review_status = 'buddy_approved') as buddy_approved,
  count(*) FILTER (WHERE s.review_status = 'needs_revision') as needs_revision
FROM worksheet_submissions s
JOIN user_profiles u ON s.user_id = u.id
WHERE u.email IN ('arjun.qa@newton.edu','sneha.qa@newton.edu','vikram.qa@newton.edu')
GROUP BY u.email ORDER BY u.email;

SELECT '✅ NOTIFICATIONS: ' || count(*)::TEXT FROM notifications;

-- Cleanup
DROP FUNCTION IF EXISTS get_id(TEXT);
