// =============================================================================
// Fix Buddy/Manager Assignments
// =============================================================================
// Authenticates as Priya (academic_head) to bypass RLS for assignment updates.
// Usage: node fix-assignments.cjs
// =============================================================================

const { createClient } = require('@supabase/supabase-js');
const { WebSocket } = require('ws');

if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in environment');
  process.exit(1);
}
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { transport: WebSocket },
});

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Fix Buddy/Manager Assignments');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Step 1: Sign in as Priya (academic_head/manager) — bypasses RLS for admin ops
  console.log('1. Signing in as Priya (Manager)...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'priya.qa@newton.edu',
    password: 'Test123!',
  });
  if (authError) {
    console.error('   ✗ Login failed:', authError.message);
    console.log('   Trying with anon key instead...');
  } else {
    console.log('   ✅ Signed in as:', authData.user?.email);
  }

  await sleep(1000);

  // Step 2: Get profile IDs for all users
  console.log('\n2. Fetching user profiles...');
  const { data: profiles, error: profilesError } = await supabase
    .from('user_profiles')
    .select('id, email, full_name, role');

  if (profilesError) {
    console.error('   ✗ Failed to fetch profiles:', profilesError.message);
    return;
  }

  const neha = profiles.find(p => p.email === 'neha.qa@newton.edu');
  const priya = profiles.find(p => p.email === 'priya.qa@newton.edu');
  const arjun = profiles.find(p => p.email === 'arjun.qa@newton.edu');
  const sneha = profiles.find(p => p.email === 'sneha.qa@newton.edu');
  const vikram = profiles.find(p => p.email === 'vikram.qa@newton.edu');

  console.log(`   Found ${profiles.length} profiles`);
  console.log(`   Neha:  ${neha?.id ? '✅' : '❌'} (${neha?.email || 'not found'})`);
  console.log(`   Priya: ${priya?.id ? '✅' : '❌'} (${priya?.email || 'not found'})`);
  console.log(`   Arjun: ${arjun?.id ? '✅' : '❌'} (${arjun?.email || 'not found'})`);

  if (!neha || !priya || !arjun) {
    console.error('\n   ❌ Missing required users. Run __seed_test_data.cjs first.');
    return;
  }

  // Step 3: Assign Neha as buddy, Priya as manager for all joinees
  console.log('\n3. Updating assignments...');

  const joinees = [arjun, sneha, vikram].filter(Boolean);
  for (const joinee of joinees) {
    console.log(`   → ${joinee.full_name} (${joinee.email}):`);

    const { error: err1 } = await supabase
      .from('user_profiles')
      .update({ assigned_buddy_id: neha.id })
      .eq('id', joinee.id);
    console.log(`     Buddy: ${err1 ? '✗ ' + err1.message : '✅ Assigned to Neha'}`);

    const { error: err2 } = await supabase
      .from('user_profiles')
      .update({ assigned_lead_id: priya.id })
      .eq('id', joinee.id);
    console.log(`     Manager: ${err2 ? '✗ ' + err2.message : '✅ Assigned to Priya'}`);

    await sleep(300);
  }

  // Step 4: Verify
  console.log('\n4. Verifying assignments...');
  const { data: verify } = await supabase
    .from('user_profiles')
    .select('email, full_name, assigned_buddy_id, assigned_lead_id')
    .in('email', ['arjun.qa@newton.edu', 'sneha.qa@newton.edu', 'vikram.qa@newton.edu']);

  if (verify) {
    console.log('');
    verify.forEach(p => {
      console.log(`   ${p.full_name}: buddy=${p.assigned_buddy_id ? '✅' : '❌'} manager=${p.assigned_lead_id ? '✅' : '❌'}`);
    });
  }

  // Sign out
  await supabase.auth.signOut();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ✅ Done!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(err => {
  console.error('\n❌ Failed:', err.message);
  process.exit(1);
});
