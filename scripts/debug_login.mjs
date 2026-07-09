// =============================================================================
// Debug Login Script — Tests each account and reports the actual error
// =============================================================================
import { createClient } from '@supabase/supabase-js';
import { WebSocket } from 'ws';

const SUPABASE_URL = 'https://fuoqoryqndtdooujslee.supabase.co';
const SUPABASE_KEY = 'sb_publishable_1JTwEK8CgHC6PLtOOnYeSw_xaHwa-i9';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { transport: WebSocket },
});

const ACCOUNTS = [
  { name: 'Manager', email: 'priya@newton.edu' },
  { name: 'Buddy', email: 'neha@newton.edu' },
  { name: 'Onboarding Lead', email: 'ravi@newton.edu' },
];

const PASSWORD = 'Test123!';

async function main() {
  console.log('Testing login for all accounts...\n');

  for (const acct of ACCOUNTS) {
    process.stdout.write(`  ${acct.name} (${acct.email}): `);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: acct.email,
        password: PASSWORD,
      });
      if (error) {
        console.log(`✗ ${error.message} (${error.status || 'no status'})`);
      } else {
        console.log(`✅ Logged in! User ID: ${data.user?.id?.substring(0, 8)}...`);
        console.log(`   Role: ${data.user?.user_metadata?.role || 'N/A'}`);
        console.log(`   Name: ${data.user?.user_metadata?.full_name || 'N/A'}`);
        // Sign out to test next account
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.log(`✗ Error: ${err.message}`);
    }
  }

  console.log('\n--- Trying to create a fresh test user ---');
  try {
    const { data, error } = await supabase.auth.signUp({
      email: 'test-debug-' + Date.now() + '@newton.edu',
      password: 'Test123!',
      options: { data: { full_name: 'Debug Test', role: 'academic_head' } },
    });
    if (error) {
      console.log(`Sign-up error: ${error.message}`);
    } else {
      console.log(`Sign-up SUCCESS! User ID: ${data.user?.id?.substring(0, 8)}...`);
      console.log(`Identities: ${data.user?.identities?.length || 0}`);
      // Try to sign in immediately
      const newEmail = data.user?.email || '';
      if (newEmail) {
        const { error: signinErr } = await supabase.auth.signInWithPassword({
          email: newEmail,
          password: 'Test123!',
        });
        if (signinErr) {
          console.log(`  But sign-in failed: ${signinErr.message}`);
        } else {
          console.log(`  Sign-in succeeded!`);
        }
      }
    }
  } catch (err) {
    console.log(`Error: ${err.message}`);
  }

  console.log('\nDone.');
}

main().catch(console.error);
