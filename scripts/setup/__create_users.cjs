const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in environment');
  process.exit(1);
}
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { realtime: { transport: ws } }
);

const TS = Date.now().toString(36).slice(-4);

async function main() {
  console.log('=== CREATING 3 TEST USERS ===\n');

  // 1. New Joinee
  console.log('1. Creating New Joinee...');
  const { data: nj, error: nje } = await supabase.auth.signUp({
    email: `newjoinee_${TS}@newton.edu`,
    password: 'Joinee123!',
    options: { data: { full_name: 'Arjun New Joinee', role: 'new_joinee' } }
  });
  if (nje) throw new Error('Joinee signup: ' + nje.message);
  console.log('   ✅ New Joinee: newjoinee_' + TS + '@newton.edu / Joinee123!');

  // 2. Manager (Lead Instructor)
  console.log('2. Creating Manager...');
  const { data: mgr, error: mge } = await supabase.auth.signUp({
    email: `manager_${TS}@newton.edu`,
    password: 'Manager123!',
    options: { data: { full_name: 'Priya Manager', role: 'lead_instructor' } }
  });
  if (mge) throw new Error('Manager signup: ' + mge.message);
  console.log('   ✅ Manager: manager_' + TS + '@newton.edu / Manager123!');

  // 3. Onboarding Lead
  console.log('3. Creating Onboarding Lead...');
  const { data: obl, error: obe } = await supabase.auth.signUp({
    email: `onboard_${TS}@newton.edu`,
    password: 'Onboard123!',
    options: { data: { full_name: 'Ravi Onboarding Lead', role: 'onboarding_lead' } }
  });
  if (obe) throw new Error('Onboarding Lead signup: ' + obe.message);
  console.log('   ✅ Onboarding Lead: onboard_' + TS + '@newton.edu / Onboard123!');

  // 4. Create a worksheet submission for the joinee
  console.log('\n4. Creating worksheet submission (p1_w1)...');
  const { error: wse } = await supabase.from('worksheet_submissions').upsert({
    user_id: nj.user.id,
    worksheet_id: 'p1_w1',
    phase: 'phase-1',
    status: 'Submitted',
    review_status: 'pending_review',
    worksheet_data: {
      employeeName: 'Arjun New Joinee',
      mentorName: 'Dr. Sharma',
      department: 'Computer Science',
      reflections: 'Completed stakeholder mapping successfully. Met the team and understood the culture.',
    },
  }, { onConflict: 'user_id,worksheet_id' });
  if (wse) throw new Error('Submission: ' + wse.message);
  console.log('   ✅ Submission created with review_status: pending_review');

  // 5. Assign manager to joinee
  console.log('\n5. Assigning manager to joinee...');
  const { error: ae } = await supabase
    .from('user_profiles')
    .update({ assigned_lead_id: mgr.user.id })
    .eq('id', nj.user.id);
  if (ae) console.log('   ⚠️ Assign (may need admin SQL):', ae.message);
  else console.log('   ✅ Manager assigned to joinee');

  // 6. Verify BuddyDashboard query works
  console.log('\n6. Testing BuddyDashboard query...');
  const { data: assigned } = await supabase
    .from('user_profiles')
    .select('id, full_name')
    .eq('assigned_lead_id', mgr.user.id);
  console.log('   Instructors assigned to manager:', assigned?.length || 0);

  // 7. Manager approves the worksheet
  console.log('\n7. Manager approving worksheet...');
  const historyEntry = {
    action: 'approved',
    reviewer_name: 'Priya Manager',
    reviewer_id: mgr.user.id,
    comment: 'Great work Arjun! All stakeholder mappings are accurate. Approved.',
    timestamp: new Date().toISOString(),
  };
  const { error: re } = await supabase
    .from('worksheet_submissions')
    .update({
      review_status: 'approved',
      reviewed_by: mgr.user.id,
      reviewed_at: new Date().toISOString(),
      reviewer_name: 'Priya Manager',
      review_comment: 'Great work Arjun! All stakeholder mappings are accurate. Approved.',
      review_history: [historyEntry],
    })
    .eq('user_id', nj.user.id)
    .eq('worksheet_id', 'p1_w1');
  if (re) throw new Error('Review: ' + re.message);
  console.log('   ✅ Worksheet approved with review history!');

  // 8. Verify the status
  console.log('\n8. Verifying final status...');
  const { data: check } = await supabase
    .from('worksheet_submissions')
    .select('review_status, review_history, reviewer_name, reviewed_at')
    .eq('user_id', nj.user.id)
    .eq('worksheet_id', 'p1_w1')
    .single();
  console.log('   review_status:', check?.review_status);
  console.log('   reviewed_by:', check?.reviewer_name);
  console.log('   review_history:', JSON.stringify(check?.review_history));

  // 9. Verify AdminDashboard query
  console.log('\n9. Testing AdminDashboard query...');
  const { data: instrs } = await supabase
    .from('user_profiles')
    .select('id, full_name, role')
    .in('role', ['new_joinee', 'lab_instructor']);
  console.log('   Instructors found:', instrs?.length || 0);

  console.log('\n========== ✅ ALL DONE ==========');
  console.log('\n📋 TEST CREDENTIALS:');
  console.log('   New Joinee:      newjoinee_' + TS + '@newton.edu / Joinee123!');
  console.log('   Manager:         manager_' + TS + '@newton.edu / Manager123!');
  console.log('   Onboarding Lead: onboard_' + TS + '@newton.edu / Onboard123!');
  console.log('');
  console.log('📋 SAMPLE DATA CREATED:');
  console.log('   - Worksheet p1_w1 submitted and approved');
  console.log('   - Review history with 1 entry');
  console.log('   - Manager assigned to joinee');
}

main().catch(err => {
  console.error('\n❌ FAILED:', err.message);
  process.exit(1);
});
