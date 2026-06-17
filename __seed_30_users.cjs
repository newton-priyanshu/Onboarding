// =============================================================================
// Newton Onboarding Portal — 32-User Complete Test Data Seeder (v2)
// =============================================================================
// Creates users in batches to handle Supabase free-tier rate limits.
// After batch is done, run:
//   node __seed_30_users.cjs --users        (creates users in batches)
//   node __seed_30_users.cjs --assign       (assigns buddies/managers)
//   node __seed_30_users.cjs --worksheets   (fills worksheet data)
//
// Or run all at once (may take a while due to rate limits):
//   node __seed_30_users.cjs
// =============================================================================

const { createClient } = require('@supabase/supabase-js');
const { WebSocket } = require('ws');

const PASSWORD = 'Test123!';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://fuoqoryqndtdooujslee.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_1JTwEK8CgHC6PLtOOnYeSw_xaHwa-i9';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { transport: WebSocket },
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Worksheet Data ──
function getWorksheetData(wsId, name, buddyName, managerName) {
  const data = {
    p1_w1: {
      employeeName: name, department: 'Computer Science',
      stakeholders: Array(4).fill(null).map((_, i) => ({
        name: ['Dr. Sharma','Prof. Verma','Ms. Kapoor','Dr. Gupta'][i],
        role: ['Manager','Senior Instructor','Admin','Faculty Lead'][i],
        team: ['Faculty','Physics','Operations','Mathematics'][i],
        responsibility: ['Mentorship','Lab coordination','Scheduling','Curriculum design'][i],
      })),
      conversations: [
        { instructorName: 'Prof. Mehta', date: '2026-06-01', takeaways: 'Understood onboarding process' },
        { instructorName: 'Dr. Sharma', date: '2026-06-03', takeaways: 'Discussed teaching methodology' },
      ],
      buddyName, buddyAssignmentDate: '2026-06-01', buddyChannel: 'Slack',
      buddySyncDay: 'Monday 11 AM',
      reflectionLearningFrom: 'Structured approach to lesson planning is inspiring.',
    },
    p1_w2: {
      employeeName: name, mentorName: buddyName,
      weeks: Array(4).fill(null).map((_, i) => ({
        date: `2026-06-${String(1 + i*7).padStart(2,'0')}`,
        topics: ['Onboarding','Curriculum review','Classroom observation','Student engagement'][i],
        actions: ['Met team','Reviewed materials','Shadowed instructor','Planned session'][i],
        mentorSignoff: true,
      })),
      mentorStrengths: 'Quick learner, good communication',
      mentorAreasForGrowth: 'Time management',
      mentorReadiness: 'Ready for more responsibility',
    },
    p1_w3: {
      employeeName: name,
      culturePhilosophy: 'Student-centered learning through hands-on practice and discovery.',
      cultureIndustryDiff: 'Industry is task-oriented; classroom explains from first principles.',
      culturePsychSafety: 'Students feel safe asking questions without judgment.',
      partnerStructure: 'Partners with universities for industry-aligned CS education.',
      semesterStructure: '16 teaching weeks per semester with mid-sem and end-sem exams.',
      studentExpectations: 'Clear explanations, timely feedback, approachable instructors.',
      behaviour1: 'Start each class with a recap',
      behaviour2: 'Use think-pair-share every 15 min',
      behaviour3: 'End with 2-min reflection prompt',
      employeeSignature: name,
    },
    p1_w4: {
      employeeName: name,
      semesters: [
        { semester: 'Sem 1', startDate: '2026-06-01', endDate: '2026-09-30', keyEvents: 'Mid-sem Aug' },
        { semester: 'Sem 2', startDate: '2027-01-01', endDate: '2027-04-30', keyEvents: 'Mid-sem Mar' },
        { semester: 'Summer', startDate: '2027-05-01', endDate: '2027-05-31', keyEvents: 'Workshops' },
      ],
      cohorts: [
        { name: 'CS Batch A', students: '60', semesterYear: 'Y1S1', notes: 'Mixed ability' },
        { name: 'CS Batch B', students: '55', semesterYear: 'Y1S1', notes: 'Good analytical skills' },
        { name: 'CS Batch C', students: '58', semesterYear: 'Y1S2', notes: 'Needs practice' },
      ],
      liaisonContact: 'coordinator@partner.edu',
      escalationPath: 'Instructor → Faculty Lead → Academic Head → Dean',
      gradeProcess: 'Grades via portal within 7 days.',
      latePolicy: '48hr late, 10% penalty/day.',
      employeeSignature: name,
    },
    p1_w5: {
      employeeName: name,
      portalModules: ['Attendance','Grades','Assignments','Quizzes'],
      walkthroughComplete: true, adminAccess: true, quizConfigured: true,
      walkthroughDate: '2026-06-05', adminConfirmed: true,
      quizSteps: ['Created quiz','Added questions','Set time','Published'],
    },
    p1_w6: {
      employeeName: name, mentorName: buddyName,
      observations: [
        { date: '2026-06-05', instructor: 'Dr. Sharma', class: 'CS 101', strengths: 'Clear explanations', improvements: 'More interaction' },
        { date: '2026-06-10', instructor: 'Prof. Verma', class: 'DS Lab', strengths: 'Excellent facilitation', improvements: 'Time mgmt' },
      ],
    },
    p1_w7: {
      employeeName: name, courseReviewed: 'CS 101',
      questionBankStatus: 'Adequate', contentGaps: 'Modern paradigms not in depth',
      recommendations: 'Add Python exercises, update examples',
    },
    p1_w8: {
      employeeName: name,
      channelsAudited: ['#general','#cs101','#faculty','#doubt-sessions'],
      bottlenecksIdentified: ['Evening query response time','Duplicate questions'],
      resolution: 'Created FAQ channel, set office hours',
      auditCompleted: true,
    },
    gc1: {
      employeeName: name, employeeSignature: name,
      portalRating: 4, courseRating: 4, studentRating: 3, commRating: 4, readinessRating: 4,
      milestones: ['Met','Met','Partial','Met','Met'],
      managerStrengths: 'Good progress', managerRisks: 'None', readinessDecision: 'approved',
      managerSignature: managerName, instructorSignature: name,
    },
    p2_w1: {
      employeeName: name,
      entries: Array(5).fill(null).map((_, i) => ({
        date: `2026-07-${String(1 + i*2).padStart(2,'0')}`,
        channel: ['Portal','Lab','Slack','Portal','Lab'][i],
        query: ['Recursion?','Linked list issue','ArrayList vs LinkedList?','Null pointer?','BST deletion?'][i],
        resolution: 'Explained with examples and diagrams',
      })),
      errors: [
        { misconception: 'Pass-by-value vs reference', topic: 'Functions', rootCause: 'Memory model unclear', fix: 'Visual diagrams' },
        { misconception: '1-indexed arrays', topic: 'Arrays', rootCause: 'Math background', fix: 'Exercises' },
        { misconception: '= vs ==', topic: 'Conditionals', rootCause: 'Rushing', fix: 'Linting' },
      ],
      keyInsight: 'Students struggle with abstract concept visualization.',
      employeeSignature: name,
    },
    p2_w2: {
      employeeName: name,
      sessions: [
        { date: '2026-07-05', subject: 'Linked Lists', observer: buddyName, notes: 'Good facilitation' },
        { date: '2026-07-12', subject: 'Stacks & Queues', observer: buddyName, notes: 'Improved pacing' },
      ],
      dimScores: [[4,5],[3,4],[4,5],[3,4],[4,4]],
      strongestMoment: 'Student solved bug after a hint',
      biggestChallenge: 'Managing 30 varying-pace students',
      employeeSignature: name,
    },
    p2_w3: {
      employeeName: name,
      entries: Array(6).fill(null).map((_, i) => ({
        type: ['Worksheet','MCQ Set','Coding Lab','Worksheet','Assessment','Solution Key'][i],
        title: ['Linked List Practice','Stack Quiz','Binary Tree Lab','Sorting WS','Mid-term Test','Lab 3 Solution'][i],
        date: `2026-07-${6+i*3}`, submitted: true, reviewer: buddyName, approved: true,
      })),
      qualityChecks: Array(6).fill(true),
      reflection: 'Creating content deepened my understanding.',
      employeeSignature: name,
    },
    p2_w4: {
      employeeName: name,
      quizConfigured: true, portalSettingsVerified: true, backupProceduresReviewed: true,
      quizTopics: ['Arrays','Linked Lists','Recursion'],
      portalChecks: ['Attendance working','Grade entry functional'],
      backupNotes: 'Weekly backup verified.',
    },
    gc2: {
      employeeName: name, employeeSignature: name,
      studentSupport: 4, labFacilitation: 4, contentCreation: 4, portalProficiency: 5, communication: 4,
      milestones: ['Met','Met','Met','Partial','Met'],
      managerComments: 'Strong Phase 2 progress.',
      decision: 'approved', managerSignature: managerName, instructorSignature: name,
    },
    p3_w1: {
      employeeName: name,
      lectures: Array(3).fill(null).map((_, i) => ({
        date: `2026-08-${String(1 + i*7).padStart(2,'0')}`,
        subject: ['Binary Trees','Graph Algorithms','Dynamic Programming'][i],
        duration: ['90','90','120'][i], observer: buddyName,
      })),
      postMortemFlow: 'Good progression.', postMortemParticipation: '70% participation.',
      postMortemQuestions: 'Handled confidently.', postMortemTime: '90% covered.',
      feedbackSummary: 'Clear delivery.',
      improvementTarget: 'Better time management',
      employeeSignature: name,
    },
    p3_w2: {
      employeeName: name,
      cohortSize: '120 across 2 sections.',
      performanceRange: 'Top above 80%.',
      learningNeeds: 'Abstract concepts challenging.',
      teachingAdaptations: 'More demos, practice sheets.',
      relationshipApproach: 'Weekly check-ins.',
    },
    p3_w3: {
      employeeName: name,
      assessmentTopic: 'Data Structures Mid-term',
      bloomLevels: { remember: 15, understand: 25, apply: 30, analyze: 20, evaluate: 10 },
      totalMarks: 100,
      questionTypes: ['MCQ','Short Answer','Coding','Design'],
      difficultyBreakdown: { easy: 25, medium: 50, hard: 25 },
    },
    p3_w4: {
      employeeName: name,
      frameworksApplied: 'Constructivism, Active Learning',
      activeLearningExample: 'Think-pair-share for algorithms',
      theoryPracticeGap: 'Need more hands-on time.',
      iterationNotes: 'Added interactivity after feedback.',
    },
    p3_w5: {
      employeeName: name, courseName: 'Advanced Data Structures',
      proposalSummary: 'Add advanced tree structures.',
      expectedImpact: 'Bridge academic and industry.',
      resourcesNeeded: 'Lab time, materials.',
      estimatedTimeline: '4 weeks dev, 2 weeks review.',
    },
    gc3: {
      employeeName: name, employeeSignature: name,
      selfProud: 'Transitioned to independent instructor.',
      selfUncomfortable: 'Large mixed-ability classes.',
      selfSkills: 'Assessment design, adaptation.',
      selfPhilosophy: 'Teaching builds confidence.',
      teachingRating: 4, commRating: 4, contentRating: 4, studentRating: 4,
      assessmentRating: 4, ownershipRating: 5, professionalismRating: 5,
      milestones: Array(6).fill('Met'),
      decision: 'fully_independent',
      finalComments: 'Excellent transition. Ready for full teaching.',
      facultyLeadSignature: managerName, instructorSignature: name,
    },
  };
  return data[wsId] || { employeeName: name };
}

// ── 32 Users ──
const USERS = [
  // 15 new_joinees
  { name: 'Arjun Mehta',       email: 'arjun.qa@newton.edu',     role: 'new_joinee' },
  { name: 'Sneha Patel',       email: 'sneha.qa@newton.edu',     role: 'new_joinee' },
  { name: 'Vikram Singh',      email: 'vikram.qa@newton.edu',    role: 'new_joinee' },
  { name: 'Ananya Gupta',      email: 'ananya.qa@newton.edu',    role: 'new_joinee' },
  { name: 'Rohit Sharma',      email: 'rohit.qa@newton.edu',     role: 'new_joinee' },
  { name: 'Priya Patel',       email: 'priya.p.qa@newton.edu',   role: 'new_joinee' },
  { name: 'Aditya Kumar',      email: 'aditya.qa@newton.edu',    role: 'new_joinee' },
  { name: 'Kavita Reddy',      email: 'kavita.qa@newton.edu',    role: 'new_joinee' },
  { name: 'Rahul Jain',        email: 'rahul.qa@newton.edu',     role: 'new_joinee' },
  { name: 'Meera Nair',        email: 'meera.qa@newton.edu',     role: 'new_joinee' },
  { name: 'Amit Verma',        email: 'amit.v.qa@newton.edu',    role: 'new_joinee' },
  { name: 'Deepa Iyer',        email: 'deepa.qa@newton.edu',     role: 'new_joinee' },
  { name: 'Suresh Kumar',      email: 'suresh.qa@newton.edu',    role: 'new_joinee' },
  { name: 'Neha Sharma',       email: 'neha.s.qa@newton.edu',    role: 'new_joinee' },
  { name: 'Vijay Patel',       email: 'vijay.qa@newton.edu',     role: 'new_joinee' },
  // 3 lab_instructors
  { name: 'Mohan Das',         email: 'mohan.qa@newton.edu',     role: 'lab_instructor' },
  { name: 'Lakshmi Krishnan',  email: 'lakshmi.qa@newton.edu',   role: 'lab_instructor' },
  { name: 'Rajesh Nair',       email: 'rajesh.qa@newton.edu',    role: 'lab_instructor' },
  // 5 lead_instructors (buddies)
  { name: 'Neha Kapoor',       email: 'neha.qa@newton.edu',      role: 'lead_instructor' },
  { name: 'Rajesh Kumar',      email: 'rajesh.k.qa@newton.edu',  role: 'lead_instructor' },
  { name: 'Pooja Sharma',      email: 'pooja.qa@newton.edu',     role: 'lead_instructor' },
  { name: 'Amit Singh',        email: 'amit.s.qa@newton.edu',    role: 'lead_instructor' },
  { name: 'Sunita Verma',      email: 'sunita.qa@newton.edu',    role: 'lead_instructor' },
  // 4 academic_heads (managers)
  { name: 'Dr. Priya Sharma',  email: 'priya.qa@newton.edu',     role: 'academic_head' },
  { name: 'Prof. Sanjay Joshi',email: 'sanjay.qa@newton.edu',    role: 'academic_head' },
  { name: 'Dr. Anita Gupta',   email: 'anita.qa@newton.edu',     role: 'academic_head' },
  { name: 'Prof. Vikram Rao',  email: 'vikram.r.qa@newton.edu',  role: 'academic_head' },
  // 3 onboarding_leads
  { name: 'Ravi Deshmukh',     email: 'ravi.qa@newton.edu',      role: 'onboarding_lead' },
  { name: 'Meera Iyer',        email: 'meera.i.qa@newton.edu',   role: 'onboarding_lead' },
  { name: 'Karan Mehta',       email: 'karan.qa@newton.edu',     role: 'onboarding_lead' },
  // 2 acad_ops
  { name: 'Suresh Iyer',       email: 'suresh.i.qa@newton.edu',  role: 'acad_ops' },
  { name: 'Lakshmi Nair',      email: 'lakshmi.n.qa@newton.edu', role: 'acad_ops' },
];

const createdUsers = {};

async function createUser({ name, email, role }) {
  process.stdout.write(`  → ${role.padEnd(18)} ${name.padEnd(22)} ${email.padEnd(32)} `);
  const { data, error } = await supabase.auth.signUp({
    email, password: PASSWORD,
    options: { data: { full_name: name, role } },
  });
  if (error) {
    if (error.message?.includes('already registered')) {
      console.log('⚠ exists');
      const { data: existing } = await supabase.from('user_profiles').select('*').eq('email', email).single();
      if (existing) createdUsers[email] = existing;
      return existing;
    }
    console.log(`❌ ${error.message}`);
    return null;
  }
  if (!data?.user) {
    console.log('❌ no user returned');
    return null;
  }
  await sleep(2000);
  let { data: profile } = await supabase.from('user_profiles').select('*').eq('id', data.user.id).single();
  if (!profile) {
    // DB trigger may not exist — insert profile directly
    const { data: inserted, error: insErr } = await supabase.from('user_profiles').insert({
      id: data.user.id,
      email: email,
      full_name: name,
      role: role,
    }).select().single();
    if (insErr) {
      console.log('⏳ profile insert error: ' + insErr.message);
    } else if (inserted) {
      profile = inserted;
    }
  }
  if (profile) {
    createdUsers[email] = profile;
    console.log('✅');
  } else {
    console.log('⏳ profile pending');
  }
  return profile;
}

async function clearData() {
  console.log('\n--- Clearing existing data ---\n');
  const { data: subs } = await supabase.from('worksheet_submissions').select('id').limit(1000);
  if (subs?.length) {
    await supabase.from('worksheet_submissions').delete().in('id', subs.map(s => s.id));
    console.log(`  Cleared ${subs.length} submissions`);
  }
  try { await supabase.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000'); } catch(e) {}
  console.log('  Cleared notifications\n');
}

async function main() {
  const mode = process.argv[2] || 'all';

  if (mode === 'users' || mode === 'all') {
    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║   Step 1: Creating 32 Test Users            ║');
    console.log('╚═══════════════════════════════════════════════╝\n');

    await clearData();

    for (let i = 0; i < USERS.length; i++) {
      const u = USERS[i];
      try { await createUser(u); } catch (err) { console.error(`  FAILED: ${err.message}`); }
      await sleep(i < 11 ? 3000 : 1500);
    }
    // Wait for any pending profile triggers
    console.log('\n  Waiting for profile sync...');
    await sleep(5000);
    // Retry any missing profiles
    for (const u of USERS) {
      if (!createdUsers[u.email]) {
        const { data } = await supabase.from('user_profiles').select('*').eq('email', u.email).single();
        if (data) createdUsers[u.email] = data;
      }
    }
    console.log(`  Users created: ${Object.keys(createdUsers).length}\n`);
  }

  if (mode === 'assign' || mode === 'all') {
    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║   Step 2: Assigning Buddies & Managers      ║');
    console.log('╚═══════════════════════════════════════════════╝\n');

    // Ensure profiles are loaded
    for (const u of USERS) {
      if (!createdUsers[u.email]) {
        const { data } = await supabase.from('user_profiles').select('*').eq('email', u.email).single();
        if (data) createdUsers[u.email] = data;
      }
    }

    const BU = { neha: 'neha.qa@newton.edu', rajeshk: 'rajesh.k.qa@newton.edu',
      pooja: 'pooja.qa@newton.edu', amits: 'amit.s.qa@newton.edu', sunita: 'sunita.qa@newton.edu' };
    const MG = { priya: 'priya.qa@newton.edu', sanjay: 'sanjay.qa@newton.edu',
      anita: 'anita.qa@newton.edu', vikramr: 'vikram.r.qa@newton.edu' };
    const JOINEES = USERS.filter(u => u.role === 'new_joinee' || u.role === 'lab_instructor');
    const buddyEmails = Object.values(BU);
    const managerEmails = Object.values(MG);

    for (let i = 0; i < JOINEES.length; i++) {
      const joinee = createdUsers[JOINEES[i].email];
      const buddy = createdUsers[buddyEmails[i % buddyEmails.length]];
      const manager = createdUsers[managerEmails[i % managerEmails.length]];
      if (!joinee) { console.log(`  Skipping ${JOINEES[i].name} (not in DB)`); continue; }
      if (buddy) {
        await supabase.from('user_profiles').update({ assigned_buddy_id: buddy.id }).eq('id', joinee.id);
      }
      if (manager) {
        await supabase.from('user_profiles').update({ assigned_lead_id: manager.id }).eq('id', joinee.id);
      }
    }
    console.log('  Assignments done\n');
  }

  if (mode === 'worksheets' || mode === 'all') {
    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║   Step 3: Creating Worksheet Submissions     ║');
    console.log('╚═══════════════════════════════════════════════╝\n');

    // Ensure profiles
    for (const u of USERS) {
      if (!createdUsers[u.email]) {
        const { data } = await supabase.from('user_profiles').select('*').eq('email', u.email).single();
        if (data) createdUsers[u.email] = data;
      }
    }

    const JOINEES = USERS.filter(u => u.role === 'new_joinee' || u.role === 'lab_instructor');
    const buddyEmails = USERS.filter(u => u.role === 'lead_instructor').map(u => u.email);
    const managerEmails = USERS.filter(u => u.role === 'academic_head').map(u => u.email);

    for (let si = 0; si < JOINEES.length; si++) {
      const u = JOINEES[si];
      const user = createdUsers[u.email];
      if (!user) { console.log(`  Skipping ${u.name} (no profile)`); continue; }
      const name = user.full_name || u.name;
      const buddyEmail = buddyEmails[si % buddyEmails.length];
      const buddyName = createdUsers[buddyEmail]?.full_name || 'Buddy';
      const managerEmail = managerEmails[si % managerEmails.length];
      const managerName = createdUsers[managerEmail]?.full_name || 'Manager';

      // Determine progression level
      // si 0-2: Full Phase 3 completion
      // si 3-5: Full Phase 2 + Phase 1 buddy_approved
      // si 6-8: Phase 1 buddy_approved, Phase 2 started
      // si 9-11: Phase 1 submitted
      // si 12-14: Phase 1 partial
      // si 15-17: Phase 1 submitted (lab instructors)
      let isPhase3 = si < 3;
      let isPhase2 = si >= 3 && si < 6;
      let isPhase1Buddy = si >= 6 && si < 9;
      let isPhase1Done = si >= 9 && si < 12;
      let isPartial = si >= 12 && si < 15;
      let isLabInstr = si >= 15;

      const now = new Date();

      // Phase 1 worksheets
      for (const wsId of PHASES[1].ids) {
        const wsData = getWorksheetData(wsId, name, buddyName, managerName);
        if (isPhase3 || isPhase2 || isPhase1Buddy) {
          const hist = [
            { action: 'buddy_approved', reviewer_name: buddyName, comment: 'Buddy approved.', timestamp: new Date(now - 86400000).toISOString() },
          ];
          if (isPhase3) {
            hist.push({ action: 'approved', reviewer_name: managerName, comment: 'Phase approved.', timestamp: now.toISOString() });
            await supabase.from('worksheet_submissions').upsert({
              user_id: user.id, worksheet_id: wsId, phase: 'phase-1',
              status: 'submitted', review_status: 'approved',
              worksheet_data: wsData,
              reviewed_by: createdUsers[managerEmail]?.id, reviewed_at: now.toISOString(),
              reviewer_name: managerName, review_comment: 'Phase 1 approved.', review_history: hist,
            }, { onConflict: 'user_id,worksheet_id' });
          } else if (isPhase2) {
            await supabase.from('worksheet_submissions').upsert({
              user_id: user.id, worksheet_id: wsId, phase: 'phase-1',
              status: 'submitted', review_status: 'buddy_approved',
              worksheet_data: wsData,
              reviewed_by: createdUsers[buddyEmail]?.id, reviewed_at: now.toISOString(),
              reviewer_name: buddyName, review_comment: 'Buddy approved.', review_history: hist,
            }, { onConflict: 'user_id,worksheet_id' });
          } else {
            // Phase 1 buddy approved - some sheets have special states
            if (wsId === 'p1_w3') {
              // needs_revision example
              await supabase.from('worksheet_submissions').upsert({
                user_id: user.id, worksheet_id: wsId, phase: 'phase-1',
                status: 'submitted', review_status: 'needs_revision',
                worksheet_data: wsData,
                reviewed_by: createdUsers[buddyEmail]?.id, reviewed_at: new Date(now - 172800000).toISOString(),
                reviewer_name: buddyName, review_comment: 'Please expand with specific examples.',
                review_history: [{ action: 'needs_revision', reviewer_name: buddyName, comment: 'Need more detail.', timestamp: new Date(now - 172800000).toISOString() }],
              }, { onConflict: 'user_id,worksheet_id' });
            } else {
              await supabase.from('worksheet_submissions').upsert({
                user_id: user.id, worksheet_id: wsId, phase: 'phase-1',
                status: 'submitted', review_status: 'buddy_approved',
                worksheet_data: wsData,
                reviewed_by: createdUsers[buddyEmail]?.id, reviewed_at: now.toISOString(),
                reviewer_name: buddyName, review_comment: 'Buddy approved.', review_history: hist,
              }, { onConflict: 'user_id,worksheet_id' });
            }
          }
        } else if (isPhase1Done) {
          await supabase.from('worksheet_submissions').upsert({
            user_id: user.id, worksheet_id: wsId, phase: 'phase-1',
            status: 'submitted', review_status: 'pending_review',
            worksheet_data: wsData,
          }, { onConflict: 'user_id,worksheet_id' });
        } else if (isPartial) {
          const submittedWs = ['p1_w1','p1_w2','p1_w3','p1_w6'];
          const status = submittedWs.includes(wsId) ? 'submitted' : 'In Progress';
          const rStatus = submittedWs.includes(wsId) ? 'pending_review' : '';
          await supabase.from('worksheet_submissions').upsert({
            user_id: user.id, worksheet_id: wsId, phase: 'phase-1',
            status, review_status: rStatus, worksheet_data: wsData,
          }, { onConflict: 'user_id,worksheet_id' });
        } else {
          await supabase.from('worksheet_submissions').upsert({
            user_id: user.id, worksheet_id: wsId, phase: 'phase-1',
            status: 'submitted', review_status: 'pending_review',
            worksheet_data: wsData,
          }, { onConflict: 'user_id,worksheet_id' });
        }
      }

      // Phase 2 (Phase 3 users get Phase 2 approved; Phase 2 users get Phase 2 buddy_approved)
      if (isPhase3 || isPhase2 || isPhase1Buddy) {
        for (const wsId of PHASES[2].ids) {
          const wsData = getWorksheetData(wsId, name, buddyName, managerName);
          if (isPhase3) {
            const hist = [
              { action: 'buddy_approved', reviewer_name: buddyName, comment: 'Buddy approved.', timestamp: new Date(now - 86400000).toISOString() },
              { action: 'approved', reviewer_name: managerName, comment: 'Phase approved.', timestamp: now.toISOString() },
            ];
            await supabase.from('worksheet_submissions').upsert({
              user_id: user.id, worksheet_id: wsId, phase: 'phase-2',
              status: 'submitted', review_status: 'approved',
              worksheet_data: wsData,
              reviewed_by: createdUsers[managerEmail]?.id, reviewed_at: now.toISOString(),
              reviewer_name: managerName, review_comment: 'Phase 2 approved.', review_history: hist,
            }, { onConflict: 'user_id,worksheet_id' });
          } else if (isPhase2) {
            await supabase.from('worksheet_submissions').upsert({
              user_id: user.id, worksheet_id: wsId, phase: 'phase-2',
              status: 'submitted', review_status: 'buddy_approved',
              worksheet_data: wsData,
              reviewed_by: createdUsers[buddyEmail]?.id, reviewed_at: now.toISOString(),
              reviewer_name: buddyName, review_comment: 'Buddy approved.', review_history: [
                { action: 'buddy_approved', reviewer_name: buddyName, comment: 'Buddy approved.', timestamp: now.toISOString() },
              ],
            }, { onConflict: 'user_id,worksheet_id' });
          } else {
            await supabase.from('worksheet_submissions').upsert({
              user_id: user.id, worksheet_id: wsId, phase: 'phase-2',
              status: 'submitted', review_status: 'pending_review',
              worksheet_data: wsData,
            }, { onConflict: 'user_id,worksheet_id' });
          }
        }
      }

      // Phase 3 (only first 3)
      if (isPhase3) {
        for (const wsId of PHASES[3].ids) {
          const wsData = getWorksheetData(wsId, name, buddyName, managerName);
          const hist = [
            { action: 'buddy_approved', reviewer_name: buddyName, comment: 'Buddy approved.', timestamp: new Date(now - 86400000).toISOString() },
            { action: 'approved', reviewer_name: managerName, comment: 'Phase approved.', timestamp: now.toISOString() },
          ];
          await supabase.from('worksheet_submissions').upsert({
            user_id: user.id, worksheet_id: wsId, phase: 'phase-3',
            status: 'submitted', review_status: 'approved',
            worksheet_data: wsData,
            reviewed_by: createdUsers[managerEmail]?.id, reviewed_at: now.toISOString(),
            reviewer_name: managerName, review_comment: 'Phase 3 approved.', review_history: hist,
          }, { onConflict: 'user_id,worksheet_id' });
        }
      }

      // needs_revision examples for specific users
      if (u.email === 'sneha.qa@newton.edu') {
        const wsData = getWorksheetData('p1_w3', name, buddyName, managerName);
        await supabase.from('worksheet_submissions').upsert({
          user_id: user.id, worksheet_id: 'p1_w3', phase: 'phase-1',
          status: 'submitted', review_status: 'needs_revision',
          worksheet_data: wsData,
          reviewed_by: createdUsers[buddyEmail]?.id, reviewed_at: new Date(now - 172800000).toISOString(),
          reviewer_name: buddyName, review_comment: 'Please expand with specific examples from your classroom experience.',
          review_history: [{ action: 'needs_revision', reviewer_name: buddyName, comment: 'Need more detail.', timestamp: new Date(now - 172800000).toISOString() }],
        }, { onConflict: 'user_id,worksheet_id' });
      }
    }

    // Verify counts
    const { count } = await supabase.from('worksheet_submissions').select('*', { count: 'exact', head: true });
    console.log(`\n  Total submissions created: ${count}`);
  }

  if (mode === 'summary' || mode === 'all') {
    console.log('\n╔═══════════════════════════════════════════════╗');
    console.log('║   ✅ Seeding Complete!                       ║');
    console.log('╚═══════════════════════════════════════════════╝\n');
    console.log('  All passwords: Test123!');
    console.log('  Login at: http://localhost:5173\n');
    console.log('  ── Key Test Users ──');
    console.log('  Joinee with full Phase 3 completion: arjun.qa@newton.edu');
    console.log('  Joinee with Phase 2:                 sneha.qa@newton.edu');
    console.log('  Buddy (approve worksheets):           neha.qa@newton.edu');
    console.log('  Manager (approve phases):            priya.qa@newton.edu');
    console.log('  Onboarding Lead:                     ravi.qa@newton.edu');
    console.log('');
    console.log('  ── E2E Test Flow ──');
    console.log('  1. Login as neha.qa@newton.edu → go to /buddy → approve worksheets');
    console.log('  2. Login as priya.qa@newton.edu → go to /admin → approve phases');
    console.log('  3. Login as arjun.qa@newton.edu → check progress, notifications');
    console.log('');
  }
}

main().catch(err => {
  console.error('\n❌ FAILED:', err.message);
  process.exit(1);
});
