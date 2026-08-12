# Full-Flow Test — API-Level E2E Regression (`scripts/full-flow-test.mjs`)

**Environment:** Live Supabase project (via `VITE_SUPABASE_URL`) — no browser, no dev server.
**Automation:** `@supabase/supabase-js` API clients — anon-key sign-in per role to satisfy RLS, service key only for setup RLS legitimately forbids (assignment fallback) and verification reads.
**Users:** The 10 e2e users created by `scripts/create-10-role-users.mjs` (looked up live by role — most recent `e2e.*` user per role, password `Test123!`).
**Relation to `docs/BROWSER_PASS.md`:** that doc covers the **UI-level** Playwright browser pass (`scripts/browser-pass.mjs`); this doc is its **API-level** counterpart. Both run the same 10-role flow; the full-flow test additionally asserts that **RLS and the state-machine trigger actually enforce** the rules through the API, including the negative/security suite. The dated bug report for this suite lives in `docs/E2E_BUG_REPORT.md`.

---

## Why it exists

The full-flow test is the **security / policy layer** of the e2e suite. It exercises exactly the paths a user (or attacker) can hit, at the API boundary, and asserts the database — not the UI — is what enforces access:

- **RLS policy enforcement** — every action runs as a signed-in user's JWT; forged rows, cross-campus reads, and privilege escalation must be blocked by policies, not by the frontend.
- **Review state-machine trigger** — the `validate_review_transition` trigger must block the owner from self-approving and enforce the buddy → manager chain.
- **Read-only role scoping** — `onboarding_lead` cannot write submissions; `super_admin` can read globally.
- **Cross-campus isolation** — a campus-scoped reviewer can read own-campus rows but not other-campus rows.

Because it's pure API, it's fast and browser-independent — the checks UI tests can't reach (or would be flaky at), and the layer that guards against RLS/trigger drift.

---

## Prerequisites

1. `.env` with:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_SERVICE_ROLE_KEY`
2. The 10 e2e role users provisioned: `node scripts/create-10-role-users.mjs` (the suite looks them up live by role and fails fast if any is missing).

No dev server is needed — this suite talks to Supabase directly.

## How to run

```bash
node scripts/create-10-role-users.mjs   # once, or to refresh users
node scripts/full-flow-test.mjs         # the suite
```

A non-zero exit means at least one check failed; every failure is listed in the final summary with its detail.

---

## The full flow (8 steps)

| Step | What it verifies |
|------|------------------|
| **1** | Look up the 10 e2e users + campuses (most recent `e2e.*` user per role). |
| **2** | Every role can sign in (anon key, real JWT). |
| **3** | Assign buddy + manager to the joinee and the lab instructor — real `academic_head` RLS path first, service-key fallback. |
| **4** | Joinee submits `p1_w1` and `p1_w3` → `pending_review` (stale rows reset first). |
| **5** | Buddy approves `p1_w1` → `buddy_approved`. |
| **6** | Manager approves `p1_w1` → `approved`. |
| **7** | Rejection cycle on `p1_w3`: buddy requests revision → `needs_revision`, joinee resubmits → `revision_submitted`, buddy re-approves → `buddy_approved`. |
| **8** | Negative/security suite — see below. |

## Negative tests in detail (STEP 8)

| # | Check | What must happen |
|---|-------|------------------|
| **8a** | Joinee cannot force own `review_status` → `'approved'` | Blocked by the `validate_review_transition` trigger (BUG-1 regression — the live DB was once missing it). |
| **8b** | Joinee cannot insert a submission for another user (forge) | RLS `INSERT` policy rejects. |
| **8c** | Joinee cannot change own role to `academic_head` | RLS `UPDATE` on `user_profiles` rejects. |
| **8d** | `onboarding_lead` cannot update submissions (read-only) | 0 rows affected / error. |
| **8e** | Cross-campus isolation | Positive: `campus_admin` reads own-campus rows. Negative: after moving to a second campus (profile + JWT `app_metadata` synced), default-campus rows invisible. Temporary campus cleaned up after. |
| **8f** | `super_admin` can read any campus submissions | Global read succeeds. |
| **8g** | User cannot forge a notification for another user | `notifications` INSERT rejects. |

---

## Full-flow vs browser-pass — division of labor

Both e2e layers run the same 10-role happy path; they differ in *what they can prove*:

| | `full-flow-test.mjs` (API) | `browser-pass.mjs` (UI) |
|---|---------------------------|--------------------------|
| **Layer** | API boundary (`supabase-js`) | Real Chromium via Playwright |
| **Needs** | `.env` + provisioned e2e users; no browser, no dev server | `.env` + **dev server on `localhost:5173`** |
| **Provisioning** | Depends on pre-provisioned `e2e.*` users (`scripts/create-10-role-users.mjs`) — run it first | **Self-contained**: provisions its own timestamped users and cleans them up |
| **Proves** | RLS enforcement, state-machine trigger, negative/security checks (forge, escalation, read-only, cross-campus, notification forge) | The UI actually renders it — buttons, labels, links, console-clean, pointer-interception, DB-poller round-trips |
| **Catches** | Policy/trigger drift, privilege escalation, cross-campus leaks, forged rows (BUG-1/BUG-2 class) | Broken routes/links (BUG-3), console errors (`start_date` 400), RLS 403s on the real UI write path (resubmit), WelcomeOverlay click interception |
| **Misses** | Anything about rendering, links, console, click targets | Negative/security cases with no UI surface; anything a slow page load would flake on |
| **Speed** | Fast — seconds, no browser | Slow — minutes, real browser |
| **Run when** | Every backend/Rls change, CI-friendly | Every UI/navigation/console change; before release |

**Rule of thumb:** if a backend/Rls/trigger change breaks the app, the API suite fails first and precisely; if a UI/navigation change breaks the app, the browser pass fails first. Run **both** before shipping.

---

## Regressions it guards

| Regression | How the pass catches it |
|------------|-------------------------|
| **Review state-machine trigger missing/divergent (BUG-1/BUG-2)** | 8a blocks owner self-approval; step 6 enforces the buddy → manager chain (no skip). Canonical trigger markers are additionally guarded in-repo by `src/api/__tests__/reviewTriggerMigration.test.ts`. |
| **Resubmit RLS 403 (revision round-trip broken)** | Step 7's joinee resubmit writes `revision_submitted` via `UPDATE` — the API-level counterpart of the browser pass's upsert path (see `docs/BROWSER_PASS.md` + `docs/E2E_BUG_REPORT.md`). |
| **Cross-campus isolation drift** | 8e (positive + negative on a campus-scoped reviewer role). |
| **Forged submissions / notifications / role escalation** | 8b, 8c, 8g. |
| **Read-only role scoping** | 8d. |
| **Super-admin global read** | 8f. |

## Related unit tests

- `src/api/__tests__/reviewTriggerMigration.test.ts` — drift guard: the canonical trigger markers must survive in the repo migration SQL (guards the BUG-1/BUG-2 class this suite catches live).
- `src/api/__tests__/worksheetResubmitPolicy.test.ts` — drift guard: the `Insert own submissions` policy must keep allowing `revision_submitted` in all 4 canonical SQL files.
- `scripts/__tests__/submissionPoller.test.mjs` — the DB-polling helpers used by the browser pass's rejection steps.
- `src/utils/__tests__/worksheetStatus.test.ts` — the dashboard roadmap label mapping the browser pass asserts.

## Related docs

- `docs/BROWSER_PASS.md` — UI-level counterpart: the Playwright all-roles browser pass (`scripts/browser-pass.mjs`), full step list, both rejection paths, and the regressions it guards.
- `docs/E2E_BUG_REPORT.md` — the dated bug report from the original full-flow run (BUG-1 … BUG-5 and fixes).
