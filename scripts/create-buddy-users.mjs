// =============================================================================
// Create 6 Buddy Users
// =============================================================================
// Usage:  node scripts/create-buddy-users.mjs
//
// Creates auth users with signup, then prints SQL to:
//   1. Confirm emails
//   2. Set role to lead_instructor (buddy)
//   3. Set full_name with "_buddy" suffix
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

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { realtime: { transport: WebSocket } }
);

const SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const serviceClient = SERVICE_KEY
  ? createClient(
      process.env.VITE_SUPABASE_URL,
      SERVICE_KEY,
      { realtime: { transport: WebSocket } }
    )
  : null;

// ─── Buddy users config ─────────────────────────────────
const TS = Date.now().toString(36).slice(-4).toUpperCase();

const BUDDIES = [
  { name: 'shubham_buddy', email: `shubham.${TS}@newtonschool.co` },
  { name: 'priyanshu_buddy', email: `priyanshu.${TS}@newtonschool.co` },
  { name: 'aadarsh_buddy', email: `aadarsh.${TS}@newtonschool.co` },
  { name: 'akshay_buddy', email: `akshay.${TS}@newtonschool.co` },
  { name: 'akshit_buddy', email: `akshit.${TS}@newtonschool.co` },
  { name: 'deeksha_buddy', email: `deeksha.${TS}@newtonschool.co` },
];

// Standardized QA password (BUG-4) — every seed script uses Test123!.
const PASSWORD = 'Test123!';

// ─── Main ───────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║        CREATE 6 BUDDY USERS                 ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const createdUsers = [];

  for (const bud of BUDDIES) {
    console.log(`Creating ${bud.name} → ${bud.email}`);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: bud.email,
        password: PASSWORD,
        options: {
          data: { full_name: bud.name, role: 'lead_instructor' },
        },
      });

      if (error) {
        if (error.message.includes('already exists') || error.message.includes('already registered')) {
          console.log(`   ⚠ Already exists, trying to fetch...`);
          const { data: signIn } = await supabase.auth.signInWithPassword({ email: bud.email, password: PASSWORD });
          if (signIn?.user) {
            createdUsers.push({ id: signIn.user.id, name: bud.name, email: bud.email });
            console.log(`   ✅ Fetched existing user — ID: ${signIn.user.id}`);
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

      createdUsers.push({ id: data.user.id, name: bud.name, email: bud.email });
      console.log(`   ✅ Created — ID: ${data.user.id}`);
    } catch (err) {
      console.log(`   ❌ ${err.message}`);
    }
  }

  // ─── Service role upsert if available ────────────────
  if (serviceClient && createdUsers.length > 0) {
    console.log('\n📋 Service-role: upserting user profiles...\n');
    for (const u of createdUsers) {
      const { error: upsertErr } = await serviceClient
        .from('user_profiles')
        .upsert({
          id: u.id,
          email: u.email,
          full_name: u.name,
          role: 'lead_instructor',
        }, { onConflict: 'id' });

      if (upsertErr) {
        console.log(`   ⚠ ${u.name}: profile upsert failed — ${upsertErr.message}`);
      } else {
        console.log(`   ✅ ${u.name}: profile upserted`);
      }
    }
    console.log('');
  }

  // ─── Print SQL — always needed for email confirmation + fallback profiles ──
  if (createdUsers.length > 0) {
    console.log('📋 RUN THIS SQL IN SUPABASE SQL EDITOR:');
    console.log('────────────────────────────────────────────────────');
    console.log('-- 1. Confirm emails');
    const emails = createdUsers.map(u => `'${u.email}'`).join(',');
    console.log(`UPDATE auth.users SET email_confirmed_at = NOW()`);
    console.log(`  WHERE email IN (${emails});`);
    console.log('');

    if (!serviceClient) {
      console.log('-- 2. Insert/update profiles (skip if service role already did this)');
      console.log('INSERT INTO user_profiles (id, email, full_name, role) VALUES');
      createdUsers.forEach((u, i) => {
        const comma = i < createdUsers.length - 1 ? ',' : ';';
        console.log(`  ('${u.id}', '${u.email}', '${u.name}', 'lead_instructor')${comma}`);
      });
      console.log('ON CONFLICT (id) DO UPDATE SET role = \'lead_instructor\', full_name = EXCLUDED.full_name;');
    }

    // Print the clean emails table INSERTS as well just in case
    if (serviceClient) {
      console.log('-- 2. (Optional) Re-run if profiles were somehow not created:');
      console.log('INSERT INTO user_profiles (id, email, full_name, role) VALUES');
      createdUsers.forEach((u, i) => {
        const comma = i < createdUsers.length - 1 ? ',' : ';';
        console.log(`  ('${u.id}', '${u.email}', '${u.name}', 'lead_instructor')${comma}`);
      });
      console.log('ON CONFLICT (id) DO UPDATE SET role = \'lead_instructor\', full_name = EXCLUDED.full_name;');
    }
    console.log('────────────────────────────────────────────────────\n');
  } else {
    console.log('\n-- No users were created. Check errors above.\n');
  }

  // ─── Print credentials ──────────────────────────────
  console.log('═══════════════════════════════════════════════');
  console.log('            BUDDY USER CREDENTIALS');
  console.log('═══════════════════════════════════════════════');
  console.log(`Password for ALL users: ${PASSWORD}\n`);
  console.log('Full Name          │ Email');
  console.log('───────────────────┼────────────────────────────────────────────');
  for (const u of createdUsers) {
    const nameLabel = u.name.padEnd(18);
    console.log(` ${nameLabel}│ ${u.email}`);
  }

  console.log(`\n✅ Created ${createdUsers.length}/${BUDDIES.length} buddy users`);
  console.log('(Run the SQL above to confirm emails + set profiles)');
}

main().catch(err => {
  console.error('\n❌ FATAL:', err.message);
  process.exit(1);
});
