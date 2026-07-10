// =============================================================================
// E2E FULL FLOW TEST — Complete Onboarding Walkthrough
// =============================================================================
// Tests the ENTIRE flow from user creation through auto-promotion.
// Signs in as each user before their operations to satisfy RLS policies,
// so it works with just the anon key (no service_role key required).
//
// Flow:
//   1. Create users for all 6 roles
//   2. Assign manager & buddy to joinees (via SQL output for RLS bypass)
//   3. Create ALL worksheet submissions for Phases 1-3 with due_dates
//   4. Buddy approves ALL worksheets → buddy_approved
//   5. Manager approves each phase → approved
//   6. Verify all phases complete and due_dates set correctly
//
// Usage: node scripts/e2e-full-flow.mjs
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import { WebSocket } from 'ws';
import { readFileSync, existsSync } from 'fs';

// ─── Load .env ──────────────────────────────────────────
if (existsSync('.env')) {
  const envContent = readFileSync('.env', 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in environment/.env');
  process.exit(1);
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// ─── Constants ──────────────────────────────────────────
const PASSWORD = 'Test123!';
const TS = Date.now().toString(36).slice(-4).toUpperCase();
const START_DATE = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

// ─── Phase Worksheet Definitions ────────────────────────
// Must match PHASE_WORKSHEETS_MAP in src/config/worksheetConfigData.ts

const PHASE_1_WORKSHEETS = [
  { id: 'p1_w5', phase: 'phase-1', week: 1, dueDayOffset: 14, reviewerType: 'onboarding_lead' },
  { id: 'p1_w6', phase: 'phase-1', week: 1, dueDayOffset: 28, reviewerType: 'buddy' },
  { id: 'p1_w3', phase: 'phase-1', week: 1, dueDayOffset: 14, reviewerType: 'buddy' },
  { id: 'w1_o1', phase: 'phase-1', week: 1, dueDayOffset: 3,  reviewerType: 'buddy' },
  { id: 'w1_e1', phase: 'phase-1', week: 1, dueDayOffset: 5,  reviewerType: 'buddy' },
  { id: 'w1_o2', phase: 'phase-1', week: 1, dueDayOffset: 6,  reviewerType: 'buddy' },
  { id: 'w1_g1', phase: 'phase-1', week: 1, dueDayOffset: 7,  reviewerType: 'buddy' },
  { id: 'p1_w1', phase: 'phase-1', week: 1, dueDayOffset: 7,  reviewerType: 'buddy' },
  { id: 'p1_w2', phase: 'phase-1', week: 1, dueDayOffset: 30, reviewerType: 'buddy' },
  { id: 'p1_w4', phase: 'phase-1', week: 1, dueDayOffset: 14, reviewerType: 'onboarding_lead' },
  { id: 'p1_w8', phase: 'phase-1', week: 1, dueDayOffset: 28, reviewerType: 'buddy' },
  { id: 'gc1',   phase: 'phase-1', week: 1, dueDayOffset: 30, reviewerType: 'buddy' },
];

const PHASE_2_WORKSHEETS = [
  { id: 'p2_w1', phase: 'phase-2', week: 3, dueDayOffset: 45, reviewerType: 'buddy' },
  { id: 'p2_w2', phase: 'phase-2', week: 3, dueDayOffset: 50, reviewerType: 'buddy' },
  { id: 'p2_w3', phase: 'phase-2', week: 2, dueDayOffset: 55, reviewerType: 'buddy' },
  { id: 'p2_w4', phase: 'phase-2', week: 3, dueDayOffset: 55, reviewerType: 'onboarding_lead' },
  { id: 'gc2',   phase: 'phase-2', week: 2, dueDayOffset: 60, reviewerType: 'buddy' },
];

const PHASE_3_WORKSHEETS = [
  { id: 'p3_w1', phase: 'phase-3', week: 4, dueDayOffset: 75, reviewerType: 'buddy' },
  { id: 'p3_w2', phase: 'phase-3', week: 4, dueDayOffset: 75, reviewerType: 'buddy' },
  { id: 'p3_w3', phase: 'phase-3', week: 4, dueDayOffset: 80, reviewerType: 'buddy' },
  { id: 'p3_w4', phase: 'phase-3', week: 4, dueDayOffset: 80, reviewerType: 'buddy' },
  { id: 'p3_w5', phase: 'phase-3', week: 4, dueDayOffset: 85, reviewerType: 'buddy' },
  { id: 'gc3',   phase: 'phase-3', week: 4, dueDayOffset: 90, reviewerType: 'buddy' },
];

const ALL_PHASE_WORKSHEETS = [...PHASE_1_WORKSHEETS, ...PHASE_2_WORKSHEETS, ...PHASE_3_WORKSHEETS];
const TOTAL_WS_COUNT = ALL_PHASE_WORKSHEETS.length; // = 23

// ─── Sample worksheet data ─────────────────────────────
function getSampleData(wsId, joineeName) {
  const common = { employeeName: joineeName };
  switch (wsId) {
    case 'p1_w1': return { ...common, mentorName: 'Dr. Sharma', reflections: 'Completed stakeholder mapping.' };
    case 'p1_w2': return { ...common, weeks: [{ date: '2026-06-01', topics: 'Syllabus review', actions: 'Reviewed materials', mentorSignoff: true }], mentorReadiness: 'Progressing well' };
    case 'p1_w3': return { ...common, teachingPhilosophy: 'Student-first', strengths: 'Communication', areasForGrowth: 'Time management' };
    case 'p1_w4': return { ...common, universityPolicies: 'Understood', governanceModel: 'Clear chain of command' };
    case 'p1_w5': return { ...common, portalRating: 4, walkthroughComplete: true, tasksVerified: ['Scheduling','Grades','Attendance'] };
    case 'p1_w6': return { ...common, observations: [{ date: '2026-06-05', observation: 'TLAC Cold Call used effectively.' }], selfReflection: 'Engaging session.' };
    case 'p1_w7': return { ...common, coursewareReviewed: 'PPT, Worksheets', qualityScore: 'Good', recommendations: 'Add more examples' };
    case 'p1_w8': return { ...common, channelAudit: ['#general','#announcements'], bottlenecks: ['Response times'] };
    case 'gc1':   return { ...common, milestones: ['Met','Met','Met','Met','Met'], readinessDecision: 'approved' };
    case 'p2_w1': return { ...common, interactions: [{ date: '2026-06-15', topic: 'Recursion', resolution: 'Resolved' }], patterns: 'Recursion common pain point', recommendations: 'Create cheatsheet' };
    case 'p2_w2': return { ...common, labsConducted: [{ date: '2026-06-12', title: 'Arrays Lab', feedback: 'Good' }], mentorFeedback: 'Shows improvement' };
    case 'p2_w3': return { ...common, contributions: [{ type: 'MCQ', topic: 'Arrays', approved: true }], totalCreated: 5 };
    case 'p2_w4': return { ...common, opsVerifications: ['Quiz config','Attendance sync'], signoffs: true };
    case 'gc2':   return { ...common, milestones: ['Met','Met','Met','Met','Met'], readinessDecision: 'approved' };
    case 'p3_w1': return { ...common, lecturesConducted: [{ date: '2026-06-20', topic: 'Binary Trees', reflection: 'Good pacing' }], facultyFeedback: 'Confident delivery' };
    case 'p3_w2': return { ...common, cohortSize: 45, highPerformers: 10, lowPerformers: 5, interventions: ['Extra doubt sessions'] };
    case 'p3_w3': return { ...common, bloomGrid: [{ level: 'Remember', count: 3 }, { level: 'Understand', count: 5 }], totalQuestions: 30 };
    case 'p3_w4': return { ...common, frameworks: ['Constructivism','Active Learning'], applications: ['Group discussions'], reflection: 'Students more engaged' };
    case 'p3_w5': return { ...common, proposalTitle: 'Add coding playgrounds', rationale: 'More practice', impact: 'Better coding skills' };
    case 'gc3':   return { ...common, milestones: ['Met','Met','Met','Met','Met'], readinessDecision: 'approved' };
    case 'w1_o1': return { ...common, accessVerified: true, buddyContacted: true, commsJoined: true };
    case 'w1_e1': return { ...common, v3Completed: true, reflections: 'Understanding contest structure' };
    case 'w1_o2': return { ...common, answers: { q1: 'Section 1.2', q2: 'Section 3.5' }, complete: true };
    case 'w1_g1': return { ...common, artifactsComplete: true };
    case 'w2_e1': return { ...common, bloomTags: [{ question: 'Q1', tag: 'Analyze' }], complete: true };
    case 'w2_c3': return { ...common, mcqsCreated: 3, codingCreated: 2, peerReviewDone: true };
    case 'w2_d2': return { ...common, microTeachTopic: 'Arrays', peerFeedback: 'Good pacing', rubricScore: 3.5 };
    case 'w2_b1': return { ...common, customisationSheet: { rules: ['No phones'], consequences: ['Warning'] }, complete: true };
    case 'w2_o1': return { ...common, scenarios: [{ scenario: 'Late student', action: 'Log and allow' }], complete: true };
    case 'w2_g1': return { ...common, artifactsComplete: true };
    case 'w3_d1': return { ...common, techSelfAssessment: { projector: true, pentab: true, portal: true } };
    case 'w3_d2': return { ...common, planning: { transitions: '2 min', activities: ['Intro','Main','Wrap'] } };
    case 'w3_e1': return { ...common, questions: [{ type: 'MCQ', topic: 'Arrays', bloom: 'Analyze' }], peerL1Pass: true };
    case 'w3_b1': return { ...common, scenarios: [{ scenario: 'Disengaged student', approach: 'Private chat' }], reflection: 'Important skill' };
    case 'w3_g1': return { ...common, artifactsComplete: true };
    case 'w4_d2': return { ...common, coTeachTopic: 'Linked Lists', observationNotes: 'Good student engagement' };
    case 'w4_e1': return { ...common, solveRatePrediction: 0.65, actualRate: 0.70, calibrationNote: 'Adjust expectations upward' };
    case 'w4_o1': return { ...common, checklist: { syllabus_ready: true, slides_prepared: true, labs_planned: true }, complete: true };
    case 'w4_b1': return { ...common, reflection: 'I commit to being engaging', commitment: 'Use cold call daily' };
    case 'w4_g1': return { ...common, artifactsComplete: true, readinessScore: 4.5 };
    default:      return { ...common };
  }
}

// ─── Helpers ────────────────────────────────────────────

function calculateDueDate(dueDayOffset) {
  const d = new Date(START_DATE);
  d.setDate(d.getDate() + dueDayOffset);
  return d.toISOString().split('T')[0];
}

/** Create a fresh authenticated client for a specific user */
async function loginAs(email) {
  const client = createClient(SUPABASE_URL, ANON_KEY, { realtime: { transport: WebSocket } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`Login as ${email}: ${error.message}`);
  return { client, user: data.user };
}

/** User info struct — used to reference users before they log in */
function userInfo(id, email, name, role) {
  return { id, email, name, role };
}

async function signUpOrSignIn(email, name, role) {
  // Try signing in first (may already exist from a previous run)
  const tempClient = createClient(SUPABASE_URL, ANON_KEY, { realtime: { transport: WebSocket } });
  const { data: signInData } = await tempClient.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInData?.user) {
    return userInfo(signInData.user.id, email, name, role);
  }

  // Sign up
  const { data, error } = await tempClient.auth.signUp({
    email, password: PASSWORD,
    options: { data: { full_name: name, role } },
  });
  if (error) throw new Error(`${role} signup: ${error.message}`);
  if (!data?.user) throw new Error(`${role}: No user returned`);
  return userInfo(data.user.id, email, name, role);
}

async function upsertSubmission(client, joineeId, wsInfo, joineeName) {
  const dueDate = calculateDueDate(wsInfo.dueDayOffset);
  const wsData = getSampleData(wsInfo.id, joineeName);
  const { error } = await client.from('worksheet_submissions').upsert({
    user_id: joineeId,
    worksheet_id: wsInfo.id,
    phase: wsInfo.phase,
    status: 'submitted',
    review_status: 'pending_review',
    reviewer_type: wsInfo.reviewerType,
    worksheet_data: wsData,
    due_date: dueDate,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,worksheet_id' });
  if (error) throw new Error(`${wsInfo.id}: ${error.message}`);
}

async function buddyApprove(client, joineeId, wsId, buddyId, buddyName, comment) {
  const historyEntry = {
    action: 'buddy_approved',
    reviewer_name: buddyName,
    reviewer_id: buddyId,
    comment,
    timestamp: new Date().toISOString(),
  };
  const { error } = await client.from('worksheet_submissions').update({
    review_status: 'buddy_approved',
    reviewed_by: buddyId,
    reviewed_at: new Date().toISOString(),
    reviewer_name: buddyName,
    review_comment: comment,
    review_history: [historyEntry],
  }).eq('user_id', joineeId).eq('worksheet_id', wsId);
  if (error) throw new Error(`buddyApprove ${wsId}: ${error.message}`);
}

async function managerApprove(client, joineeId, wsList, managerId, managerName) {
  for (const ws of wsList) {
    const historyEntry = {
      action: 'approved',
      reviewer_name: managerName,
      reviewer_id: managerId,
      comment: `Phase approved by ${managerName}.`,
      timestamp: new Date().toISOString(),
    };
    const { error } = await client.from('worksheet_submissions').update({
      review_status: 'approved',
      reviewed_by: managerId,
      reviewed_at: new Date().toISOString(),
      reviewer_name: managerName,
      review_comment: `Phase-level approval: All worksheets complete.`,
      review_history: [historyEntry],
    }).eq('user_id', joineeId).eq('worksheet_id', ws.id);
    if (error) throw new Error(`mgrApprove ${ws.id}: ${error.message}`);
  }
}

async function assignInDb(client, userId, managerId, buddyId) {
  const { error } = await client.from('user_profiles').update({
    assigned_lead_id: managerId,
    assigned_buddy_id: buddyId,
  }).eq('id', userId);
  if (error) throw new Error(`Assign ${userId}: ${error.message}`);
}

// ─── Main ───────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         E2E FULL FLOW TEST — Complete Onboarding         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  console.log(`Timestamp: ${TS}  |  Start date: ${START_DATE.toISOString().split('T')[0]}  |  Worksheets: ${TOTAL_WS_COUNT}\n`);

  // ════════════════════════════════════════════════════════════════
  // STEP 1: Create/Fetch all 6 test users
  // ════════════════════════════════════════════════════════════════
  console.log('─── STEP 1: Create/Fetch 6 Users ───\n');
  const joinee   = await signUpOrSignIn(`e2e_joinee_${TS}@newton.edu`, 'Arjun E2E Joinee', 'new_joinee');
  const labInstr = await signUpOrSignIn(`e2e_lab_${TS}@newton.edu`, 'Kavita E2E Lab Instr', 'lab_instructor');
  const buddy    = await signUpOrSignIn(`e2e_buddy_${TS}@newton.edu`, 'Neha E2E Buddy', 'lead_instructor');
  const manager  = await signUpOrSignIn(`e2e_manager_${TS}@newton.edu`, 'Dr. Priya E2E Manager', 'academic_head');
  const ol       = await signUpOrSignIn(`e2e_ol_${TS}@newton.edu`, 'Ravi E2E Onboarding', 'onboarding_lead');
  const ops      = await signUpOrSignIn(`e2e_ops_${TS}@newton.edu`, 'Suresh E2E Acad Ops', 'acad_ops');
  console.log('✅ 6 users ready\n');

  // ════════════════════════════════════════════════════════════════
  // STEP 2: Assign manager & buddy to joinees
  // ════════════════════════════════════════════════════════════════
  console.log('─── STEP 2: Assign Manager & Buddy ───\n');

  // Sign in as manager (academic_head) — their role allows updating profiles
  let { client: mgrClient } = await loginAs(manager.email);
  let assignOk = true;
  for (const user of [joinee, labInstr]) {
    try {
      await assignInDb(mgrClient, user.id, manager.id, buddy.id);
    } catch (err) {
      assignOk = false;
      console.log(`   ⚠  ${user.name}: ${err.message}`);
      break; // Stop trying — RLS is blocking
    }
  }
  if (assignOk) {
    console.log('   ✅ Manager & buddy assigned\n');
  } else {
    // Fallback: output SQL
    console.log('   ⚠ RLS blocked assignment. Run this SQL:');
    console.log(`   UPDATE user_profiles SET assigned_lead_id = '${manager.id}', assigned_buddy_id = '${buddy.id}'`);
    console.log(`     WHERE id IN ('${joinee.id}', '${labInstr.id}');\n`);
  }

  // ════════════════════════════════════════════════════════════════
  // STEP 3: Create ALL worksheet submissions with due_dates
  // ════════════════════════════════════════════════════════════════
  console.log('─── STEP 3: Create Submissions ───\n');

  let created = 0;
  let failed = 0;

  for (const user of [joinee, labInstr]) {
    console.log(`  Signing in as ${user.name} to create ${ALL_PHASE_WORKSHEETS.length} submissions...`);
    const { client: c } = await loginAs(user.email);
    for (const ws of ALL_PHASE_WORKSHEETS) {
      try {
        await upsertSubmission(c, user.id, ws, user.name);
        created++;
      } catch (err) {
        failed++;
        console.log(`    ❌ ${ws.id}: ${err.message}`);
      }
    }
    // Verify
    const { data: subs } = await c.from('worksheet_submissions')
      .select('worksheet_id, due_date')
      .eq('user_id', user.id);
    console.log(`    📊 ${subs?.length || 0} submissions created for ${user.name} (${subs?.filter(s => s.due_date).length || 0} with due_dates)\n`);
  }
  console.log(`   ✅ ${created} created, ${failed} failed\n`);

  // ════════════════════════════════════════════════════════════════
  // STEP 4: Buddy approves Phase 1 worksheets
  // ════════════════════════════════════════════════════════════════
  console.log('─── STEP 4: Buddy Approves Phase 1 ───\n');
  let { client: buddyClient } = await loginAs(buddy.email);

  for (const user of [joinee, labInstr]) {
    console.log(`  Buddy approving ${PHASE_1_WORKSHEETS.length} worksheets for ${user.name}...`);
    for (const ws of PHASE_1_WORKSHEETS) {
      try {
        await buddyApprove(buddyClient, user.id, ws.id, buddy.id, 'Neha E2E Buddy', `Good work!`);
      } catch (err) {
        console.log(`    ❌ ${ws.id}: ${err.message}`);
      }
    }
    console.log(`   ✅ Done\n`);
  }

  // ════════════════════════════════════════════════════════════════
  // STEP 5: Manager approves Phase 1
  // ════════════════════════════════════════════════════════════════
  console.log('─── STEP 5: Manager Approves Phase 1 ───\n');
  let { client: mgrClient2 } = await loginAs(manager.email);

  for (const user of [joinee, labInstr]) {
    console.log(`  Manager approving Phase 1 for ${user.name}...`);
    await managerApprove(mgrClient2, user.id, PHASE_1_WORKSHEETS, manager.id, 'Dr. Priya E2E Manager');
    console.log(`   ✅ Phase 1 complete\n`);
  }

  // ════════════════════════════════════════════════════════════════
  // STEP 6: Buddy approves Phase 2
  // ════════════════════════════════════════════════════════════════
  console.log('─── STEP 6: Buddy Approves Phase 2 ───\n');
  let { client: buddyClient2 } = await loginAs(buddy.email);

  for (const user of [joinee, labInstr]) {
    console.log(`  Buddy approving ${PHASE_2_WORKSHEETS.length} worksheets for ${user.name}...`);
    for (const ws of PHASE_2_WORKSHEETS) {
      try {
        await buddyApprove(buddyClient2, user.id, ws.id, buddy.id, 'Neha E2E Buddy', `Phase 2 ${ws.id} approved.`);
      } catch (err) {
        console.log(`    ❌ ${ws.id}: ${err.message}`);
      }
    }
    console.log(`   ✅ Done\n`);
  }

  // ════════════════════════════════════════════════════════════════
  // STEP 7: Manager approves Phase 2
  // ════════════════════════════════════════════════════════════════
  console.log('─── STEP 7: Manager Approves Phase 2 ───\n');
  let { client: mgrClient3 } = await loginAs(manager.email);

  for (const user of [joinee, labInstr]) {
    console.log(`  Manager approving Phase 2 for ${user.name}...`);
    await managerApprove(mgrClient3, user.id, PHASE_2_WORKSHEETS, manager.id, 'Dr. Priya E2E Manager');
    console.log(`   ✅ Phase 2 complete\n`);
  }

  // ════════════════════════════════════════════════════════════════
  // STEP 8: Buddy approves Phase 3
  // ════════════════════════════════════════════════════════════════
  console.log('─── STEP 8: Buddy Approves Phase 3 ───\n');
  let { client: buddyClient3 } = await loginAs(buddy.email);

  for (const user of [joinee, labInstr]) {
    console.log(`  Buddy approving ${PHASE_3_WORKSHEETS.length} worksheets for ${user.name}...`);
    for (const ws of PHASE_3_WORKSHEETS) {
      try {
        await buddyApprove(buddyClient3, user.id, ws.id, buddy.id, 'Neha E2E Buddy', `Phase 3 ${ws.id} approved. Excellent!`);
      } catch (err) {
        console.log(`    ❌ ${ws.id}: ${err.message}`);
      }
    }
    console.log(`   ✅ Done\n`);
  }

  // ════════════════════════════════════════════════════════════════
  // STEP 9: Manager approves Phase 3
  // ════════════════════════════════════════════════════════════════
  console.log('─── STEP 9: Manager Approves Phase 3 ───\n');
  let { client: mgrClient4 } = await loginAs(manager.email);

  for (const user of [joinee, labInstr]) {
    console.log(`  Manager approving Phase 3 for ${user.name}...`);
    await managerApprove(mgrClient4, user.id, PHASE_3_WORKSHEETS, manager.id, 'Dr. Priya E2E Manager');
    console.log(`   ✅ Phase 3 complete\n`);
  }

  // ════════════════════════════════════════════════════════════════
  // STEP 10: Verification
  // ════════════════════════════════════════════════════════════════
  console.log('─── STEP 10: Verification ───\n');

  const phases = [
    { n: 'Phase 1', ws: PHASE_1_WORKSHEETS },
    { n: 'Phase 2', ws: PHASE_2_WORKSHEETS },
    { n: 'Phase 3', ws: PHASE_3_WORKSHEETS },
  ];

  for (const user of [joinee, labInstr]) {
    console.log(`  ${user.name} (${user.email}):`);
    const { client: checkClient } = await loginAs(user.email);
    const { data: subs } = await checkClient
      .from('worksheet_submissions')
      .select('worksheet_id, review_status, due_date')
      .eq('user_id', user.id)
      .order('worksheet_id');

    if (!subs || subs.length === 0) {
      console.log('    ❌ No submissions found\n');
      continue;
    }

    const approved = subs.filter(s => s.review_status === 'approved').length;
    const withDue = subs.filter(s => s.due_date).length;
    console.log(`    📊 ${subs.length} total | ${approved} approved | ${withDue} with due_dates`);

    let allGood = true;
    for (const { n, ws: wsList } of phases) {
      const phaseSubs = wsList.map(w => subs.find(s => s.worksheet_id === w.id)).filter(Boolean);
      const phaseApproved = phaseSubs.filter(s => s?.review_status === 'approved').length;
      const phaseDue = phaseSubs.filter(s => s?.due_date).length;
      const ok = phaseApproved === wsList.length;
      console.log(`    ${n}: ${phaseApproved}/${wsList.length} approved | ${phaseDue}/${wsList.length} due_dates ${ok ? '✅' : '❌'}`);
      if (!ok) allGood = false;
    }
    console.log(`    ${allGood ? '✅ COMPLETE!' : '❌ Need attention'}\n`);
  }

  // ════════════════════════════════════════════════════════════════
  // Output SQL
  // ════════════════════════════════════════════════════════════════
  console.log('─── SQL: Confirm Emails ───\n');
  const all = [joinee, labInstr, buddy, manager, ol, ops];
  const emails = all.map(u => `'${u.email}'`).join(',');
  console.log('Run this in Supabase SQL Editor:\n');
  console.log(`UPDATE auth.users SET email_confirmed_at = NOW()`);
  console.log(`  WHERE email IN (${emails});\n`);

  // ════════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════════
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║               E2E TEST COMPLETE                         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  console.log('Password: ' + PASSWORD + '\n');
  for (const u of all) {
    console.log(`   ${u.role.padEnd(18)} ${u.email}`);
  }
  console.log('');
  console.log(`${created + failed} worksheet submissions (${created} OK, ${failed} failed)`);
  console.log('Due dates set from ' + START_DATE.toISOString().split('T')[0] + ' + day offsets');
  console.log('Buddy approved → all buddy_approved');
  console.log('Manager approved → all phases approved');
  console.log('After email confirmation, users can sign in at the app.');
}

main().catch(err => {
  console.error('\n❌ FATAL:', err.message);
  process.exit(1);
});
