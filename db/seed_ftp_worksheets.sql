-- =============================================================================
-- Seed FTP Worksheet Submissions for Test Users
-- Run this in Supabase SQL Editor AFTER running __seed_test_data.cjs
-- This seeds all 20 FTP worksheets (16 content + 4 gates) for the 3 test joinees
-- =============================================================================

-- Helper: Get user ID by email (cleaned up at end)
CREATE OR REPLACE FUNCTION get_id(email TEXT) RETURNS UUID AS $$
  SELECT id FROM user_profiles WHERE user_profiles.email = get_id.email LIMIT 1;
$$ LANGUAGE SQL;

-- =============================================================================
-- SCENARIO A: arjun.qa@newton.edu — All 4 weeks fully submitted with various states
-- =============================================================================
DO $$
DECLARE
  uid UUID := get_id('arjun.qa@newton.edu');
  bid UUID := get_id('neha.qa@newton.edu');
  bname TEXT := 'Neha Kapoor';
  ws TEXT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'arjun.qa not found — run __seed_test_data.cjs first'; END IF;

  RAISE NOTICE 'Seeding FTP worksheets for arjun.qa@newton.edu...';

  -- ── WEEK 1: All buddy_approved ───────────────────────
  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data, reviewed_by, reviewed_at, reviewer_name, review_comment, review_history)
  VALUES (uid, 'w1_o1', 'week-1', 'submitted', 'buddy_approved', 
    '{"employeeName":"Arjun Mehta","accessVerified":true,"buddyContacted":true,"commsJoined":true,"laptopSetup":true,"portalAccess":true,"slackChannels":["#general","#faculty","#onboarding-july","#cs-dept"],"notes":"All access verified. Buddy Neha contacted via Slack."}',
    bid, NOW() - INTERVAL '25 days', bname, 'Logistics checklist complete.',
    ('[{"action":"buddy_approved","reviewer_name":"Neha Kapoor","comment":"Logistics checklist complete.","timestamp":"' || (NOW() - INTERVAL '25 days')::TEXT || '"}]')::jsonb)
  ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'buddy_approved', reviewed_by = bid, reviewer_name = bname;

  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data, reviewed_by, reviewed_at, reviewer_name, review_comment, review_history)
  VALUES (uid, 'w1_e1', 'week-1', 'submitted', 'buddy_approved',
    '{"employeeName":"Arjun Mehta","dateRead":"2026-06-02","keyTakeaways":"V3 introduces strict Bloom distribution rules. Each contest must have at least 2 questions at Apply level. No more than 2 Evaluate/Create combined. Peer L1 pass is mandatory before publishing.","questionsForFacilitator":"How do we handle contests where the Bloom distribution conflicts with topic coverage needs?"}',
    bid, NOW() - INTERVAL '24 days', bname, 'Good reflection on V3 guidelines.',
    ('[{"action":"buddy_approved","reviewer_name":"Neha Kapoor","comment":"Good reflection on V3 guidelines.","timestamp":"' || (NOW() - INTERVAL '24 days')::TEXT || '"}]')::jsonb)
  ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'buddy_approved';

  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data, reviewed_by, reviewed_at, reviewer_name, review_comment, review_history)
  VALUES (uid, 'w1_o2', 'week-1', 'submitted', 'buddy_approved',
    '{"employeeName":"Arjun Mehta","answers":[{"q":"What is the sacrosanct standard in our teaching philosophy?","a":"No student is left behind — friction is character, not a reason to give up.","section":"§1"},{"q":"Name three components of the culture engine.","a":"Mirror moments, witnessed commitment, and rehearsal cycles.","section":"§2"},{"q":"What is the difference between a silent error and a loud error?","a":"Silent errors go unnoticed by the student and require deliberate diagnostics. Loud errors are visible and can be corrected in the moment.","section":"§3"},{"q":"How do we handle a 'this is basic' moment from a student?","a":"Validate the feeling, then pivot to a deeper layer — ask why it matters or connect to a bigger application.","section":"§4"},{"q":"What is the 20% rule for content review?","a":"If a reviewer edits more than 20% of the content, the creator must fix the checklist and resubmit.","section":"§5"}],"reflectionNote":"The playbook is surprisingly practical. The 20% rule makes a lot of sense for quality control."}',
    bid, NOW() - INTERVAL '23 days', bname, 'Scavenger sheet complete and accurate.',
    ('[{"action":"buddy_approved","reviewer_name":"Neha Kapoor","comment":"Scavenger sheet complete and accurate.","timestamp":"' || (NOW() - INTERVAL '23 days')::TEXT || '"}]')::jsonb)
  ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'buddy_approved';

  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data, reviewed_by, reviewed_at, reviewer_name, review_comment, review_history)
  VALUES (uid, 'w1_g1', 'week-1', 'submitted', 'buddy_approved',
    '{"employeeName":"Arjun Mehta","employeeSignature":"Arjun Mehta","artifacts":[{"label":"Operational checklist complete","checked":true,"fromSession":"W1-O1"},{"label":"3 structured observation logs (TLAC-lens)","checked":true,"fromSession":"W1-D1"},{"label":"Completed playbook scavenger sheet","checked":true,"fromSession":"W1-O2"},{"label":"Written reflection #0 in why-we-reflect format","checked":true,"fromSession":"W1-A1"},{"label":"Platform walkthrough verification complete","checked":true,"fromSession":"W1-P1"}],"buddyDecision":"approved","buddySignature":"Neha Kapoor"}',
    bid, NOW() - INTERVAL '22 days', bname, 'All anchor artifacts verified. Gate 1 passed.',
    ('[{"action":"buddy_approved","reviewer_name":"Neha Kapoor","comment":"All anchor artifacts verified. Gate 1 passed.","timestamp":"' || (NOW() - INTERVAL '22 days')::TEXT || '"}]')::jsonb)
  ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'buddy_approved';

  -- ── WEEK 2: Mixed — most buddy_approved, w2_c3 pending ──
  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data, reviewed_by, reviewed_at, reviewer_name, review_comment, review_history)
  VALUES (uid, 'w2_e1', 'week-2', 'submitted', 'buddy_approved',
    '{"employeeName":"Arjun Mehta","taggings":[{"question":"What is the time complexity of binary search?","bloomLevel":"remember","justification":"Recall of a known fact."},{"question":"Explain how a hash table resolves collisions.","bloomLevel":"understand","justification":"Requires explanation of a concept."},{"question":"Write a function to reverse a linked list.","bloomLevel":"apply","justification":"Apply known algorithm to a specific problem."},{"question":"Compare the trade-offs between arrays and linked lists.","bloomLevel":"analyze","justification":"Requires breaking down and comparing two data structures."}],"reflection":"Most questions cluster around Remember and Apply. Need more Analyze and Evaluate in my question sets."}',
    bid, NOW() - INTERVAL '18 days', bname, 'Bloom tagging is thoughtful. Good meta-reflection.',
    ('[{"action":"buddy_approved","reviewer_name":"Neha Kapoor","comment":"Bloom tagging is thoughtful.","timestamp":"' || (NOW() - INTERVAL '18 days')::TEXT || '"}]')::jsonb)
  ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'buddy_approved';

  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data)
  VALUES (uid, 'w2_c3', 'week-2', 'submitted', 'pending_review',
    '{"employeeName":"Arjun Mehta","mcqs":[{"question":"Which of the following is NOT a valid Python data type?","options":["List","Tuple","Dictionary","Array"],"answer":"Array","bloomLevel":"remember"},{"question":"What will be the output of print(2 ** 3)?","options":["5","6","8","9"],"answer":"8","bloomLevel":"understand"},{"question":"Given a list of integers, write a function that returns the two numbers that sum to a target.","options":["O(n) with hash map","O(n²) brute force","O(n log n) with sorting","O(1) direct lookup"],"answer":"O(n) with hash map","bloomLevel":"apply"}],"codingQuestions":[{"title":"Palindrome Check","description":"Write a function that checks if a given string is a palindrome, ignoring case and non-alphanumeric characters.","testCases":"'racecar' → true, 'A man, a plan' → true, 'hello' → false"},{"title":"FizzBuzz","description":"Write a function that prints numbers 1 to n, replacing multiples of 3 with 'Fizz', multiples of 5 with 'Buzz', and multiples of both with 'FizzBuzz'.","testCases":"n=15 → 1,2,Fizz,4,Buzz,Fizz,7,8,Fizz,Buzz,11,Fizz,13,14,FizzBuzz"}],"peerReviewDone":true,"peerReviewedName":"Sneha Patel","peerReviewFeedback":"Snehas questions were well-structured. Her MCQ on recursion was clever. Suggested adding edge cases to her coding problems."}')
  ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review';

  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data, reviewed_by, reviewed_at, reviewer_name, review_comment, review_history)
  VALUES (uid, 'w2_d2', 'week-2', 'submitted', 'buddy_approved',
    '{"employeeName":"Arjun Mehta","topic":"Variables and Data Types in Python","feedbackNotes":"Peers liked the real-world analogy (variables as labelled boxes). Suggested slowing down during the coding demo. Good pacing overall.","selfReflection":"I was nervous at first but settled after the first 2 minutes. Need to work on transitions between concepts."}',
    bid, NOW() - INTERVAL '16 days', bname, 'Good micro-teach. Feedback mirrors my observations.',
    ('[{"action":"buddy_approved","reviewer_name":"Neha Kapoor","comment":"Good micro-teach.","timestamp":"' || (NOW() - INTERVAL '16 days')::TEXT || '"}]')::jsonb)
  ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'buddy_approved';

  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data, reviewed_by, reviewed_at, reviewer_name, review_comment, review_history)
  VALUES (uid, 'w2_b1', 'week-2', 'submitted', 'buddy_approved',
    '{"employeeName":"Arjun Mehta","topRules":["No phones during class — first offence: warning, second: dean referral","Raise hand before speaking — no callouts","Submit assignments on time — 10% penalty per day late"],"consequenceForBreaking":"First offense: private 1:1 chat after class. Second: documented warning. Third: escalate to Course Lead.","consistencyStrategy":"I will use a visible tracking sheet on the wall. Every rule breach gets a mark. No exceptions — the rule must apply equally to everyone.","mirrorReflection":"I tend to be too lenient because I want students to like me. I need to practice being firm but fair from Day 1."}',
    bid, NOW() - INTERVAL '15 days', bname, 'Good self-awareness on the mirror reflection.',
    ('[{"action":"buddy_approved","reviewer_name":"Neha Kapoor","comment":"Good self-awareness on the mirror reflection.","timestamp":"' || (NOW() - INTERVAL '15 days')::TEXT || '"}]')::jsonb)
  ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'buddy_approved';

  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data, reviewed_by, reviewed_at, reviewer_name, review_comment, review_history)
  VALUES (uid, 'w2_o1', 'week-2', 'submitted', 'buddy_approved',
    '{"employeeName":"Arjun Mehta","policyRead":true,"scenarios":[{"situation":"A student is found with unauthorised notes during an exam","response":"Confiscate notes, note the time, let the student continue. File a malpractice report after the exam per SOP §4.2."},{"situation":"A student submits a malpractice complaint against another student","response":"Take the complaint in writing. Do not discuss during the exam. Refer to the Academic Integrity Committee within 24 hours."},{"situation":"A student arrives 30 minutes late to the exam","response":"Allow entry if exam policy permits (check SOP). Note arrival time. No extra time granted unless documented medical reason."},{"situation":"The exam server goes down mid-test","response":"Pause all students. Note the downtime. Resume when server is back. Add equivalent time to the end of the exam. File an incident report."}],"questions":"What is the policy for students who finish an online exam early but the server crashes before they submit?"}',
    bid, NOW() - INTERVAL '14 days', bname, 'Scenario responses are thorough and policy-aligned.',
    ('[{"action":"buddy_approved","reviewer_name":"Neha Kapoor","comment":"Scenario responses thorough and policy-aligned.","timestamp":"' || (NOW() - INTERVAL '14 days')::TEXT || '"}]')::jsonb)
  ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'buddy_approved';

  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data, reviewed_by, reviewed_at, reviewer_name, review_comment, review_history)
  VALUES (uid, 'w2_g1', 'week-2', 'submitted', 'buddy_approved',
    '{"employeeName":"Arjun Mehta","artifacts":[{"label":"Question set created & peer-reviewed","checked":true,"fromSession":"W2-C3"},{"label":"Peer reviews authored for another hire","checked":true,"fromSession":"W2-C3"},{"label":"Blooms two-pens tagging sheet completed","checked":true,"fromSession":"W2-E1"},{"label":"Class Discipline Customisation Sheet draft","checked":true,"fromSession":"W2-B1"},{"label":"Micro-teach #1 completed with feedback","checked":true,"fromSession":"W2-D2"}],"buddyDecision":"approved","buddySignature":"Neha Kapoor"}',
    bid, NOW() - INTERVAL '13 days', bname, 'Co-create artifacts complete. Gate 2 passed.',
    ('[{"action":"buddy_approved","reviewer_name":"Neha Kapoor","comment":"Co-create artifacts complete. Gate 2 passed.","timestamp":"' || (NOW() - INTERVAL '13 days')::TEXT || '"}]')::jsonb)
  ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'buddy_approved';

  -- ── WEEK 3: Mixed states ─────────────────────────────
  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data)
  VALUES (uid, 'w3_d1', 'week-3', 'submitted', 'pending_review',
    '{"employeeName":"Arjun Mehta","techConfirmed":["Projector connection & screen sharing","Pentab setup & calibration","Portal joining (student + faculty)","Recording a lecture","Using in-class polling tools","Sound system & microphone test"],"notes":"All tech checked. The pentab calibration was tricky but works now."}')
  ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review';

  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data)
  VALUES (uid, 'w3_d2', 'week-3', 'submitted', 'pending_review',
    '{"employeeName":"Arjun Mehta","minuteByMinute":"Minute 1-2: Opening hook — real-world problem scenario\nMinute 3-5: Core concept explanation with diagram\nMinute 6-7: Worked example on board\nMinute 8-9: Quick practice problem (students try, I circulate)\nMinute 10: Recap and transition to next topic","transitionStrategy":"Use a bridging question: 'What we just did connects to...' as I move to the board.","biggestChallenge":"Sticking to the timebox — I tend to go deep on tangents."}')
  ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review';

  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data, reviewed_by, reviewed_at, reviewer_name, review_comment, review_history)
  VALUES (uid, 'w3_e1', 'week-3', 'submitted', 'needs_revision',
    '{"employeeName":"Arjun Mehta","contestTitle":"CS 101 — Data Structures Mini-Contest","bloomDistribution":"Remember: 2, Understand: 3, Apply: 4, Analyze: 2, Evaluate: 1, Create: 0","peerReviewed":false}',
    bid, NOW() - INTERVAL '8 days', bname, 'Missing Create-level question. Also peer L1 review not marked complete.',
    ('[{"action":"needs_revision","reviewer_name":"Neha Kapoor","comment":"Missing Create-level question. Also peer L1 review not marked complete.","timestamp":"' || (NOW() - INTERVAL '8 days')::TEXT || '"}]')::jsonb)
  ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'needs_revision';

  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data, reviewed_by, reviewed_at, reviewer_name, review_comment, review_history)
  VALUES (uid, 'w3_b1', 'week-3', 'submitted', 'buddy_approved',
    '{"employeeName":"Arjun Mehta","atRiskScript":"I would start by saying: 'I noticed youve been quiet in class lately and your last two assignments were submitted late. Im not here to punish you — I want to understand what is going on. Is everything okay?' Then listen without interrupting.","ruleChallengeScript":"'I hear your concern, and I appreciate you bringing it up. Let me explain why this rule exists — it is not about control, it is about fairness to everyone. After class, I am happy to discuss it more.' Then follow up 1:1.","basicMomentScript":"'You are right that the core idea is simple. Let me show you why it matters in a real engineering context — the challenge is not understanding it, but applying it when the stakes are higher.'","forcedPosition":"I naturally want to be liked, so I avoid confrontation. I need to practice being warm but direct — 'I care about you, which is why I am holding you to this standard.'"}',
    bid, NOW() - INTERVAL '7 days', bname, 'Excellent scripts — shows real understanding of the method.',
    ('[{"action":"buddy_approved","reviewer_name":"Neha Kapoor","comment":"Excellent scripts.","timestamp":"' || (NOW() - INTERVAL '7 days')::TEXT || '"}]')::jsonb)
  ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'buddy_approved';

  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data)
  VALUES (uid, 'w3_g1', 'week-3', 'submitted', 'pending_review',
    '{"employeeName":"Arjun Mehta","artifacts":[{"label":"Demo dry-run delivered + rubric sheets filed","checked":true,"fromSession":"W3-D4"},{"label":"Written response to demo feedback","checked":true,"fromSession":"W3-D4"},{"label":"Lecture package v1 completed","checked":true,"fromSession":"W3-C1"},{"label":"Mini-contest paper designed","checked":false,"fromSession":"W3-E1"},{"label":"Customisation Sheet complete","checked":true,"fromSession":"W2-B1"}],"buddyDecision":"pending","buddySignature":""}')
  ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review';

  -- ── WEEK 4: Some submitted, some not started ─────────
  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data)
  VALUES (uid, 'w4_d2', 'week-4', 'submitted', 'pending_review',
    '{"employeeName":"Arjun Mehta","sessionType":"mock_classroom","date":"2026-07-20","scenarios":"Handled late arrival, phone ringing in class, and a student saying 'this is revision'. Mock facilitator threw in a power outage scenario.","observerFeedback":"Good composure. The phone scenario could have been handled more firmly. Suggested: pause and wait rather than trying to talk over it.","selfReflection":"I stayed calm through the edge cases. Need to work on commanding presence — I still sound unsure sometimes."}')
  ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review';

  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data)
  VALUES (uid, 'w4_e1', 'week-4', 'submitted', 'pending_review',
    '{"employeeName":"Arjun Mehta","predictedRates":"Q1 (Remember): 85%, Q2 (Understand): 70%, Q3 (Apply): 55%, Q4 (Analyze): 40%, Q5 (Evaluate): 30%","actualRates":"Q1: 92%, Q2: 65%, Q3: 48%, Q4: 35%, Q5: 25%","calibrationNote":"I consistently overestimated difficulty for Remember-level questions and underestimated how hard Apply/Analyze would be. The gap between predicted and actual is largest at Apply level — I need to calibrate my expectation for what 'applying' looks like for students at this stage.","insights":"For future contests: include more practice questions at each level during class before the contest. The predicted-vs-actual gap is useful data for adjusting teaching emphasis."}')
  ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review';

  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data)
  VALUES (uid, 'w4_o1', 'week-4', 'submitted', 'pending_review',
    '{"employeeName":"Arjun Mehta","checklist":[{"item":"Lecture schedule confirmed","done":true,"notes":"Confirmed with Acad Ops"},{"item":"All course materials uploaded to portal","done":true,"notes":"Syllabus, readings, first 3 lectures"},{"item":"First 3 lecture packages ready","done":true,"notes":"Slides, quiz, assignment for Week 1-3"},{"item":"Assessment schedule published","done":false,"notes":"Awaiting course lead approval"},{"item":"Classroom assigned and verified","done":true,"notes":"Room 301, projector works"},{"item":"Office hours published","done":true,"notes":"Tue/Thu 2-4 PM"},{"item":"Welcome message drafted for students","done":true,"notes":"Ready to send"},{"item":"Backup plans for tech failures documented","done":false,"notes":"Need to document"}],"courseLeadSignOff":false}')
  ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review';

  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data)
  VALUES (uid, 'w4_b1', 'week-4', 'submitted', 'pending_review',
    '{"employeeName":"Arjun Mehta","reflectionPrompt1":"The most challenging part has been balancing speed with depth — there is so much to learn in 4 weeks but each topic deserves proper attention.","reflectionPrompt2":"The most rewarding moment was my micro-teach. Seeing that I can actually hold a room and explain a concept was a real confidence boost.","reflectionPrompt3":"I will carry forward the discipline consistency framework and the minute-by-minute planning approach. These are practical tools that will help me every day.","commitment":"I commit to asking for feedback after each of my first 10 lectures, and writing a one-paragraph reflection on what I learned from each."}')
  ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review';

  -- Gate 4 not yet submitted (still pending week 3 revision)

  RAISE NOTICE '✅ FTP worksheets seeded for arjun.qa@newton.edu — 20 submissions created';
END;
$$;

-- =============================================================================
-- SCENARIO B: sneha.qa@newton.edu — FTP Week 1-2 complete, Week 3-4 not started
-- =============================================================================
DO $$
DECLARE
  uid UUID := get_id('sneha.qa@newton.edu');
  bid UUID := get_id('neha.qa@newton.edu');
  bname TEXT := 'Neha Kapoor';
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'sneha.qa not found'; END IF;

  RAISE NOTICE 'Seeding FTP worksheets for sneha.qa@newton.edu...';

  -- Week 1: mixed states
  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data)
  VALUES (uid, 'w1_o1', 'week-1', 'draft', '',
    '{"employeeName":"Sneha Patel","accessVerified":true,"buddyContacted":true,"commsJoined":false,"laptopSetup":true,"portalAccess":true,"slackChannels":["#general","#faculty"],"notes":"Still need to join #onboarding channel"}')
  ON CONFLICT (user_id, worksheet_id) DO NOTHING;

  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data, reviewed_by, reviewed_at, reviewer_name, review_comment, review_history)
  VALUES (uid, 'w1_e1', 'week-1', 'submitted', 'needs_revision',
    '{"employeeName":"Sneha Patel","dateRead":"2026-06-03","keyTakeaways":"V3 has rules about Bloom levels. Need to read carefully before contest design.","questionsForFacilitator":"When do we get access to past contest data for calibration?"}',
    bid, NOW() - INTERVAL '22 days', bname, 'Please expand your takeaways — list at least 3 specific rules from V3 that stood out.',
    ('[{"action":"needs_revision","reviewer_name":"Neha Kapoor","comment":"Please expand your takeaways.","timestamp":"' || (NOW() - INTERVAL '22 days')::TEXT || '"}]')::jsonb)
  ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'needs_revision';

  -- Week 2: partial
  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data)
  VALUES (uid, 'w2_e1', 'week-2', 'submitted', 'pending_review',
    '{"employeeName":"Sneha Patel","taggings":[{"question":"Define recursion.","bloomLevel":"remember","justification":"Definition recall."},{"question":"Explain how merge sort works.","bloomLevel":"understand","justification":"Requires explanation of the algorithm."},{"question":"Implement a stack using arrays.","bloomLevel":"apply","justification":"Applying data structure knowledge."},{"question":"Compare time and space complexity of BFS vs DFS.","bloomLevel":"analyze","justification":"Comparing two algorithms across multiple dimensions."}],"reflection":"This was harder than I expected — justifying Bloom levels requires deep content knowledge."}')
  ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review';

  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data)
  VALUES (uid, 'w2_o1', 'week-2', 'submitted', 'pending_review',
    '{"employeeName":"Sneha Patel","policyRead":true,"scenarios":[{"situation":"A student is found with unauthorised notes during an exam","response":"Confiscate and file report."},{"situation":"A student submits a malpractice complaint against another student","response":"Take written statement and refer to committee."},{"situation":"A student arrives 30 minutes late to the exam","response":"Check policy — likely allow entry with time deduction."},{"situation":"The exam server goes down mid-test","response":"Pause, add time, file report."}],"questions":"None for now."}')
  ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review';

  -- Week 3-4: not started (no submissions)

  RAISE NOTICE '✅ FTP worksheets seeded for sneha.qa@newton.edu — 4 submissions created';
END;
$$;

-- =============================================================================
-- SCENARIO C: vikram.qa@newton.edu — FTP Week 1 partial only
-- =============================================================================
DO $$
DECLARE
  uid UUID := get_id('vikram.qa@newton.edu');
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'vikram.qa not found'; END IF;

  RAISE NOTICE 'Seeding FTP worksheets for vikram.qa@newton.edu...';

  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data)
  VALUES (uid, 'w1_o1', 'week-1', 'submitted', 'pending_review',
    '{"employeeName":"Vikram Singh","accessVerified":true,"buddyContacted":true,"commsJoined":true,"laptopSetup":false,"portalAccess":true,"slackChannels":["#general"],"notes":"Laptop pending IT setup"}')
  ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review';

  INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status,
    worksheet_data)
  VALUES (uid, 'w1_e1', 'week-1', 'draft', '',
    '{"employeeName":"Vikram Singh","dateRead":"","keyTakeaways":"","questionsForFacilitator":""}')
  ON CONFLICT (user_id, worksheet_id) DO NOTHING;

  -- No other FTP worksheets started

  RAISE NOTICE '✅ FTP worksheets seeded for vikram.qa@newton.edu — 2 submissions created';
END;
$$;

-- =============================================================================
-- Final Verification
-- =============================================================================
SELECT '✅ FTP WORKSHEET SEED' as section,
  u.email,
  count(*) as total,
  count(*) FILTER (WHERE s.review_status = 'buddy_approved') as buddy_approved,
  count(*) FILTER (WHERE s.review_status = 'pending_review') as pending,
  count(*) FILTER (WHERE s.review_status = 'needs_revision') as needs_revision,
  count(*) FILTER (WHERE s.worksheet_id LIKE 'w%') as ftp_only,
  count(*) FILTER (WHERE s.worksheet_id LIKE 'w%_g1') as gates
FROM worksheet_submissions s
JOIN user_profiles u ON s.user_id = u.id
WHERE u.email IN ('arjun.qa@newton.edu','sneha.qa@newton.edu','vikram.qa@newton.edu')
  AND s.worksheet_id LIKE 'w%'
GROUP BY u.email ORDER BY u.email;

-- Show detailed FTP worksheet list for arjun
SELECT '📋 Arjun FTP worksheets:' as info, s.worksheet_id, s.review_status, s.status
FROM worksheet_submissions s
JOIN user_profiles u ON s.user_id = u.id
WHERE u.email = 'arjun.qa@newton.edu' AND s.worksheet_id LIKE 'w%'
ORDER BY s.worksheet_id;

-- Cleanup
DROP FUNCTION IF EXISTS get_id(TEXT);
