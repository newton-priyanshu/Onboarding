// =============================================================================
// Phase 10 — Cross-campus RLS isolation validation (live DB)
// =============================================================================
// Usage:
//   node scripts/validate_rls_isolation.mjs
//   node scripts/validate_rls_isolation.mjs --campus-a <slug> --campus-b <slug>
//   node scripts/validate_rls_isolation.mjs --cleanup
//
// What it does:
//   1. Loads .env (VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY)
//   2. Picks two active campuses (default: first two found; override with flags)
//   3. Creates (or signs in to) one test user per campus via signup, with the
//      campus_id passed in user_metadata so handle_new_user assigns it
//   4. Signs both in and asserts cross-campus isolation:
//        - User A cannot see User B's profile row
//        - User A cannot see any campus-B profiles
//        - User A cannot see User B's worksheet_submissions
//        - User A cannot update User B's profile (RLS blocks → 0 rows)
//        - User A cannot insert a submission for User B (WITH CHECK blocks)
//        - User A's get_user_campus() == campus A, assert_campus_access(campus B) raises
//   5. If VITE_SUPABASE_SERVICE_ROLE_KEY is present, also validates that the
//      service role CAN read across campuses (RLS bypass works as designed)
//   5.6 Campus admin scoped management: promotes user A to campus_admin via the
//      service key, re-auths for a fresh JWT, verifies own-campus read/update
//      works while cross-campus read/update + assert_campus_access are denied,
//      then restores the original role
//   6. Prints PASS/FAIL per check and exits 1 if any check failed
//
// Safe to re-run: users are created idempotently (signup → sign-in fallback)
// and the script never mutates another user's rows.
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import { WebSocket } from 'ws';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── Load .env ──────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');

if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
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

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey) {
  console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env');
  process.exit(1);
}

// ─── Parse args ─────────────────────────────────────────
const args = process.argv.slice(2);
const flagValue = (name) => {
  const idx = args.indexOf(name);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
};
const campusASlug = flagValue('--campus-a');
const campusBSlug = flagValue('--campus-b');
const CLEANUP = args.includes('--cleanup');

const PASSWORD = 'Test123!';
const TS = Date.now().toString(36).slice(-4).toUpperCase();

// ─── Clients ────────────────────────────────────────────
const anon = createClient(url, anonKey, { realtime: { transport: WebSocket } });
const service = serviceKey
  ? createClient(url, serviceKey, { realtime: { transport: WebSocket } })
  : null;

// ─── Test harness ───────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`   ✅ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`   ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function signInOrCreate(email, fullName, campusId) {
  // Try sign-in first (idempotent re-runs)
  const { data: signedIn, error: signInErr } = await anon.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (!signInErr && signedIn?.user) {
    return { id: signedIn.user.id, email, existing: true };
  }

  // Fall back to signup with campus_id in user_metadata
  const { data, error } = await anon.auth.signUp({
    email,
    password: PASSWORD,
    options: { data: { full_name: fullName, campus_id: campusId } },
  });
  if (error) {
    throw new Error(`signUp ${email}: ${error.message}`);
  }
  if (!data?.user) {
    throw new Error(`signUp ${email}: no user returned`);
  }
  return { id: data.user.id, email, existing: false };
}

// ─── Main ───────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Phase 10 — Cross-campus RLS Isolation Validation    ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // ── 1. Fetch active campuses ──────────────────────────
  console.log('── Step 1: Discover campuses ──');
  let campuses = [];
  try {
    const { data, error } = await anon.rpc('get_active_campuses');
    if (!error && Array.isArray(data) && data.length > 0) {
      campuses = data;
    }
  } catch { /* fall through to direct query */ }

  if (campuses.length === 0) {
    const { data, error } = await anon
      .from('campuses')
      .select('id, name, slug, is_active')
      .eq('is_active', true);
    if (!error && data) campuses = data;
  }

  console.log(`   Found ${campuses.length} active campus(es)`);
  if (campuses.length < 2) {
    console.error('❌ Need at least 2 active campuses to validate isolation.');
    console.error('   Seed a second campus or pass --campus-a/--campus-b with existing slugs.');
    process.exit(1);
  }

  const pick = (slug) => {
    if (!slug) return null;
    const found = campuses.find(c => c.slug === slug);
    if (!found) console.warn(`⚠️  Requested campus "${slug}" not found — using first available`);
    return found;
  };

  const campusA = pick(campusASlug) ?? campuses[0];
  const campusB = pick(campusBSlug) ?? campuses.find(c => c.id !== campusA.id) ?? campuses[1];

  console.log(`   Campus A: ${campusA.slug} (${campusA.id})`);
  console.log(`   Campus B: ${campusB.slug} (${campusB.id})`);

  // ── 2. Create / sign in test users ────────────────────
  console.log('\n── Step 2: Provision test users ──');
  const emailA = `rls_a_${TS}@newton.edu`;
  const emailB = `rls_b_${TS}@newton.edu`;
  let userA;
  let userB;
  try {
    userA = await signInOrCreate(emailA, 'RLS Test User A', campusA.id);
    userB = await signInOrCreate(emailB, 'RLS Test User B', campusB.id);
  } catch (err) {
    console.error(`❌ Provisioning failed: ${err.message}`);
    process.exit(1);
  }
  console.log(`   User A: ${emailA} (${userA.existing ? 'existing' : 'new'})`);
  console.log(`   User B: ${emailB} (${userB.existing ? 'existing' : 'new'})`);

  // ── 3. Sign both users in ─────────────────────────────
  console.log('\n── Step 3: Authenticate ──');
  const sessions = {};
  for (const [tag, u] of [['A', userA], ['B', userB]]) {
    const { data, error } = await anon.auth.signInWithPassword({ email: u.email, password: PASSWORD });
    if (error) {
      console.error(`❌ Sign-in failed for user ${tag} (${u.email}): ${error.message}`);
      process.exit(1);
    }
    sessions[tag] = createClient(url, anonKey, {
      realtime: { transport: WebSocket },
      global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    });
  }
  console.log('   ✅ Both users authenticated');

  // ── 4. Verify campus assignment ───────────────────────
  console.log('\n── Step 4: Verify profile campus_id ──');
  for (const [tag, u, expected] of [['A', userA, campusA.id], ['B', userB, campusB.id]]) {
    const { data } = await sessions[tag]
      .from('user_profiles')
      .select('id, campus_id, role')
      .eq('id', u.id)
      .maybeSingle();
    check(
      `User ${tag} profile campus_id == ${tag === 'A' ? 'campus A' : 'campus B'}`,
      data?.campus_id === expected,
      `got ${data?.campus_id ?? 'NULL'}`
    );
  }

  // ── 5. Cross-campus isolation checks ──────────────────
  console.log('\n── Step 5: Cross-campus isolation (User A ←→ User B) ──');

  // 5a. A cannot see B's profile row
  const { data: bProfileSeen } = await sessions.A
    .from('user_profiles')
    .select('id')
    .eq('id', userB.id);
  check('A cannot read B\'s profile row', !bProfileSeen || bProfileSeen.length === 0);

  // 5b. A cannot see any campus-B profiles
  const { data: campusBProfiles } = await sessions.A
    .from('user_profiles')
    .select('id, campus_id')
    .eq('campus_id', campusB.id);
  check('A cannot read any campus-B profiles', !campusBProfiles || campusBProfiles.length === 0);

  // 5c. B's submissions invisible to A — seed one for B first (B can self-insert)
  const { error: seedErr } = await sessions.B
    .from('worksheet_submissions')
    .insert({
      user_id: userB.id,
      worksheet_id: 'p1_w1',
      worksheet_data: { test: true },
      phase: 'phase1',
      status: 'Not Started',
      review_status: 'pending_review',
      campus_id: campusB.id,
    });
  check('B can self-insert a submission (setup)', !seedErr, seedErr?.message ?? '');

  const { data: bSubsSeen } = await sessions.A
    .from('worksheet_submissions')
    .select('id')
    .eq('user_id', userB.id);
  check('A cannot read B\'s worksheet_submissions', !bSubsSeen || bSubsSeen.length === 0);

  // 5d. A cannot update B's profile (RLS blocks → 0 rows affected)
  // NOTE: .select('id') is required — without it supabase-js returns data:null
  // whether RLS allowed or blocked the update, and the check would always pass.
  const { data: updData, error: updErr } = await sessions.A
    .from('user_profiles')
    .update({ full_name: 'HACKED' })
    .eq('id', userB.id)
    .select('id');
  const updateBlocked = !updErr && (!updData || updData.length === 0);
  check('A cannot update B\'s profile', updateBlocked, updErr?.message ?? '');

  // 5e. A cannot insert a submission claiming to be B (WITH CHECK auth.uid() = user_id)
  const { error: insertErr } = await sessions.A
    .from('worksheet_submissions')
    .insert({
      user_id: userB.id,
      worksheet_id: 'p1_w2',
      worksheet_data: { forged: true },
      phase: 'phase1',
      status: 'Not Started',
      review_status: 'pending_review',
      campus_id: campusB.id,
    });
  check('A cannot insert a submission for B (forge)', !!insertErr, insertErr?.message ?? '');

  // 5f. A cannot create a notification for B
  const { error: notifErr } = await sessions.A
    .from('notifications')
    .insert({
      user_id: userB.id,
      type: 'submitted',
      message: 'forged',
      worksheet_id: 'p1_w1',
      campus_id: campusB.id,
    });
  check('A cannot insert a notification for B', !!notifErr, notifErr?.message ?? '');

  // 5g. get_user_campus() RPC returns A's campus
  const { data: userCampus } = await sessions.A.rpc('get_user_campus');
  check('A\'s get_user_campus() == campus A', userCampus === campusA.id, `got ${userCampus ?? 'NULL'}`);

  // 5h. assert_campus_access(campus B) raises for A
  const { error: assertErr } = await sessions.A.rpc('assert_campus_access', {
    target_campus_id: campusB.id,
  });
  check('assert_campus_access(campus B) denied for A', !!assertErr, assertErr?.message ?? '');

  // 5i. A can still read their own profile (baseline sanity)
  const { data: ownProfile } = await sessions.A
    .from('user_profiles')
    .select('id')
    .eq('id', userA.id);
  check('A can read own profile (control)', ownProfile?.length === 1);

  // 5j. A cannot read campus B's onboarding templates
  // ("Users can read campus templates" policy: campus_id = get_user_campus())
  // NOTE: only meaningful if campus B actually has template rows, so when a
  // service key is present we seed one first (cleaned up after) — otherwise
  // this is best-effort and only catches a leak if rows already exist.
  let seededTemplateId = null;
  if (service) {
    const { data: seeded, error: seedTplErr } = await service
      .from('onboarding_templates')
      .insert({
        campus_id: campusB.id,
        name: `RLS Test Template ${TS}`,
        description: 'temporary template for isolation validation',
        structure: { weeks: [], phases: [], gateArtifacts: {} },
        approval_chain: ['lead_instructor', 'academic_head'],
        is_active: true,
        is_default: false,
      })
      .select('id')
      .single();
    if (!seedTplErr && seeded) {
      seededTemplateId = seeded.id;
      console.log('   ℹ️  Seeded campus-B template so the read-isolation check exercises RLS');
    } else {
      console.log(`   ⚠️  Could not seed campus-B template (${seedTplErr?.message ?? 'unknown'}) — check is best-effort`);
    }
  }

  const { data: bTemplates, error: bTplErr } = await sessions.A
    .from('onboarding_templates')
    .select('id')
    .eq('campus_id', campusB.id);
  check('A cannot read campus-B onboarding_templates', !bTemplates || bTemplates.length === 0, bTplErr?.message ?? '');

  // Clean up the seeded template (non-fatal if it fails)
  if (seededTemplateId) {
    const { error: delErr } = await service
      .from('onboarding_templates')
      .delete()
      .eq('id', seededTemplateId);
    if (delErr) console.log(`   ⚠️  Failed to clean up seeded template: ${delErr.message}`);
  }

  // 5k. Control: A's own-campus template query must succeed without error
  // (asserts the template read path works for a user, not just that no rows leak)
  const { data: aTemplates, error: aTplErr } = await sessions.A
    .from('onboarding_templates')
    .select('id')
    .eq('campus_id', campusA.id);
  check('A can query campus-A onboarding_templates (control, no error)', !aTplErr, aTplErr?.message ?? `returned ${aTemplates?.length ?? 0} row(s)`);

  // ── 5.6 Campus admin scoped management ────────────────
  console.log('\n── Step 5.6: Campus admin scoped user management ──');
  if (service) {
    // Promote user A to campus_admin (user_profiles.role + app_metadata so
    // the fresh JWT carries the role claim the RLS policies read).
    const { data: origRoleRow } = await sessions.A
      .from('user_profiles')
      .select('role')
      .eq('id', userA.id)
      .maybeSingle();
    const originalRole = origRoleRow?.role || 'new_joinee';

    const { error: roleUpdErr } = await service
      .from('user_profiles')
      .update({ role: 'campus_admin' })
      .eq('id', userA.id);
    const { error: metaErr } = await service.auth.admin.updateUserById(userA.id, {
      app_metadata: { role: 'campus_admin' },
    });
    check('Promote user A to campus_admin (setup)', !roleUpdErr && !metaErr, roleUpdErr?.message ?? metaErr?.message ?? '');

    // Re-auth to mint a JWT carrying the campus_admin app_metadata claim.
    const { data: caSignIn, error: caErr } = await anon.auth.signInWithPassword({ email: userA.email, password: PASSWORD });
    if (caErr || !caSignIn?.session) {
      check('Campus-admin sign-in (setup)', false, caErr?.message ?? 'no session');
    } else {
      const adminSession = createClient(url, anonKey, {
        realtime: { transport: WebSocket },
        global: { headers: { Authorization: `Bearer ${caSignIn.session.access_token}` } },
      });

      // 5.6a. Control: can read own-campus profiles
      const { data: ownProfiles, error: ownErr } = await adminSession
        .from('user_profiles')
        .select('id, campus_id')
        .eq('campus_id', campusA.id);
      check('Campus admin can read own-campus profiles', !ownErr && (ownProfiles?.length ?? 0) >= 1, ownErr?.message ?? `${ownProfiles?.length ?? 0} rows`);

      // 5.6b. Cannot read other-campus profiles
      const { data: otherProfiles, error: otherErr } = await adminSession
        .from('user_profiles')
        .select('id, campus_id')
        .eq('campus_id', campusB.id);
      check('Campus admin cannot read other-campus profiles', !otherErr && (!otherProfiles || otherProfiles.length === 0), otherErr?.message ?? '');

      // 5.6c. Control: can update a user in their own campus
      const { data: updOwn, error: updOwnErr } = await adminSession
        .from('user_profiles')
        .update({ full_name: 'Admin Managed' })
        .eq('id', userA.id)
        .select('id');
      check('Campus admin can update own-campus user', !updOwnErr && (updOwn?.length ?? 0) === 1, updOwnErr?.message ?? '');

      // 5.6d. Cannot update a user in another campus (0 rows affected)
      const { data: updOther, error: updOtherErr } = await adminSession
        .from('user_profiles')
        .update({ full_name: 'HACKED' })
        .eq('id', userB.id)
        .select('id');
      check('Campus admin cannot update other-campus user', !updOtherErr && (!updOther || updOther.length === 0), updOtherErr?.message ?? '');

      // 5.6e. assert_campus_access(campus B) still denied for the campus admin
      const { error: caAssertErr } = await adminSession.rpc('assert_campus_access', {
        target_campus_id: campusB.id,
      });
      check('assert_campus_access(campus B) denied for campus admin', !!caAssertErr, caAssertErr?.message ?? '');
    }

    // Restore user A's original role so re-runs stay consistent.
    await service.from('user_profiles').update({ role: originalRole }).eq('id', userA.id);
    await service.auth.admin.updateUserById(userA.id, { app_metadata: { role: originalRole } });
    console.log('   ℹ️  Restored user A to original role');
  } else {
    console.log('   ℹ️  No VITE_SUPABASE_SERVICE_ROLE_KEY — skipping campus-admin scoping checks');
  }

  // ── 6. Super admin / service-role bypass ──────────────
  console.log('\n── Step 6: Super admin cross-campus access ──');
  if (service) {
    const { data: allProfiles, error: svcErr } = await service
      .from('user_profiles')
      .select('id, campus_id')
      .in('campus_id', [campusA.id, campusB.id]);
    check('Service role can read both campuses (bypass)', !svcErr && (allProfiles?.length ?? 0) >= 2, svcErr?.message ?? `${allProfiles?.length ?? 0} rows`);

    const { data: bProfilesViaSvc } = await service
      .from('user_profiles')
      .select('id')
      .eq('campus_id', campusB.id);
    check('Service role sees campus-B profiles (super admin view)', (bProfilesViaSvc?.length ?? 0) >= 1);
  } else {
    console.log('   ℹ️  No VITE_SUPABASE_SERVICE_ROLE_KEY — skipping service-role bypass checks');
    console.log('       (add the key to .env to validate the super-admin cross-campus path)');
  }

  // ── 7. Cleanup (optional) ─────────────────────────────
  if (CLEANUP) {
    console.log('\n── Step 7: Cleanup ──');
    if (service) {
      for (const u of [userA, userB]) {
        const { error } = await service.auth.admin.deleteUser(u.id);
        console.log(`   ${error ? '⚠️  Failed to delete' : '✅ Deleted'} ${u.email}${error ? `: ${error.message}` : ''}`);
      }
    } else {
      console.log('   ℹ️  Cleanup needs the service role key — users left in place.');
    }
  }

  // ── Summary ───────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log(`   PASSED: ${passed}   FAILED: ${failed}`);
  if (failed > 0) {
    console.log('\n   Failures:');
    for (const f of failures) console.log(`     ❌ ${f}`);
  }
  if (passed === 0 && failed === 0) {
    console.log('   ⚠️  No checks ran — something went wrong earlier.');
  }
  console.log('══════════════════════════════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\n❌ FATAL:', err.message);
  process.exit(1);
});
