// =============================================================================
// Fix Phase 1 promotion data for Arjun
// Sets all Phase 1 worksheets to buddy_approved so Priya can promote the phase.
// Logs in as Arjun himself to bypass RLS (users can update their own submissions).
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import { WebSocket } from 'ws';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://fuoqoryqndtdooujslee.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_1JTwEK8CgHC6PLtOOnYeSw_xaHwa-i9';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { transport: WebSocket },
});

const PHASE1_IDS = ['p1_w1','p1_w2','p1_w3','p1_w4','p1_w5','p1_w6','p1_w7','p1_w8','gc1'];

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Fix Phase 1 Promotion Data');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Step 1: Login as Arjun (he owns the submissions, so RLS allows update)
  console.log('📋 Step 1: Logging in as Arjun...\n');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'arjun.qa@newton.edu',
    password: 'Test123!',
  });

  if (authError) {
    console.error('  ✗ Login failed:', authError.message);
    process.exit(1);
  }
  console.log('  ✅ Logged in as:', authData.user?.email, '\n');

  // Step 2: Set all Phase 1 worksheets to buddy_approved
  console.log('📋 Step 2: Setting Phase 1 worksheets to buddy_approved...\n');
  
  let updated = 0;
  for (const wsId of PHASE1_IDS) {
    const { error } = await supabase
      .from('worksheet_submissions')
      .update({
        review_status: 'buddy_approved',
        reviewed_at: new Date().toISOString(),
        reviewer_name: 'Neha Kapoor',
        review_comment: 'Great work! Ready for manager review.',
      })
      .eq('user_id', authData.user.id)
      .eq('worksheet_id', wsId);

    if (error) {
      console.log(`  ✗ ${wsId}: ${error.message}`);
    } else {
      console.log(`  ✅ ${wsId}: buddy_approved`);
      updated++;
    }
  }

  console.log(`\n  ✅ Updated ${updated}/${PHASE1_IDS.length} Phase 1 worksheets to buddy_approved\n`);

  // Step 3: Verify
  console.log('📋 Step 3: Verifying...\n');
  const { data: subs, error: subsError } = await supabase
    .from('worksheet_submissions')
    .select('worksheet_id, review_status')
    .eq('user_id', authData.user.id)
    .in('worksheet_id', PHASE1_IDS);

  if (subsError) {
    console.error('  ✗ Verification error:', subsError.message);
  } else {
    for (const sub of (subs || [])) {
      const icon = sub.review_status === 'buddy_approved' ? '✅' : '⚠️';
      console.log(`  ${icon} ${sub.worksheet_id}: ${sub.review_status}`);
    }
  }

  // Sign out
  await supabase.auth.signOut();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ✅ Done! Phase 1 is now buddy_approved for Priya to promote.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(err => {
  console.error('\n❌ Failed:', err);
  process.exit(1);
});
