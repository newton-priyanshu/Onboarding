// =============================================================================
// BROWSER PASS — All-Roles UI Regression against localhost
// =============================================================================
// Drives a real Chromium (Playwright) through the app at localhost:5173 and
// verifies the whole onboarding flow from the user's perspective:
//
//   1. Provisions a fresh set of e2e users (one per role) — self-contained,
//      so the script is repeatable in one command without setup.
//   2. Assigns buddy + manager to the joinee (service key, RLS-legit).
//   3. Seeds the FULL worksheet set for phases 1–3 (23 worksheets incl.
//      gate checks) as pending_review, owner-legal.
//   4. UI login for every role — asserts the dashboard renders, the URL leaves
//      /login, no error alert, no unexpected console errors, no 404s.
//   5. Joinee worksheet page — renders, and the owner has NO approve control.
//   6. Rejection round-trip — buddy requests revision on a worksheet via the
//      review UI (comment required) → needs_revision, the joinee sees it on
//      their dashboard roadmap, resubmits through the worksheet UI
//      (needs_revision → revision_submitted), and the buddy re-approves via
//      the review UI (revision_submitted → buddy_approved) — the dashboard
//      reflects each state along the way. The worksheet is left buddy_approved
//      so the approval flow below picks it up from that state.
//   7. Buddy UI flow — approves the remaining worksheets (23 in total; p1_w1
//      is already buddy_approved from step 6 and is verified from the DB),
//      each verified in the DB as buddy_approved.
//   8. Manager rejection path (H28) — once every worksheet is buddy-approved,
//      the manager requests revision on one of them directly from the phase
//      review page (comment required) → needs_revision, and the joinee sees
//      it on their dashboard roadmap. The worksheet is then restored to
//      buddy_approved via the service role so the approvals below stay intact.
//   9. Manager UI flow — performs the phase-level approve for phases 1, 2 and
//      3 in sequence, then verifies EVERY worksheet in each phase flipped to
//      approved in the DB (incl. the gate checks).
//  10. Console/pageerror/requestfailed watchers per page — a regression like
//      the start_date 400 or the /phase-1/worksheet- 404s fails loudly.
//  11. Best-effort cleanup of the provisioned users + seeded rows.
//
// Usage:  node scripts/browser-pass.mjs
// Prereq: dev server running (npm run dev → http://localhost:5173)
//         and .env with VITE_SUPABASE_URL / PUBLISHABLE / SERVICE_ROLE_KEY.
// Full flow (incl. both rejection paths) documented in docs/BROWSER_PASS.md.
// =============================================================================

import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { WebSocket } from 'ws';
import { readFileSync, existsSync } from 'fs';
import { sleep, waitForSubmissionState, waitForAllSubmissionsState } from './lib/submissionPoller.mjs';

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

const APP_URL = process.env.BROWSER_PASS_URL || 'http://localhost:5173';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = 'Test123!';
const TS = Date.now().toString(36).slice(-4).toUpperCase();

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

const check = (name, condition, detail) => record(name, !!condition, detail);

/** Fresh anon client signed in as a user (for RLS-legit API setup). */
async function loginAs(email) {
  const client = createClient(SUPABASE_URL, ANON_KEY, { realtime: { transport: WebSocket } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`Login ${email}: ${error.message}`);
  return { client, user: data.user };
}

// ─── Provisioning (mirrors create-10-role-users.mjs) ──────────────────────
const ROLES = [
  { role: 'super_admin',       name: 'BP Super Admin',        email: `e2e.bp.superadmin_${TS}@newton.edu` },
  { role: 'campus_head',       name: 'BP Campus Head',        email: `e2e.bp.campushead_${TS}@newton.edu` },
  { role: 'academic_head',     name: 'BP Academic Head',      email: `e2e.bp.academichead_${TS}@newton.edu` },
  { role: 'progression_head',  name: 'BP Progression Head',   email: `e2e.bp.progressionhead_${TS}@newton.edu` },
  { role: 'ops_head',          name: 'BP Ops Head',           email: `e2e.bp.opshead_${TS}@newton.edu` },
  { role: 'campus_admin',      name: 'BP Campus Admin',       email: `e2e.bp.campusadmin_${TS}@newton.edu` },
  { role: 'onboarding_lead',   name: 'BP Onboarding Lead',    email: `e2e.bp.onboardinglead_${TS}@newton.edu` },
  { role: 'lead_instructor',   name: 'BP Buddy Mentor',       email: `e2e.bp.buddy_${TS}@newton.edu` },
  { role: 'lab_instructor',    name: 'BP Lab Instructor',     email: `e2e.bp.labinstructor_${TS}@newton.edu` },
  { role: 'new_joinee',        name: 'BP New Joinee',         email: `e2e.bp.joinee_${TS}@newton.edu` },
];

// Full worksheet sets for every phase, mirroring PHASE_WORKSHEETS_MAP in
// src/config/worksheetConfigData.ts. Phase 1 = FTP Week-1 anchors + legacy
// Phase-1 worksheets + gate check; Phases 2–3 = legacy + gate checks.
// All 23 are seeded with reviewer_type 'buddy' for this pass — an intentional
// override of the WORKSHEET_REVIEWER config map (p1_w4/p1_w5/p2_w4 are
// onboarding_lead there), because WorksheetReview.tsx gates the buddy approve
// action only on isBuddy && isAssignedBuddy, not on reviewer_type. This keeps
// the whole 3-phase flow exercised by a single reviewer.
const PHASE_WORKSHEETS = {
  1: ['p1_w5', 'p1_w6', 'p1_w3', 'w1_o1', 'w1_e1', 'w1_o2', 'w1_g1', 'p1_w1', 'p1_w2', 'p1_w4', 'p1_w8', 'gc1'],
  2: ['p2_w1', 'p2_w2', 'p2_w3', 'p2_w4', 'gc2'],
  3: ['p3_w1', 'p3_w2', 'p3_w3', 'p3_w4', 'p3_w5', 'gc3'],
};
const PHASE_NUMBERS = [1, 2, 3];
const ALL_WORKSHEETS = Object.values(PHASE_WORKSHEETS).flat();

async function resolveDefaultCampus() {
  const { data: campuses, error } = await svc.from('campuses').select('id, name, slug').order('created_at', { ascending: true });
  if (error) throw new Error(`campuses: ${error.message}`);
  const defaultCampus = campuses?.find(c => c.slug === 'default') || campuses?.[0];
  if (!defaultCampus) throw new Error('No campus found — run the multi-tenant migration first');
  return defaultCampus;
}

async function provisionUsers(defaultCampusId) {
  const users = {};
  for (const { role, name, email } of ROLES) {
    const { data, error } = await svc.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: name, role, campus_id: defaultCampusId },
      app_metadata: { role, campus_id: defaultCampusId },
    });
    if (error && /already/i.test(error.message || '')) {
      const { data: existing } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = existing?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
      if (!found) throw new Error(`${role} exists-lookup failed: ${error.message}`);
      const { error: pe } = await svc.from('user_profiles').upsert({
        id: found.id, email, full_name: name, role, campus_id: defaultCampusId,
      }, { onConflict: 'id' });
      if (pe) throw new Error(`${role} profile upsert: ${pe.message}`);
      users[role] = { id: found.id, email, full_name: name, role, campus_id: defaultCampusId };
      continue;
    }
    if (error) throw new Error(`${role} createUser: ${error.message}`);
    const { error: pe } = await svc.from('user_profiles').upsert({
      id: data.user.id, email, full_name: name, role, campus_id: defaultCampusId,
    }, { onConflict: 'id' });
    if (pe) throw new Error(`${role} profile upsert: ${pe.message}`);
    users[role] = { id: data.user.id, email, full_name: name, role, campus_id: defaultCampusId };
  }
  return users;
}

async function cleanup(users) {
  try {
    const joinee = users.new_joinee;
    if (joinee) {
      await svc.from('worksheet_submissions').delete().eq('user_id', joinee.id);
      await svc.from('user_profiles').delete().eq('id', joinee.id);
      await svc.auth.admin.deleteUser(joinee.id);
    }
    for (const { role } of ROLES) {
      const u = users[role];
      if (u && role !== 'new_joinee') {
        try { await svc.from('user_profiles').delete().eq('id', u.id); } catch { /* already gone */ }
        try { await svc.auth.admin.deleteUser(u.id); } catch { /* already gone */ }
      }
    }
    console.log('  🧹 Cleaned up provisioned users');
  } catch (err) {
    console.log(`  ⚠️ Cleanup incomplete: ${err.message}`);
  }
}

// ─── Playwright helpers ─────────────────────────────────
function collectPageErrors(page) {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', err => errors.push(`[pageerror] ${err.message}`));
  page.on('requestfailed', req => {
    const url = req.url();
    if (url.includes('.ico')) return; // favicon noise
    errors.push(`[requestfailed ${req.failure()?.errorText || 'failed'}] ${url}`);
  });
  return errors;
}

/** Known-benign console noise patterns (favicon, optional analytics). */
const IGNORED_ERROR_PATTERNS = [
  /favicon/i,
  /net::ERR_ABORTED/,
];

function filterBenign(errors) {
  return errors.filter(e => !IGNORED_ERROR_PATTERNS.some(p => p.test(e)));
}

async function loginViaUI(page, email) {
  // Clear any session from a previous role — keeps each login isolated even
  // though all pages share one browser context.
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.evaluate(() => localStorage.clear()).catch(() => {});
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#login-email', email);
  await page.fill('#login-password', PASSWORD);
  // Submit via Enter on the password field — a WelcomeOverlay can intercept
  // pointer events on the submit button (observed live), but native form
  // submission via Enter is unaffected.
  await page.press('#login-password', 'Enter');
  // Wait for the URL to leave /login (success) or an error alert to appear.
  await Promise.race([
    page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 }),
    page.waitForSelector('.lux-alert-error', { timeout: 20000 }).then(() => { throw new Error('login error alert shown'); }),
  ]);
  await page.waitForLoadState('networkidle').catch(() => {});
  return page.url();
}

/**
 * Dismiss the one-time WelcomeOverlay for roles that get it (new_joinee /
 * lab_instructor). It's an App-level, fixed full-viewport backdrop at
 * z-index 9999 that appears ~600ms after mount when the localStorage guard is
 * unset — the same culprit that forced the Enter-key workaround in loginViaUI
 * — and it swallows every pointer event until dismissed. Pre-set the guard key
 * for future mounts, then click Skip if the overlay is up (or shortly appears).
 */
async function dismissWelcomeOverlay(page) {
  await page.evaluate(() => localStorage.setItem('has_seen_welcome_overlay', 'true')).catch(() => {});
  const skipBtn = page.getByRole('button', { name: 'Skip' }).first();
  const seen = await skipBtn.waitFor({ state: 'visible', timeout: 3000 })
    .then(() => true).catch(() => false);
  if (seen) await skipBtn.click({ timeout: 5000 }).catch(() => {});
}

// ─── Main ───────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║      BROWSER PASS — ALL-ROLES UI REGRESSION               ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── STEP 0: Dev server reachable? ─────────────────────
  console.log(`─── STEP 0: Dev server @ ${APP_URL} ───\n`);
  try {
    const probe = await fetch(APP_URL, { signal: AbortSignal.timeout(5000) });
    check('dev server reachable', probe.ok, `HTTP ${probe.status}`);
  } catch (err) {
    check('dev server reachable', false, err.message);
    console.error('\n❌ Start it with: npm run dev');
    process.exit(1);
  }

  // ── STEP 1: Provision users ───────────────────────────
  console.log('\n─── STEP 1: Provision fresh role users ───\n');
  const defaultCampus = await resolveDefaultCampus();
  const users = await provisionUsers(defaultCampus.id);
  for (const role of ROLES.map(r => r.role)) {
    check(`provision ${role}`, !!users[role], users[role]?.email);
  }
  const { new_joinee: joinee, lead_instructor: buddy, academic_head: manager, super_admin: superAdmin, onboarding_lead: onboardingLead } = users;

  // ── STEP 2: Assignments ───────────────────────────────
  console.log('\n─── STEP 2: Assign buddy + manager to joinee ───\n');
  for (const target of [joinee, users.lab_instructor]) {
    const { error } = await svc.from('user_profiles').update({
      assigned_lead_id: manager.id,
      assigned_buddy_id: buddy.id,
      campus_id: defaultCampus.id,
    }).eq('id', target.id);
    check(`assign buddy+manager → ${target.role}`, !error, error?.message);
  }

  // ── STEP 3: Seed full submission set for phases 1–3 ──
  console.log(`\n─── STEP 3: Seed ${ALL_WORKSHEETS.length} submissions (phases 1–3) → pending_review ───\n`);
  const { client: jc } = await loginAs(joinee.email);
  let seededOk = 0;
  for (const phaseNum of PHASE_NUMBERS) {
    for (const wsId of PHASE_WORKSHEETS[phaseNum]) {
      const { error } = await jc.from('worksheet_submissions').upsert({
        user_id: joinee.id,
        worksheet_id: wsId,
        phase: `phase-${phaseNum}`,
        status: 'submitted',
        review_status: 'pending_review',
        reviewer_type: 'buddy',
        worksheet_data: { employeeName: joinee.full_name, mentorName: 'BP Mentor', reflections: 'Browser-pass seeded submission.' },
        campus_id: defaultCampus.id,
      }, { onConflict: 'user_id,worksheet_id' });
      if (!error) seededOk++;
    }
  }
  check(`seed ${ALL_WORKSHEETS.length} submissions across phases 1–3 (owner-legal)`, seededOk === ALL_WORKSHEETS.length, `${seededOk}/${ALL_WORKSHEETS.length} inserted`);
  console.log('');

  // ── STEP 4: UI login for every role ───────────────────
  console.log('─── STEP 4: UI sign-in for all roles ───\n');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    for (const role of ROLES.map(r => r.role)) {
      const u = users[role];
      if (!u) continue;
      const page = await context.newPage();
      const errors = collectPageErrors(page);
      let url = '';
      try {
        url = await loginViaUI(page, u.email);
        const errorAlert = await page.locator('.lux-alert-error').count();
        check(`sign-in ${role}`, url && errorAlert === 0, url);
        // No unexpected console errors on landing
        const bad = filterBenign(errors);
        check(`console clean on ${role} landing`, bad.length === 0, bad.slice(0, 3).join(' | '));
      } catch (err) {
        check(`sign-in ${role}`, false, err.message);
      }
      await page.close();
      await sleep(300);
    }
    console.log('');

    // ── STEP 5: Joinee worksheet page — no self-approve ──
    console.log('─── STEP 5: Joinee worksheet (no self-approve) ───\n');
    {
      const page = await context.newPage();
      const errors = collectPageErrors(page);
      const url = await loginViaUI(page, joinee.email);
      await page.goto(`${APP_URL}/default/phase-1/worksheet-1`, { waitUntil: 'networkidle' }).catch(() => {});
      // The worksheet should render either a form or a submitted view — but
      // never an approve button for the owner.
      const approveButtons = await page.getByRole('button', { name: /approve/i }).count();
      check('joinee has no approve button on own worksheet', approveButtons === 0, `${approveButtons} found`);
      const bad = filterBenign(errors);
      check('joinee worksheet console clean', bad.length === 0, bad.slice(0, 3).join(' | '));
      // BUG-3 regression: the broken links ended in /worksheet- (empty id).
      const hasRealWsId = !page.url().endsWith('worksheet-') && /\/worksheet-[^\/]+$/.test(page.url());
      check('worksheet URL has a real worksheet id', hasRealWsId, page.url());
      await page.close();
    }
    console.log('');

    // ── STEP 6: Rejection round-trip — revision → resubmit → re-approve ──
    console.log('─── STEP 6: Rejection round-trip — revision → resubmit → re-approve ───\n');
    {
      const REVISION_WS = 'p1_w1';
      const REVISION_COMMENT = 'Browser-pass: please expand the stakeholder mapping.';
      // Ensure the worksheet is pending_review (it already is from step 3 — the
      // upsert keeps this step self-contained if the flow order ever changes).
      {
        const { error } = await jc.from('worksheet_submissions').upsert({
          user_id: joinee.id,
          worksheet_id: REVISION_WS,
          phase: 'phase-1',
          status: 'submitted',
          review_status: 'pending_review',
          reviewer_type: 'buddy',
          worksheet_data: { employeeName: joinee.full_name, mentorName: 'BP Mentor', reflections: 'Browser-pass seeded submission.' },
          campus_id: defaultCampus.id,
        }, { onConflict: 'user_id,worksheet_id' });
        check(`re-seed ${REVISION_WS} → pending_review (rejection path)`, !error, error?.message);
      }

      // Buddy requests revision via the review page UI (a comment is required —
      // handleBuddyRevision refuses an empty comment).
      const page = await context.newPage();
      const errors = collectPageErrors(page);
      const url = await loginViaUI(page, buddy.email);
      check('buddy signs in (rejection path)', !!url, url);
      await page.goto(`${APP_URL}/default/buddy/review/${joinee.id}/${REVISION_WS}`, { waitUntil: 'networkidle' }).catch(() => {});
      check('buddy review page opens (rejection path)', !page.url().includes('/404'), page.url());
      const revisionBtn = page.getByRole('button', { name: /request revision/i }).first();
      if (await revisionBtn.count()) {
        await page.fill('#review-comment', REVISION_COMMENT);
        await revisionBtn.click({ timeout: 10000 });
        // Verify the DB flipped to needs_revision (poll — the async fetch may
        // still be in flight when the click resolves).
        const dbResult = await waitForSubmissionState(svc, joinee.id, REVISION_WS, 'needs_revision');
        check(`buddy requests revision on ${REVISION_WS} → needs_revision`, dbResult.ok,
          dbResult.ok ? `state=${dbResult.state}` : `state=${dbResult.state} (timeout)`);
      } else {
        check(`buddy Request Revision button found (${REVISION_WS})`, false, 'no Request Revision button');
      }
      const bad = filterBenign(errors);
      check('buddy rejection page console clean', bad.length === 0, bad.slice(0, 3).join(' | '));
      await page.close();

      // Joinee sees the revision request on their dashboard roadmap.
      const jPage = await context.newPage();
      const jErrors = collectPageErrors(jPage);
      const jUrl = await loginViaUI(jPage, joinee.email);
      check('joinee signs in (rejection path)', !!jUrl, jUrl);
      await jPage.goto(`${APP_URL}/default`, { waitUntil: 'networkidle' }).catch(() => {});
      // The roadmap row for p1_w1 is a Link to /phase-1/worksheet-1. Assert it
      // now carries the Needs Revision status label. Scope with filter({hasText})
      // instead of .first(): the "Continue Where You Left Off" banner ALSO links
      // to the same path (p1_w1 is the most recently updated non-approved
      // submission) and sits before the roadmap in the DOM, so .first() would
      // match the banner (worksheet name + Continue, no status label).
      const row = jPage.locator('a[href*="phase-1/worksheet-1"]').filter({ hasText: 'Needs Revision' });
      const rowSeen = await row.waitFor({ state: 'visible', timeout: 10000 })
        .then(() => true)
        .catch(() => false);
      check('joinee dashboard shows Needs Revision on the worksheet row', rowSeen,
        rowSeen ? 'row label visible' : 'row or label not found');
      const jBad = filterBenign(jErrors);
      check('joinee dashboard console clean (rejection path)', jBad.length === 0, jBad.slice(0, 3).join(' | '));
      await jPage.close();

      // ── Joinee resubmits via the worksheet UI (needs_revision → revision_submitted) ──
      // The seed only fills employeeName/mentorName/reflections, so fill the
      // remaining required fields (buddy name + assignment date) — a realistic
      // "make the requested edits" pass before resubmitting.
      const rPage = await context.newPage();
      const rErrors = collectPageErrors(rPage);
      const rUrl = await loginViaUI(rPage, joinee.email);
      check('joinee signs in (resubmit)', !!rUrl, rUrl);
      // The WelcomeOverlay (new_joinee role, App-level fixed backdrop) swallows
      // pointer events until dismissed — without this the Finish Worksheet click
      // below times out with "element intercepts pointer events" (observed live).
      await dismissWelcomeOverlay(rPage);
      await rPage.goto(`${APP_URL}/default/phase-1/worksheet-1`, { waitUntil: 'networkidle' }).catch(() => {});
      // The form re-renders for needs_revision (not the read-only SubmittedView)
      // and ReviewFeedback surfaces the reviewer's comment banner.
      const feedbackSeen = await rPage.getByText('Revision Requested').first()
        .waitFor({ state: 'visible', timeout: 10000 })
        .then(() => true).catch(() => false);
      check('joinee sees the revision feedback on the worksheet', feedbackSeen,
        feedbackSeen ? 'Revision Requested banner visible' : 'banner not found');
      if (feedbackSeen) {
        await rPage.fill('#buddy-name', 'BP Buddy');
        await rPage.fill('#buddy-date', '2026-08-01');
        const finishBtn = rPage.getByRole('button', { name: /finish worksheet/i }).first();
        if (await finishBtn.count()) {
          await finishBtn.click({ timeout: 10000 });
          // Verify the DB flipped to revision_submitted (poll — the async submit
          // fetch may still be in flight when the click resolves).
          const resubDb = await waitForSubmissionState(svc, joinee.id, REVISION_WS, 'revision_submitted');
          check(`joinee resubmits ${REVISION_WS} → revision_submitted`, resubDb.ok,
            resubDb.ok ? `state=${resubDb.state}` : `state=${resubDb.state} (timeout)`);
        } else {
          check(`joinee Finish Worksheet button found (${REVISION_WS})`, false, 'no submit button on worksheet');
        }
      }
      const rBad = filterBenign(rErrors);
      check('joinee resubmit page console clean', rBad.length === 0, rBad.slice(0, 3).join(' | '));
      await rPage.close();

      // ── Buddy re-approves (revision_submitted → buddy_approved) ──
      const aPage = await context.newPage();
      const aErrors = collectPageErrors(aPage);
      const aUrl = await loginViaUI(aPage, buddy.email);
      check('buddy signs in (re-approve)', !!aUrl, aUrl);
      await aPage.goto(`${APP_URL}/default/buddy/review/${joinee.id}/${REVISION_WS}`, { waitUntil: 'networkidle' }).catch(() => {});
      check('buddy review page opens (re-approve)', !aPage.url().includes('/404'), aPage.url());
      const reapproveBtn = aPage.getByRole('button', { name: /approve/i }).first();
      if (await reapproveBtn.count()) {
        await reapproveBtn.click({ timeout: 10000 });
        const reapproveDb = await waitForSubmissionState(svc, joinee.id, REVISION_WS, 'buddy_approved');
        check(`buddy re-approves ${REVISION_WS} → buddy_approved`, reapproveDb.ok,
          reapproveDb.ok ? `state=${reapproveDb.state}` : `state=${reapproveDb.state} (timeout)`);
      } else {
        check(`buddy Approve button found (${REVISION_WS} re-approve)`, false, 'no APPROVE button on review page');
      }
      const aBad = filterBenign(aErrors);
      check('buddy re-approve page console clean', aBad.length === 0, aBad.slice(0, 3).join(' | '));
      await aPage.close();

      // ── Joinee dashboard reflects the re-approval (Buddy Approved) ──
      const dPage = await context.newPage();
      const dErrors = collectPageErrors(dPage);
      const dUrl = await loginViaUI(dPage, joinee.email);
      check('joinee signs in (round-trip complete)', !!dUrl, dUrl);
      await dPage.goto(`${APP_URL}/default`, { waitUntil: 'networkidle' }).catch(() => {});
      // Same row-scoping trick as above: the roadmap row for p1_w1 now carries
      // the Buddy Approved status label (the reviewer chip just says "Buddy").
      const approvedRow = dPage.locator('a[href*="phase-1/worksheet-1"]').filter({ hasText: 'Buddy Approved' });
      const approvedRowSeen = await approvedRow.waitFor({ state: 'visible', timeout: 10000 })
        .then(() => true).catch(() => false);
      check('joinee dashboard shows Buddy Approved after round-trip', approvedRowSeen,
        approvedRowSeen ? 'row label visible' : 'row or label not found');
      const dBad = filterBenign(dErrors);
      check('joinee dashboard console clean (round-trip)', dBad.length === 0, dBad.slice(0, 3).join(' | '));
      await dPage.close();

      // NOTE: p1_w1 is intentionally left buddy_approved — step 7 verifies
      // already-approved worksheets from the DB instead of re-clicking approve
      // (an approved worksheet's review page renders no approve button).
    }
    console.log('');

    // ── STEP 7: Buddy approves every worksheet (phases 1–3) ──
    console.log(`─── STEP 7: Buddy approves ${ALL_WORKSHEETS.length} worksheets across phases 1–3 (UI) ───\n`);
    let buddyApprovedCount = 0;
    {
      const page = await context.newPage();
      const errors = collectPageErrors(page);
      const url = await loginViaUI(page, buddy.email);
      check('buddy signs in', !!url, url);
      // Buddy dashboard should surface the pending reviews (wait for it to
      // render rather than racing the data fetch).
      const pendingSeen = await page.getByText(/pending review/i).first()
        .waitFor({ state: 'visible', timeout: 10000 })
        .then(() => true).catch(() => false);
      check('buddy dashboard shows pending reviews', pendingSeen, pendingSeen ? 'visible' : 'text not found');
      // Fetch current DB states first — p1_w1 is already buddy_approved from
      // the rejection round-trip in step 6, and its review page renders the
      // approved state (no approve button), so it must be verified not re-clicked.
      const { data: preStates, error: preStateErr } = await svc
        .from('worksheet_submissions')
        .select('worksheet_id, review_status')
        .eq('user_id', joinee.id)
        .in('worksheet_id', ALL_WORKSHEETS);
      check('fetch current submission states (step 7)', !preStateErr, preStateErr?.message);
      const preStateByWs = Object.fromEntries((preStates || []).map(s => [s.worksheet_id, s.review_status]));
      for (const wsId of ALL_WORKSHEETS) {
        if (preStateByWs[wsId] === 'buddy_approved') {
          check(`buddy approves ${wsId} → buddy_approved`, true, 'already buddy_approved (step 6 round-trip)');
          buddyApprovedCount++;
          continue;
        }
        await page.goto(`${APP_URL}/default/buddy/review/${joinee.id}/${wsId}`, { waitUntil: 'networkidle' }).catch(() => {});
        check(`buddy review page opens (${wsId})`, !page.url().includes('/404'), page.url());
        // The real button label is "Approve (Buddy)" (see WorksheetReview.tsx) —
        // match loosely so an icon + text accessible name still hits.
        const approveBtn = page.getByRole('button', { name: /approve/i }).first();
        if (await approveBtn.count()) {
          await approveBtn.click({ timeout: 10000 });
          // Verify DB state — poll, because the async approve fetch may still
          // be in flight when the click resolves.
          const dbResult = await waitForSubmissionState(svc, joinee.id, wsId, 'buddy_approved');
          check(`buddy approves ${wsId} → buddy_approved`, dbResult.ok, dbResult.ok ? `state=${dbResult.state}` : `state=${dbResult.state} (timeout)`);
          if (dbResult.ok) buddyApprovedCount++;
        } else {
          check(`buddy approve button found (${wsId})`, false, 'no APPROVE button on review page');
        }
      }
      const bad = filterBenign(errors);
      check('buddy review console clean', bad.length === 0, bad.slice(0, 3).join(' | '));
      await page.close();
    }
    console.log('');

    // ── STEP 8: Manager rejection path (H28) — request revision from phase review ──
    console.log('─── STEP 8: Manager rejection path — request revision from phase review (H28) ───\n');
    if (buddyApprovedCount === ALL_WORKSHEETS.length) {
      const MGR_REVISION_WS = 'p1_w2';
      const MGR_REVISION_COMMENT = 'Browser-pass: please strengthen the lesson plan with concrete examples.';

      // Manager requests revision on a buddy-approved worksheet directly from
      // the phase review page (PhaseReview.tsx H28 panel — comment required).
      const page = await context.newPage();
      const errors = collectPageErrors(page);
      const url = await loginViaUI(page, manager.email);
      check('manager signs in (rejection path)', !!url, url);
      await page.goto(`${APP_URL}/default/admin/review-phase/${joinee.id}/1`, { waitUntil: 'networkidle' }).catch(() => {});
      check('manager phase review page opens (rejection path)', !page.url().includes('/404'), page.url());
      // Every buddy-approved worksheet in the phase renders its own Request
      // Revision panel (textarea #revision-comment-{wsId} + button) — scope to
      // p1_w2's panel instead of a bare getByRole (which would match all 12).
      const revTextarea = page.locator(`#revision-comment-${MGR_REVISION_WS}`);
      if (await revTextarea.count()) {
        await revTextarea.fill(MGR_REVISION_COMMENT);
        const revBtn = revTextarea.locator('xpath=..').getByRole('button', { name: /request revision/i });
        if (await revBtn.count()) {
          await revBtn.click({ timeout: 10000 });
          // Verify the DB flipped to needs_revision (poll — the async fetch may
          // still be in flight when the click resolves).
          const dbResult = await waitForSubmissionState(svc, joinee.id, MGR_REVISION_WS, 'needs_revision');
          check(`manager requests revision on ${MGR_REVISION_WS} → needs_revision`, dbResult.ok,
            dbResult.ok ? `state=${dbResult.state}` : `state=${dbResult.state} (timeout)`);
        } else {
          check(`manager Request Revision button found (${MGR_REVISION_WS})`, false, 'no Request Revision button in panel');
        }
      } else {
        check(`manager Request Revision panel found (${MGR_REVISION_WS})`, false, `#revision-comment-${MGR_REVISION_WS} not found`);
      }
      const bad = filterBenign(errors);
      check('manager rejection page console clean', bad.length === 0, bad.slice(0, 3).join(' | '));
      await page.close();

      // Joinee sees the manager's revision request on their dashboard roadmap.
      const jPage = await context.newPage();
      const jErrors = collectPageErrors(jPage);
      const jUrl = await loginViaUI(jPage, joinee.email);
      check('joinee signs in (manager rejection path)', !!jUrl, jUrl);
      await jPage.goto(`${APP_URL}/default`, { waitUntil: 'networkidle' }).catch(() => {});
      // Same row-scoping trick as step 6: the roadmap row for p1_w2 (a Link to
      // /phase-1/worksheet-2) now carries the Needs Revision label; the "Continue
      // Where You Left Off" banner links to the same path but shows the
      // worksheet name, not the status label.
      const row = jPage.locator('a[href*="phase-1/worksheet-2"]').filter({ hasText: 'Needs Revision' });
      const rowSeen = await row.waitFor({ state: 'visible', timeout: 10000 })
        .then(() => true).catch(() => false);
      check('joinee dashboard shows Needs Revision after manager rejection', rowSeen,
        rowSeen ? 'row label visible' : 'row or label not found');
      const jBad = filterBenign(jErrors);
      check('joinee dashboard console clean (manager rejection path)', jBad.length === 0, jBad.slice(0, 3).join(' | '));
      await jPage.close();

      // Restore p1_w2 → buddy_approved via the service role: the owner cannot
      // write buddy_approved (INSERT policy + trigger), and the legal UI path
      // back (joinee resubmit → buddy re-approve) is already exercised by step
      // 6 — a direct restore keeps the phase-approval step below intact.
      // NOTE: the manager's rejection comment/reviewer fields are intentionally
      // left in place — step 9's handleApprovePhase overwrites all reviewer
      // metadata with the phase-approval values moments later.
      const { error: restoreErr } = await svc.from('worksheet_submissions').update({
        review_status: 'buddy_approved',
      }).eq('user_id', joinee.id).eq('worksheet_id', MGR_REVISION_WS);
      check(`restore ${MGR_REVISION_WS} → buddy_approved after manager rejection`, !restoreErr, restoreErr?.message);
    } else {
      check('manager rejection path (skipped — buddy step failed)', false, `${buddyApprovedCount}/${ALL_WORKSHEETS.length} buddy_approved`);
    }
    console.log('');

    // ── STEP 9: Manager phase-level approval for phases 1–3 (UI) ──
    console.log('─── STEP 9: Manager approves phases 1 → 2 → 3 (UI) ───\n');
    if (buddyApprovedCount === ALL_WORKSHEETS.length) {
      const page = await context.newPage();
      const errors = collectPageErrors(page);
      const url = await loginViaUI(page, manager.email);
      check('manager signs in', !!url, url);
      for (const phaseNum of PHASE_NUMBERS) {
        const wsList = PHASE_WORKSHEETS[phaseNum];
        // Phase review page for the joinee, this phase number
        await page.goto(`${APP_URL}/default/admin/review-phase/${joinee.id}/${phaseNum}`, { waitUntil: 'networkidle' }).catch(() => {});
        check(`manager phase ${phaseNum} review page opens`, !page.url().includes('/404'), page.url());
        const approvePhase = page.getByRole('button', { name: /approve phase/i }).first();
        if (await approvePhase.count()) {
          await approvePhase.click({ timeout: 10000 });
          await sleep(1500);
          const actionMsg = await page.locator('.lux-alert').first().textContent().catch(() => '');
          console.log(`  ℹ  Approve Phase ${phaseNum} click — app message: ${(actionMsg || '').trim().substring(0, 80)}`);
        } else {
          console.log(`  ⚠️ No APPROVE PHASE ${phaseNum} button found on manager review page`);
        }
        const bad = filterBenign(errors);
        check(`manager phase ${phaseNum} review console clean`, bad.length === 0, bad.slice(0, 3).join(' | '));
        // Verify the phase approval flipped EVERY worksheet of this phase to
        // approved — the app can partially approve ("Only X of Y were
        // approved"), so poll the whole set until all land.
        const mgrDb = await waitForAllSubmissionsState(svc, joinee.id, wsList, 'approved', 20000);
        const approvedNow = Object.values(mgrDb.states).filter(s => s === 'approved').length;
        check(`DB: all ${wsList.length} phase-${phaseNum} worksheets → approved`, mgrDb.ok,
          mgrDb.ok ? 'all approved' : `${approvedNow}/${wsList.length} approved (${JSON.stringify(mgrDb.states)})`);
      }
      await page.close();
    } else {
      check('manager phase approvals (skipped — buddy step failed)', false, `${buddyApprovedCount}/${ALL_WORKSHEETS.length} buddy_approved`);
    }
    console.log('');

    // ── STEP 10: Super admin global view ─────────────────
    console.log('─── STEP 10: Super admin /super-admin/campuses ───\n');
    {
      const page = await context.newPage();
      const errors = collectPageErrors(page);
      const url = await loginViaUI(page, superAdmin.email);
      await page.goto(`${APP_URL}/super-admin/campuses`, { waitUntil: 'networkidle' }).catch(() => {});
      check('super admin campuses page opens', !page.url().includes('/404'), page.url());
      // CampusManagement renders each campus by name (no table) — assert the
      // default campus name appears on the page.
      const campusSeen = await page.getByText(defaultCampus.name).first()
        .waitFor({ state: 'visible', timeout: 10000 })
        .then(() => true).catch(() => false);
      check('super admin sees campus content', campusSeen, `looking for "${defaultCampus.name}"`);
      const bad = filterBenign(errors);
      check('super admin console clean', bad.length === 0, bad.slice(0, 3).join(' | '));
      await page.close();
    }
    console.log('');

    // ── STEP 11: Onboarding lead read-only ───────────────
    console.log('─── STEP 11: Onboarding lead read-only ───\n');
    {
      const page = await context.newPage();
      const errors = collectPageErrors(page);
      const url = await loginViaUI(page, onboardingLead.email);
      check('onboarding lead signs in', !!url, url);
      await page.goto(`${APP_URL}/default/onboarding-lead`, { waitUntil: 'networkidle' }).catch(() => {});
      const approveButtons = await page.getByRole('button', { name: /approve|review/i }).count();
      check('onboarding lead has no approve/review actions', approveButtons === 0, `${approveButtons} found`);
      const bad = filterBenign(errors);
      check('onboarding lead console clean', bad.length === 0, bad.slice(0, 3).join(' | '));
      await page.close();
    }
    console.log('');
  } finally {
    await browser.close();
  }

  // ── STEP 12: Cleanup + summary ────────────────────────
  await cleanup(users);

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  BROWSER PASS — ${passes} passed, ${failures} failed`);
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
