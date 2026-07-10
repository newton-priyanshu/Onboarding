const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

if (!process.env.VITE_SUPABASE_URL || !(process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_KEY)) {
  console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY/SUPABASE_KEY in environment');
  process.exit(1);
}
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_KEY,
  { realtime: { transport: ws } }
);

const TS = Date.now().toString(36).slice(-4).toUpperCase();
const PASSWORD = 'Test123!';

async function main() {
  console.log('=== CREATING TEST USERS FOR REVIEWER FLOW TEST ===\n');

  // ── 1. Create New Joinee ──
  console.log('1. Creating New Joinee...');
  const njEmail = `joinee_${TS}@newton.edu`;
  const { data: nj, error: nje } = await supabase.auth.signUp({
    email: njEmail, password: PASSWORD,
    options: { data: { full_name: 'Arjun Test Joinee', role: 'new_joinee' } }
  });
  if (nje) throw new Error('Joinee signup: ' + nje.message);
  console.log('   ✅ Joinee ID:', nj.user.id);

  // ── 2. Create Buddy (a lead_instructor) ──
  console.log('\n2. Creating Buddy (Lead Instructor)...');
  const buddyEmail = `buddy_${TS}@newton.edu`;
  const { data: buddy, error: bde } = await supabase.auth.signUp({
    email: buddyEmail, password: PASSWORD,
    options: { data: { full_name: 'Neha Buddy Mentor', role: 'lead_instructor' } }
  });
  if (bde) throw new Error('Buddy signup: ' + bde.message);
  console.log('   ✅ Buddy ID:', buddy.user.id);

  // ── 3. Create Manager (another lead_instructor) ──
  console.log('\n3. Creating Manager (Lead Instructor)...');
  const mgrEmail = `manager_${TS}@newton.edu`;
  const { data: mgr, error: mge } = await supabase.auth.signUp({
    email: mgrEmail, password: PASSWORD,
    options: { data: { full_name: 'Priya Lead Manager', role: 'lead_instructor' } }
  });
  if (mge) throw new Error('Manager signup: ' + mge.message);
  console.log('   ✅ Manager ID:', mgr.user.id);

  // ── 4. Create Onboarding Lead ──
  console.log('\n4. Creating Onboarding Lead...');
  const olEmail = `onboard_${TS}@newton.edu`;
  const { data: ol, error: ole } = await supabase.auth.signUp({
    email: olEmail, password: PASSWORD,
    options: { data: { full_name: 'Ravi Onboarding Lead', role: 'onboarding_lead' } }
  });
  if (ole) throw new Error('Onboarding Lead signup: ' + ole.message);
  console.log('   ✅ Onboarding Lead ID:', ol.user.id);

  // Wait a moment for profiles to be created
  await new Promise(r => setTimeout(r, 2000));

  // ── 5. Assign Manager + Buddy to joinee ──
  console.log('\n5. Assigning Manager & Buddy to Joinee...');
  const { error: ae1 } = await supabase
    .from('user_profiles')
    .update({ assigned_lead_id: mgr.user.id })
    .eq('id', nj.user.id);
  if (ae1) console.log('   ⚠️ Manager assign:', ae1.message);
  else console.log('   ✅ Manager assigned');

  const { error: ae2 } = await supabase
    .from('user_profiles')
    .update({ assigned_buddy_id: buddy.user.id })
    .eq('id', nj.user.id);
  if (ae2) console.log('   ⚠️ Buddy assign:', ae2.message);
  else console.log('   ✅ Buddy assigned');

  await new Promise(r => setTimeout(r, 1000));

  // ── 6. Create Worksheet Submissions ──
  console.log('\n6. Creating worksheet submissions...');

  // Buddy worksheet (p1_w1 - Team Introduction → buddy)
  console.log('   Creating buddy worksheet (p1_w1)...');
  await supabase.from('worksheet_submissions').upsert({
    user_id: nj.user.id, worksheet_id: 'p1_w1', phase: 'phase-1',
    status: 'Submitted', review_status: 'pending_review', reviewer_type: 'buddy',
    worksheet_data: { employeeName: 'Arjun Test Joinee', mentorName: 'Neha Buddy', department: 'Computer Science', reflections: 'Completed stakeholder mapping.' },
  }, { onConflict: 'user_id,worksheet_id' });

  // Buddy worksheet (p1_w2 - Mentor Sync → buddy)
  console.log('   Creating buddy worksheet (p1_w2)...');
  await supabase.from('worksheet_submissions').upsert({
    user_id: nj.user.id, worksheet_id: 'p1_w2', phase: 'phase-1',
    status: 'Submitted', review_status: 'pending_review', reviewer_type: 'buddy',
    worksheet_data: { employeeName: 'Arjun Test Joinee', syncDate: '2026-06-10', keyTakeaways: 'Weekly syncs going well with mentor.' },
  }, { onConflict: 'user_id,worksheet_id' });

  // Manager worksheet (p1_w3 - Teaching Philosophy → manager)
  console.log('   Creating manager worksheet (p1_w3)...');
  await supabase.from('worksheet_submissions').upsert({
    user_id: nj.user.id, worksheet_id: 'p1_w3', phase: 'phase-1',
    status: 'Submitted', review_status: 'pending_review', reviewer_type: 'manager',
    worksheet_data: { employeeName: 'Arjun Test Joinee', teachingPhilosophy: 'I believe in project-based learning with real-world applications.', coreValues: 'Student-first approach, continuous improvement.' },
  }, { onConflict: 'user_id,worksheet_id' });

  // Onboarding Lead worksheet (p1_w4 - University Governance → onboarding_lead)
  console.log('   Creating onboarding lead worksheet (p1_w4)...');
  await supabase.from('worksheet_submissions').upsert({
    user_id: nj.user.id, worksheet_id: 'p1_w4', phase: 'phase-1',
    status: 'Submitted', review_status: 'pending_review', reviewer_type: 'onboarding_lead',
    worksheet_data: { employeeName: 'Arjun Test Joinee', governanceStructure: 'Understood university policies and semester flow.', escalationPath: 'Faculty → HOD → Academic Council' },
  }, { onConflict: 'user_id,worksheet_id' });

  // Onboarding Lead worksheet (p1_w5 - Portal Walkthrough → onboarding_lead)
  console.log('   Creating onboarding lead worksheet (p1_w5)...');
  await supabase.from('worksheet_submissions').upsert({
    user_id: nj.user.id, worksheet_id: 'p1_w5', phase: 'phase-1',
    status: 'Submitted', review_status: 'pending_review', reviewer_type: 'onboarding_lead',
    worksheet_data: { employeeName: 'Arjun Test Joinee', portalAccess: 'Verified all portal modules.', quizConfigured: 'Yes' },
  }, { onConflict: 'user_id,worksheet_id' });

  // Another buddy worksheet (p1_w6 - Observation → buddy)
  console.log('   Creating buddy worksheet (p1_w6)...');
  await supabase.from('worksheet_submissions').upsert({
    user_id: nj.user.id, worksheet_id: 'p1_w6', phase: 'phase-1',
    status: 'Submitted', review_status: 'pending_review', reviewer_type: 'buddy',
    worksheet_data: { employeeName: 'Arjun Test Joinee', lecturesObserved: 2, labsObserved: 1, keyLearning: 'Effective classroom management techniques observed.' },
  }, { onConflict: 'user_id,worksheet_id' });

  // Another manager worksheet (p1_w7 - Courseware Review → manager)
  console.log('   Creating manager worksheet (p1_w7)...');
  await supabase.from('worksheet_submissions').upsert({
    user_id: nj.user.id, worksheet_id: 'p1_w7', phase: 'phase-1',
    status: 'Submitted', review_status: 'pending_review', reviewer_type: 'manager',
    worksheet_data: { employeeName: 'Arjun Test Joinee', pptsReviewed: 5, worksheetsReviewed: 3, qualityScore: 'Good', recommendations: 'Add more practice problems.' },
  }, { onConflict: 'user_id,worksheet_id' });

  console.log('   ✅ All worksheets created');

  // ── 7. Verify data ──
  console.log('\n7. Verifying data...');
  const { data: subs } = await supabase
    .from('worksheet_submissions')
    .select('worksheet_id, review_status, reviewer_type')
    .eq('user_id', nj.user.id);
  console.log('   Worksheets for joinee:', subs?.length || 0);
  if (subs) {
    const byType = { buddy: 0, manager: 0, onboarding_lead: 0 };
    subs.forEach(s => { if (byType[s.reviewer_type] !== undefined) byType[s.reviewer_type]++; });
    console.log('   By reviewer type:', JSON.stringify(byType));
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('full_name, assigned_lead_id, assigned_buddy_id')
    .eq('id', nj.user.id)
    .single();
  console.log('   Profile:', JSON.stringify(profile));

  // Check buddy dashboard query
  const { data: buddyInstrs } = await supabase
    .from('user_profiles')
    .select('id, full_name')
    .eq('assigned_buddy_id', buddy.user.id);
  console.log('   Buddy sees instructors:', buddyInstrs?.length || 0);

  const { data: mgrInstrs } = await supabase
    .from('user_profiles')
    .select('id, full_name')
    .eq('assigned_lead_id', mgr.user.id);
  console.log('   Manager sees instructors:', mgrInstrs?.length || 0);

  console.log('\n========== ✅ ALL DONE ==========');
  console.log('\n📋 TEST CREDENTIALS (all pw: ' + PASSWORD + '):');
  console.log('   Joinee:          ' + njEmail + ' / ' + PASSWORD);
  console.log('   Buddy:           ' + buddyEmail + ' / ' + PASSWORD);
  console.log('   Manager:         ' + mgrEmail + ' / ' + PASSWORD);
  console.log('   Onboarding Lead: ' + olEmail + ' / ' + PASSWORD);
  console.log('');
  console.log('📋 DATA CREATED:');
  console.log('   - 6 worksheet submissions (2 buddy, 2 manager, 2 onboarding_lead)');
  console.log('   - Manager assigned to joinee (assigned_lead_id)');
  console.log('   - Buddy assigned to joinee (assigned_buddy_id)');
  console.log('');
  console.log('📋 TEST STEPS:');
  console.log('   1. Login as joinee → Dashboard shows reviewer badges on each worksheet');
  console.log('   2. Login as Buddy (Neha) → /buddy → Buddy Queue shows 2 pending');
  console.log('   3. Login as Manager (Priya) → /buddy → Manager Queue shows 2 pending');
  console.log('   4. Login as Onboarding Lead (Ravi) → /onboarding-lead → 2 pending');
}

main().catch(err => {
  console.error('\n❌ FAILED:', err.message);
  process.exit(1);
});
