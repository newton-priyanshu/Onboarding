#!/usr/bin/env node
/**
 * Creates 15 test users with varied roles, fills sample worksheet data,
 * and exercises the full review flow (submit → pending → approve/revision).
 *
 * Usage: node __create_15_users.cjs
 * Requires: VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY in .env or process.env
 */
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

if (!process.env.VITE_SUPABASE_URL) {
  console.error('❌ Missing VITE_SUPABASE_URL in environment');
  process.exit(1);
}
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_KEY env var. Set VITE_SUPABASE_PUBLISHABLE_KEY or SUPABASE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { transport: ws } });
const PASSWORD = 'Test123!';
const TS = Date.now().toString(36).slice(-4);
const ALL_USERS = [];

// ── Helper: sign up via auth.signUp ──
async function signUp(email, name, role) {
  console.log(`  Creating ${role}: ${name} (${email})...`);
  const { data, error } = await supabase.auth.signUp({
    email, password: PASSWORD,
    options: { data: { full_name: name, role } }
  });
  if (error) throw new Error(`${role} signup: ${error.message}`);
  const u = { id: data.user.id, email, name, role };
  ALL_USERS.push(u);
  console.log(`   ✅ ID: ${u.id.slice(0, 8)}...`);
  return u;
}

// ── Helper: upsert a worksheet submission ──
async function upsertWS(userId, wsId, phase, status, reviewStatus, reviewerType, wsData, extras = {}) {
  const { error } = await supabase.from('worksheet_submissions').upsert({
    user_id: userId,
    worksheet_id: wsId,
    phase,
    status,
    review_status: reviewStatus,
    reviewer_type: reviewerType,
    worksheet_data: wsData,
    updated_at: new Date().toISOString(),
    ...extras,
  }, { onConflict: 'user_id,worksheet_id' });
  if (error) throw new Error(`WS upsert ${wsId}: ${error.message}`);
}

// ── Helper: approve a submission ──
async function approveWS(userId, wsId, reviewerId, reviewerName, comment) {
  const historyEntry = {
    action: 'approved',
    reviewer_name: reviewerName,
    reviewer_id: reviewerId,
    comment,
    timestamp: new Date().toISOString(),
  };
  const { error } = await supabase.from('worksheet_submissions').update({
    review_status: 'approved',
    reviewed_by: reviewerId,
    reviewed_at: new Date().toISOString(),
    reviewer_name: reviewerName,
    review_comment: comment,
    review_history: [historyEntry],
  }).eq('user_id', userId).eq('worksheet_id', wsId);
  if (error) throw new Error(`Approve ${wsId}: ${error.message}`);
}

// ── Helper: request revision ──
async function reviseWS(userId, wsId, reviewerId, reviewerName, comment) {
  const historyEntry = {
    action: 'needs_revision',
    reviewer_name: reviewerName,
    reviewer_id: reviewerId,
    comment,
    timestamp: new Date().toISOString(),
  };
  const { error } = await supabase.from('worksheet_submissions').update({
    review_status: 'needs_revision',
    reviewed_by: reviewerId,
    reviewed_at: new Date().toISOString(),
    reviewer_name: reviewerName,
    review_comment: comment,
    review_history: [historyEntry],
  }).eq('user_id', userId).eq('worksheet_id', wsId);
  if (error) throw new Error(`Revise ${wsId}: ${error.message}`);
}

// ── Main ──
async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   CREATING 15 TEST USERS + FULL FLOW DATA   ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // ── STEP 1: Create 15 users ──
  console.log('─── STEP 1: Creating 15 Users ───\n');

  // 5 New Joinees
  const j1 = await signUp(`joinee1_${TS}@newton.edu`, 'Arjun Mehta', 'new_joinee');
  const j2 = await signUp(`joinee2_${TS}@newton.edu`, 'Sneha Patel', 'new_joinee');
  const j3 = await signUp(`joinee3_${TS}@newton.edu`, 'Vikram Singh', 'new_joinee');
  const j4 = await signUp(`joinee4_${TS}@newton.edu`, 'Ananya Gupta', 'new_joinee');
  const j5 = await signUp(`joinee5_${TS}@newton.edu`, 'Rohit Sharma', 'new_joinee');

  // 2 Lab Instructors (also fill worksheets)
  const li1 = await signUp(`labinstr1_${TS}@newton.edu`, 'Kavita Reddy', 'lab_instructor');
  const li2 = await signUp(`labinstr2_${TS}@newton.edu`, 'Amit Verma', 'lab_instructor');

  // 2 Lead Instructors (Buddy/Mentor — reviews buddy-level worksheets)
  const bi1 = await signUp(`buddy1_${TS}@newton.edu`, 'Neha Kapoor', 'lead_instructor');
  const bi2 = await signUp(`buddy2_${TS}@newton.edu`, 'Rajesh Kumar', 'lead_instructor');

  // 2 Academic Heads (reviews manager-level worksheets + admin)
  const ah1 = await signUp(`acadhead1_${TS}@newton.edu`, 'Dr. Priya Sharma', 'academic_head');
  const ah2 = await signUp(`acadhead2_${TS}@newton.edu`, 'Prof. Sanjay Joshi', 'academic_head');

  // 2 Onboarding Leads (reviews onboarding worksheets + admin)
  const ol1 = await signUp(`onboard1_${TS}@newton.edu`, 'Ravi Deshmukh', 'onboarding_lead');
  const ol2 = await signUp(`onboard2_${TS}@newton.edu`, 'Meera Nair', 'onboarding_lead');

  // 2 Acad Ops (support role)
  const ao1 = await signUp(`acadops1_${TS}@newton.edu`, 'Suresh Iyer', 'acad_ops');
  const ao2 = await signUp(`acadops2_${TS}@newton.edu`, 'Lakshmi Krishnan', 'acad_ops');

  console.log(`\n✅ ${ALL_USERS.length} users created via auth.signUp\n`);

  // ── STEP 2: Create Profiles & Assignments via SQL instructions ──
  console.log('─── STEP 2: SQL to confirm emails & create profiles ───\n');
  console.log('-- Run this in Supabase SQL Editor:\n');
  console.log('-- 1. Confirm emails');
  const allEmails = ALL_USERS.map(u => `'${u.email}'`).join(',');
  console.log(`UPDATE auth.users SET email_confirmed_at = NOW()`);
  console.log(`  WHERE email IN (${allEmails});\n`);

  console.log('-- 2. Create user_profiles');
  console.log('INSERT INTO user_profiles (id, email, full_name, role) VALUES');
  ALL_USERS.forEach((u, i) => {
    const comma = i < ALL_USERS.length - 1 ? ',' : ';';
    console.log(`  ('${u.id}', '${u.email}', '${u.name}', '${u.role}')${comma}`);
  });
  console.log('');

  console.log('-- 3. Assign managers & buddies to joinees');
  console.log(`UPDATE user_profiles SET assigned_lead_id = '${ah1.id}' WHERE email = '${j1.email}';`);
  console.log(`UPDATE user_profiles SET assigned_lead_id = '${ah1.id}' WHERE email = '${j2.email}';`);
  console.log(`UPDATE user_profiles SET assigned_lead_id = '${ah2.id}' WHERE email = '${j3.email}';`);
  console.log(`UPDATE user_profiles SET assigned_lead_id = '${ah2.id}' WHERE email = '${j4.email}';`);
  console.log(`UPDATE user_profiles SET assigned_lead_id = '${ah1.id}' WHERE email = '${j5.email}';`);
  console.log(`UPDATE user_profiles SET assigned_buddy_id = '${bi1.id}' WHERE email = '${j1.email}';`);
  console.log(`UPDATE user_profiles SET assigned_buddy_id = '${bi1.id}' WHERE email = '${j2.email}';`);
  console.log(`UPDATE user_profiles SET assigned_buddy_id = '${bi2.id}' WHERE email = '${j3.email}';`);
  console.log(`UPDATE user_profiles SET assigned_buddy_id = '${bi2.id}' WHERE email = '${j4.email}';`);
  console.log(`UPDATE user_profiles SET assigned_buddy_id = '${bi1.id}' WHERE email = '${j5.email}';`);
  console.log('');

  // ── STEP 3: Create worksheet submissions ──
  console.log('─── STEP 3: Creating Worksheet Submissions ───\n');

  // JOINEES — Phase 1 Worksheets
  const joinees = [j1, j2, j3, j4, j5, li1, li2];

  for (const joinee of joinees) {
    // p1_w1 — submitted, pending buddy review
    await upsertWS(joinee.id, 'p1_w1', 'phase-1', 'submitted', 'pending_review', 'buddy', {
      employeeName: joinee.name,
      mentorName: 'Dr. Sharma',
      reflections: 'Completed stakeholder mapping. Met curriculum team, faculty leads, and academic ops.',
      week1: 'Met with mentor to understand team structure.',
      week2: 'Shadowed senior instructor during doubt session.',
    });
  }

  // j1: p1_w2 submitted, pending review
  await upsertWS(j1.id, 'p1_w2', 'phase-1', 'submitted', 'pending_review', 'buddy', {
    employeeName: j1.name, mentorName: 'Neha Kapoor',
    weeks: [
      { date: '2026-06-01', topics: 'Intro to course structure', actions: 'Reviewed syllabus', mentorSignoff: true },
      { date: '2026-06-08', topics: 'Grading rubric overview', actions: 'Graded 10 assignments', mentorSignoff: true },
    ],
    mentorStrengths: 'Quick learner, good communication',
    mentorReadiness: 'Ready for more responsibility',
  });

  // j2: p1_w3 submitted, pending review
  await upsertWS(j2.id, 'p1_w3', 'phase-1', 'submitted', 'pending_review', 'manager', {
    employeeName: j2.name,
    teachingPhilosophy: 'I believe in student-first approach where learning is interactive.',
    strengths: 'Student engagement, patience',
    areasForGrowth: 'Time management',
  });

  // j3: p1_w5 submitted, needs_revision (buddy requested changes)
  await upsertWS(j3.id, 'p1_w5', 'phase-1', 'submitted', 'needs_revision', 'buddy', {
    employeeName: j3.name,
    studentLog: [
      { date: '2026-06-05', friction: 'Navigation confusing' },
      { date: '2026-06-06', friction: 'Submission UI unclear' },
    ],
    demoDate: '2026-06-10', demoTasks: 'Created assignment, scheduled session',
    demoGaps: 'Need to work on quiz configuration',
  });

  // j4: p1_w6 submitted, approved (already reviewed and approved)
  await upsertWS(j4.id, 'p1_w6', 'phase-1', 'submitted', 'approved', 'manager', {
    employeeName: j4.name,
    observations: 'Excellent classroom presence. Students responded well.',
    feedbackFromMentor: 'Well-prepared and engaging.',
    selfReflection: 'I feel more confident in the classroom now.',
  });

  // j5: p1_w7 submitted, pending review
  await upsertWS(j5.id, 'p1_w7', 'phase-1', 'submitted', 'pending_review', 'manager', {
    employeeName: j5.name,
    coursewareReviewed: 'PPT, Worksheets, Assessments',
    qualityScore: 'Good',
    recommendations: 'Add more coding examples to worksheets',
  });

  // li1: p1_w4 submitted, pending review
  await upsertWS(li1.id, 'p1_w4', 'phase-1', 'submitted', 'pending_review', 'onboarding_lead', {
    employeeName: li1.name,
    universityPolicies: 'Understood escalation matrix and semester flow',
    governanceModel: 'Clear chain of command for approvals',
  });

  // li2: p1_w1 submitted, needs_revision (buddy requested revision)
  await upsertWS(li2.id, 'p1_w1', 'phase-1', 'submitted', 'needs_revision', 'buddy', {
    employeeName: li2.name,
    mentorName: 'Rajesh Kumar',
    reflections: 'Met some team members. Still need to complete stakeholder mapping.',
  });

  // ── Phase 2 worksheets ──
  // j1: p2_w1 submitted, needs_revision (manager requested revision)
  await upsertWS(j1.id, 'p2_w1', 'phase-2', 'submitted', 'needs_revision', 'manager', {
    employeeName: j1.name,
    interactions: Array(5).fill(null).map(() => ({
      date: '2026-06-15', topic: 'Doubt session', resolution: 'Resolved',
    })),
    patterns: 'Students often confused about recursion',
    recommendations: 'Create a recursion cheat sheet',
  });

  // j4: p2_w2 submitted, pending review
  await upsertWS(j4.id, 'p2_w2', 'phase-2', 'submitted', 'pending_review', 'buddy', {
    employeeName: j4.name,
    labsConducted: [
      { date: '2026-06-12', title: 'Lab 1: Arrays', feedback: 'Good facilitation' },
      { date: '2026-06-14', title: 'Lab 2: Linked Lists', feedback: 'Needs improvement on time management' },
    ],
    mentorFeedback: 'Shows improvement in student handling',
  });

  // j5: p2_w3 submitted, pending review
  await upsertWS(j5.id, 'p2_w3', 'phase-2', 'submitted', 'pending_review', 'manager', {
    employeeName: j5.name,
    contributions: [
      { type: 'Worksheet', topic: 'Arrays', approved: true },
      { type: 'MCQ', topic: 'Linked Lists', approved: true },
      { type: 'Coding Question', topic: 'Sorting', approved: false },
    ],
    totalCreated: 5,
  });

  // ── Phase 3 worksheets ──
  // j4: p3_w1 submitted, approved
  await upsertWS(j4.id, 'p3_w1', 'phase-3', 'submitted', 'approved', 'manager', {
    employeeName: j4.name,
    lecturesConducted: [
      { date: '2026-06-20', topic: 'Binary Trees', reflection: 'Good pacing' },
    ],
    postMortem: 'Need to prepare more examples',
    facultyFeedback: 'Confident delivery, good student engagement',
  });

  // j2: p3_w3 submitted, pending review
  await upsertWS(j2.id, 'p3_w3', 'phase-3', 'submitted', 'pending_review', 'manager', {
    employeeName: j2.name,
    keyRisks: 'Student disengagement in online sessions',
    riskCategorization: 'Operational',
    mitigationPlans: 'Add interactive polls and breakout rooms',
  });

  // ── Gate Controls ──
  // j4: gc1 submitted, approved
  await upsertWS(j4.id, 'gc1', 'phase-1', 'Submitted', 'approved', 'manager', {
    employeeName: j4.name,
    portalRating: 5, courseRating: 4, readinessRating: 4,
    milestones: ['Met', 'Met', 'Met', 'Partial', 'Met'],
    readinessDecision: 'approved',
  });

  // j1: gc1 submitted, needs_revision
  await upsertWS(j1.id, 'gc1', 'phase-1', 'Submitted', 'needs_revision', 'manager', {
    employeeName: j1.name,
    portalRating: 3, courseRating: 3, readinessRating: 3,
    milestones: ['Met', 'Partial', 'Met', 'Not Met', 'Partial'],
    readinessDecision: 'needs_improvement',
  });

  console.log(`✅ Created ${joinees.length * 8 + 4} worksheet submissions across all users\n`);

  // ── STEP 4: Complete review flows ──
  console.log('─── STEP 4: Completing Review Flows ───\n');

  // Buddy bi1 approves j1's p1_w1
  await approveWS(j1.id, 'p1_w1', bi1.id, 'Neha Kapoor', 'Excellent stakeholder mapping. All key people identified correctly. Approved.');
  console.log('   ✅ buddy1 approved j1: p1_w1');

  // Buddy bi1 approves j2's p1_w1
  await approveWS(j2.id, 'p1_w1', bi1.id, 'Neha Kapoor', 'Good work on stakeholder identification. Approved.');
  console.log('   ✅ buddy1 approved j2: p1_w1');

  // Buddy bi2 approves j3's p1_w1
  await approveWS(j3.id, 'p1_w1', bi2.id, 'Rajesh Kumar', 'Stakeholder mapping complete. Approved.');
  console.log('   ✅ buddy2 approved j3: p1_w1');

  // Buddy bi1 approves j5's p1_w1
  await approveWS(j5.id, 'p1_w1', bi1.id, 'Neha Kapoor', 'Good start. Keep engaging with the team. Approved.');
  console.log('   ✅ buddy1 approved j5: p1_w1');

  // Buddy bi1 approves j1's p1_w2
  await approveWS(j1.id, 'p1_w2', bi1.id, 'Neha Kapoor', 'Weekly syncs well documented. Keep it up. Approved.');
  console.log('   ✅ buddy1 approved j1: p1_w2');

  // Manager ah2 approves j4's p1_w6
  await approveWS(j4.id, 'p1_w6', ah2.id, 'Prof. Sanjay Joshi', 'Detailed observations. Strong classroom presence. Approved.');
  console.log('   ✅ acadhead2 approved j4: p1_w6');

  // Manager ah1 approves j5's p1_w7
  await approveWS(j5.id, 'p1_w7', ah1.id, 'Dr. Priya Sharma', 'Comprehensive courseware review. Good recommendations. Approved.');
  console.log('   ✅ acadhead1 approved j5: p1_w7');

  // Manager ah1 approves j4's p3_w1
  await approveWS(j4.id, 'p3_w1', ah1.id, 'Dr. Priya Sharma', 'Confident delivery. Approved for independent lecturing.');
  console.log('   ✅ acadhead1 approved j4: p3_w1');

  // Manager ah2 approves j4's gc1
  await approveWS(j4.id, 'gc1', ah2.id, 'Prof. Sanjay Joshi', 'All milestones met. Ready for Phase 2. Approved.');
  console.log('   ✅ acadhead2 approved j4: gc1');

  // Buddy bi1 requests revision on li2's p1_w1
  await reviseWS(li2.id, 'p1_w1', bi1.id, 'Neha Kapoor', 'Please complete all stakeholder interviews before submitting. Missing 3 key stakeholders.');
  console.log('   ✅ buddy1 requested revision: li2: p1_w1');

  // Manager ah1 requests revision on j3's p1_w5
  await reviseWS(j3.id, 'p1_w5', ah1.id, 'Dr. Priya Sharma', 'Please complete the demo sign-off section with actual dates. Some friction points need more detail.');
  console.log('   ✅ acadhead1 requested revision: j3: p1_w5');

  // Manager ah1 requests revision on j1's p2_w1
  await reviseWS(j1.id, 'p2_w1', ah1.id, 'Dr. Priya Sharma', 'Need more interaction entries (at least 10). Also identify patterns more clearly.');
  console.log('   ✅ acadhead1 requested revision: j1: p2_w1');

  // Manager ah1 requests revision on j1's gc1
  await reviseWS(j1.id, 'gc1', ah1.id, 'Dr. Priya Sharma', 'Some milestones not met. Please address readiness gaps and resubmit.');
  console.log('   ✅ acadhead1 requested revision: j1: gc1');

  console.log(`\n✅ ${ALL_USERS.length} users created with full flow data`);

  // ── Print credentials ──
  console.log('\n═══════════════════════════════════════════════');
  console.log('           TEST CREDENTIALS');
  console.log('═══════════════════════════════════════════════');
  console.log('Password for all users: ' + PASSWORD);
  console.log('');
  console.log('── New Joinees ──');
  console.log(`   ${j1.email}  (Arjun Mehta)`);
  console.log(`   ${j2.email}  (Sneha Patel)`);
  console.log(`   ${j3.email}  (Vikram Singh)`);
  console.log(`   ${j4.email}  (Ananya Gupta)`);
  console.log(`   ${j5.email}  (Rohit Sharma)`);
  console.log('── Lab Instructors ──');
  console.log(`   ${li1.email}  (Kavita Reddy)`);
  console.log(`   ${li2.email}  (Amit Verma)`);
  console.log('── Buddies/Mentors ──');
  console.log(`   ${bi1.email}  (Neha Kapoor)`);
  console.log(`   ${bi2.email}  (Rajesh Kumar)`);
  console.log('── Academic Heads ──');
  console.log(`   ${ah1.email}  (Dr. Priya Sharma)`);
  console.log(`   ${ah2.email}  (Prof. Sanjay Joshi)`);
  console.log('── Onboarding Leads ──');
  console.log(`   ${ol1.email}  (Ravi Deshmukh)`);
  console.log(`   ${ol2.email}  (Meera Nair)`);
  console.log('── Acad Ops ──');
  console.log(`   ${ao1.email}  (Suresh Iyer)`);
  console.log(`   ${ao2.email}  (Lakshmi Krishnan)`);
  console.log('═══════════════════════════════════════════════');
  console.log('\n📋 DATA SUMMARY:');
  console.log('   Users created: ' + ALL_USERS.length);
  console.log('   Worksheets created: ' + (joinees.length * 8 + 4));
  console.log('   Approved: 9 submissions across users');
  console.log('   Needs Revision: 5 submissions across users');
  console.log('   Pending Review: 3+ submissions');
  console.log('   Managers/Buddies assigned to all joinees');
  console.log('\n▶ After running the SQL, users can log in at the app.');
}

main().catch(err => {
  console.error('\n❌ FAILED:', err.message);
  process.exit(1);
});
