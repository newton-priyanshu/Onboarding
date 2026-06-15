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
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://fuoqoryqndtdooujslee.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_1JTwEK8CgHC6PLtOOnYeSw_xaHwa-i9';

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
};

// ── Helpers ────────────────────────────────────────────────────────────────
const ALL_WORKSHEET_IDS = Object.keys(WORKSHEET_DEFAULTS);
const PHASES = {
  p1: { ids: ['p1_w1','p1_w2','p1_w3','p1_w4','p1_w5','p1_w6','p1_w7','p1_w8','gc1'], phase: 'phase-1' },
  p2: { ids: ['p2_w1','p2_w2','p2_w3','p2_w4','gc2'], phase: 'phase-2' },
  p3: { ids: ['p3_w1','p3_w2','p3_w3','p3_w4','p3_w5','gc3'], phase: 'phase-3' },
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
    // Arjun: mix of approved, pending, and needs_revision
    console.log('  → Arjun Mehta - Phase 1 worksheets');
    for (const id of PHASES.p1.ids) {
      await createSubmission(arjun.id, id, 'submitted', 'approved', {
        reviewed_at: new Date().toISOString(),
        reviewer_name: 'Neha Kapoor',
        review_comment: 'Great work!',
        review_history: [{ action: 'approved', reviewer_name: 'Neha Kapoor', comment: 'Great work!', timestamp: new Date().toISOString() }],
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
  console.log('  • Sneha: Phase 1 approved, Phase 2 mixed, Phase 3 revision_submitted');
  console.log('  • Vikram: Phase 1 partial, Phase 2+3 not started');
  console.log('  • Neha (Buddy): Can review buddy worksheets for all 3 joinees');
  console.log('  • Priya (Manager): Can review everything');
  console.log('  • Ravi (Onboarding Lead): Can review p1_w4, p1_w5, p2_w4\n');
  console.log('  🌐 Login at: http://localhost:5173\n');
}

main().catch(err => {
  console.error('\n❌ Seeding failed:', err);
  process.exit(1);
});
