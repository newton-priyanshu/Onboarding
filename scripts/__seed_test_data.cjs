// =============================================================================
// Newton Onboarding Portal — Test Data Seeder
// =============================================================================
// Run with: node __seed_test_data.cjs
// This script creates test users with realistic worksheet submissions so you
// can test the full review flow end-to-end.
//
// Prerequisites:
//   1. Run __migration_notifications_dates.sql in Supabase SQL editor first
//   2. Set SUPABASE_URL / SUPABASE_KEY env vars if different from .env
// =============================================================================

const { createClient } = require('@supabase/supabase-js');
const { WebSocket } = require('ws');

// ── Configuration ──────────────────────────────────────────────────────────
const PASSWORD = 'Test123!';
if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in environment');
  process.exit(1);
}
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { transport: WebSocket },
});

// ── Test Users ─────────────────────────────────────────────────────────────
const USERS = [
  // Joinees (new_joinee)
  { name: 'Arjun Mehta',      email: 'arjun.qa@newton.edu',     role: 'new_joinee' },
  { name: 'Sneha Patel',      email: 'sneha.qa@newton.edu',     role: 'new_joinee' },
  { name: 'Vikram Singh',     email: 'vikram.qa@newton.edu',    role: 'new_joinee' },
  // Buddy / Mentor (lead_instructor)
  { name: 'Neha Kapoor',      email: 'neha.qa@newton.edu',      role: 'lead_instructor' },
  // Manager (academic_head)
  { name: 'Dr. Priya Sharma', email: 'priya.qa@newton.edu',     role: 'academic_head' },
  // Onboarding Lead
  { name: 'Ravi Deshmukh',    email: 'ravi.qa@newton.edu',      role: 'onboarding_lead' },
];

// ── Worksheet Default Data ─────────────────────────────────────────────────
const WORKSHEET_DEFAULTS = {
  p1_w1: { employeeName: 'Arjun Mehta', buddyName: 'Neha Kapoor', stakeholders: [{ name: 'Dr. Sharma', role: 'Manager', team: 'Faculty', responsibility: 'Review' }], conversations: [{ date: '2026-06-01', instructorName: 'Prof. Mehta', topic: 'Onboarding overview', outcome: 'Good understanding' }] },
  p1_w2: { employeeName: 'Arjun Mehta', mentorName: 'Neha Kapoor', meetingDates: ['2026-06-01', '2026-06-08'], discussionTopics: 'Weekly sync on curriculum', goalsSet: 'Complete Phase 1', progressNotes: 'On track' },
  p1_w3: { employeeName: 'Arjun Mehta', culturePhilosophy: 'I believe in student-centered learning...', teachingApproach: 'Interactive lectures with real-world examples', growthAreas: 'Classroom management', newtonValues: 'Excellence, Innovation, Empathy' },
  p1_w4: { employeeName: 'Arjun Mehta', partnerUniversity: 'SRM University', semesterWeeks: 16, academicCalendar: 'June-December', governanceStructure: 'Department heads report to Dean', coordinationNotes: 'Monthly sync meetings' },
  p1_w5: { employeeName: 'Arjun Mehta', portalModules: ['Attendance', 'Grades', 'Assignments'], walkthroughComplete: true, adminAccess: true, quizConfigured: true },
  p1_w6: { employeeName: 'Arjun Mehta', mentorName: 'Neha Kapoor', observations: [{ date: '2026-06-05', instructor: 'Dr. Sharma', class: 'Physics 101', strengths: 'Clear explanations', improvements: 'More student interaction' }] },
  p1_w7: { employeeName: 'Arjun Mehta', courseReviewed: 'Physics 101', questionBankStatus: 'Needs expansion', contentGaps: 'Modern physics topics missing', recommendations: 'Add quantum mechanics module' },
  p1_w8: { employeeName: 'Arjun Mehta', channelsAudited: ['#general', '#physics', '#faculty'], bottlenecksIdentified: 'Response time for student queries', resolution: 'Create FAQ channel', auditCompleted: true },
  p2_w1: { employeeName: 'Arjun Mehta', commonErrors: ['Momentum conservation', 'Vector addition'], resolutionStrategies: 'Step-by-step problem solving', studentFeedback: 'Helpful sessions' },
  p2_w2: { employeeName: 'Arjun Mehta', labTopic: 'Newton\'s Laws', studentCount: 30, completionRate: 85, facilitationNotes: 'Students engaged well' },
  p2_w3: { employeeName: 'Arjun Mehta', contentCreated: 'Lab manual chapter 3', peerReviewed: true, reviewsReceived: 'Positive feedback' },
  p2_w4: { employeeName: 'Arjun Mehta', quizConfigured: true, portalSettingsVerified: true, backupProceduresReviewed: true },
  p3_w1: { employeeName: 'Arjun Mehta', lectureTopic: 'Thermodynamics', deliveryDate: '2026-07-01', studentCount: 28, pacingNotes: 'Completed on time' },
  p3_w2: { employeeName: 'Arjun Mehta', cohortSize: 30, highPerformers: 8, lowPerformers: 3, interventionPlan: 'Extra tutorials for low performers' },
  p3_w3: { employeeName: 'Arjun Mehta', assessmentTopic: 'Mid-term Physics', bloomLevels: { remember: 20, understand: 30, apply: 25, analyze: 15, evaluate: 10 }, totalMarks: 100 },
  p3_w4: { employeeName: 'Arjun Mehta', frameworksApplied: 'Constructivism, Active Learning', activeLearningExample: 'Think-pair-share activities', theoryPracticeGap: 'Need more hands-on labs', iterationNotes: 'Improved after feedback' },
  p3_w5: { employeeName: 'Arjun Mehta', courseName: 'Engineering Physics', proposalSummary: 'Add computational physics module', expectedImpact: 'Better student engagement', resourcesNeeded: 'Lab equipment' },
  gc1: { employeeName: 'Arjun Mehta', overallReflection: 'Good start to onboarding', keyLearnings: 'School processes, teaching philosophy', completionStatus: 'All Phase 1 worksheets done', readyForNext: true },
  gc2: { employeeName: 'Arjun Mehta', phase2Summary: 'Completed lab facilitation', keyAchievements: 'Independently ran 3 labs', challenges: 'Time management', readyForNext: true },
  gc3: { employeeName: 'Arjun Mehta', phase3Summary: 'Completed all milestones', teachingAbility: 'Independent', overallReadiness: 'Ready for full faculty role', recommendations: 'Continue mentorship' },

// ── FTP Worksheet Defaults ──────────────────────────────────────────────────
  // Week 1 — Anchor
  w1_o1: { employeeName: 'Arjun Mehta', accessVerified: true, buddyContacted: true, commsJoined: true, laptopSetup: true, portalAccess: true, slackChannels: ['#general', '#faculty', '#onboarding-july'], notes: 'All good.' },
  w1_e1: { employeeName: 'Arjun Mehta', dateRead: '2026-06-02', keyTakeaways: 'V3 Bloom distribution rules and peer L1 pass requirement.', questionsForFacilitator: 'How to handle Bloom vs topic coverage conflicts?' },
  w1_o2: { employeeName: 'Arjun Mehta', answers: [{ q: 'Sacrosanct standard?', a: 'No student left behind.', section: '§1' }, { q: 'Culture engine components?', a: 'Mirror, commitment, rehearsal.', section: '§2' }, { q: 'Silent vs loud error?', a: 'Silent = unnoticed by student, loud = visible.', section: '§3' }, { q: 'Handle basic moment?', a: 'Validate then go deeper.', section: '§4' }, { q: '20% rule?', a: 'If edits >20%, fix checklist.', section: '§5' }], reflectionNote: 'Very practical.' },
  w1_g1: { employeeName: 'Arjun Mehta', artifacts: [{ label: 'Operational checklist', checked: true, fromSession: 'W1-O1' }, { label: 'Observation logs', checked: true, fromSession: 'W1-D1' }, { label: 'Scavenger sheet', checked: true, fromSession: 'W1-O2' }, { label: 'Reflection #0', checked: true, fromSession: 'W1-A1' }], employeeSignature: 'Arjun Mehta' },
  // Week 2 — Co-create
  w2_e1: { employeeName: 'Arjun Mehta', taggings: [{ question: 'What is Big O?', bloomLevel: 'remember', justification: 'Recall.' }, { question: 'Explain hash table collisions.', bloomLevel: 'understand', justification: 'Explanation.' }, { question: 'Reverse a linked list.', bloomLevel: 'apply', justification: 'Apply algorithm.' }, { question: 'Compare BFS vs DFS.', bloomLevel: 'analyze', justification: 'Comparison.' }], reflection: 'Need more Analyze level questions.' },
  w2_c3: { employeeName: 'Arjun Mehta', mcqs: [{ question: 'Which is not a Python type?', options: ['List', 'Tuple', 'Dict', 'Array'], answer: 'Array', bloomLevel: 'remember' }, { question: 'Output of 2 ** 3?', options: ['5', '6', '8', '9'], answer: '8', bloomLevel: 'understand' }, { question: 'Two-sum best complexity?', options: ['O(n)', 'O(n²)', 'O(n log n)', 'O(1)'], answer: 'O(n)', bloomLevel: 'apply' }], codingQuestions: [{ title: 'Palindrome Check', description: 'Check if string is palindrome ignoring non-alphanumeric.', testCases: 'racecar => true' }, { title: 'FizzBuzz', description: 'Print 1-n with Fizz/Buzz replacements.', testCases: 'n=15' }], peerReviewDone: true, peerReviewedName: 'Sneha Patel', peerReviewFeedback: 'Good questions, add edge cases.' },
  w2_d2: { employeeName: 'Arjun Mehta', topic: 'Python Variables', feedbackNotes: 'Good pacing, use more analogies.', selfReflection: 'Nervous but settled after 2 min.' },
  w2_b1: { employeeName: 'Arjun Mehta', topRules: ['No phones', 'Raise hand before speaking', 'Submit on time'], consequenceForBreaking: 'Private chat first offense, documented second.', consistencyStrategy: 'Visible tracking sheet, no exceptions.', mirrorReflection: 'Tend to be lenient, need to practice firmness.' },
  w2_o1: { employeeName: 'Arjun Mehta', policyRead: true, scenarios: [{ situation: 'Student with notes', response: 'Confiscate, file report.' }, { situation: 'Malpractice complaint', response: 'Take written statement, refer to committee.' }, { situation: '30 min late', response: 'Allow entry per policy.' }, { situation: 'Server down', response: 'Pause, add time, file report.' }], questions: '' },
  w2_g1: { employeeName: 'Arjun Mehta', artifacts: [{ label: 'Question set', checked: true, fromSession: 'W2-C3' }, { label: 'Peer review', checked: true, fromSession: 'W2-C3' }, { label: 'Bloom tagging', checked: true, fromSession: 'W2-E1' }, { label: 'Discipline sheet', checked: true, fromSession: 'W2-B1' }], employeeSignature: 'Arjun Mehta' },
  // Week 3 — Co-deliver
  w3_d1: { employeeName: 'Arjun Mehta', techConfirmed: ['Projector', 'Pentab', 'Portal joining', 'Recording', 'Polling tools', 'Sound system'], notes: 'All working.' },
  w3_d2: { employeeName: 'Arjun Mehta', minuteByMinute: 'Min 1-2: Hook\nMin 3-5: Concept\nMin 6-7: Example\nMin 8-9: Practice\nMin 10: Recap', transitionStrategy: 'Bridging question between segments.', biggestChallenge: 'Sticking to timebox.' },
  w3_e1: { employeeName: 'Arjun Mehta', contestTitle: 'DS Mini-Contest', bloomDistribution: 'R:2, U:3, A:4, An:2, E:1, C:0', peerReviewed: false },
  w3_b1: { employeeName: 'Arjun Mehta', atRiskScript: 'Check in privately, listen without interrupting.', ruleChallengeScript: 'Acknowledge concern, explain reasoning, follow up 1:1.', basicMomentScript: 'Validate and connect to real application.', forcedPosition: 'Avoid confrontation - need to practice directness.' },
  w3_g1: { employeeName: 'Arjun Mehta', artifacts: [{ label: 'Demo dry-run', checked: true, fromSession: 'W3-D4' }, { label: 'Feedback response', checked: true, fromSession: 'W3-D4' }, { label: 'Lecture package v1', checked: true, fromSession: 'W3-C1' }, { label: 'Mini-contest', checked: false, fromSession: 'W3-E1' }], employeeSignature: 'Arjun Mehta' },
  // Week 4 — Independence
  w4_d2: { employeeName: 'Arjun Mehta', sessionType: 'mock_classroom', date: '2026-07-20', scenarios: 'Late arrival, phone ringing, power outage.', observerFeedback: 'Good composure, be firmer on phone scenario.', selfReflection: 'Stayed calm, need more presence.' },
  w4_e1: { employeeName: 'Arjun Mehta', predictedRates: 'Q1:85%, Q2:70%, Q3:55%, Q4:40%, Q5:30%', actualRates: 'Q1:92%, Q2:65%, Q3:48%, Q4:35%, Q5:25%', calibrationNote: 'Overestimated difficulty, especially at Apply level.', insights: 'Include more practice questions at each level before contests.' },
  w4_o1: { employeeName: 'Arjun Mehta', checklist: [{ item: 'Schedule confirmed', done: true, notes: '' }, { item: 'Materials uploaded', done: true, notes: '' }, { item: 'Lecture packages ready', done: true, notes: '' }, { item: 'Assessment schedule', done: false, notes: 'Pending approval' }, { item: 'Classroom assigned', done: true, notes: '' }, { item: 'Office hours set', done: true, notes: '' }, { item: 'Welcome message', done: true, notes: '' }, { item: 'Tech backup plan', done: false, notes: '' }], courseLeadSignOff: false },
  w4_b1: { employeeName: 'Arjun Mehta', reflectionPrompt1: 'Balancing speed with depth.', reflectionPrompt2: 'Micro-teach was confidence boost.', reflectionPrompt3: 'Discipline framework and minute-planning.', commitment: 'I commit to asking for feedback after each of my first 10 lectures.' },
  w4_g1: { employeeName: 'Arjun Mehta', artifacts: [{ label: 'Demo final', checked: false, fromSession: 'W4-D1' }, { label: 'Lecture package v2', checked: false, fromSession: 'W4-C1' }, { label: 'Pre-semester checklist', checked: false, fromSession: 'W4-O1' }, { label: 'Reflection #1', checked: false, fromSession: 'W4-B1' }], employeeSignature: '' },
};

// ── Helpers ────────────────────────────────────────────────────────────────
const ALL_WORKSHEET_IDS = Object.keys(WORKSHEET_DEFAULTS);
const PHASES = {
  p1: { ids: ['p1_w1','p1_w2','p1_w3','p1_w4','p1_w5','p1_w6','p1_w7','p1_w8','gc1'], phase: 'phase-1' },
  p2: { ids: ['p2_w1','p2_w2','p2_w3','p2_w4','gc2'], phase: 'phase-2' },
  p3: { ids: ['p3_w1','p3_w2','p3_w3','p3_w4','p3_w5','gc3'], phase: 'phase-3' },
};

const FTP_WEEKS = {
  w1: { ids: ['w1_o1','w1_e1','w1_o2','w1_g1'], phase: 'week-1' },
  w2: { ids: ['w2_e1','w2_c3','w2_d2','w2_b1','w2_o1','w2_g1'], phase: 'week-2' },
  w3: { ids: ['w3_d1','w3_d2','w3_e1','w3_b1','w3_g1'], phase: 'week-3' },
  w4: { ids: ['w4_d2','w4_e1','w4_o1','w4_b1','w4_g1'], phase: 'week-4' },
};

let createdUsers = {};

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function createUser({ name, email, role }) {
  console.log(`  → Creating ${role}: ${name} (${email})`);
  const { data, error } = await supabase.auth.signUp({
    email,
    password: PASSWORD,
    options: { data: { full_name: name, role } },
  });
  if (error) {
    // If user already exists, try to fetch the profile
    if (error.message?.includes('already registered')) {
      console.log(`    ⚠ User already exists, fetching profile...`);
      const { data: existing } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('email', email)
        .single();
      if (existing) {
        createdUsers[role] = existing;
        createdUsers[email] = existing;
        return existing;
      }
      throw error;
    }
    throw error;
  }
  if (!data?.user) throw new Error(`Failed to create user: ${name}`);

  // Wait for the trigger to create the profile
  await sleep(2000);

  // Fetch the profile
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', data.user.id)
    .single();

  if (profile) {
    createdUsers[role] = profile;
    createdUsers[email] = profile;
  }
  return profile;
}

async function assignBuddy(joineeEmail, buddyEmail) {
  const joinee = createdUsers[joineeEmail];
  const buddy = createdUsers[buddyEmail];
  if (!joinee || !buddy) {
    console.log(`  ⚠ Cannot assign: joinee/buddy not found`);
    return;
  }
  console.log(`  → Assigning buddy ${buddy.full_name} to ${joinee.full_name}`);
  const { error } = await supabase
    .from('user_profiles')
    .update({ assigned_buddy_id: buddy.id })
    .eq('id', joinee.id);
  if (error) console.error(`    ✗ Assignment error:`, error.message);
}

async function assignManager(joineeEmail, managerEmail) {
  const joinee = createdUsers[joineeEmail];
  const manager = createdUsers[managerEmail];
  if (!joinee || !manager) {
    console.log(`  ⚠ Cannot assign: joinee/manager not found`);
    return;
  }
  console.log(`  → Assigning manager ${manager.full_name} to ${joinee.full_name}`);
  const { error } = await supabase
    .from('user_profiles')
    .update({ assigned_lead_id: manager.id })
    .eq('id', joinee.id);
  if (error) console.error(`    ✗ Assignment error:`, error.message);
}

async function createSubmission(userId, worksheetId, status, reviewStatus, extra = {}) {
  const data = WORKSHEET_DEFAULTS[worksheetId] || {};
  const phase = worksheetId.startsWith('p1') || worksheetId === 'gc1' ? 'phase-1'
    : worksheetId.startsWith('p2') || worksheetId === 'gc2' ? 'phase-2'
    : worksheetId.startsWith('p3') || worksheetId === 'gc3' ? 'phase-3'
    : worksheetId.startsWith('w1') ? 'week-1'
    : worksheetId.startsWith('w2') ? 'week-2'
    : worksheetId.startsWith('w3') ? 'week-3'
    : worksheetId.startsWith('w4') ? 'week-4'
    : 'phase-3';

  const { error } = await supabase
    .from('worksheet_submissions')
    .upsert({
      user_id: userId,
      worksheet_id: worksheetId,
      phase,
      status,
      review_status: reviewStatus,
      worksheet_data: { ...data, ...extra.data },
      ...extra,
    }, { onConflict: 'user_id, worksheet_id' });

  if (error) console.error(`    ✗ Submission error (${worksheetId}):`, error.message);
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Newton Onboarding - Test Data Seeder');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Step 1: Create all users
  console.log('📋 Step 1: Creating test users...\n');
  for (const u of USERS) {
    try {
      await createUser(u);
    } catch (err) {
      console.error(`  ✗ Failed to create ${u.name}:`, err.message);
    }
    await sleep(500);
  }
  console.log(`\n  ✅ Created ${Object.keys(createdUsers).length} users\n`);

  const arjun   = createdUsers['arjun.qa@newton.edu'];
  const sneha   = createdUsers['sneha.qa@newton.edu'];
  const vikram  = createdUsers['vikram.qa@newton.edu'];
  const neha    = createdUsers['neha.qa@newton.edu'];
  const priya   = createdUsers['priya.qa@newton.edu'];
  const ravi    = createdUsers['ravi.qa@newton.edu'];

  // Step 2: Assign buddies and managers
  console.log('📋 Step 2: Assigning buddies & managers...\n');
  if (arjun && neha) await assignBuddy('arjun.qa@newton.edu', 'neha.qa@newton.edu');
  if (arjun && priya) await assignManager('arjun.qa@newton.edu', 'priya.qa@newton.edu');
  if (sneha && neha) await assignBuddy('sneha.qa@newton.edu', 'neha.qa@newton.edu');
  if (sneha && priya) await assignManager('sneha.qa@newton.edu', 'priya.qa@newton.edu');
  if (vikram && neha) await assignBuddy('vikram.qa@newton.edu', 'neha.qa@newton.edu');
  if (vikram && priya) await assignManager('vikram.qa@newton.edu', 'priya.qa@newton.edu');
  await sleep(1000);

  // Step 3: Create worksheet submissions with various states
  console.log('\n📋 Step 3: Creating worksheet submissions...\n');

  if (arjun) {
    // Arjun: Phase 1 buddy_approved (ready for manager promotion), Phase 2+ fully approved
    console.log('  → Arjun Mehta - Phase 1 worksheets (buddy_approved — ready for manager promotion)');
    for (const id of PHASES.p1.ids) {
      await createSubmission(arjun.id, id, 'submitted', 'buddy_approved', {
        reviewed_at: new Date().toISOString(),
        reviewer_name: 'Neha Kapoor',
        review_comment: 'Great work!',
        review_history: [{ action: 'buddy_approved', reviewer_name: 'Neha Kapoor', comment: 'Great work!', timestamp: new Date().toISOString() }],
      });
    }
    console.log('  → Arjun Mehta - Phase 2 worksheets');
    for (const id of PHASES.p2.ids) {
      await createSubmission(arjun.id, id, 'submitted', 'approved', {
        reviewed_at: new Date().toISOString(),
        reviewer_name: 'Neha Kapoor',
        review_comment: 'Well done!',
        review_history: [{ action: 'approved', reviewer_name: 'Neha Kapoor', comment: 'Well done!', timestamp: new Date().toISOString() }],
      });
    }
    console.log('  → Arjun Mehta - Phase 3 (mixed states)');
    for (const id of PHASES.p3.ids) {
      await createSubmission(arjun.id, id, 'submitted', 'pending_review');
    }
    await sleep(500);
  }

  if (sneha) {
    // Sneha: Phase 1 approved, Phase 2 needs_revision w1-w2, Phase 3 pending
    console.log('  → Sneha Patel - Phase 1 approved');
    for (const id of PHASES.p1.ids) {
      await createSubmission(sneha.id, id, 'submitted', 'approved', {
        reviewed_at: new Date().toISOString(),
        reviewer_name: 'Neha Kapoor',
        review_comment: 'Completed',
        review_history: [{ action: 'approved', reviewer_name: 'Neha Kapoor', comment: 'Completed', timestamp: new Date().toISOString() }],
      });
    }
    console.log('  → Sneha Patel - Phase 2 (w1+w2 needs_revision, rest pending)');
    await createSubmission(sneha.id, 'p2_w1', 'submitted', 'needs_revision', {
      reviewed_at: new Date().toISOString(),
      reviewer_name: 'Neha Kapoor',
      review_comment: 'Please add more detail to the error log',
      review_history: [{ action: 'needs_revision', reviewer_name: 'Neha Kapoor', comment: 'Please add more detail', timestamp: new Date().toISOString() }],
    });
    await createSubmission(sneha.id, 'p2_w2', 'submitted', 'needs_revision', {
      reviewed_at: new Date().toISOString(),
      reviewer_name: 'Neha Kapoor',
      review_comment: 'Lab scorecard needs facilitation notes',
      review_history: [{ action: 'needs_revision', reviewer_name: 'Neha Kapoor', comment: 'Lab scorecard needs facilitation notes', timestamp: new Date().toISOString() }],
    });
    for (const id of ['p2_w3', 'p2_w4', 'gc2']) {
      await createSubmission(sneha.id, id, 'submitted', 'pending_review');
    }
    console.log('  → Sneha Patel - Phase 3 (p3_w1+w2 revision_submitted, rest pending)');
    await createSubmission(sneha.id, 'p3_w1', 'submitted', 'revision_submitted', {
      review_history: [
        { action: 'needs_revision', reviewer_name: 'Neha Kapoor', comment: 'Add more detail', timestamp: new Date(Date.now() - 86400000).toISOString() },
        { action: 'revision_submitted', reviewer_name: '', comment: 'Updated as requested', timestamp: new Date().toISOString() },
      ],
    });
    await createSubmission(sneha.id, 'p3_w2', 'submitted', 'revision_submitted', {
      review_history: [
        { action: 'needs_revision', reviewer_name: 'Neha Kapoor', comment: 'Add intervention plan', timestamp: new Date(Date.now() - 86400000).toISOString() },
        { action: 'revision_submitted', reviewer_name: '', comment: 'Added plan', timestamp: new Date().toISOString() },
      ],
    });
    for (const id of ['p3_w3', 'p3_w4', 'p3_w5', 'gc3']) {
      await createSubmission(sneha.id, id, 'submitted', 'pending_review');
    }
    await sleep(500);
  }

  if (vikram) {
    // Vikram: Phase 1 in progress, Phase 2 not started
    console.log('  → Vikram Singh - Phase 1 in progress (partial)');
    await createSubmission(vikram.id, 'p1_w1', 'In Progress', '');
    await createSubmission(vikram.id, 'p1_w2', 'In Progress', '');
    await createSubmission(vikram.id, 'p1_w6', 'submitted', 'pending_review');
    await createSubmission(vikram.id, 'p1_w8', 'submitted', 'pending_review');
    // Vikram has no Phase 2 or 3 submissions
    await sleep(500);
  }

  // ── FTP Worksheet Submissions ──────────────────────────────────────────
  console.log('  → FTP Week Worksheets...\n');

  if (arjun) {
    // Arjun: Week 1-2 buddy_approved, Week 3-4 mixed
    console.log('    Arjun - Week 1 (Anchor): buddy_approved');
    for (const id of FTP_WEEKS.w1.ids) {
      await createSubmission(arjun.id, id, 'submitted', 'buddy_approved', {
        reviewed_at: new Date(Date.now() - 22 * 86400000).toISOString(),
        reviewer_name: 'Neha Kapoor',
        review_comment: 'Week 1 anchor artifacts approved.',
        review_history: [{ action: 'buddy_approved', reviewer_name: 'Neha Kapoor', comment: 'Approved.', timestamp: new Date(Date.now() - 22 * 86400000).toISOString() }],
      });
    }
    console.log('    Arjun - Week 2 (Co-create): buddy_approved (except w2_c3 pending)');
    for (const id of FTP_WEEKS.w2.ids) {
      if (id === 'w2_c3') {
        await createSubmission(arjun.id, id, 'submitted', 'pending_review');
      } else {
        await createSubmission(arjun.id, id, 'submitted', 'buddy_approved', {
          reviewed_at: new Date(Date.now() - 15 * 86400000).toISOString(),
          reviewer_name: 'Neha Kapoor',
          review_comment: 'Week 2 co-create approved.',
          review_history: [{ action: 'buddy_approved', reviewer_name: 'Neha Kapoor', comment: 'Approved.', timestamp: new Date(Date.now() - 15 * 86400000).toISOString() }],
        });
      }
    }
    console.log('    Arjun - Week 3 (Co-deliver): mixed states');
    for (const id of FTP_WEEKS.w3.ids) {
      if (id === 'w3_e1') {
        await createSubmission(arjun.id, id, 'submitted', 'needs_revision', {
          reviewed_at: new Date(Date.now() - 8 * 86400000).toISOString(),
          reviewer_name: 'Neha Kapoor',
          review_comment: 'Missing Create-level question and peer L1 review.',
          review_history: [{ action: 'needs_revision', reviewer_name: 'Neha Kapoor', comment: 'Missing Create-level question.', timestamp: new Date(Date.now() - 8 * 86400000).toISOString() }],
        });
      } else if (id === 'w3_b1') {
        await createSubmission(arjun.id, id, 'submitted', 'buddy_approved', {
          reviewed_at: new Date(Date.now() - 7 * 86400000).toISOString(),
          reviewer_name: 'Neha Kapoor',
          review_comment: 'Excellent dialoguing scripts.',
          review_history: [{ action: 'buddy_approved', reviewer_name: 'Neha Kapoor', comment: 'Excellent.', timestamp: new Date(Date.now() - 7 * 86400000).toISOString() }],
        });
      } else {
        await createSubmission(arjun.id, id, 'submitted', 'pending_review');
      }
    }
    console.log('    Arjun - Week 4 (Independence): pending_review (Gate 4 not started)');
    for (const id of ['w4_d2', 'w4_e1', 'w4_o1', 'w4_b1']) {
      await createSubmission(arjun.id, id, 'submitted', 'pending_review');
    }
    await sleep(500);
  }

  if (sneha) {
    // Sneha: Week 1 partial (w1_e1 needs_revision), Week 2 partial, no Week 3-4
    console.log('    Sneha - Week 1: partial');
    await createSubmission(sneha.id, 'w1_o1', 'draft', '');
    await createSubmission(sneha.id, 'w1_e1', 'submitted', 'needs_revision', {
      reviewed_at: new Date(Date.now() - 22 * 86400000).toISOString(),
      reviewer_name: 'Neha Kapoor',
      review_comment: 'Please expand your takeaways — list at least 3 specific V3 rules.',
      review_history: [{ action: 'needs_revision', reviewer_name: 'Neha Kapoor', comment: 'Expand takeaways.', timestamp: new Date(Date.now() - 22 * 86400000).toISOString() }],
    });
    console.log('    Sneha - Week 2: w2_e1 and w2_o1 pending_review');
    await createSubmission(sneha.id, 'w2_e1', 'submitted', 'pending_review');
    await createSubmission(sneha.id, 'w2_o1', 'submitted', 'pending_review');
    await sleep(500);
  }

  if (vikram) {
    // Vikram: Week 1 partial only
    console.log('    Vikram - Week 1: partial (w1_o1 pending, w1_e1 draft)');
    await createSubmission(vikram.id, 'w1_o1', 'submitted', 'pending_review');
    await createSubmission(vikram.id, 'w1_e1', 'draft', '');
    await sleep(500);
  }

  // Step 4: Create onboarding_lead worksheets for ravi (p1_w4, p1_w5, p2_w4)
  if (arjun) {
    console.log('  → Arjun Mehta - Onboarding lead worksheets');
    await createSubmission(arjun.id, 'p1_w4', 'submitted', 'pending_review');
    await createSubmission(arjun.id, 'p1_w5', 'submitted', 'pending_review');
    await createSubmission(arjun.id, 'p2_w4', 'submitted', 'pending_review');
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ✅ Seeding Complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('  📧 Test Credentials (password: Test123! for all):');
  console.log('  ┌──────────────────────────┬──────────────────────────┬──────────────────┐');
  console.log('  │ Name                     │ Email                    │ Role             │');
  console.log('  ├──────────────────────────┼──────────────────────────┼──────────────────┤');
  console.log('  │ Arjun Mehta              │ arjun.qa@newton.edu      │ New Joinee       │');
  console.log('  │ Sneha Patel              │ sneha.qa@newton.edu      │ New Joinee       │');
  console.log('  │ Vikram Singh             │ vikram.qa@newton.edu     │ New Joinee       │');
  console.log('  │ Neha Kapoor              │ neha.qa@newton.edu       │ Buddy / Mentor   │');
  console.log('  │ Dr. Priya Sharma         │ priya.qa@newton.edu      │ Manager (AH)     │');
  console.log('  │ Ravi Deshmukh            │ ravi.qa@newton.edu       │ Onboarding Lead  │');
  console.log('  └──────────────────────────┴──────────────────────────┴──────────────────┘\n');
  console.log('  📋 Test Data Summary:');
  console.log('  • Arjun: Phase 1+2 approved, Phase 3 pending_review');
  console.log('    FTP: Week 1-2 buddy_approved, Week 3 mixed, Week 4 pending');
  console.log('  • Sneha: Phase 1 approved, Phase 2 mixed, Phase 3 revision_submitted');
  console.log('    FTP: Week 1 partial (needs_revision), Week 2 partial');
  console.log('  • Vikram: Phase 1 partial, Phase 2+3 not started');
  console.log('    FTP: Week 1 partial (1 pending, 1 draft)');
  console.log('  • Neha (Buddy): Can review buddy worksheets for all 3 joinees');
  console.log('  • Priya (Manager): Can review everything');
  console.log('  • Ravi (Onboarding Lead): Can review p1_w4, p1_w5, p2_w4\n');
  console.log('  💡 FTP worksheets seeded via __seed_test_data.cjs');
  console.log('  💡 Or run db/seed_ftp_worksheets.sql in Supabase SQL Editor\n');
  console.log('  🌐 Login at: http://localhost:5173\n');
}

main().catch(err => {
  console.error('\n❌ Seeding failed:', err);
  process.exit(1);
});
