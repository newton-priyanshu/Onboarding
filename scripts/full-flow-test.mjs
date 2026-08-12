// =============================================================================
// FULL FLOW TEST — All 10 Roles, Approval/Rejection, Negative Tests
// =============================================================================
// Uses the 10 e2e users created by scripts/create-10-role-users.mjs (looked up
// live by role — most recently created e2e user per role). Signs in as each
// user to satisfy RLS (anon key), using the service key only for setup that
// RLS legitimately forbids (assignment fallback) and for verification reads.
//
// Flow:
//   1. Look up the 10 e2e users + campuses
//   2. Verify every user can sign in with their role JWT
//   3. Assign buddy + manager to the joinee (real academic_head path first)
//   4. Joinee submits worksheets (p1_w1, p1_w3)
//   5. Buddy approves p1_w1 → buddy_approved
//   6. Manager approves p1_w1 → approved
//   7. Rejection cycle: buddy requests revision on p1_w3 → needs_revision,
//      joinee resubmits → revision_submitted, buddy approves → buddy_approved
//   8. Negative tests:
//      a. joinee cannot force own review_status to 'approved'
//      b. joinee cannot insert a submission for another user (forge)
//      c. joinee cannot change own role (privilege escalation)
//      d. onboarding_lead cannot update a submission (read-only role)
//      e. campus_head of campus A cannot read campus B submissions
//      f. super_admin can read any campus submissions
//      g. a user cannot forge a notification for another user
//
// Usage: node scripts/full-flow-test.mjs
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

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = 'Test123!';

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('❌ Need VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const svc = createClient(SUPABASE_URL, SERVICE_KEY, { realtime: { transport: WebSocket } });

let failures = 0;
let passes = 0;
const results = [];

function record(name, ok, detail) {
  if (ok) passes++;
  else failures++;
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Full error body for diagnostics (PostgREST errors often hide the message). */
function errDetail(err) {
  if (!err) return undefined;
  return JSON.stringify(err);
}

/** Small delay between logins to stay under anon-auth rate limits. */
const sleep = ms => new Promise(r => setTimeout(r, ms));

function check(name, condition, detail) {
  record(name, !!condition, detail);
}

/** Fresh anon client signed in as a user. */
async function loginAs(email) {
  const client = createClient(SUPABASE_URL, ANON_KEY, { realtime: { transport: WebSocket } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`Login ${email}: ${error.message}`);
  return { client, user: data.user };
}

// ─── Main ───────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║        FULL FLOW TEST — 10 ROLES + NEGATIVE TESTS        ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── STEP 1: Look up e2e users + campuses ──────────────────────────
  console.log('─── STEP 1: Locate e2e users & campuses ───\n');
  const { data: profiles, error: profErr } = await svc
    .from('user_profiles')
    .select('id, email, full_name, role, campus_id')
    .ilike('email', 'e2e.%')
    .order('created_at', { ascending: false });
  if (profErr) throw new Error(`profiles lookup: ${profErr.message}`);

  const { data: campuses, error: campErr } = await svc.from('campuses').select('id, name, slug');
  if (campErr) throw new Error(`campuses lookup: ${campErr.message}`);
  const defaultCampus = campuses?.find(c => c.slug === 'default') || campuses?.[0];

  // Pick the most recent e2e user per role
  const wanted = ['super_admin', 'campus_head', 'academic_head', 'progression_head', 'ops_head', 'campus_admin', 'onboarding_lead', 'lead_instructor', 'lab_instructor', 'new_joinee'];
  const users = {};
  for (const role of wanted) {
    const u = profiles?.find(p => p.role === role);
    if (!u) { console.log(`  ❌ No e2e user for role ${role}`); failures++; continue; }
    users[role] = u;
    console.log(`  ✅ ${role.padEnd(16)} ${u.email}`);
  }
  console.log('');

  const joinee = users.new_joinee;
  const buddy = users.lead_instructor;
  const manager = users.academic_head;
  const superAdmin = users.super_admin;
  const campusAdmin = users.campus_admin;
  const onboardingLead = users.onboarding_lead;
  const labInstr = users.lab_instructor;

  // Fail fast if any required role is missing — don't crash mid-flow on undefined.
  const required = [joinee, buddy, manager, superAdmin, campusAdmin, onboardingLead, labInstr];
  if (required.some(u => !u)) {
    console.error('❌ Missing required e2e user — run scripts/create-10-role-users.mjs first');
    process.exit(1);
  }

  // ── STEP 2: Every user can sign in ─────────────────────────────────
  console.log('─── STEP 2: Sign-in for every role ───\n');
  for (const role of wanted) {
    const u = users[role];
    if (!u) continue;
    try {
      await loginAs(u.email);
      check(`sign-in ${role}`, true);
    } catch (err) {
      check(`sign-in ${role}`, false, err.message);
    }
    await sleep(400);
  }
  console.log('');

  // ── STEP 3: Assignment (manager & buddy → joinee + lab instructor) ──
  console.log('─── STEP 3: Assignment ───\n');
  let assignedVia = 'service key';
  try {
    const { client: mgr } = await loginAs(manager.email);
    const { error: aErr } = await mgr.from('user_profiles').update({
      assigned_lead_id: manager.id,
      assigned_buddy_id: buddy.id,
    }).eq('id', joinee.id);
    if (!aErr) {
      assignedVia = 'academic_head RLS path';
    }
  } catch { /* fall through to service key */ }

  for (const target of [joinee, labInstr]) {
    const { error } = await svc.from('user_profiles').update({
      assigned_lead_id: manager.id,
      assigned_buddy_id: buddy.id,
      campus_id: defaultCampus?.id ?? target.campus_id,
    }).eq('id', target.id);
    check(`assign manager+buddy to ${target.full_name}`, !error, errDetail(error));
  }
  // Also put the buddy/manager/reviewers on the default campus if they aren't
  for (const role of ['lead_instructor', 'academic_head', 'onboarding_lead', 'campus_head', 'super_admin', 'campus_admin', 'progression_head', 'ops_head']) {
    const u = users[role];
    if (u && defaultCampus && u.campus_id !== defaultCampus.id) {
      await svc.from('user_profiles').update({ campus_id: defaultCampus.id }).eq('id', u.id);
    }
  }
  console.log(`  ℹ  Assignment path used: ${assignedVia}\n`);

  // ── STEP 4: Joinee submits worksheets ──────────────────────────────
  console.log('─── STEP 4: Worksheet submission ───\n');
  const ws1 = 'p1_w1', ws2 = 'p1_w3';
  // Reset leftover state from earlier runs — rows stuck at 'approved' would
  // block the transition checks below.
  await svc.from('worksheet_submissions').delete().eq('user_id', joinee.id).in('worksheet_id', [ws1, ws2]);
  const { client: jc } = await loginAs(joinee.email);
  for (const [ws, data] of [[ws1, { employeeName: joinee.full_name, mentorName: 'Dr. Sharma', reflections: 'Completed stakeholder mapping.' }],
                            [ws2, { employeeName: joinee.full_name, teachingPhilosophy: 'Student-first', strengths: 'Communication' }]]) {
    const { error } = await jc.from('worksheet_submissions').upsert({
      user_id: joinee.id,
      worksheet_id: ws,
      phase: 'phase-1',
      status: 'submitted',
      review_status: 'pending_review',
      reviewer_type: 'buddy',
      worksheet_data: data,
      due_date: new Date(Date.now() + 7 * 864e5).toISOString().split('T')[0],
      campus_id: defaultCampus?.id ?? joinee.campus_id,
    }, { onConflict: 'user_id,worksheet_id' });
    check(`joinee submits ${ws}`, !error, errDetail(error));
  }
  console.log('');

  // ── STEP 5: Buddy approves p1_w1 → buddy_approved ─────────────────
  console.log('─── STEP 5: Buddy approves ───\n');
  const { client: bc } = await loginAs(buddy.email);
  const buddyApprove = async (ws) => {
    const { error } = await bc.from('worksheet_submissions').update({
      review_status: 'buddy_approved',
      reviewed_by: buddy.id,
      reviewed_at: new Date().toISOString(),
      reviewer_name: buddy.full_name,
      review_comment: 'Good work!',
    }).eq('user_id', joinee.id).eq('worksheet_id', ws);
    return error;
  };
  const bErr1 = await buddyApprove(ws1);
  check(`buddy approves ${ws1} → buddy_approved`, !bErr1, errDetail(bErr1));
  console.log('');

  // ── STEP 6: Manager approves p1_w1 → approved ─────────────────────
  console.log('─── STEP 6: Manager approves ───\n');
  const { client: mc } = await loginAs(manager.email);
  const { error: mErr } = await mc.from('worksheet_submissions').update({
    review_status: 'approved',
    reviewed_by: manager.id,
    reviewed_at: new Date().toISOString(),
    reviewer_name: manager.full_name,
    review_comment: 'Phase-level approval: All worksheets complete.',
  }).eq('user_id', joinee.id).eq('worksheet_id', ws1);
  check(`manager approves ${ws1} → approved`, !mErr, errDetail(mErr));
  console.log('');

  // ── STEP 7: Rejection cycle on p1_w3 ───────────────────────────────
  console.log('─── STEP 7: Rejection → revision → re-approve ───\n');
  // Buddy requests revision on the still-pending worksheet (p1_w3)
  const { error: revErr } = await bc.from('worksheet_submissions').update({
    review_status: 'needs_revision',
    reviewed_by: buddy.id,
    reviewed_at: new Date().toISOString(),
    reviewer_name: buddy.full_name,
    review_comment: 'Please revise the teaching philosophy section.',
  }).eq('user_id', joinee.id).eq('worksheet_id', ws2);
  check(`buddy requests revision on ${ws2} → needs_revision`, !revErr, errDetail(revErr));
  await sleep(400);

  // Joinee resubmits
  const { client: jc2 } = await loginAs(joinee.email);
  const { error: resubErr } = await jc2.from('worksheet_submissions').update({
    status: 'submitted',
    review_status: 'revision_submitted',
    updated_at: new Date().toISOString(),
  }).eq('user_id', joinee.id).eq('worksheet_id', ws2);
  check(`joinee resubmits ${ws2} → revision_submitted`, !resubErr, errDetail(resubErr));
  await sleep(400);

  // Buddy approves again
  const bErr2 = await buddyApprove(ws2);
  check(`buddy re-approves ${ws2} → buddy_approved`, !bErr2, errDetail(bErr2));
  console.log('');

  // ── STEP 8: Negative tests ─────────────────────────────────────────
  console.log('─── STEP 8: Negative tests ───\n');

  // 8a. Joinee cannot force own review_status to 'approved'
  //     (Must be blocked by the validate_review_transition trigger — which the
  //     live DB is MISSING — so an error here is the expected SECURE behavior.)
  const { client: jc3 } = await loginAs(joinee.email);
  const forgeApprove = await jc3.from('worksheet_submissions').update({
    review_status: 'approved',
    reviewer_name: joinee.full_name,
  }).eq('user_id', joinee.id).eq('worksheet_id', ws2).select();
  const forgeApproveBlocked = !!forgeApprove.error
    || (Array.isArray(forgeApprove.data) && forgeApprove.data.length === 0);
  check('joinee cannot self-approve (trigger must block)', forgeApproveBlocked,
    forgeApproveBlocked ? errDetail(forgeApprove.error) : `SELF-APPROVAL PERSISTED — ${JSON.stringify(forgeApprove.data)}`);

  // 8b. Joinee cannot insert a submission for another user (forge)
  const forgeInsert = await jc3.from('worksheet_submissions').insert({
    user_id: manager.id,
    worksheet_id: 'p2_w1',
    phase: 'phase-2',
    status: 'submitted',
    review_status: 'pending_review',
    reviewer_type: 'buddy',
    worksheet_data: { forged: true },
  });
  check('joinee cannot forge a submission for manager', !!forgeInsert.error, forgeInsert.error?.message || 'INSERT succeeded — BUG');

  // 8c. Joinee cannot change own role
  const roleChange = await jc3.from('user_profiles').update({ role: 'academic_head' }).eq('id', joinee.id).select();
  const roleChangeBlocked = !!roleChange.error
    || (Array.isArray(roleChange.data) && roleChange.data.length === 0);
  check('joinee cannot escalate own role', roleChangeBlocked,
    roleChangeBlocked ? errDetail(roleChange.error) : 'ROLE CHANGED — BUG');

  // 8d. onboarding_lead is read-only on submissions (0 rows affected = blocked)
  const { client: olc } = await loginAs(onboardingLead.email);
  const olUpdate = await olc.from('worksheet_submissions').update({
    review_status: 'approved',
  }).eq('user_id', joinee.id).eq('worksheet_id', ws2).select();
  const olBlocked = !!olUpdate.error
    || (Array.isArray(olUpdate.data) && olUpdate.data.length === 0);
  check('onboarding_lead cannot update submissions (read-only)', olBlocked,
    olBlocked ? errDetail(olUpdate.error) : `UPDATE PERSISTED — ${JSON.stringify(olUpdate.data)}`);
  await sleep(400);

  // 8e. Cross-campus isolation — campus_admin IS a campus-scoped reviewer role
  //     (in the "Reviewers select submissions" RLS policy with a campus check),
  //     so the stronger property can be exercised:
  //       (positive) campus_admin on default campus CAN read default-campus rows
  //       (negative) after moving to another campus, those rows become invisible
  const { data: otherCampus, error: ocErr } = await svc.from('campuses').insert({
    name: `FullFlow Other Campus ${Date.now().toString(36).slice(-4)}`,
    slug: `fullflow-other-${Date.now().toString(36).slice(-4)}`,
    is_active: true,
  }).select('id').single();
  check('create a second campus', !ocErr, errDetail(ocErr));
  if (otherCampus?.id && campusAdmin) {
    // Positive: reviewer scoped to default campus sees default-campus rows.
    const { client: ca0 } = await loginAs(campusAdmin.email);
    const { data: ownRead, error: ownErr } = await ca0.from('worksheet_submissions').select('id').eq('campus_id', defaultCampus?.id);
    const ownVisible = Array.isArray(ownRead) && ownRead.length > 0;
    check('campus_admin can read own-campus submissions (positive)', ownVisible,
      ownErr ? errDetail(ownErr) : (ownVisible ? `visible (${ownRead.length} rows)` : '0 rows — unexpectedly blocked'));

    // Move campus_admin to the other campus + sync JWT claim (RLS get_user_campus()
    // reads app_metadata, not user_profiles).
    await svc.from('user_profiles').update({ campus_id: otherCampus.id }).eq('id', campusAdmin.id);
    await svc.auth.admin.updateUserById(campusAdmin.id, {
      app_metadata: { role: campusAdmin.role, campus_id: otherCampus.id },
    });
    await sleep(400);
    const { client: cac } = await loginAs(campusAdmin.email);
    const { data: crossRead, error: crossErr } = await cac.from('worksheet_submissions').select('id').eq('campus_id', defaultCampus?.id);
    const leaked = Array.isArray(crossRead) ? crossRead.length > 0 : false;
    check('campus_admin cannot read other-campus submissions (negative)', !leaked,
      crossErr ? errDetail(crossErr) : (leaked ? 'LEAKED cross-campus rows' : 'blocked (0 rows)'));
    // restore campus + JWT
    await svc.from('user_profiles').update({ campus_id: defaultCampus?.id }).eq('id', campusAdmin.id);
    await svc.auth.admin.updateUserById(campusAdmin.id, {
      app_metadata: { role: campusAdmin.role, campus_id: defaultCampus?.id },
    });
  }
  await sleep(400);

  // 8f. super_admin can read any campus submissions
  const { client: sac } = await loginAs(superAdmin.email);
  const { data: superRead, error: superErr } = await sac.from('worksheet_submissions').select('id').limit(5);
  check('super_admin can read submissions (global)', !superErr && Array.isArray(superRead), errDetail(superErr));
  await sleep(400);

  // 8g. User cannot forge a notification for another user
  const notifForge = await jc3.from('notifications').insert({
    user_id: manager.id,
    from_user_id: joinee.id,
    worksheet_id: ws1,
    type: 'submitted',
    message: 'FORGED — should be blocked',
  });
  check('user cannot forge a notification for another user', !!notifForge.error, notifForge.error?.message || 'INSERT succeeded — BUG');

  // ── Cleanup: remove the temporary cross-campus test campus ─────────
  if (otherCampus?.id) {
    await svc.from('campuses').delete().eq('id', otherCampus.id);
    console.log('  🧹 Cleaned up temporary test campus');
  }

  // ── Summary ──────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  FULL FLOW TEST — ${passes} passed, ${failures} failed`);
  console.log('═══════════════════════════════════════════════════');
  if (failures > 0) {
    console.log('\n❌ FAILED CHECKS:');
    for (const r of results.filter(r => !r.ok)) {
      console.log(`  - ${r.name}: ${r.detail}`);
    }
  }
  console.log('');
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\n❌ FATAL:', err.message);
  process.exit(1);
});
