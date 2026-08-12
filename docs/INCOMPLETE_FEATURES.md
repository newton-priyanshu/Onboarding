# INCOMPLETE FEATURES & PARTIAL FLOWS

> **Purpose:** one place listing every feature / flow that is **half-completed or
> not fully completed** as of this commit, so the next working session (or QA
> pass) knows exactly what remains. Cross-references:
> [`docs/BUGS.md`](./BUGS.md) (bug fixes) · [`docs/QA_BUG_REPORT.md`](./QA_BUG_REPORT.md)
> (QA health) · [`docs/MULTI_TENANT_MIGRATION_PLAN.md`](./MULTI_TENANT_MIGRATION_PLAN.md)
> (10-phase migration plan with checkboxes).
>
> Legend: 🟡 = half-completed (code exists, deployment/config/edge missing) ·
> ⬜ = not started · 🔁 = needs re-run/re-verification

---

## 1. Deployment half of BUG-1 — gamification migration NOT applied to live DB 🟡

- **What exists:** `supabase/migrations/20260812000001_gamification.sql` +
  `scripts/run_gamification_migration.cjs` (idempotent, self-verifying).
- **What's missing:** applying it to the live Supabase project. Requires
  `SUPABASE_PAT` (Personal Access Token — user rotates it, so the script is
  offline until provided).
- **Impact:** campus-head leaderboard (`get_campus_leaderboard` RPC), XP /
  level / streak persistence, persisted achievements, and completion
  certificates are degraded to client-side fallbacks on the live DB. The UI now
  degrades gracefully (BUG-1 code half), but the features are not live.
- **Command when ready:** `SUPABASE_PAT=<token> node scripts/run_gamification_migration.cjs`

## 2. Realtime notifications migration — code done, live application unverified 🟡

- **What exists:** `src/hooks/useNotifications.ts` now subscribes via
  `supabase.channel(...)` + `.subscribe()` (fallback polling retained); migration
  `supabase/migrations/20260730000002_notifications_realtime.sql` creates the
  `supabase_realtime` publication for `notifications`.
- **What's missing:** live application of that migration is **unverified** (same
  `SUPABASE_PAT`-gated path). If it is not yet applied, realtime inserts won't
  stream live — the polling fallback covers it either way.
- **Verify:** after confirming the publication is live, watch a notification
  arrive without a page refresh.

## 3. QA password standardization — scripts done, live accounts not rotated 🟡

- **What exists:** all seed scripts now use `Test123!`;
  `scripts/qa-credentials.mjs` is the single source of truth (BUG-4).
- **What's missing:** rotating **already-created** live QA accounts
  (`superadmin@newtonschool.co`, `campus.head@newtonschool.co`,
  `progression.head@newtonschool.co`, `ops.head@newtonschool.co`,
  `manager@newton.edu`) to `Test123!` with the service role key. Until rotated,
  those accounts keep their legacy passwords.
- **Note:** a reset script can be added on request (targets only the known QA
  emails above, using `VITE_SUPABASE_SERVICE_ROLE_KEY` + the auth admin API).

## 4. Multi-tenant single-tenant fallback mode ⬜ (Phase 11.3)

- **What exists:** `VITE_MULTI_TENANT_ENABLED` documented in `.env.example`;
  multi-tenant is the live default (`/:campusSlug/...` URL prefix + legacy
  redirects).
- **What's missing:** the full "when disabled, behave like the old single-tenant
  app (flat URLs, no campus prefix)" fallback mode is **not implemented**. The
  env var exists but the code does not branch on it.
- **Risk:** if anyone deploys with `VITE_MULTI_TENANT_ENABLED=false`, behavior
  is not guaranteed — don't ship that config.

## 5. Multi-tenant Phase 10 — E2E / load / regression suites 🟡

From `docs/MULTI_TENANT_MIGRATION_PLAN.md` §12.3–12.5 (plan checkboxes
unchecked). Note: the **main full flow is already covered** by
`scripts/full-flow-test.mjs` (28/28) and `scripts/browser-pass.mjs` (11 steps:
joinee → buddy → manager → revisions → phase approvals). What remains is the
**specific scenarios** below, not the whole flow:

- **E2E (§12.3) — the four specific scenarios: ⬜**
  - Super Admin creates campus → Campus Admin assigns buddy → Joinee completes
    onboarding (as one consolidated scripted scenario).
  - Multi-campus parallel flow (Campus A and Campus B independently).
  - Campus deactivation (users redirected, data preserved).
  - Template change mid-onboarding (worksheet structure updates live).
- **Load (§12.4): ⬜** RLS performance with `campus_id` filter; 100+ campuses /
  1000+ users; query latency with and without the campus filter.
- **Regression (§12.5): 🟡** existing single-campus flow via `/default/` prefix
  works (legacy redirect tests cover the redirect); a full
  "no existing functionality broken" sweep after the route migration was not
  re-run end-to-end.

## 6. Campus Settings — Branding section is a stub 🟡

- **What exists:** `src/pages/campus-admin/CampusSettings.tsx` renders a
  "Branding — coming soon" placeholder (`campus_id` fields exist in the DB
  schema: `campuses.branding JSONB`).
- **What's missing:** the actual branding editor (logo URL, theme color,
  welcome message) and applying branding to the UI (logo/badge/colors per
  campus). The DB column is future-ready only.

## 7. Super Admin "campus management" AuthContext placeholder 🟡

- **What exists:** `src/context/AuthContext.tsx` has a comment
  `// Placeholder for Phase 6 — super admin campus management` and a stub
  `manageCampuses`-style hook area.
- **What's missing:** whether the stub is used by any page is unverified; the
  actual campus CRUD lives in the Super Admin pages (`super-admin/campuses`,
  `CampusDetail`, `CampusManagement`). Clean up the stale comment / stub or wire
  it to the real pages.

## 8. Sentry error tracking — guarded init, DSN not configured 🟡

- **What exists:** `src/utils/sentry.ts` + `initSentry()` in `main.tsx`;
  everything is a safe no-op when `VITE_SENTRY_DSN` is unset; CSP in
  `vercel.json` already allows `*.ingest.sentry.io`.
- **What's missing:** a real Sentry project DSN in the environment. Until a DSN
  is set, no errors are reported (by design — nothing is broken, it's just not
  active).

## 9. Browser-pass — campus-head leaderboard step not yet in the script 🔁

- **What exists:** `scripts/browser-pass.mjs` covers 11 steps (joinee → buddy →
  manager → revisions → phase approvals) across roles.
- **What's missing:** the campus-head dashboard (and its leaderboard section)
  is not part of the scripted pass — it was only spot-checked ad hoc in the QA
  loop. Housekeeping item from `QA_BUG_REPORT.md` fix list.

## 10. QA_TEST_PLAN route inventory table ⬜ (housekeeping)

- The plan doc (§8) asks for a route-inventory table (route / purpose /
  public-protected / required role / expected result). It was tracked as a
  housekeeping item but not yet added.

## 11. Gamification migration runner in deploy checklist ⬜ (housekeeping)

- The gamification migration runner (`scripts/run_gamification_migration.cjs`)
  is not yet wired into a formal deploy checklist doc (it's referenced in
  `BUGS.md`/`QA_BUG_REPORT.md` only).

---

## Verified-complete (for contrast — do NOT treat as pending)

- ✅ All 7 QA bugs fixed in code (see `docs/BUGS.md`) — vitest **553/553**,
  `tsc` clean, ESLint 0 errors.
- ✅ Multi-tenant migration applied to live DB (campuses, RLS, review trigger,
  resubmit-RLS fix — applied in prior sessions).
- ✅ Core user flows end-to-end: joinee fill → buddy approve → manager phase
  approve → phase unlock; rejection → revision → resubmit round-trip.
- ✅ Route guards, RLS isolation (22/22), review state machine trigger (4/4),
  concurrency/injection/chaos pass-2 (19/19).
