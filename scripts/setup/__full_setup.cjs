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

const PASSWORD = 'Test123!';

async function main() {
  console.log('=== CREATING TEST USERS ===\n');

  const users = {};

  // ── Helper to sign up ──
  async function signUp(email, name, role) {
    console.log(`  Creating ${role}: ${name} (${email})`);
    const { data, error } = await supabase.auth.signUp({
      email, password: PASSWORD,
      options: { data: { full_name: name, role } }
    });
    if (error) throw new Error(`${role} signup: ${error.message}`);
    console.log(`   ✅ User ID: ${data.user.id}`);
    return { id: data.user.id, email, name, role };
  }

  // ── 1. Create users ──
  users.joinee = await signUp('arjun.test@newton.edu', 'Arjun Test Joinee', 'new_joinee');
  users.manager = await signUp('priya.manager@newton.edu', 'Priya Lead Manager', 'lead_instructor');
  users.buddy = await signUp('neha.buddy@newton.edu', 'Neha Buddy Mentor', 'lead_instructor');
  users.onboarding = await signUp('ravi.lead@newton.edu', 'Ravi Onboarding Lead', 'onboarding_lead');

  console.log('\n✅ All 4 users created via auth.signUp');
  console.log('');
  console.log('📋 NOW RUN THIS SQL IN SUPABASE SQL EDITOR:');
  console.log('───────────────────────────────────────────────────');
  console.log('-- Confirm emails & create profiles');
  console.log('UPDATE auth.users SET email_confirmed_at = NOW()');
  console.log("  WHERE email IN ('arjun.test@newton.edu','priya.manager@newton.edu','neha.buddy@newton.edu','ravi.lead@newton.edu');");
  console.log('');
  console.log("-- Insert profiles");
  console.log("INSERT INTO user_profiles (id, email, full_name, role) VALUES");
  console.log(`  ('${users.joinee.id}', 'arjun.test@newton.edu', 'Arjun Test Joinee', 'new_joinee'),`);
  console.log(`  ('${users.manager.id}', 'priya.manager@newton.edu', 'Priya Lead Manager', 'lead_instructor'),`);
  console.log(`  ('${users.buddy.id}', 'neha.buddy@newton.edu', 'Neha Buddy Mentor', 'lead_instructor'),`);
  console.log(`  ('${users.onboarding.id}', 'ravi.lead@newton.edu', 'Ravi Onboarding Lead', 'onboarding_lead')`);
  console.log('  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role;');
  console.log('');
  console.log('-- Assign manager & buddy to joinee');
  console.log(`UPDATE user_profiles SET`);
  console.log(`  assigned_lead_id = '${users.manager.id}',`);
  console.log(`  assigned_buddy_id = '${users.buddy.id}'`);
  console.log(`  WHERE email = 'arjun.test@newton.edu';`);
  console.log('');
  console.log("-- Create 6 worksheet submissions");
  // Buddy worksheets
  console.log(`INSERT INTO worksheet_submissions (user_id, worksheet_id, phase, status, review_status, reviewer_type, worksheet_data)`);
  console.log(`SELECT '${users.joinee.id}', w.* FROM (VALUES`);
  console.log(`  ('p1_w1', 'phase-1', 'Submitted', 'pending_review', 'buddy', '{"employeeName":"Arjun Test Joinee","reflections":"Stakeholder mapping done."}'::jsonb),`);
  console.log(`  ('p1_w2', 'phase-1', 'Submitted', 'pending_review', 'buddy', '{"employeeName":"Arjun Test Joinee","syncDate":"2026-06-10"}'::jsonb),`);
  console.log(`  ('p1_w3', 'phase-1', 'Submitted', 'pending_review', 'manager', '{"employeeName":"Arjun Test Joinee","philosophy":"Student-first approach"}'::jsonb),`);
  console.log(`  ('p1_w4', 'phase-1', 'Submitted', 'pending_review', 'onboarding_lead', '{"employeeName":"Arjun Test Joinee","governance":"Understood policies"}'::jsonb),`);
  console.log(`  ('p1_w5', 'phase-1', 'Submitted', 'pending_review', 'onboarding_lead', '{"employeeName":"Arjun Test Joinee","portalAccess":"Verified"}'::jsonb),`);
  console.log(`  ('p1_w7', 'phase-1', 'Submitted', 'pending_review', 'manager', '{"employeeName":"Arjun Test Joinee","qualityScore":"Good"}'::jsonb)`);
  console.log(`) AS w(worksheet_id, phase, status, review_status, reviewer_type, worksheet_data)`);
  console.log(`ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'pending_review';`);
  console.log('');
  console.log('-- Verify');
  console.log("SELECT u.email, u.role, u.assigned_lead_id IS NOT NULL as has_manager, u.assigned_buddy_id IS NOT NULL as has_buddy");
  console.log("FROM user_profiles u WHERE u.email LIKE '%@newton.edu' ORDER BY u.email;");
  console.log('───────────────────────────────────────────────────');
  console.log('');
  console.log('📋 TEST CREDENTIALS (all pw: ' + PASSWORD + '):');
  console.log('   Joinee:          arjun.test@newton.edu');
  console.log('   Manager:         priya.manager@newton.edu');
  console.log('   Buddy:           neha.buddy@newton.edu');
  console.log('   Onboarding Lead: ravi.lead@newton.edu');
}

main().catch(err => {
  console.error('\n❌ FAILED:', err.message);
  process.exit(1);
});
