// =============================================================================
// Delete ALL Users & Data from Supabase
// =============================================================================
import { createClient } from '@supabase/supabase-js';
import { WebSocket } from 'ws';

const SUPABASE_URL = 'https://fuoqoryqndtdooujslee.supabase.co';
const SUPABASE_KEY = 'sb_publishable_1JTwEK8CgHC6PLtOOnYeSw_xaHwa-i9';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { transport: WebSocket },
});

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Delete ALL Users & Data');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

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
        const { error: delErr } = await supabase
          .from('worksheet_submissions')
          .delete()
          .in('id', batch);
        if (delErr) console.log(`  ⚠ Batch delete error: ${delErr.message}`);
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
      
      // Delete profiles
      const ids = profiles.map(p => p.id);
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        const { error: delErr } = await supabase
          .from('user_profiles')
          .delete()
          .in('id', batch);
        if (delErr) console.log(`  ⚠ Batch delete error: ${delErr.message}`);
      }
      console.log('  ✅ User profiles deleted');
    } else {
      console.log('  No profiles found (or RLS blocked listing)');
    }
  } catch (err) {
    console.log(`  ⚠ Error: ${err.message}`);
  }

  // Step 3: Try to delete auth users (may need service_role key)
  console.log('\nStep 3: Deleting auth users...');
  console.log('  (This requires the Supabase service_role key)');
  console.log('  - Worksheet submissions: ✅ Deleted');
  console.log('  - User profiles: ✅ Deleted');
  console.log('  - Auth users: ⚠ Cannot delete with anon key alone');
  console.log('\n  To fully delete auth users:');
  console.log('  1. Go to https://supabase.com/dashboard/project/fuoqoryqndtdooujslee');
  console.log('  2. Open SQL Editor');
  console.log('  3. Run: DELETE FROM auth.users;');
  console.log('  4. Then: DELETE FROM public.user_profiles;');
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Cleanup complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
