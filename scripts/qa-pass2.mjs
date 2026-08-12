// =============================================================================
// QA PASS 2 — Concurrency (§13), Injection/XSS fuzzing (§17), Chaos (§29)
// =============================================================================
// Companion to docs/QA_TEST_PLAN.md. Uses the live e2e users created by
// scripts/create-10-role-users.mjs (looked up live by role) and the same
// client conventions as scripts/full-flow-test.mjs.
//
// Sections covered:
//   §13 CONCURRENCY
//     C1  Double buddy-approve fired concurrently → exactly ONE persisted
//         transition (review_history must not double-append)
//     C2  Buddy approve vs. buddy request-revision race on same row → final
//         state is one of the two legal outcomes, history consistent
//     C3  Double-submit (concurrent upsert same user_id+worksheet_id) → no
//         duplicate row, no unique-violation crash
//     C4  Owner resubmit racing a buddy approve → legal final state, no
//         corruption (one side may be blocked by the trigger by design)
//   §17 INJECTION / XSS
//     I1  XSS payloads stored verbatim in worksheet_data (data, not executed)
//     I2  SQLi payloads in filter values → no data leak (0 rows OR edge block)
//     I3  Auth-bypass login payloads rejected (400 Invalid credentials)
//     I4  Command-injection strings stored safely as data
//     I5  SQLi-style worksheet_id lookups return nothing (no UNION/leak)
//   §29 CHAOS
//     X1  Owner illegal transition (pending_review → approved) → trigger blocks
//     X2  Buddy illegal transition (pending_review → approved) → trigger blocks
//     X3  Manager illegal transition (pending_review → approved, no buddy step)
//         → trigger blocks
//     X4  Owner resubmission after approval (approved → revision_submitted)
//         → trigger blocks ("already been reviewed")
//     X5  IDOR: joinee updates ANOTHER user's submission → RLS blocks
//     X6  Tampered/garbage JWT → no data returned (0 rows or error)
//     X7  Role-scoped read returns only allowed data
//     X8  Null/empty worksheet_data upsert → defined response (no 500 crash)
//     X9  Unexpected review_status value sent by owner → trigger blocks
//     X10 Cross-user notification forge (user_id = manager) → RLS blocks
//         (self-insert is legitimately allowed by contract item 5)
//
// Usage: node scripts/qa-pass2.mjs
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

function errDetail(err) {
  if (!err) return undefined;
  return typeof err === 'object' ? JSON.stringify(err) : String(err);
}

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

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   QA PASS 2 — CONCURRENCY / INJECTION / CHAOS           ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── STEP 0: Locate e2e users + campuses ─────────────────────────
  console.log('─── STEP 0: Locate e2e users & campuses ───\n');
  const { data: profiles, error: profErr } = await svc
    .from('user_profiles')
    .select('id, email, full_name, role, campus_id')
    .ilike('email', 'e2e.%')
    .order('created_at', { ascending: false });
  if (profErr) throw new Error(`profiles lookup: ${profErr.message}`);

  const { data: campuses } = await svc.from('campuses').select('id, name, slug');
  const defaultCampus = campuses?.find(c => c.slug === 'default') || campuses?.[0];

  const wanted = ['new_joinee', 'lead_instructor', 'academic_head', 'onboarding_lead'];
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
  const onbLead = users.onboarding_lead;
  if (!joinee || !buddy || !manager) {
    console.error('❌ Missing required e2e user — run scripts/create-10-role-users.mjs first');
    process.exit(1);
  }

  // Assign buddy+manager to joinee (service key — RLS legitimately forbids this for tests)
  await svc.from('user_profiles').update({
    assigned_lead_id: manager.id,
    assigned_buddy_id: buddy.id,
    campus_id: defaultCampus?.id ?? joinee.campus_id,
  }).eq('id', joinee.id);

  // ── Helpers ────────────────────────────────────────────────
  const campusId = defaultCampus?.id ?? joinee.campus_id;
  const due = new Date(Date.now() + 7 * 864e5).toISOString().split('T')[0];

  /** Reset a submission to a known state via service key (bypasses trigger).
   *  review_history starts EMPTY so history counts reflect real transitions only. */
  async function seedSubmission(wsId, reviewStatus, data = {}) {
    await svc.from('worksheet_submissions').delete().eq('user_id', joinee.id).eq('worksheet_id', wsId);
    const { error } = await svc.from('worksheet_submissions').insert({
      user_id: joinee.id,
      worksheet_id: wsId,
      phase: 'phase-1',
      status: reviewStatus === '' ? '' : 'submitted',
      review_status: reviewStatus,
      reviewer_type: 'buddy',
      worksheet_data: data,
      due_date: due,
      campus_id: campusId,
      review_history: [],
    });
    if (error) throw new Error(`seed ${wsId} (${reviewStatus}): ${error.message}`);
  }

  /** Read a submission (service key) and return the row. */
  async function getSub(wsId) {
    const { data } = await svc.from('worksheet_submissions')
      .select('*')
      .eq('user_id', joinee.id).eq('worksheet_id', wsId)
      .maybeSingle();
    return data;
  }

  // ── §13 CONCURRENCY ───────────────────────────────────────────
  console.log('─── §13 CONCURRENCY ───\n');
  const { client: bc } = await loginAs(buddy.email);
  const { client: jc } = await loginAs(joinee.email);
  const buddyApprove = (wsId, comment = 'ok') =>
    bc.from('worksheet_submissions').update({
      review_status: 'buddy_approved',
      reviewed_by: buddy.id,
      reviewed_at: new Date().toISOString(),
      reviewer_name: buddy.full_name,
      review_comment: comment,
    }).eq('user_id', joinee.id).eq('worksheet_id', wsId);

  // C1: Double buddy-approve, fired concurrently
  await seedSubmission('p1_w2', 'pending_review', { employeeName: joinee.full_name });
  const [c1a, c1b] = await Promise.all([buddyApprove('p1_w2'), buddyApprove('p1_w2')]);
  const c1row = await getSub('p1_w2');
  const c1HistoryLen = Array.isArray(c1row?.review_history) ? c1row.review_history.length : -1;
  const c1Errors = [c1a.error, c1b.error].filter(Boolean).length;
  check('C1 double-approve: no errors + single final transition',
    c1Errors === 0 && c1row?.review_status === 'buddy_approved' && c1HistoryLen === 1,
    `errors=${c1Errors}, status=${c1row?.review_status}, history=${c1HistoryLen} (expect 1)`);

  // C2: Buddy approve vs. buddy request-revision, fired concurrently.
  //     NOTE: if needs_revision commits first, a subsequent buddy_approved is
  //     (by design) rejected by the trigger — the joinee must resubmit first.
  //     Assert: final state legal, history consistent, no crash.
  await seedSubmission('p1_w4', 'pending_review', { employeeName: joinee.full_name });
  const [c2a, c2b] = await Promise.all([
    buddyApprove('p1_w4'),
    bc.from('worksheet_submissions').update({
      review_status: 'needs_revision',
      reviewed_by: buddy.id,
      reviewed_at: new Date().toISOString(),
      reviewer_name: buddy.full_name,
      review_comment: 'revise',
    }).eq('user_id', joinee.id).eq('worksheet_id', 'p1_w4'),
  ]);
  const c2row = await getSub('p1_w4');
  const c2Legal = ['buddy_approved', 'needs_revision'].includes(c2row?.review_status);
  const c2HistLen = Array.isArray(c2row?.review_history) ? c2row.review_history.length : -1;
  // errors are acceptable ONLY if they are the trigger's transition rejection
  // (no crash/500): we surface them in the detail for inspection.
  const c2Errors = [c2a.error, c2b.error].filter(Boolean);
  const c2Crash = c2Errors.some(e => !/transition|revision|Illegal|already been reviewed/i.test(e?.message || ''));
  check('C2 approve-vs-revision race: legal final state, no crash',
    c2Legal && c2HistLen >= 1 && c2HistLen <= 2 && !c2Crash,
    `status=${c2row?.review_status}, history=${c2HistLen}, errors=${c2Errors.length ? c2Errors.map(e => e.message).join(' | ') : 'none'}`);

  // C3: Double-submit (concurrent upsert) — no duplicate row
  const wsDup = 'p1_w6';
  await svc.from('worksheet_submissions').delete().eq('user_id', joinee.id).eq('worksheet_id', wsDup);
  const upsertPayload = {
    user_id: joinee.id,
    worksheet_id: wsDup,
    phase: 'phase-1',
    status: 'submitted',
    review_status: 'pending_review',
    reviewer_type: 'buddy',
    worksheet_data: { employeeName: joinee.full_name, reflections: 'dup test' },
    due_date: due,
    campus_id: campusId,
  };
  const [c3a, c3b] = await Promise.all([
    jc.from('worksheet_submissions').upsert(upsertPayload, { onConflict: 'user_id,worksheet_id' }),
    jc.from('worksheet_submissions').upsert(upsertPayload, { onConflict: 'user_id,worksheet_id' }),
  ]);
  const { count: dupCount, error: dupCountErr } = await svc.from('worksheet_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', joinee.id).eq('worksheet_id', wsDup);
  check('C3 double-submit upsert: exactly one row persists',
    dupCount === 1 && !dupCountErr && ![c3a.error, c3b.error].filter(Boolean).length,
    `rows=${dupCount}, errors=${[c3a.error, c3b.error].filter(Boolean).length}`);

  // C4: Owner resubmit racing buddy approve.
  //     If approve commits first, the owner resubmit is rejected by design
  //     ("already been reviewed"). If resubmit commits first, approve is legal.
  await seedSubmission('p1_w7', 'pending_review', { employeeName: joinee.full_name });
  const [c4a, c4b] = await Promise.all([
    jc.from('worksheet_submissions').update({ status: 'submitted', review_status: 'revision_submitted' })
      .eq('user_id', joinee.id).eq('worksheet_id', 'p1_w7'),
    buddyApprove('p1_w7'),
  ]);
  const c4row = await getSub('p1_w7');
  const c4Legal = ['revision_submitted', 'buddy_approved'].includes(c4row?.review_status);
  const c4Hist = Array.isArray(c4row?.review_history) ? c4row.review_history.length : -1;
  const c4Consistent = c4row?.review_status === 'buddy_approved' ? c4Hist === 1 : c4Hist === 0;
  const c4Errors = [c4a.error, c4b.error].filter(Boolean);
  const c4Crash = c4Errors.some(e => !/already been reviewed|transition|Illegal/i.test(e?.message || ''));
  check('C4 resubmit-vs-approve race: legal final state, consistent history',
    c4Legal && c4Consistent && !c4Crash,
    `status=${c4row?.review_status}, history=${c4Hist}, errors=${c4Errors.length ? c4Errors.map(e => e.message).join(' | ') : 'none'}`);
  console.log('');

  // ── §17 INJECTION / XSS ────────────────────────────────────────
  console.log('─── §17 INJECTION / XSS FUZZING ───\n');

  const XSS_PAYLOADS = {
    scriptTag: '<script>alert(document.cookie)</script>',
    imgOnError: '<img src=x onerror=alert(1)>',
    jsUrl: 'javascript:alert(1)',
    svgPayload: '<svg/onload=alert(1)>',
  };

  // I1: XSS payloads stored verbatim as data (no error, no execution at rest)
  let i1ok = true;
  const i1details = [];
  for (const [k, payload] of Object.entries(XSS_PAYLOADS)) {
    const wsId = 'p1_w8';
    await svc.from('worksheet_submissions').delete().eq('user_id', joinee.id).eq('worksheet_id', wsId);
    const { error } = await jc.from('worksheet_submissions').upsert({
      user_id: joinee.id,
      worksheet_id: wsId,
      phase: 'phase-1',
      status: 'submitted',
      review_status: 'pending_review',
      reviewer_type: 'buddy',
      worksheet_data: { employeeName: payload, reflections: payload },
      due_date: due,
      campus_id: campusId,
    }, { onConflict: 'user_id,worksheet_id' });
    const row = await getSub(wsId);
    const storedVerbatim = row?.worksheet_data?.employeeName === payload;
    if (error || !storedVerbatim) { i1ok = false; i1details.push(`${k}:${error?.message || 'mismatch'}`); }
  }
  check('I1 XSS payloads accepted + stored verbatim (data, not executed)', i1ok,
    i1ok ? `${Object.keys(XSS_PAYLOADS).length}/4 payloads round-tripped` : i1details.join('; '));

  // I2: SQLi in filter values — no data leak. A WAF/edge block or a 0-row
  //     response is a PASS (no leak); leaking rows without error is the bug.
  const sqliFilters = ["' OR 1=1 --", "' OR '1'='1", "'; DROP TABLE worksheet_submissions; --", '1 OR 1=1'];
  let i2leak = false;
  let i2blocked = 0;
  const i2details = [];
  for (const f of sqliFilters) {
    const { data, error } = await jc.from('worksheet_submissions').select('user_id, worksheet_id, review_status').eq('worksheet_id', f);
    // ANY error (WAF block, 400/403, parse failure) OR a 0-row response means
    // no data leaked — that satisfies the security property. The ONLY failure
    // is rows coming back without an error. Never depend on error-message
    // text to decide pass/fail.
    if (Array.isArray(data) && data.length > 0) {
      i2leak = true;
      i2details.push(`LEAK ${f}: ${data.length} rows`);
    } else if (error) {
      i2blocked++;
      i2details.push(`payload "${f}" blocked (error)`);
    } else {
      i2blocked++;
      i2details.push(`payload "${f}" blocked (0 rows)`);
    }
  }
  check('I2 SQLi filter payloads cause NO data leak (0 rows or blocked)',
    !i2leak && i2blocked === sqliFilters.length,
    i2details.join('; ') || `${sqliFilters.length}/${sqliFilters.length} payloads blocked, 0 leaked`);

  // I3: Auth-bypass login payloads rejected
  const bypassLogins = [
    ["' OR '1'='1", "x' OR '1'='1' --"],
    ['admin', "' OR 1=1 --"],
    ['1=1; DROP TABLE users;--', 'password'],
  ];
  let i3ok = true;
  let i3rateLimited = false;
  for (const [email, pw] of bypassLogins) {
    const t = createClient(SUPABASE_URL, ANON_KEY, { realtime: { transport: WebSocket } });
    const { data, error } = await t.auth.signInWithPassword({ email, password: pw });
    if (!error || (data.user)) i3ok = false;
    if (error && /rate limit|too many/i.test(error.message || '')) i3rateLimited = true;
    await sleep(500);
  }
  check('I3 SQLi/auth-bypass login payloads rejected',
    i3ok && !i3rateLimited,
    i3rateLimited ? 'rate-limited (no conclusion)' : 'all 3 payload combos rejected');

  // I4: Command-injection strings stored safely as data
  const cmdPayload = '$(rm -rf /tmp/x) || echo pwned; `id`; & ping 8.8.8.8';
  const wsCmd = 'p1_w5';
  await svc.from('worksheet_submissions').delete().eq('user_id', joinee.id).eq('worksheet_id', wsCmd);
  const { error: cmdErr } = await jc.from('worksheet_submissions').upsert({
    user_id: joinee.id,
    worksheet_id: wsCmd,
    phase: 'phase-1',
    status: 'submitted',
    review_status: 'pending_review',
    reviewer_type: 'buddy',
    worksheet_data: { employeeName: cmdPayload, reflections: cmdPayload },
    due_date: due,
    campus_id: campusId,
  }, { onConflict: 'user_id,worksheet_id' });
  const cmdRow = await getSub(wsCmd);
  check('I4 command-injection string stored safely as data',
    !cmdErr && cmdRow?.worksheet_data?.employeeName === cmdPayload,
    cmdErr ? errDetail(cmdErr) : 'stored verbatim, no execution');

  // I5: SQLi-style worksheet_id lookups can't pull other users' rows
  const { data: forgedLookup, error: forgedErr } = await jc.from('worksheet_submissions')
    .select('user_id, worksheet_id')
    .eq('worksheet_id', "x' UNION SELECT id,email FROM auth.users --");
  check('I5 SQLi worksheet_id lookup returns nothing (no UNION/leak)',
    (Array.isArray(forgedLookup) && forgedLookup.length === 0) || !!forgedErr,
    forgedErr ? errDetail(forgedErr) : `rows=${forgedLookup?.length}`);
  console.log('');

  // ── §29 CHAOS ───────────────────────────────────────────────────
  console.log('─── §29 CHAOS TESTING ───\n');

  // X1: Owner illegal transition pending_review → approved → trigger blocks
  await seedSubmission('p1_w2', 'pending_review');
  const x1 = await jc.from('worksheet_submissions').update({ review_status: 'approved' })
    .eq('user_id', joinee.id).eq('worksheet_id', 'p1_w2').select();
  const x1blocked = !!x1.error || (Array.isArray(x1.data) && x1.data.length === 0);
  check('X1 owner pending_review→approved blocked by trigger', x1blocked,
    x1blocked ? errDetail(x1.error) : `SELF-APPROVAL PERSISTED ${JSON.stringify(x1.data)}`);

  // X2: Buddy illegal transition pending_review → approved (skips own approval) → blocked
  await seedSubmission('p1_w4', 'pending_review');
  const x2 = await bc.from('worksheet_submissions').update({ review_status: 'approved', reviewed_by: buddy.id, reviewed_at: new Date().toISOString(), reviewer_name: buddy.full_name })
    .eq('user_id', joinee.id).eq('worksheet_id', 'p1_w4').select();
  const x2blocked = !!x2.error || (Array.isArray(x2.data) && x2.data.length === 0);
  check('X2 buddy pending_review→approved (skips buddy step) blocked', x2blocked,
    x2blocked ? errDetail(x2.error) : `PERSISTED ${JSON.stringify(x2.data)}`);

  // X3: Manager illegal transition pending_review → approved (no buddy approval first) → blocked
  const { client: mc } = await loginAs(manager.email);
  const x3 = await mc.from('worksheet_submissions').update({ review_status: 'approved', reviewed_by: manager.id, reviewed_at: new Date().toISOString(), reviewer_name: manager.full_name })
    .eq('user_id', joinee.id).eq('worksheet_id', 'p1_w4').select();
  const x3blocked = !!x3.error || (Array.isArray(x3.data) && x3.data.length === 0);
  check('X3 manager pending_review→approved (no buddy step) blocked', x3blocked,
    x3blocked ? errDetail(x3.error) : `PERSISTED ${JSON.stringify(x3.data)}`);

  // X4: Owner resubmission after approval → blocked ("already been reviewed")
  await seedSubmission('p1_w7', 'approved');
  const x4 = await jc.from('worksheet_submissions').update({ review_status: 'revision_submitted' })
    .eq('user_id', joinee.id).eq('worksheet_id', 'p1_w7').select();
  const x4blocked = !!x4.error || (Array.isArray(x4.data) && x4.data.length === 0);
  check('X4 owner approved→revision_submitted blocked ("already reviewed")', x4blocked,
    x4blocked ? errDetail(x4.error) : `PERSISTED ${JSON.stringify(x4.data)}`);

  // X5: IDOR — joinee updates ANOTHER user's submission → RLS blocks.
  //     Deterministic victim: find any submission owned by someone else; if
  //     none exists, seed one for the manager via service key.
  let victimSub = null;
  const { data: otherSubs } = await svc.from('worksheet_submissions').select('user_id, worksheet_id')
    .neq('user_id', joinee.id).limit(1);
  if (otherSubs?.length) {
    victimSub = otherSubs[0];
  } else {
    const { data: seeded, error: seedErr } = await svc.from('worksheet_submissions').insert({
      user_id: manager.id,
      worksheet_id: 'p1_w1',
      phase: 'phase-1',
      status: 'submitted',
      review_status: 'pending_review',
      reviewer_type: 'buddy',
      worksheet_data: { note: 'IDOR victim' },
      due_date: due,
      campus_id: manager.campus_id ?? campusId,
      review_history: [],
    }).select('user_id, worksheet_id').single();
    if (!seedErr) victimSub = seeded;
  }
  let x5blocked = true;
  if (victimSub) {
    const x5 = await jc.from('worksheet_submissions').update({ review_status: 'needs_revision' })
      .eq('user_id', victimSub.user_id).eq('worksheet_id', victimSub.worksheet_id).select();
    x5blocked = !!x5.error || (Array.isArray(x5.data) && x5.data.length === 0);
  }
  check('X5 IDOR: joinee cannot update another user submission (RLS)', x5blocked,
    victimSub ? (x5blocked ? 'blocked' : 'PERSISTED — BUG') : 'no victim row available (skipped)');

  // X6: Tampered/garbage JWT → no data returned (0 rows OR error is a pass)
  const evil = createClient(SUPABASE_URL, ANON_KEY, { realtime: { transport: WebSocket } });
  await evil.auth.setSession({ access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlIiwicm9sZSI6InN1cGVyX2FkbWluIn0.garbage', refresh_token: '' });
  const x6 = await evil.from('worksheet_submissions').select('id, user_id');
  const x6leaked = Array.isArray(x6.data) && x6.data.length > 0;
  check('X6 tampered JWT returns no data (0 rows or rejected)',
    !x6leaked,
    x6leaked ? `LEAKED ${x6.data.length} rows — BUG` : (x6.error ? `rejected: ${errDetail(x6.error)}` : '0 rows returned'));

  // X7: Role-scoped read returns only allowed data (onboarding_lead reads joinee)
  const { client: olc } = await loginAs(onbLead.email);
  const x7 = await olc.from('user_profiles').select('id, role').eq('id', joinee.id).maybeSingle();
  const x7roleOk = !x7.error && x7.data?.role === 'new_joinee';
  check('X7 role-scoped read returns only allowed data', x7roleOk, x7.error ? errDetail(x7.error) : `got role=${x7.data?.role}`);

  // X8: Null/empty worksheet_data upsert → defined response (no 500 crash)
  const wsNull = 'p1_w8';
  const { error: x8e } = await jc.from('worksheet_submissions').upsert({
    user_id: joinee.id,
    worksheet_id: wsNull,
    phase: 'phase-1',
    status: 'submitted',
    review_status: 'pending_review',
    reviewer_type: 'buddy',
    worksheet_data: null,
    due_date: due,
    campus_id: campusId,
  }, { onConflict: 'user_id,worksheet_id' });
  const x8row = await getSub(wsNull);
  check('X8 null worksheet_data → defined response (no 500)', !x8e, x8e ? errDetail(x8e) : `stored, data=${JSON.stringify(x8row?.worksheet_data)}`);

  // X9: Unexpected review_status value sent by owner → trigger blocks
  await seedSubmission('p1_w4', 'pending_review');
  const x9 = await jc.from('worksheet_submissions').update({ review_status: 'super_approved_forever' })
    .eq('user_id', joinee.id).eq('worksheet_id', 'p1_w4').select();
  const x9blocked = !!x9.error || (Array.isArray(x9.data) && x9.data.length === 0);
  check('X9 unexpected review_status value blocked', x9blocked,
    x9blocked ? errDetail(x9.error) : `PERSISTED ${JSON.stringify(x9.data)}`);

  // X10: Cross-user notification forge → RLS blocks (self-insert is legal by design)
  const x10 = await jc.from('notifications').insert({
    user_id: manager.id,
    from_user_id: joinee.id,
    worksheet_id: 'p1_w2',
    type: 'submitted',
    message: 'FORGED — should be blocked',
  });
  check('X10 cross-user notification forge blocked by RLS', !!x10.error,
    x10.error?.message || 'INSERT succeeded — BUG (can spam others)');

  // ── Cleanup: reset test submissions to neutral state ─────────────
  for (const ws of ['p1_w2', 'p1_w4', 'p1_w6', 'p1_w7', 'p1_w5', 'p1_w8']) {
    await svc.from('worksheet_submissions').delete().eq('user_id', joinee.id).eq('worksheet_id', ws);
  }
  if (victimSub && victimSub.user_id === manager.id) {
    await svc.from('worksheet_submissions').delete().eq('user_id', manager.id).eq('worksheet_id', victimSub.worksheet_id);
  }
  console.log('\n  🧹 Cleaned up test submissions');

  // ── Summary ──────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  QA PASS 2 — ${passes} passed, ${failures} failed`);
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
