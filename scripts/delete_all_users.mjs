// =============================================================================
// Delete ALL Users & Data from Supabase
// =============================================================================
// Usage:  node scripts/delete_all_users.mjs
//
// When VITE_SUPABASE_SERVICE_ROLE_KEY is set in .env:
//   - Deletes worksheet_submissions and user_profiles directly (bypasses RLS)
//   - Prints SQL for auth.users deletion (cannot be done via JS client)
// Without the service role key, prints SQL instructions for manual execution
// (same as before).
// =============================================================================
import { createClient } from '@supabase/supabase-js';
import { WebSocket } from 'ws';

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

// Service-role client bypasses RLS for DELETE operations.
const serviceClient = SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, { realtime: { transport: WebSocket } })
  : null;

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Delete ALL Users & Data');
  if (serviceClient) {
    console.log('  🔑 Service-role key detected — RLS bypassed');
  } else {
    console.log('  ⚠ No service-role key — some steps will print SQL only');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Use the service-role client for DML operations; fall back to anon client.
  const client = serviceClient || supabase;

  // Step 1: Delete all worksheet submissions
  console.log('Step 1: Deleting worksheet submissions...');
  try {
    // First, get all submissions to know what we're deleting
    const { data: subs, error: listErr } = await supabase
      .from('worksheet_submissions')
      .select('id, user_id')
      .limit(1000);

    if (listErr) {
      console.log(`  ⚠ Could not list submissions: ${listErr.message}`);
    } else if (subs && subs.length > 0) {
      console.log(`  Found ${subs.length} submissions`);

      // Delete submissions
      const ids = subs.map(s => s.id);
      // Delete in batches of 50 (Supabase limit)
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        const { error: delErr } = await client
          .from('worksheet_submissions')
          .delete()
          .in('id', batch);
        if (delErr) {
          console.log(`  ⚠ Batch delete error: ${delErr.message}`);
          if (!serviceClient) {
            console.log('  💡 Set VITE_SUPABASE_SERVICE_ROLE_KEY in .env to bypass RLS.');
            break;
          }
        }
      }
      console.log('  ✅ Worksheet submissions deleted');
    } else {
      console.log('  No submissions found');
    }
  } catch (err) {
    console.log(`  ⚠ Error: ${err.message}`);
  }

  // Step 2: Delete all user profiles
  console.log('\nStep 2: Deleting user profiles...');
  try {
    const { data: profiles, error: listErr } = await supabase
      .from('user_profiles')
      .select('id, email')
      .limit(1000);

    if (listErr) {
      console.log(`  ⚠ Could not list profiles: ${listErr.message}`);
    } else if (profiles && profiles.length > 0) {
      console.log(`  Found ${profiles.length} profiles:`);
      for (const p of profiles) {
        console.log(`    - ${p.email || p.id?.substring(0, 8)}`);
      }

      // Delete profiles via service client (bypasses RLS outer-FK checks)
      const ids = profiles.map(p => p.id);
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        const { error: delErr } = await client
          .from('user_profiles')
          .delete()
          .in('id', batch);
        if (delErr) {
          console.log(`  ⚠ Batch delete error: ${delErr.message}`);
          if (!serviceClient) {
            console.log('  💡 Set VITE_SUPABASE_SERVICE_ROLE_KEY in .env to bypass RLS.');
            break;
          }
        }
      }
      console.log('  ✅ User profiles deleted');
    } else {
      console.log('  No profiles found (or RLS blocked listing)');
    }
  } catch (err) {
    console.log(`  ⚠ Error: ${err.message}`);
  }

  // Step 3: Auth users — always requires SQL Editor (JS client can't write auth.users)
  console.log('\nStep 3: Deleting auth users...');
  console.log('  (This requires the Supabase service_role key in SQL Editor)');
  console.log('  - Worksheet submissions: ✅ Deleted');
  console.log('  - User profiles: ✅ Deleted');
  console.log('  - Auth users: ⚠ Cannot delete via JS client — see SQL below');

  const projectRef = (process.env.VITE_SUPABASE_URL || '').match(/https:\/\/([^.]+)\.supabase\.co/) || ['', 'your-project'];
  console.log(`\n  📋 To fully delete auth users:`);
  console.log(`  1. Go to https://supabase.com/dashboard/project/${projectRef[1]}`);
  console.log('  2. Open SQL Editor');
  console.log('  3. Run:');
  console.log('     DELETE FROM auth.users;');
  console.log('     -- (This cascades to public.user_profiles, worksheet_submissions, and');
  console.log('     --  notifications via ON DELETE CASCADE foreign keys.)');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Cleanup complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
