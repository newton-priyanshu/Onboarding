# BUGS — Consolidated Bug Tracker

> Single source of truth for every known bug found during the adversarial QA
> passes (see [`docs/QA_TEST_PLAN.md`](./QA_TEST_PLAN.md) and the detailed
> [`docs/QA_BUG_REPORT.md`](./QA_BUG_REPORT.md)). This file tracks **fix status**
> as each bug is implemented. A bug is only `FIXED` when its code fix is merged,
> validated (typecheck/tests), and — where applicable — applied to the live DB.
>
> Status legend: `OPEN` · `IN PROGRESS` · `FIXED` · `N/A` (not a code defect)

---

## Fix Status Dashboard

| Bug | Severity | Priority | Status | Fixed in |
| --- | -------- | -------- | ------ | -------- |
| BUG-1 — Campus head leaderboard RPC 404 | High | P1 | FIXED (code half) | `LeaderboardPanel` degradation; deploy half = run gamification migration |
| BUG-2 — `campus_admin` has no nav link | Medium | P2 | FIXED | `src/components/Navbar.tsx` |
| BUG-3 — Admin roles land on joinee dashboard | Low | P3 | FIXED | `src/App.tsx` `CampusHomeRoute` |
| BUG-4 — Test-account passwords inconsistent | Low | P3 | FIXED | seed scripts + `scripts/qa-credentials.mjs` + docs |
| BUG-5 — `/worksheet/` 404 console noise | Low | P3 | FIXED | `LegacyRouteFallback` bare-`worksheet` redirect |
| BUG-6 — Unknown route may render dashboard instead of 404 | Low | P3 | FIXED | regression tests (was already correct) |
| BUG-7 — Stale-navigation 404 after approve | Low | P3 | FIXED | `src/pages/WorksheetReview.tsx` `returnToList()` |

---

## BUG-1 — Campus Head "Joinee Momentum" leaderboard fails to load (RPC 404)

- **Severity:** High · **Priority:** P1
- **Module:** `src/components/LeaderboardPanel.tsx` → `get_campus_leaderboard` RPC
- **Status:** FIXED (code half — deploy half outstanding)

**Symptoms:** `Failed to load leaderboard: [object Object]` + 404 in console; the
"Joinee Momentum" section never renders content.

**Root cause (two parts):**
1. **Live-DB migration gap:** `supabase/migrations/20260812000001_gamification.sql`
   (which creates `get_campus_leaderboard`) has not been applied to the live DB.
   This is a deployment step: `SUPABASE_PAT=<token> node scripts/run_gamification_migration.cjs`.
2. **No graceful degradation:** when the RPC is missing (PostgREST error
   `PGRST202` "function not found"), `LeaderboardPanel` surfaces a raw error
   instead of hiding/subduing the section.

**Fix (code, this repo):** detect the RPC-not-found error (PGRST202 / "does not
exist") in `LeaderboardPanel` and render a subtle "Leaderboard unavailable — it
appears once gamification is fully deployed" empty state instead of a raw error.
Done (`src/components/LeaderboardPanel.tsx`).
**Fix (deploy, live DB):** apply the gamification migration (P1 — deployment
step, requires `SUPABASE_PAT`): `SUPABASE_PAT=<token> node scripts/run_gamification_migration.cjs`.
Still outstanding — the code no longer shows an error either way.

## BUG-2 — `campus_admin` role has NO navigation link to their admin dashboard

- **Severity:** Medium · **Priority:** P2
- **Module:** `src/components/Navbar.tsx` (roleLinks + user-menu dropdown)
- **Status:** FIXED

**Symptoms:** a `campus_admin` user sees only Dashboard/Stakeholders links; the
`/admin` route exists and is guarded for `campus_admin` but is unreachable from
the UI (URL-typing only).

**Fix:** added a `campus_admin` branch to `roleLinks` (→ `campusPath('/admin')`,
label "Admin") and to the user-menu dropdown ("Admin Dashboard"), mirroring the
`onboarding_lead` pattern. Also added `campus_admin: 'Campus Admin'` to
`roleLabels` for the badge. Done (`src/components/Navbar.tsx`).

## BUG-3 — Admin/dept-head roles land on the joinee dashboard after login

- **Severity:** Low · **Priority:** P3
- **Module:** `src/App.tsx` → `CampusHomeRoute`
- **Status:** FIXED

**Symptoms:** `campus_admin`, `academic_head`, `onboarding_lead` fall through to
the joinee `<Dashboard />` after login.

**Fix:** `CampusHomeRoute` now redirects `campus_admin` → `admin`,
`academic_head` → `admin`, `onboarding_lead` → `onboarding-lead` (same pattern
as `lead_instructor` → `buddy`). Done (`src/App.tsx`).

## BUG-4 — Test-account passwords inconsistent across seed scripts

- **Severity:** Low · **Priority:** P3
- **Module:** `scripts/create-super-admin.mjs` (SuperAdmin123!),
  `scripts/create-buddy-users.mjs` (Buddy{TS}!), `scripts/create-test-users.mjs` (Test123!)
- **Status:** FIXED

**Symptoms:** `superadmin@newtonschool.co` / `Test123!` → 400; the
`@newtonschool.co` head accounts use non-`Test123!` passwords; buddy accounts
use a per-run suffix. Cost multiple QA reruns.

**Fix:**
1. Standardized `create-super-admin.mjs` and `create-buddy-users.mjs` on
   `Test123!` (all other seed scripts already used it).
2. Added `scripts/qa-credentials.mjs` — prints the email/password matrix for
   every role (single source of truth).
3. Documented the convention in `docs/QA_TEST_PLAN.md` §31 "QA Credentials".
   Note: existing live accounts must be reset (rotate password to `Test123!`)
   with the service role key before the convention fully applies to them.

## BUG-5 — Repeated `/worksheet/` 404 console noise during browser sessions

- **Severity:** Low · **Priority:** P3
- **Module:** route catch-all / stale emitters (no in-repo generator found)
- **Status:** FIXED

**Symptoms:** `Failed to load resource: 404` for `/worksheet/` up to 20× in some
sessions. Repo-wide search found no code emitting a bare `/worksheet/` path
(all worksheet paths include a campus slug + ID via `getWorksheetPath`).

**Fix (defensive):** `LegacyRouteFallback` now treats a bare `/worksheet` /
`/worksheet/` path (no campus prefix, no ID) as "navigate to campus home"
(campus-aware) instead of a 404 — converts stale-emitter noise into a harmless
redirect. Regression tests added in `LegacyRedirect.test.tsx`. If a generator is
later found, fix it at the source (see `getWorksheetPath`).

## BUG-6 (note) — Unknown route `/nonsense` may render dashboard content instead of 404

- **Severity:** Low · **Priority:** P3
- **Module:** route catch-all (`LegacyRouteFallback`)
- **Status:** FIXED (verified — was an agent misread)

**Symptoms:** one browser agent reported dashboard content at `/nonsense`;
repo inspection says `LegacyRouteFallback` renders `NotFound` for non-legacy
routes, so this is likely an agent misread.

**Fix:** added regression tests locking the behavior: `/nonsense` and unknown
routes render `NotFound` (and never fall back to dashboard content), legacy
routes redirect to the campus-scoped equivalent. Done
(`src/components/__tests__/LegacyRedirect.test.tsx`).

## BUG-7 (note) — Stale-navigation 404 after approving a worksheet

- **Severity:** Low · **Priority:** P3
- **Module:** post-approve navigation in `src/pages/WorksheetReview.tsx`
- **Status:** FIXED

**Symptoms:** after Approve/Revision, `navigate(-1)` may land on a stale URL
(the just-reviewed worksheet) producing a benign 404. Action itself is
idempotent (no data damage).

**Fix:** added `returnToList()` in `WorksheetReview` — after approve/reject,
navigate (with `replace`) to the review-origin list page (`/buddy`, `/admin`,
or `/onboarding-lead` depending on the current path) instead of `navigate(-1)`,
so Back never re-opens a stale review URL. Done (`src/pages/WorksheetReview.tsx`).

---

## Notes

- BUG-6 and BUG-7 were "notes" in the QA report (flagged for re-verification);
  they are tracked here as real fixes (regression test / navigation hardening).
- The **only P1** remains BUG-1's deployment half: apply the gamification
  migration to the live DB. The code half (graceful degradation) ships in this
  change set.
- Existing live QA accounts need their passwords rotated to `Test123!` with the
  service role key for BUG-4's convention to fully apply (scripts now create
  new accounts with `Test123!`; resetting existing accounts is a one-time step).
- After all fixes are implemented, update the Status Dashboard in
  `docs/QA_BUG_REPORT.md` and re-run the QA suites (vitest, full-flow,
  qa-pass2, browser-pass).
