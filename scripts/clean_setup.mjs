// =============================================================================
// Newton Onboarding Portal — Clean Setup
// =============================================================================
// Deletes all existing worksheet data, then creates 3 clean users:
//   1. Manager (academic_head)
//   2. Buddy (lead_instructor)
//   3. Onboarding Lead (onboarding_lead)
//
// Run with: node scripts/clean_setup.mjs
//
// Advantages when VITE_SUPABASE_SERVICE_ROLE_KEY is set:
//   - Bypasses RLS for DELETE operations (worksheet_submissions, user_profiles)
//   - Can run cleanup and user creation in a single pass
// Without the service role key, SQL instructions are printed for manual execution.
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import { WebSocket } from 'ws';

const PASSWORD = 'Test123!';
if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in environment');
  process.exit(1);
}
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { transport: WebSocket },
});

// Service-role client bypasses RLS for admin operations.
// Only created if the secret key is available (never exposed client-side).
const serviceClient = SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, { realtime: { transport: WebSocket } })
  : null;

const USERS = [
  { name: 'Dr. Priya Sharma', email: 'priya@newton.edu',    role: 'academic_head' },
  { name: 'Neha Kapoor',      email: 'neha@newton.edu',     role: 'lead_instructor' },
  { name: 'Ravi Deshmukh',    email: 'ravi@newton.edu',     role: 'onboarding_lead' },
];

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function deleteAllData() {
  // Use the service-role client when available; it bypasses RLS.
  const client = serviceClient || supabase;

  console.log('📋 Step 1: Deleting all worksheet submissions...');
  const { error: delError } = await client
    .from('worksheet_submissions')
    .delete()
    .neq('user_id', '00000000-0000-0000-0000-000000000000');

  if (delError) {
    console.log(`  ⚠ Could not delete submissions: ${delError.message}`);
    if (!serviceClient) {
      console.log('  💡 Set VITE_SUPABASE_SERVICE_ROLE_KEY in .env to bypass RLS.\n');
    }
  } else {
    console.log('  ✅ All worksheet submissions deleted.\n');
  }
}

async function assignRoleViaServiceClient(userId, role) {
  if (!serviceClient) return false;
  // The handle_new_user trigger sets role to 'new_joinee' on signup.
  // Use the service role to update it to the intended role.
  const { error } = await serviceClient
    .from('user_profiles')
    .update({ role })
    .eq('id', userId);
  if (error) {
    console.log(`    ⚠ Could not update role via service client: ${error.message}`);
    return false;
  }
  return true;
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Clean Setup - Reset Data & Create Users');
  if (serviceClient) {
    console.log('  🔑 Service-role key detected — RLS bypassed');
  } else {
    console.log('  ⚠ No service-role key — some operations print SQL instead');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Step 1: Delete all existing data
  await deleteAllData();
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

    // Fetch the profile (created by handle_new_user trigger)
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profile) {
      // Override the default 'new_joinee' role with the intended one
      if (u.role !== 'new_joinee') {
        const upgraded = await assignRoleViaServiceClient(data.user.id, u.role);
        if (upgraded) {
          profile.role = u.role;
          console.log(`    ✅ Role upgraded to ${u.role} via service-role`);
        }
      }
      created[u.role] = profile;
      created[u.email] = profile;
      console.log(`    ✅ Profile confirmed`);
    } else {
      console.log(`    ⚠ Profile not found yet (trigger may be slow)`);
    }

    await sleep(500);
  }

  if (!serviceClient && Object.keys(created).length > 0) {
    // Print SQL to manually upgrade roles
    console.log('\n📋 RUN THIS SQL IN SUPABASE SQL EDITOR to assign correct roles:');
    console.log('────────────────────────────────────────────────────');
    for (const u of USERS) {
      if (created[u.email]) {
        console.log(
          `UPDATE user_profiles SET role = '${u.role}' WHERE id = '${created[u.email].id}';`
        );
      }
    }
    if (USERS.some(u => u.role !== 'new_joinee')) {
      console.log('-- (The handle_new_user trigger sets all to new_joinee on signup.)');
    }
    console.log('────────────────────────────────────────────────────\n');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
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
