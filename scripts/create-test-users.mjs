// =============================================================================
// Create 1 Test User Per Role
// =============================================================================
// Usage:  node scripts/create-test-users.mjs
//
// When VITE_SUPABASE_SERVICE_ROLE_KEY is set in .env:
//   - Automatically creates/updates user_profiles (bypasses RLS)
//   - Prints SQL to confirm emails (cannot be done via JS client)
// Without the service role key, outputs SQL for manual execution in Supabase
// SQL Editor (same as before).
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import { WebSocket } from 'ws';
import { readFileSync, existsSync } from 'fs';

// ─── Load .env ──────────────────────────────────────────
if (existsSync('.env')) {
  const envContent = readFileSync('.env', 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in environment/.env');
  process.exit(1);
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { realtime: { transport: WebSocket } }
);

// Service-role client bypasses RLS for admin operations on public schema.
// NOTE: auth.users (email confirmation) still requires raw SQL in the SQL Editor —
//       the JS client cannot write to auth.users even with the service role key.
const serviceClient = SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, { realtime: { transport: WebSocket } })
  : null;

// ─── Test user config ───────────────────────────────────
const PASSWORD = 'Test123!';
const TS = Date.now().toString(36).slice(-4).toUpperCase();

const ROLES = [
  { role: 'new_joinee',       name: 'Arjun New Joinee',       email: `joinee_${TS}@newton.edu` },
  { role: 'lab_instructor',   name: 'Kavita Lab Instructor',  email: `labinstr_${TS}@newton.edu` },
  { role: 'lead_instructor',  name: 'Neha Buddy Mentor',      email: `buddy_${TS}@newton.edu` },
  { role: 'academic_head',    name: 'Dr. Priya Academic Head',email: `manager_${TS}@newton.edu` },
  { role: 'onboarding_lead',  name: 'Ravi Onboarding Lead',   email: `onboard_${TS}@newton.edu` },
  { role: 'acad_ops',         name: 'Suresh Acad Ops',        email: `acadops_${TS}@newton.edu` },
];

// ─── Main ───────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     CREATE 1 TEST USER PER ROLE (×6)        ║');
  if (serviceClient) {
    console.log('║     🔑 Service-role key detected            ║');
  } else {
    console.log('║     ⚠ No service-role — SQL fallback        ║');
  }
  console.log('╚══════════════════════════════════════════════╝\n');

  const createdUsers = [];

  for (const { role, name, email } of ROLES) {
    console.log(`Creating ${role} → ${name}`);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: PASSWORD,
        options: {
          data: { full_name: name, role },
        },
      });

      if (error) {
        // If user already exists, try to fetch it
        if (error.message.includes('already exists') || error.message.includes('already registered')) {
          console.log(`   ⚠ Already exists, attempting to fetch...`);
          const { data: signIn } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
          if (signIn?.user) {
            createdUsers.push({ id: signIn.user.id, email, name, role });
            console.log(`   ✅ Fetched existing user`);
          } else {
            console.log(`   ⚠ Could not fetch: ${error.message}`);
          }
        } else {
          console.log(`   ❌ ${error.message}`);
        }
        continue;
      }

      if (!data?.user) {
        console.log(`   ❌ No user returned (rate-limited or network error)`);
        continue;
      }

      createdUsers.push({ id: data.user.id, email, name, role });
      console.log(`   ✅ User ID: ${data.user.id}`);
    } catch (err) {
      console.log(`   ❌ ${err.message}`);
    }
  }

  // ─── If service client is available, upsert profiles (bypass RLS) ──
  if (serviceClient && createdUsers.length > 0) {
    console.log('\n📋 Service-role: upserting user profiles...\n');
    for (const u of createdUsers) {
      const { error: upsertErr } = await serviceClient
        .from('user_profiles')
        .upsert({
          id: u.id,
          email: u.email,
          full_name: u.name,
          role: u.role,
        }, { onConflict: 'id' });

      if (upsertErr) {
        console.log(`   ⚠ ${u.name}: profile upsert failed — ${upsertErr.message}`);
      } else {
        console.log(`   ✅ ${u.name}: profile upserted`);
      }
    }
    console.log('');
  }

  // ─── Print SQL to confirm emails (always needed — JS client can't write auth.users) ──
  if (createdUsers.length > 0) {
    console.log('📋 RUN THIS SQL IN SUPABASE SQL EDITOR to confirm emails:');
    console.log('────────────────────────────────────────────────────');
    const emails = createdUsers.map(u => `'${u.email}'`).join(',');
    console.log(`UPDATE auth.users SET email_confirmed_at = NOW()`);
    console.log(`  WHERE email IN (${emails});`);
    console.log('');
    // Also insert profiles if the auto-trigger and service role both failed
    if (!serviceClient) {
      console.log('-- (Optional) Insert profiles if the auto-trigger failed:');
      console.log('INSERT INTO user_profiles (id, email, full_name, role) VALUES');
      createdUsers.forEach((u, i) => {
        const comma = i < createdUsers.length - 1 ? ',' : ';';
        console.log(`  ('${u.id}', '${u.email}', '${u.name}', '${u.role}')${comma}`);
      });
      console.log('ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;');
    }
    console.log('────────────────────────────────────────────────────\n');
  } else {
    console.log('\n-- No users were created. Check errors above.\n');
  }

  // ─── Print credentials ──────────────────────────────
  console.log('═══════════════════════════════════════════════');
  console.log('            TEST USER CREDENTIALS');
  console.log('═══════════════════════════════════════════════');
  console.log(`Password for all users: ${PASSWORD}\n`);
  console.log('Role                │ Email                              │ Name');
  console.log('────────────────────┼────────────────────────────────────┼──────────────────────────');
  for (const u of createdUsers) {
    const roleLabel = u.role.padEnd(18);
    const emailLabel = u.email.padEnd(34);
    console.log(` ${roleLabel}│ ${emailLabel}│ ${u.name}`);
  }

  console.log(`\n✅ Created ${createdUsers.length}/${ROLES.length} users`);
  console.log('(Sign in at your deployed app or localhost)');
}

main().catch(err => {
  console.error('\n❌ FATAL:', err.message);
  process.exit(1);
});
