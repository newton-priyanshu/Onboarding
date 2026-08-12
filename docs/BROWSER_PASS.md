# Browser Pass — All-Roles UI Regression (`scripts/browser-pass.mjs`)

**Environment:** Live Supabase project (via `VITE_SUPABASE_URL`) + dev server on `localhost:5173`
**Automation:** Real Chromium via Playwright (`@playwright/test`) — drives the app through the UI exactly as a user would, with per-page console/pageerror/requestfailed watchers. Provisioning/DB verification use the service-role key.
**Relation to `docs/FULL_FLOW_TEST.md`:** that doc covers the **API-level** `scripts/full-flow-test.mjs` (RLS/state-machine/negative suite, no browser); this doc is its **UI-level** counterpart. Both run the same 10-role flow; the browser pass additionally asserts that the UI actually renders it (buttons, labels, links, console-clean). See that doc's *Full-flow vs browser-pass* section for the division of labor; the dated bug report for the API suite lives in `docs/E2E_BUG_REPORT.md`.

---

## Why it exists

The browser pass exists to catch regressions that unit/API tests can't:

- **RLS/policy regressions** that only surface through the app's actual write paths — e.g. the resubmit 403 (owner's upsert of `revision_submitted` was rejected by the `Insert own submissions` policy's `WITH CHECK`; see *Regressions it guards*).
- **Broken routes/links** — e.g. BUG-3 (`/phase-1/worksheet-` with an empty worksheet id → 404).
- **Console errors / failed requests** that ship silently otherwise (the `start_date` 400).
- **Pointer-interception bugs** — e.g. the App-level WelcomeOverlay swallowing clicks on the joinee's submit button (the script dismisses it, mirroring real-user behavior).
- The **full rejection lifecycle** end-to-end: both the buddy rejection round-trip and the manager rejection path (H28), verified through the real review UI + the joinee dashboard.

---

## Prerequisites

1. Dev server running: `npm run dev` → `http://localhost:5173`
2. `.env` with:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_SERVICE_ROLE_KEY`

## How to run

```bash
node scripts/browser-pass.mjs        # or: npm run test:browser
```

The script is **self-contained and repeatable**: it provisions a fresh set of timestamped e2e users (one per role) at the start and cleans them up at the end. A non-zero exit means at least one check failed; every failure is listed in the final summary.

---

## The full flow (13 steps)

The table below is a **table of contents**: each step links to its section further down. Steps 6 and 8 carry the full rejection-path detail.

| Step | What it verifies |
|------|------------------|
| [**STEP 0**](#step-0-dev-server-probe) | Dev server reachable at `APP_URL`. |
| [**STEP 1**](#step-1-provision-role-users) | Provisions 10 role users (super_admin, campus_head, academic_head, progression_head, ops_head, campus_admin, onboarding_lead, lead_instructor, lab_instructor, new_joinee) via the service-role admin API + profile rows. |
| [**STEP 2**](#step-2-assign-buddy-and-manager) | Assigns buddy (`lead_instructor`) + manager (`academic_head`) to the joinee (and the lab instructor). |
| [**STEP 3**](#step-3-seed-worksheets-for-phases-1-to-3) | Seeds the full worksheet set for phases 1–3 (23 worksheets incl. gate checks) → `pending_review`, owner-legal (the joinee's anon client). |
| [**STEP 4**](#step-4-ui-sign-in-for-every-role) | UI sign-in for every role — dashboard renders, URL leaves `/login`, no error alert, console clean. |
| [**STEP 5**](#step-5-joinee-worksheet-page) | Joinee worksheet page — renders, the owner has **no approve control**, and the URL carries a real worksheet id (BUG-3 regression). |
| [**STEP 6**](#step-6-buddy-rejection-round-trip) | **Buddy rejection round-trip** — full `needs_revision → revision_submitted → buddy_approved` cycle through the UI. |
| [**STEP 7**](#step-7-buddy-approves-the-remaining-worksheets) | Buddy UI approves the remaining worksheets (23 total; `p1_w1` is already `buddy_approved` from step 6 and is verified from the DB), each confirmed `buddy_approved`. |
| [**STEP 8**](#step-8-manager-rejection-path-h28) | **Manager rejection path (H28)** — per-worksheet Request Revision from the phase review page. |
| [**STEP 9**](#step-9-manager-phase-approvals) | Manager phase-level approvals for phases 1 → 2 → 3 via the phase review page; every worksheet in each phase flips to `approved` in the DB (incl. gate checks). |
| [**STEP 10**](#step-10-super-admin-global-view) | Super admin global view (`/super-admin/campuses`) renders campus content. |
| [**STEP 11**](#step-11-onboarding-lead-read-only) | Onboarding lead dashboard is read-only (no approve/review actions). |
| [**STEP 12**](#step-12-cleanup-and-summary) | Best-effort cleanup of the provisioned users + seeded rows, then the pass/fail summary. |

---

## Steps in detail

### STEP 0: Dev server probe

Asserts `APP_URL` is reachable before any provisioning starts, so a missing dev server fails fast with a clear message instead of a cascade of login timeouts.

### STEP 1: Provision role users

Creates one timestamped e2e user per role (10 total, listed in the TOC table) via the service-role admin API, plus their profile rows — the same privileged-seeding path used by `docs/E2E_BUG_REPORT.md`'s API suite.

### STEP 2: Assign buddy and manager

Writes the buddy (`lead_instructor`) and manager (`academic_head`) assignments for the joinee (and the lab instructor), so review routing is exercised with real relationships.

### STEP 3: Seed worksheets for phases 1 to 3

Seeds the full worksheet set for phases 1–3 — 23 worksheets including gate checks — all `pending_review` and owner-legal (written through the joinee's anon client so RLS accepts them).

### STEP 4: UI sign-in for every role

Signs into the app as each of the 10 roles: the dashboard renders, the URL leaves `/login`, no error alert appears, and the page console is clean.

### STEP 5: Joinee worksheet page

Opens a worksheet as the owner: it renders, the owner has **no approve control** (guards BUG-1 self-approval), and the URL carries a real worksheet id (BUG-3 regression — no `/worksheet-` with an empty id).

### STEP 6: Buddy rejection round-trip

Exercises the full `needs_revision → revision_submitted → buddy_approved` cycle on `p1_w1` **through the UI**:

1. **Re-seed** `p1_w1` → `pending_review` (owner-legal upsert; keeps the step self-contained).
2. **Buddy requests revision** on `/default/buddy/review/{joineeId}/p1_w1` — fills `#review-comment` (a comment is required by `handleBuddyRevision`) and clicks **Request Revision** → DB poll confirms `needs_revision`.
3. **Joinee sees it** — dashboard roadmap row for `/phase-1/worksheet-1` carries the **"Needs Revision"** label. The selector is scoped with `.filter({ hasText: 'Needs Revision' })` because the "Continue Where You Left Off" banner also links to the same path but shows the worksheet name, not the status label.
4. **Joinee resubmits via the worksheet UI** — the form re-renders for `needs_revision` (not the read-only SubmittedView); the "Revision Requested" feedback banner is asserted, the required `#buddy-name`/`#buddy-date` fields (left empty by the seed) are filled, and **Finish Worksheet** is clicked → DB poll confirms `revision_submitted`. The App-level WelcomeOverlay is dismissed first (it intercepts the click otherwise).
5. **Buddy re-approves** via the review UI → DB poll confirms `buddy_approved`.
6. **Joinee dashboard** shows the **"Buddy Approved"** label on the row.

`p1_w1` is intentionally left `buddy_approved` — step 7 verifies it from the DB instead of re-clicking.

### STEP 7: Buddy approves the remaining worksheets

Buddy UI approves every remaining worksheet (23 total; `p1_w1` is already `buddy_approved` from step 6 and is verified from the DB), each confirmed `buddy_approved` by the poller.

### STEP 8: Manager rejection path (H28)

H28 was the audit finding "manager has no rejection path — buddy-approved work can only be approved or silently stalled." The app now supports per-worksheet **Request Revision** for the manager on both the review page and the **phase review page** (`PhaseReview.tsx`). The browser pass exercises the phase-review-page path on `p1_w2`:

1. Runs only when step 7 left all 23 worksheets `buddy_approved` (the manager can only reject a `buddy_approved` worksheet).
2. **Manager opens `/default/admin/review-phase/{joineeId}/1`** — every buddy-approved worksheet renders its own Request Revision panel (`#revision-comment-{wsId}` + button, comment required).
3. Fills `#revision-comment-p1_w2` and clicks that worksheet's **Request Revision** button, scoped to the panel via `revTextarea.locator('xpath=..')` (a bare `getByRole` would match all 12 phase-1 panels) → DB poll confirms `buddy_approved → needs_revision`.
4. **Joinee sees it** — dashboard roadmap row for `/phase-1/worksheet-2` shows **"Needs Revision"**.
5. **Restores** `p1_w2` → `buddy_approved` via the **service role**: the owner cannot write `buddy_approved` (INSERT policy + state-machine trigger), and the legal UI path back (joinee resubmit → buddy re-approve) is already covered by step 6 — a direct restore keeps step 9's phase approvals intact. (The manager's rejection comment/reviewer fields are intentionally left in place; step 9's `handleApprovePhase` overwrites all reviewer metadata.)

### STEP 9: Manager phase approvals

Manager approves phases 1 → 2 → 3 via the phase review page; every worksheet in each phase (including gate checks) flips to `approved` in the DB. This is the step the step-8 restore exists to keep intact.

### STEP 10: Super admin global view

Super admin opens `/super-admin/campuses` and the global campus view renders — verifies the multi-tenant super-admin surface isn't broken by the flow's writes.

### STEP 11: Onboarding lead read-only

Onboarding lead dashboard is read-only — no approve/review actions render, confirming role-scoped UI gating.

### STEP 12: Cleanup and summary

Best-effort cleanup of the provisioned users + seeded rows, then the final pass/fail summary (every failure listed; non-zero exit on any check failure).

---

## Regressions it guards

| Regression | How the pass catches it |
|------------|-------------------------|
| **Resubmit RLS 403 (revision round-trip broken)** | Step 6's resubmit upsert carries `review_status='revision_submitted'`; the `Insert own submissions` policy used to reject that with 42501/403 → the DB poll times out and the round-trip fails. Fixed in repo SQL (all 4 canonical copies now allow `revision_submitted`); live fix: `SUPABASE_PAT=<token> node scripts/run_resubmit_rls_fix.cjs`. |
| **Review state machine drift (owner self-approve / manager skip-buddy)** | Guarded by the canonical `validate_review_transition` trigger (see `docs/E2E_BUG_REPORT.md` BUG-1/BUG-2 + `scripts/verify_review_trigger.mjs`); the browser pass asserts the owner has no approve control and that phase approvals only succeed after buddy approval. |
| **Broken worksheet links (BUG-3)** | Step 5 asserts the worksheet URL ends in a real id (no `/worksheet-`). |
| **Console errors / failed requests** | Every UI step (4–11) runs console/pageerror/requestfailed watchers on each page (benign favicon/abort noise filtered). |
| **WelcomeOverlay pointer interception** | The joinee's Finish Worksheet click would time out with "element intercepts pointer events"; the script dismisses the overlay (same class of bug as the login submit button). |

## Related unit tests

- `scripts/__tests__/submissionPoller.test.mjs` — the DB-polling helpers used by the rejection steps (partial-approval failure, error-swallowing, injectable interval).
- `src/utils/__tests__/worksheetStatus.test.ts` — the dashboard roadmap label mapping the rejection steps assert (`needs_revision` → "Needs Revision" etc.).
- `src/api/__tests__/worksheetResubmitPolicy.test.ts` — drift guard: the `Insert own submissions` policy must keep allowing `revision_submitted` in all 4 canonical SQL files.
- `src/api/__tests__/reviewTriggerMigration.test.ts` — drift guard for the canonical trigger markers.
