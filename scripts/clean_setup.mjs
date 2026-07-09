// =============================================================================
// Newton Onboarding Portal — Clean Setup
// =============================================================================
// Deletes all existing worksheet data, then creates 3 clean users:
//   1. Manager (academic_head)
//   2. Buddy (lead_instructor)
//   3. Onboarding Lead (onboarding_lead)
//
// Run with: node scripts/clean_setup.mjs
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import { WebSocket } from 'ws';

const PASSWORD = 'Test123!';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://fuoqoryqndtdooujslee.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_1JTwEK8CgHC6PLtOOnYeSw_xaHwa-i9';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { transport: WebSocket },
});

const USERS = [
  { name: 'Dr. Priya Sharma', email: 'priya@newton.edu',    role: 'academic_head' },
  { name: 'Neha Kapoor',      email: 'neha@newton.edu',     role: 'lead_instructor' },
  { name: 'Ravi Deshmukh',    email: 'ravi@newton.edu',     role: 'onboarding_lead' },
];

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Clean Setup - Reset Data & Create Users');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Step 1: Delete all existing worksheet submissions
  console.log('📋 Step 1: Deleting all worksheet submissions...\n');
  const { error: delError } = await supabase
    .from('worksheet_submissions')
    .delete()
    .neq('user_id', '00000000-0000-0000-0000-000000000000'); // delete all

  if (delError) {
    console.log(`  ⚠ Could not delete submissions: ${delError.message}`);
    console.log('  (This is expected with RLS — we\'ll continue with creating users)\n');
  } else {
    console.log('  ✅ All worksheet submissions deleted.\n');
  }

  await sleep(1000);

  // Step 2: Create users
  console.log('📋 Step 2: Creating users...\n');

  const created = {};

  for (const u of USERS) {
    console.log(`  → Creating ${u.role}: ${u.name} (${u.email})`);
    const { data, error } = await supabase.auth.signUp({
      email: u.email,
      password: PASSWORD,
      options: { data: { full_name: u.name, role: u.role } },
    });

    if (error) {
      if (error.message?.includes('already registered')) {
        console.log(`    ⚠ Already exists, checking profile...`);
        const { data: existing } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('email', u.email)
          .single();
        if (existing) {
          created[u.role] = existing;
          created[u.email] = existing;
          console.log(`    ✅ Found existing profile for ${u.name}`);
        }
        continue;
      }
      console.error(`    ✗ Failed: ${error.message}`);
      continue;
    }

    if (!data?.user) {
      console.error(`    ✗ No user returned for ${u.name}`);
      continue;
    }

    console.log(`    ✅ Auth user created (${data.user.id})`);
    await sleep(2000);

    // Fetch the profile
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profile) {
      created[u.role] = profile;
      created[u.email] = profile;
      console.log(`    ✅ Profile confirmed`);
    } else {
      console.log(`    ⚠ Profile not found yet (trigger may be slow)`);
    }

    await sleep(500);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ✅ Setup Complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('  📧 Login Credentials (password: Test123! for all):\n');
  console.log('  ┌─────────────────────┬──────────────────┬──────────────────┐');
  console.log('  │ Name                │ Email            │ Role             │');
  console.log('  ├─────────────────────┼──────────────────┼──────────────────┤');
  console.log('  │ Dr. Priya Sharma    │ priya@newton.edu │ Manager (AH)     │');
  console.log('  │ Neha Kapoor         │ neha@newton.edu  │ Buddy / Mentor   │');
  console.log('  │ Ravi Deshmukh       │ ravi@newton.edu  │ Onboarding Lead  │');
  console.log('  └─────────────────────┴──────────────────┴──────────────────┘\n');
  console.log('  🔑 Password: Test123! for all\n');
  console.log('  🌐 Login at: http://localhost:5199/login\n');
}

main().catch(err => {
  console.error('\n❌ Setup failed:', err);
  process.exit(1);
});
