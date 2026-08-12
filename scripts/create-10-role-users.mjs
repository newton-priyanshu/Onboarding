// =============================================================================
// CREATE 10 TEST USERS — one per role (incl. super_admin)
// =============================================================================
// Uses the service role key (VITE_SUPABASE_SERVICE_ROLE_KEY in .env) to:
//   1. Create the auth user (email auto-confirmed)
//   2. Upsert user_profiles with role + campus_id (bypasses RLS)
//   3. Sync role into auth.users app_metadata so JWT claims match
//
// Usage:  node scripts/create-10-role-users.mjs
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
  console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env');
  process.exit(1);
}
if (!process.env.VITE_SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing VITE_SUPABASE_SERVICE_ROLE_KEY in .env — required for role/campus assignment');
  process.exit(1);
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const PASSWORD = 'Test123!';
const TS = Date.now().toString(36).slice(-4).toUpperCase();

const svc = createClient(SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY, {
  realtime: { transport: WebSocket },
});

// ─── Target campus: default campus ──────────────────────
// (Looked up live so the script stays correct across environments)
let DEFAULT_CAMPUS_ID = null;

// ─── The 10 roles ───────────────────────────────────────
const ROLES = [
  { role: 'super_admin',       name: 'Aarav Super Admin',       email: `e2e.superadmin_${TS}@newton.edu` },
  { role: 'campus_head',       name: 'Bhavna Campus Head',      email: `e2e.campushead_${TS}@newton.edu` },
  { role: 'academic_head',     name: 'Dr. Chirag Academic Head',email: `e2e.academichead_${TS}@newton.edu` },
  { role: 'progression_head',  name: 'Deepa Progression Head',  email: `e2e.progressionhead_${TS}@newton.edu` },
  { role: 'ops_head',          name: 'Eshan Ops Head',          email: `e2e.opshead_${TS}@newton.edu` },
  { role: 'campus_admin',      name: 'Farah Campus Admin',      email: `e2e.campusadmin_${TS}@newton.edu` },
  { role: 'onboarding_lead',   name: 'Gaurav Onboarding Lead',  email: `e2e.onboardinglead_${TS}@newton.edu` },
  { role: 'lead_instructor',   name: 'Hina Buddy Mentor',       email: `e2e.buddy_${TS}@newton.edu` },
  { role: 'lab_instructor',    name: 'Ishaan Lab Instructor',   email: `e2e.labinstructor_${TS}@newton.edu` },
  { role: 'new_joinee',        name: 'Jaya New Joinee',         email: `e2e.joinee_${TS}@newton.edu` },
];

// ─── Helpers ────────────────────────────────────────────

async function createUser(role, name, email) {
  // Try to create via admin API (email auto-confirmed with email_confirm: true).
  // campus_id goes into app_metadata because RLS get_user_campus() reads the
  // JWT claim — user_profiles alone does not reach the JWT.
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: name, role, campus_id: DEFAULT_CAMPUS_ID },
    app_metadata: { role, campus_id: DEFAULT_CAMPUS_ID },
  });
  if (error) {
    // Only treat as "already exists" when the API actually says so — anything
    // else (rate limit, invalid email) should surface loudly.
    const msg = error.message || '';
    const alreadyExists = /already (exists|registered|been used)/i.test(msg) || msg.includes('already');
    if (alreadyExists) {
      const { data: existing } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = existing?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
      if (found) return found;
    }
    throw new Error(`${role} createUser: ${error.message}`);
  }
  return data.user;
}

async function setProfile(userId, email, name, role) {
  const { error } = await svc.from('user_profiles').upsert(
    {
      id: userId,
      email,
      full_name: name,
      role,
      campus_id: DEFAULT_CAMPUS_ID,
    },
    { onConflict: 'id' }
  );
  if (error) throw new Error(`profile upsert ${role}: ${error.message}`);
}

// ─── Main ───────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   CREATE 10 TEST USERS — ALL ROLES + SUPER ADMIN     ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // Resolve default campus
  const { data: campuses, error: campErr } = await svc
    .from('campuses')
    .select('id, name, slug')
    .order('created_at', { ascending: true });
  if (campErr) throw new Error(`list campuses: ${campErr.message}`);

  const defaultCampus = campuses?.find(c => c.slug === 'default') || campuses?.[0];
  if (!defaultCampus) throw new Error('No campus found — run the multi-tenant migration first');
  DEFAULT_CAMPUS_ID = defaultCampus.id;
  console.log(`🏫 Campus: ${defaultCampus.name} (${defaultCampus.slug}) — ${DEFAULT_CAMPUS_ID}\n`);

  const created = [];
  for (const { role, name, email } of ROLES) {
    try {
      const user = await createUser(role, name, email);
      await setProfile(user.id, email, name, role);
      created.push({ id: user.id, email, name, role });
      console.log(`  ✅ ${role.padEnd(18)} ${email}`);
    } catch (err) {
      console.log(`  ❌ ${role.padEnd(18)} ${err.message}`);
    }
  }

  // ─── Credentials ──────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════');
  console.log('            TEST USER CREDENTIALS');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Password for all users: ${PASSWORD}\n`);
  console.log('Role                │ Email                              │ Name');
  console.log('────────────────────┼────────────────────────────────────┼──────────────────────────');
  for (const u of created) {
    console.log(` ${u.role.padEnd(18)}│ ${u.email.padEnd(34)}│ ${u.name}`);
  }
  console.log(`\n✅ Created ${created.length}/${ROLES.length} users`);
}

main().catch(err => {
  console.error('\n❌ FATAL:', err.message);
  process.exit(1);
});
