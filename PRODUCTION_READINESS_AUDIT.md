# Newton Onboarding — Production Readiness Audit

**Audit date:** 2026-07-09  
**Repository:** `github.com/newton-priyanshu/Onboarding` (branch `main`)  
**Method:** 21-dimension parallel audit (Senior Architect / Principal Engineer / QA Lead / Security Engineer / DevOps / PM lenses), with every CRITICAL and HIGH finding independently re-checked by an adversarial "skeptic" agent that tried to refute it against the actual code. 2 findings were refuted and dropped; only surviving findings appear here.

> **This report is generated from a real code read, not from the code compiling.** Every finding cites a file and line that an auditor personally read.

## 1. Verdict

### Can this application be safely deployed to production today?

# ❌ No

The application has **21 CRITICAL** and **45 HIGH** severity issues, including a **complete, independently-confirmed privilege-escalation vulnerability**: Row-Level Security trusts a role value stored in the client-writable JWT `user_metadata`, so any signed-up employee can make themselves an admin and read every colleague's PII, self-approve their own onboarding, or wipe data. Separately, a core submission flow (all FTP gate pages) is silently broken by a `'Submitted'` vs `'submitted'` casing bug, submissions can fail while showing "success" (silent data loss), a full-database-wipe script is committed and aimed at the only (production) Supabase project, and there is no CI/CD, no monitoring, no password-reset flow, and no environment separation.

## 2. Executive summary

| Severity | Count |
|---|---|
| 🔴 CRITICAL | **21** |
| 🟠 HIGH | **45** |
| 🟡 MEDIUM | **90** |
| ⚪ LOW | **40** |
| **Total** | **196** |

The four issues that block launch on their own:

1. **Authorization is trivially bypassable (security / tenancy / privacy / auth — 4 auditors independently confirmed).** RLS policies authorize on `auth.jwt() -> user_metadata -> role`, which the user controls at signup and can update. Result: self-promotion to admin, cross-tenant PII access, self-approval of onboarding. RLS `UPDATE` policies also lack `WITH CHECK`, so a user can rewrite their own `role` column directly.
2. **Silent data loss.** `useAutoSave` reports success even when the save permanently fails, and gate submissions with a status casing mismatch never reach a reviewer — the employee sees "submitted" but nobody ever can approve it.
3. **A destructive, unguarded full-wipe script (`db/__cleanup_test_users.sql`) is committed and points at the single production Supabase project.** There is no environment separation; "test" scripts hardcode the production URL/key.
4. **No production operational baseline:** no CI/CD, no error monitoring, no schema-migration framework (16 loose SQL files), no password-reset flow, no admin recovery for stuck users, and the canonical `schema.sql` is missing tables the app actively uses.

## 3. Production readiness scorecard

| Dimension | Score | Grade |
|---|---|---|
| User Isolation | **4/100** | 🔴 Critical |
| Security | **6/100** | 🔴 Critical |
| Operational Readiness | **8/100** | 🔴 Critical |
| E2E Data Flow & Contracts | **9/100** | 🔴 Critical |
| Privacy & Compliance | **10/100** | 🔴 Critical |
| Auth Flow Deep-Dive | **12/100** | 🔴 Critical |
| Database Schema & Integrity | **14/100** | 🔴 Critical |
| Data Durability & Dangerous Scripts | **14/100** | 🔴 Critical |
| Architecture Integrity | **16/100** | 🔴 Critical |
| Deployment & Ops | **18/100** | 🔴 Critical |
| Observability | **18/100** | 🔴 Critical |
| Documentation & Onboarding | **18/100** | 🔴 Critical |
| Testing & Input Validation | **22/100** | 🔴 Critical |
| Spec Compliance | **24/100** | 🔴 Critical |
| Resource & Cost Control | **24/100** | 🔴 Critical |
| Failure Handling & Recovery | **27/100** | 🔴 Critical |
| Code Quality | **32/100** | 🟠 Poor |
| Performance | **34/100** | 🟠 Poor |
| UI/UX & Accessibility | **42/100** | 🟠 Poor |
| Supply Chain & Dependencies | **47/100** | 🟠 Poor |
| React Frontend Audit | **58/100** | 🟠 Poor |

### Aggregate scores

| Category | Score |
|---|---|
| **Overall Production Readiness** | **22/100** |
| Security | 8/100 |
| Code Quality | 24/100 |
| Maintainability | 22/100 |
| Performance | 29/100 |
| Scalability | 18/100 |
| UI/UX | 42/100 |
| Documentation | 18/100 |
| Testing | 22/100 |
| Data Integrity & Durability | 12/100 |
| Deployment & Ops | 15/100 |

> Full per-finding detail for MEDIUM and LOW issues is in **AUDIT_FINDINGS_DETAIL.md**. The prioritized remediation plan is in **AUDIT_FIX_CHECKLIST.md**.

## 4. Dimension summaries

### Dim 1: Spec Compliance — 24/100
*C:2 H:2 M:3 L:2*

The implementation diverges sharply from what ARCHITECTURE_PLAN.md and REVIEW_FLOW.md promise. The 'strict, DB-enforced' review state machine exists only as a value-set CHECK constraint (db/schema.sql:151) — there is no trigger validating state transitions, and the RLS UPDATE policies place no restriction on which columns/values a joinee or reviewer can write, so a joinee can self-approve via a raw API call. The exact 'status case inconsistency' bug the plan called out to fix was fixed for ordinary worksheets but never for Gate Controls, silently breaking gate submission and permanently blocking Phase 2/3. The docs describe a clean 20-worksheet 3-phase model that the code has replaced with a larger overlapping 'FTP week' structure never reflected in any audited document. QA_REPORT.md's '0 critical bugs' verdict predates this drift and cannot be trusted.

### Dim 2: Code Quality — 32/100
*C:1 H:1 M:6 L:3*

Static analysis only — node_modules is not installed in this environment so `npm test`/`npm run lint` could not be executed (both failed with 'Permission denied' / missing binaries); no CI config exists at the repo root to confirm these gates run anywhere. Reading the source directly surfaced a critical, fully-traced production bug caused by uncentralized status strings, massive copy-pasted business logic across the Phase1-3/Week1-4 pages, a 1043-line God Component (ReviewContent.tsx) with zero behavioral test coverage, four dead 'fix-fg' migration scripts plus a pile of orphaned one-off admin scripts committed to the repo, and systemic silent error-swallowing on every dashboard's data load. TypeScript config itself is reasonably strict (strict, noUnusedLocals, noUncheckedIndexedAccess), which is the one bright spot.

### Dim 3: React Frontend Audit — 58/100
*C:0 H:0 M:6 L:4*

The React layer is functionally complete and mostly well-structured (useWorksheet/useAutoSave correctly use cancellation flags and mountedRef guards, routing is fully protected, Toast context is properly memoized), but it has one clear architectural defect explicitly worth blocking on: AuthContext's value/actions are never memoized, so every login/logout/profile-refresh forces a synchronous re-render cascade through ~28 consumers app-wide. Beyond that, the app has zero code-splitting (every page and the 42KB ReviewContent/35KB worksheetConfigData ship in one bundle), a global ErrorBoundary that takes the Navbar down with any single page crash, several data-fetching effects (WorksheetReview, PhaseReview, PhaseAccessGuard) that lack cancellation guards and can race on rapid navigation between same-shaped routes, and a duplicated NotificationBell/useNotifications polling instance under the mobile drawer. None of these are showstoppers for a first production launch at modest scale, but the AuthContext memoization gap and the error-boundary blast radius should be fixed before launch; the rest are reasonable to ship with tracked follow-ups.

### Dim 4: Deployment & Ops — 18/100
*C:0 H:4 M:4 L:2*

Deployment and Ops posture is not production-ready. There is no CI/CD, no Dockerfile, and no committed config for any of the three hosting targets the project's own docs suggest (Vercel/Netlify/GitHub Pages), so a BrowserRouter SPA with no 404/redirect fallback will 404 on every deep-link refresh regardless of which is chosen. The only server script in the repo (serve-app.mjs) has a straightforward path-traversal arbitrary-file-read bug. Env var handling fails unsafely: missing Supabase credentials crash the app during module evaluation, before the app's own ErrorBoundary can ever catch it, yielding a silent blank screen. Secrets hygiene is poor beyond the already-known committed .env — the same live production Supabase URL/anon key are hardcoded as fallback literals in five-plus utility scripts, meaning there is effectively no dev/prod environment separation. The build pipeline also never type-checks the strict TypeScript config and ships the entire app as one eagerly-loaded bundle. This would not pass a launch review as-is.

### Dim 5: Architecture Integrity — 16/100
*C:2 H:1 M:6 L:2*

Architecture Integrity is not production-ready. The most severe issue: the app runs two incompatible worksheet-to-phase taxonomies simultaneously (legacy ALL_WORKSHEETS driving routing/nav, PHASE_WORKSHEETS_MAP/WK_WORKSHEETS_MAP driving all gating/promotion logic) that disagree about which phase a worksheet belongs to — this produces a real, reproducible core-flow defect where the Phase 1->2->3 access gate is both unsatisfiable through its own intended route tree and trivially bypassable through the parallel /week-N route tree. There is no service/data-access layer (17 files issue raw supabase.from() calls, many duplicating the identical query), worksheet display metadata is hand-duplicated across 5+ files with already-observed drift (numbering gaps, a worksheet appearing twice with contradictory titles), and 'config-driven worksheets' is only a partial truth — worksheetConfigData.ts centralizes IDs/routing/reviewer metadata but not form fields or most display copy, which live hardcoded and re-duplicated across ~40 page files and 5 card-list files. This is strong evidence of an incompletely executed 'Phase/Week merge' (confirmed by git log) that was UI-polished but never architecturally reconciled.

### Dim 6: Database Schema & Integrity — 14/100
*C:2 H:2 M:5 L:2*

The database layer has a critical, repo-wide RLS design flaw: every "update own row" policy on user_profiles and worksheet_submissions omits WITH CHECK, so any authenticated new hire can self-elevate their role (bypassing every downstream role-based RLS gate) or directly set their own worksheet's review_status to 'approved', completely defeating the app's core review/approval workflow — and this is present identically in schema.sql, supabase_schema.sql, setup_correct.sql, and every RLS fix script. Compounding this, the schema itself is in a state of unmanaged drift: the documented "one true" schema.sql is missing the notifications table and due_date column that core features depend on in production, the repo's only migration-runner script points at files that don't exist, and internal docs (SYSTEM_ANALYSIS.md) still point engineers at a years-stale, incompatible schema file. Secondary issues include a spoofable notifications INSERT policy, a missing CHECK constraint that let a real status-badge display bug ship, a non-atomic duplicate-prevention pattern for final assessments, and no ON DELETE semantics anywhere, making user offboarding/erasure operationally blocked. This dimension is not production-ready and should block launch until the RLS WITH CHECK gaps are closed and the schema is consolidated into one verifiably-applied source of truth.</summary>


### Dim 7: Failure Handling & Recovery — 27/100
*C:1 H:3 M:7 L:2*

Failure handling in Newton Onboarding is largely cosmetic: most Supabase writes check `.error` and show a toast, but the two most consequential flows — worksheet submission and initial data hydration — actively hide failures from the user. useAutoSave's save() never rethrows/rejects, so useWorksheet/useGateControl's try/catch around `await flushSave()` is dead code; users see a 'Submitted successfully' toast and get locked into the SubmittedView even when the underlying upsert never persisted (after exhausting 2 retries). The one visible save-status indicator (SaveIndicator) is built but never wired into the header, so there is no persistent UI signal of a failed save at all. Several read paths (PhaseAccessGuard, BuddyGatePass, admin/buddy/lead dashboards' fetchWithCache calls, loadWorksheetData) drop the Supabase `error` field entirely, silently rendering wrong/empty state (locking a legitimate phase, hanging in an infinite loading skeleton, showing 0 instructors) instead of surfacing anything to the user. Partial-failure/notification flows are not atomic and not idempotent on retry.

### Dim 8: E2E Data Flow & Contracts — 9/100
*C:1 H:2 M:3 L:1*

This dimension fails outright: two independently-verified CRITICAL defects break core, non-recoverable end-to-end flows for every user in production. (1) A circular gating bug in PHASE_WORKSHEETS_MAP means Phase 2 and Phase 3 — surfaced, primary navigation — can never unlock, because the worksheets required to satisfy the Phase-1 gate are themselves only reachable behind the Phase-2 lock. (2) A case-sensitive status-string mismatch ('Submitted' vs 'submitted') between useGateControl.ts and useAutoSave.ts/useWorksheet.ts permanently strands every FTP week-gate submission (w1_g1..w4_g1) with review_status stuck at '', invisible to reviewers and unrescuable via the UI, with zero feedback to the submitting user. On top of these, db/schema.sql — documented as the single canonical setup file — omits the notifications table and due_date column the app depends on, breaking any fresh deployment. Reviewer approve/revision actions and the auto-promotion pipeline also lack optimistic-concurrency and re-entrancy guards, enabling stale-tab overwrites and duplicate notification spam. None of this was caught by tests (no useGateControl tests exist at all). This is not production-ready.</summary>


### Dim 9: Security — 6/100
*C:4 H:2 M:1 L:1*

Security is not production-ready and represents a launch-blocking risk. The two most severe findings are textbook Supabase RLS anti-patterns present in the schema explicitly labeled "DEFINITIVE": (1) role-based authorization is sourced from auth.jwt()->user_metadata, which any authenticated user can self-write via the standard supabase.auth.updateUser() client call, granting themselves academic_head/onboarding_lead/lead_instructor at the database layer, not just the UI; and (2) the user_profiles and worksheet_submissions self-update RLS policies have no WITH CHECK clauses, so any new hire can directly set their own profile role to admin or their own worksheets' review_status to 'approved' via a plain Supabase client call, fully bypassing the buddy/manager review workflow that is the product's core purpose. ProtectedRoute/PhaseAccessGuard/route requiredRoles (confirmed client-side-only) provide zero real protection against either vector, and there are no server-side RPCs/SECURITY DEFINER functions anywhere in the codebase enforcing role-scoped state transitions. Compounding this, multiple committed scripts (create-admin.cjs, fix-assignments.cjs, create_32_users.sql, seed scripts) hardcode a shared weak password across dozens of accounts including at least one named manager-role account, targeting the same production project URL already committed via .env. XSS surface is genuinely clean (no dangerouslySetInnerHTML/innerHTML anywhere in src, no markdown/HTML-rendering libraries), and there's no classic open-redirect or SQL/PostgREST filter injection found. But the authorization model itself is fundamentally broken at the data layer, not just missing UI polish — this must be fixed (app_metadata-based roles + WITH CHECK clauses + server-side transition RPCs) before any real user data touches this system.

### Dim 10: Observability — 18/100
*C:0 H:1 M:3 L:2*

Observability is essentially absent. There is zero error-reporting/monitoring SDK anywhere in the dependency tree (grep for Sentry/Bugsnag/LogRocket/Datadog/PostHog/analytics returns nothing) — every error, including those caught by the app's single global ErrorBoundary, terminates at console.error and vanishes once the tab closes. Production builds explicitly disable sourcemaps (vite.config.js sourcemap: false, contradicting the code's own comment), so even a captured stack trace would be unreadable minified code. Logging is unstructured (raw console.error/warn scattered across ~18 files, two inconsistent error-handling paths), there's no audit/activity-log table in the schema so review/approval actions can't be reconstructed after the fact, and there's no build/version identifier or uptime monitoring. Engineering currently has no way to detect, diagnose, or even learn about a production incident short of a user describing it in words — this is a hard blocker for launch.

### Dim 11: Data Durability & Dangerous Scripts — 14/100
*C:2 H:3 M:3 L:0*

This dimension fails outright. There is exactly one Supabase project in existence (fuoqoryqndtdooujslee, the same ref committed in .env and hardcoded as the fallback in nearly every 'test' script), so every destructive or fabricating script in the repo is a live-production hazard, not a safe local tool. db/__cleanup_test_users.sql is an unconditional, unguarded DELETE-everything script (including auth.users) with a misleading name and zero confirmation step, meant to be pasted into the SQL Editor where it bypasses RLS entirely. scripts/clean_setup.mjs contains an all-rows delete that is currently inert only by accident (no DELETE RLS policy exists yet) and will fire the moment one is added. fix_promotion_data.mjs and fix-assignments.cjs hardcode QA credentials and directly forge review/approval and assignment fields outside the app's own review workflow, poisoning the audit trail indistinguishably from real reviews. The documented 'Production Checklist' in context.md even instructs running a seed script (db/seed_worksheets.sql) that upserts fabricated review data over any real row sharing a (user_id, worksheet_id) key. Backup/restore strategy is a single aspirational sentence ('restore from Supabase backup') with no configured export, no verified retention tier, and no RPO/RTO defined. No soft-delete exists anywhere for user or worksheet lifecycle. This cannot be approved for launch without provisioning a real dev/prod split, deleting or hard-gating every destructive script behind a non-prod project check, and standing up a verified, independent backup process.

### Dim 12: Resource & Cost Control — 24/100
*C:0 H:4 M:4 L:2*

Resource and cost control is essentially unaddressed in this codebase: there is zero pagination anywhere (confirmed by grep — no `.range()` usage at all), the two role-based admin dashboards run genuinely unbounded queries on user_profiles and a hard-capped-but-unordered `.limit(500)` on worksheet_submissions that will silently truncate data at the org's current realistic scale (~30 seeded users × ~20-25 worksheets/user already exceeds 500 rows), notification polling runs every 15s indefinitely per open tab with no visibility-based backoff (and can double when the mobile nav is open), and there is no application-level rate limiting anywhere combined with a git-committed anon key — meaning unbounded direct-API abuse against Supabase is one curl script away. The most serious finding is a completely open `notifications` INSERT RLS policy (`WITH CHECK (true)`) that lets any self-registered account write unlimited rows for any target user with no retention/cleanup job ever active, giving a trivial, low-effort storage/cost-DoS vector. None of this is exotic at-scale-in-5-years risk — the truncation and fan-out issues bite at the company's first cohort of ~25-30 employees.

### Dim 13: Performance — 34/100
*C:0 H:1 M:3 L:3*

The app has no code splitting anywhere (App.tsx statically imports every page, and worksheetConfig.tsx eagerly imports all 40 worksheet/gate-control components), so a first-time visitor to /login downloads the JS for every dashboard, every worksheet form across all phases/weeks, and the 35KB config data before anything role-relevant is needed — vite.config.js even shows the chunk-size warning threshold was raised rather than the bundle being split. Beyond bundle size, the admin/lead dashboards hard-cap worksheet queries at 500 rows with no ordering, which — given the project's own 30-user seed script and ~33 worksheets/user — will silently truncate and corrupt dashboard data at the documented target scale; the phase-approval action performs a genuine sequential-await waterfall (up to ~17 serialized round trips) that freezes the UI; and there is essentially zero memoization anywhere in the dashboard/admin code, so per-row stats are recomputed via full array scans on every render, including every keystroke in the unthrottled admin search box. These are concrete, scale-triggered defects rather than cosmetic nitpicks, which is why this dimension is not launch-ready as-is.

### Dim 14: User Isolation — 4/100
*C:2 H:2 M:2 L:0*

User isolation is comprehensively broken at every layer the app relies on. Every RLS policy that grants reviewer/admin access is anchored to auth.jwt()->user_metadata->>role, which is ordinary Supabase user_metadata that any authenticated client can rewrite via supabase.auth.updateUser() (a code path the app itself exercises in useAutoPromote.ts) — meaning any signed-up user can self-escalate to academic_head/lead_instructor/onboarding_lead and gain RLS-level read+write over every other employee's profile and worksheet data. Independently, the 'Update own profile' policy has no column restriction, so a user can also just UPDATE their own role/assigned_lead_id/assigned_buddy_id directly. On top of that, the reviewer RLS policies OR a bare role check with the assignment check instead of ANDing them, so even a legitimately-scoped buddy/manager account can read and approve any other buddy's/manager's assignees — confirmed independently at the route layer (ProtectedRoute only checks role, never :userId against assignment) and the component layer (WorksheetReview/PhaseReview/BuddyGatePass gate approve actions purely on profile.role). A buddy-mode write path (useWorksheet overrideUserId) even lets an unassigned buddy overwrite a joinee's raw worksheet content, not just its approval state. The one table that does isolation correctly (notifications SELECT/UPDATE) still allows forging arbitrary notifications on INSERT. This is not launch-ready under any reasonable interpretation — it requires a full RLS redesign (server-trusted role source, AND-based ownership checks) before this app can hold real employee data.

### Dim 15: Privacy & Compliance — 10/100
*C:1 H:1 M:5 L:1*

Privacy posture is not production-ready: every authorization check that gates access to employee PII (names, emails, department, buddy/manager assignments, assessment answers, and manager review feedback) relies on a JSON field the client itself writes and can freely rewrite, so any signed-up user can trivially grant themselves company-wide read access to everyone's personnel data. On top of that there is no right-to-erasure mechanism, no data-export/portability feature, and no consent notice or privacy policy anywhere in the signup flow — the only 'deletion' tooling is a blunt SQL script that wipes the entire database rather than a single user's record. Seed scripts also commit a shared weak password and default to the live Supabase project URL, so if ever run against prod they plant persistent low-effort backdoor accounts.

### Dim 16: Supply Chain & Dependencies — 47/100
*C:0 H:0 M:3 L:3*

Lockfile integrity is genuinely solid (325/325 packages have integrity hashes, all resolved from registry.npmjs.org, no rogue git/tarball deps, no typosquats), and the "lucide-react is ancient 1.x" hypothesis in the brief is disproven -- lucide-react ^1.21.0 is only 3 minor versions behind the real latest (1.24.0), not a legacy 0.x package. However, the project has zero dependency-update process: every one of 27 deps uses an unpinned ^ range, there is no CI/CD anywhere in the repo to gate installs/builds/audits, no `engines` field despite Vite 8 requiring a narrow Node range, and npm audit surfaces a real unpatched HIGH-severity undici vulnerability chain (dev-only via jsdom/vitest, but sitting unaddressed with a trivial fix available). Dependency classification is sloppy: `ws` and `dotenv` are declared as production dependencies but are used exclusively by one-off Node seed/admin scripts never touched by the shipped src/ app, and `tslib` is a dead top-level entry already satisfied transitively. None of this blocks the app's core runtime today (it's a Supabase-only frontend with no server dependency chain shipping to users), but the complete absence of any automated dependency hygiene process is a real production-readiness gap for an app that has already made several bleeding-edge major-version bets (React 19, Vite 8/Rolldown, Tailwind 4).

### Dim 17: Operational Readiness — 8/100
*C:2 H:4 M:6 L:2*

Operational readiness is effectively absent. The repo has no CI/CD, no error/observability tooling, no runbook/on-call/incident doc, and no schema-migration framework (16 loose, unordered SQL files with no version tracking). The one migration-runner script is provably broken (references nonexistent file paths and would corrupt its own migration via naive semicolon-splitting of a dollar-quoted function body even if the paths were fixed). Production Supabase credentials are hardcoded as fallback defaults across at least 9 separate scripts, one of which (clean_setup.mjs) unconditionally deletes all worksheet_submissions with no confirmation and defaults to hitting production if env vars aren't set. None of the three named support scenarios (stuck needs_revision, buddy departure, wrong phase promotion) have any admin-facing recovery path in the UI — all require undocumented, unaudited manual SQL against production. This is not launch-ready for a real company; it would fail on day one of its first support ticket.

### Dim 18: UI/UX & Accessibility — 42/100
*C:0 H:3 M:6 L:3*

The app has real visual polish (a coherent theme-token system in theme.js/index.css, consistent focus-visible outlines, prefers-reduced-motion support, loading skeletons, a sign-out confirmation step, and a couple of correctly keyboard-accessible custom controls that prove the team knows the right pattern). But underneath that polish are several systemic, high-volume defects: ~151 of 158 worksheet form fields have visually-present but programmatically unassociated labels; the toast/status system has zero ARIA live-region support so assistive-tech users get no feedback on any action; four gate-artifact checklist pages are entirely keyboard-inoperable in a phase-blocking flow; and nearly every core dashboard's data-fetch error handling silently degrades to a misleading empty/zero state instead of surfacing an error. Combined with a hard color-contrast failure on the brand gold accent (used as text in 40+ places), no dark-mode support, and a couple of responsive/overflow and silent-redirect gaps, this is not production-ready for a company-wide launch without an accessibility and error-handling remediation pass.</summary>
</StructuredOutput>



### Dim 19: Auth Flow Deep-Dive — 12/100
*C:1 H:2 M:3 L:2*

The auth flow has a working happy path (email/password + Google OAuth, session persistence via supabase-js defaults, loading-gated ProtectedRoute) but the authorization model underneath it is fundamentally broken: every RLS policy that decides who is an admin/reviewer trusts auth.jwt() -> user_metadata ->> role, and user_metadata is fully client-writable via supabase.auth.signUp()/updateUser() — meaning any signed-up user can grant themselves academic_head/onboarding_lead/lead_instructor privileges with one JS call, no exploit chain required. Combined with a completely absent password-reset flow, a role-sync bug in auto-promotion, an optimistic/unsafe logout, and a fragile OAuth callback race, this is not launchable for a real company's employee data.

### Dim 20: Testing & Input Validation — 22/100
*C:0 H:5 M:4 L:1*

Testing is narrow and shallow relative to the app's risk surface: 6 test files / 70 assertions cover pure config-derived functions and fully-mocked hook seams (useAutoSave, useDueDates, useNotifications, useAutoPromote, and worksheetConfigData helpers) reasonably well, including good edge-case coverage of status transitions and error paths. But there is zero coverage of authentication (Login/Signup/AuthContext/AuthCallback), zero coverage of RLS/authorization boundaries, zero coverage of the admin/buddy/lead dashboards and the actual review approve/reject UI (only its data-shape helpers are tested), zero component-rendering tests despite @testing-library/react being installed and unused, and zero tests for useGateControl — which contains an undocumented fail-open bug (gate check defaults to "complete" on query error). There is no CI running the suite and no coverage tooling, so this gap has no visibility and can silently worsen. Input validation client-side is essentially only "non-empty after trim" everywhere (useWorksheet.ts:178-185); there is no maxLength anywhere in the app and no email format check beyond native HTML5. React's default JSX escaping does mitigate the HTML/script-injection-rendered-back risk (no dangerouslySetInnerHTML or markdown rendering found), which is the one bright spot on the validation side.

### Dim 21: Documentation & Onboarding — 18/100
*C:0 H:2 M:7 L:2*

Documentation is a liability, not an asset, for this codebase. README.md is unmodified Vite boilerplate with zero project content. There is no single authoritative source for DB setup: 16 SQL files exist across db/ and repo root, schema.sql claims to be "the ONE FILE you need to run" but demonstrably omits at least 3-4 migrations (notifications, due dates, buddy_approved) that QA_REPORT.md and a stray root-level migration file say are also required. Ten overlapping root-level markdown/txt docs (3279 LOC) plus a 100KB context.md compete with no index or cross-linking, several are internally contradictory, and at least one (TYPESCRIPT_MIGRATION_EXECUTION.md) actively lies about project state — it shows a TS migration as not-started via unchecked checklist items when the codebase is in fact ~99% migrated (100 .ts/.tsx files vs 1 .js file). Multiple docs reference file paths/extensions (AuthContext.jsx, Navbar.jsx, GateControl1.jsx) that no longer exist post-migration. Deployment instructions exist only 1588 lines into context.md, unreachable from any entry point, and hardcode a live Supabase project ID rather than documenting generic multi-environment setup. An entire feature area (src/pages/ftp/, with its own 28.5KB seed file) has zero documentation anywhere. A new developer has no reliable way to get the app running against a correctly-configured database without reverse-engineering SQL files and grepping stale docs against source.

## 5. CRITICAL findings (full detail)

#### 1. [CRITICAL] Review state machine is not enforced at the database level — reviewers and joinees can bypass it via direct API calls

- **Dimension:** Dim 1: Spec Compliance
- **Location:** `db/schema.sql:150-151 (value-only CHECK); db/schema.sql:184-187 ('Update own submissions', no column/value restriction); db/schema.sql:207-216 ('Reviewers update submissions', no restriction on source/target review_status)`
- **Verification:** CONFIRMED — Independently reconfirms the security/db-dimension findings: RLS UPDATE policies lack WITH CHECK and no transition trigger exists.
- **Effort:** M

**Description.** ARCHITECTURE_PLAN.md §1 promises 'review_status transitions validated at DB level' and 'No re-review of approved worksheets (immutable after approval)'. No such trigger exists anywhere in db/*.sql (confirmed via grep for TRIGGER) — only CHECK (review_status IN (...)), which validates the value is a legal state, not that the transition from the current state is legal. Because the architecture is Supabase + RLS only (no custom API layer), the frontend JS guards (WorksheetReview.tsx:76-80, PhaseReview.tsx:172-173) are the ONLY enforcement. Any authenticated user can call the Supabase client directly (already in the browser bundle) and: (a) as the joinee, UPDATE worksheet_submissions SET review_status='approved' WHERE user_id=auth.uid() — self-approving, since 'Update own submissions' has no WITH CHECK; (b) as a buddy, set review_status='approved' directly, skipping the buddy→manager two-step; (c) edit an already-approved worksheet, violating the documented immutability rule.

**Root cause.** State-machine enforcement was specified but only implemented client-side; the DB CHECK constraint validates value membership, not transitions.

**Impact / failure scenario.** The entire review/audit-trail integrity model — the stated reason this refactor exists — has no backend enforcement. A malicious or buggy client can silently corrupt the approval trail, self-promote, or falsify sign-off records used for auto-promotion to lead_instructor (useAutoPromote.ts:61-66), a role that grants review authority over other joinees.

**Current behavior.** Only React-level if guards prevent illegal transitions; nothing stops a raw REST/PostgREST call.

**Expected behavior.** A BEFORE UPDATE trigger validating OLD.review_status → NEW.review_status against the REVIEW_FLOW.md whitelist, plus WITH CHECK clauses on the RLS UPDATE policies restricting which roles may write which target states.

**Suggested fix.** Add a validate_review_status_transition() trigger function + BEFORE UPDATE ... FOR EACH ROW trigger on worksheet_submissions; tighten RLS WITH CHECK clauses to reject joinee-initiated review_status writes into reviewer-only states.

---

#### 2. [CRITICAL] Gate Control submissions never transition to pending_review — Phase progression is permanently blocked (spec-level confirmation)

- **Dimension:** Dim 1: Spec Compliance
- **Location:** `src/hooks/useGateControl.ts:163 (status: 'Submitted') vs src/hooks/useAutoSave.ts:87 (data.status === 'submitted') and src/hooks/useWorksheet.ts:222; read-side also src/pages/Dashboard.tsx:74 (checks capital 'Submitted')`
- **Verification:** CONFIRMED — Third independent confirmation of the same casing bug (also found by quality and dataflow auditors).
- **Effort:** S

**Description.** useGateControl.handleSubmit() sets status:'Submitted' (capital S). useAutoSave.save() computes newReviewStatus by checking data.status === 'submitted' (lowercase); the strings never match for gate controls, so review_status is written as '' instead of 'pending_review'. useWorksheet.ts isSubmitted also checks lowercase, so the 'Submitted' confirmation screen never renders. ARCHITECTURE_PLAN.md §4 explicitly called out normalizing status to lowercase — it was done for ordinary worksheets but missed for gate controls.

**Root cause.** Status-string normalization was applied incompletely; gate-control write path retained the capitalized literal, and no shared status constant enforces consistency.

**Impact / failure scenario.** isPhaseApproved() (worksheetConfigData.ts:663-674) requires every worksheet ID in PHASE_WORKSHEETS_MAP[phase] — including gc1/gc2/gc3 — to reach review_status==='approved'. Since a gate's status can never leave '', getMaxAccessiblePhase() can never advance past Phase 1 for any joinee. This breaks the headline feature (phase-gated progression) for every user. Also inconsistent read-side check at Dashboard.tsx:74 still uses capital 'Submitted'.

**Current behavior.** Joinee clicks Submit Gate Review → sees the form again → nothing appears in any reviewer's queue → Phase 2/3 remain locked forever.

**Expected behavior.** Submitting a gate control transitions review_status to pending_review and surfaces in the reviewer's queue, per ARCHITECTURE_PLAN.md §4.

**Suggested fix.** Change useGateControl.ts:163 to status:'submitted'; audit every writer/reader of worksheet_submissions.status for casing (including Dashboard.tsx:74); centralize on a single status constant module.

---

#### 3. [CRITICAL] Gate Control / Gate Artifact submissions never enter the review queue — 'Submitted' vs 'submitted' casing mismatch

- **Dimension:** Dim 2: Code Quality
- **Location:** `src/hooks/useGateControl.ts:163 (writes status: 'Submitted'), src/hooks/useAutoSave.ts:87,126 (checks data.status === 'submitted'), src/hooks/useWorksheet.ts:198,222 (writes/reads lowercase 'submitted'), src/pages/WorksheetReview.tsx:77,265`
- **Verification:** CONFIRMED — Verified: useGateControl.ts:163 writes status:'Submitted' (capital), while useAutoSave.ts:87/126 and useWorksheet.ts:198/222 all check/write lowercase 'submitted', and WorksheetReview.tsx:77 blocks approve unless review_status is 'pending_review'/'revision_submitted' (which stays '' for gate submissions); the symptom-patch at WorksheetReview.tsx:265 (status === '' && submission.status === 'Submitted') is present verbatim, confirming the bug was already observed downstream.
- **Effort:** S

**Description.** useGateControl.handleSubmit (used by all 7 gate pages: GateControl1/2/3.tsx and GateArtifact1-4.tsx) writes `status: 'Submitted'` with a capital S. Every consumer of that field elsewhere checks the lowercase literal `'submitted'`: useAutoSave.ts line 87 computes `newReviewStatus` from `data.status === 'submitted'` — since it's false, review_status is left as `''` instead of `'pending_review'`. Line 126's `isNewSubmission` check (also `data.status === 'submitted'`) is likewise false, so `triggerNotification` is never called — the reviewer is never notified. useWorksheet.ts line 222's `isSubmitted` derived state is also permanently false for these pages, so the 'Submitted' confirmation screen (GateControl1.tsx:65-78, GateArtifact*.tsx) never renders after submit — the form just falls through to itself, looking to the user like nothing happened. Finally, WorksheetReview.tsx:77 hard-blocks the buddy/manager approve action unless `review_status` is exactly `'pending_review'` or `'revision_submitted'` — since it's `''`, `handleBuddyApprove` returns the error 'Cannot approve: worksheet is in "" state.' WorksheetReview.tsx:265 has a special-cased badge-rendering patch (`status === '' && submission.status === 'Submitted'`) that someone already added as a symptom-level workaround for exactly this bug, without fixing the root cause — proving the bug is real and previously observed, not theoretical.

**Impact / failure scenario.** Employee submits Gate Control 1 (30-day milestone review). Toast says 'Gate submitted for review.' Buddy/manager dashboards (BuddyDashboard.tsx:83, AdminDashboard.tsx:117/166, OnboardingLeadDashboard.tsx:77, PhaseReview.tsx:169 — all filter on review_status === 'pending_review') never show it in their pending queue because review_status is ''. No notification is sent. If a reviewer manually navigates to the WorksheetReview URL for that user/worksheet, clicking Approve is explicitly rejected by the guard at line 77. The gate — which is the mechanism that unlocks the next phase — is permanently stuck; the employee cannot be approved through the normal review flow for any of the 7 gate pages.

**Suggested fix.** Introduce a single shared status constant module (e.g. src/constants/status.ts exporting SUBMISSION_STATUS = { SUBMITTED: 'submitted', IN_PROGRESS: 'In Progress', ... } as const) and use it everywhere status/review_status literals appear (useGateControl.ts, useWorksheet.ts, useAutoSave.ts, WorksheetReview.tsx, all Phase/Week pages). As an immediate hotfix, change useGateControl.ts:163 from `status: 'Submitted'` to `status: 'submitted'` to match the rest of the codebase, then remove the now-unnecessary special case at WorksheetReview.tsx:265.

---

#### 4. [CRITICAL] Two incompatible worksheet-to-phase taxonomies drive routing vs. gating, and disagree on which phase a worksheet belongs to

- **Dimension:** Dim 5: Architecture Integrity
- **Location:** `src/config/worksheetConfigData.ts:509-545 (ALL_WORKSHEETS) vs :555-569 (PHASE_WORKSHEETS_MAP) vs :399-404 (WK_WORKSHEETS_MAP)`
- **Verification:** CONFIRMED — Verified directly in worksheetConfigData.ts: ALL_WORKSHEETS 'Phase 2' (line 524-533) includes p2_w1, and PHASE_WORKSHEETS_MAP[1] (line 556-567) also includes p2_w1/p2_w2/p2_w4/p3_w1/p3_w5 — a real bucket mismatch. Traced actual impact: App.tsx builds the live /phase-2/* routes from ALL_WORKSHEETS and wraps them in PhaseAccessGuard(phaseNum=2) (App.tsx:81-96); canAccessPhase(2) (worksheetConfigData.ts:705) requires isPhaseApproved(1), which requires ALL 34 PHASE_WORKSHEETS_MAP[1] ids (including p2_w1) to be review_status='approved' (worksheetConfigData.ts:663-673). GateControl1 (gate-controls/GateControl1.tsx:37-42) also gates gc1 submission via useGateControl->checkPhaseWorksheetsComplete(phaseNum=1) against the same 34-item list. Navbar.tsx:73-78 confirms /phase-1,2,3 are the live user-facing links (Week routes aren't linked). Net effect: p2_w1 is inaccessible until Phase 1 is approved, but Phase 1 approval requires p2_w1 to already be approved — a genuine circular deadlock, not merely a labeling mismatch, confirming (and if anything underselling) the CRITICAL rating.
- **Effort:** L

**Description.** The app has two parallel worksheet-organization models that were apparently merged incompletely (top commit is literally 'Phase/Week merge'). ALL_WORKSHEETS groups worksheets into legacy 'Phase 1' (p1_w1-8, gc1 = 9 items), 'Phase 2' (p2_w1-4, gc2 = 5 items), 'Phase 3' (p3_w1-5, gc3 = 6 items) and drives routing (App.tsx dynamic route generation) and nav labels. PHASE_WORKSHEETS_MAP (used for ALL phase-completion/gating logic) instead buckets by FTP-week curriculum stage, and PHASE_WORKSHEETS_MAP[1] alone contains 34 worksheet IDs including p2_w1, p2_w2, p2_w4, p3_w1, p3_w5 — worksheets ALL_WORKSHEETS explicitly classifies as belonging to 'Phase 2'/'Phase 3'. The two structures are simply inconsistent about what 'Phase 1' means.

**Root cause.** Incomplete migration from a 3-legacy-phase model to a 4-week FTP curriculum model; PHASE_WORKSHEETS_MAP was repurposed to encode the new week-based gating without renaming or reconciling against the still-in-use legacy ALL_WORKSHEETS grouping.

**Impact / failure scenario.** Any code (isPhaseApproved, canAccessPhase, getMaxAccessiblePhase, checkAndPromote, getPhaseReviewStatus, useGateControl) that asks 'is Phase 1 done?' answers a fundamentally different question than what the Navbar/routes present as 'Phase 1' to the user.

**Steps to reproduce.** Read worksheetConfigData.ts lines 509-569 side by side; p2_w1 appears under 'Phase 2' in ALL_WORKSHEETS (line 527) and under PHASE_WORKSHEETS_MAP[1] (line 560).

**Suggested fix.** Collapse to a single source of truth: derive both routing groups and gating groups from one canonical worksheet->phase (or worksheet->week) map, and add a compile-time or test-time invariant that ALL_WORKSHEETS and PHASE_WORKSHEETS_MAP partition the same worksheet-ID set identically.

---

#### 5. [CRITICAL] Phase-access gate is both undeliverable (circular dependency) and trivially bypassable via the parallel /week-N route tree

- **Dimension:** Dim 5: Architecture Integrity
- **Location:** `src/components/PhaseAccessGuard.tsx:86; src/pages/Phase2.tsx:88; src/App.tsx:81-100,144-147; src/config/worksheetConfigData.ts:663-708`
- **Verification:** CONFIRMED — Confirmed by direct reading: PHASE_WORKSHEETS_MAP[1] (worksheetConfigData.ts:556-567) requires p2_w1/p2_w2/p2_w4/p3_w5/p3_w1 approved, but ALL_WORKSHEETS['Phase 1'] (worksheetConfigData.ts:510-520) used by App.tsx's route generator only contains p1_w1-8+gc1, so those worksheets are only gated-routable via /phase-2|3/* (behind PhaseAccessGuard requiring Phase 1 already approved = circular); the actual reachable route is the ungated /week-N/worksheet/:worksheetId -> WeekWorksheetPage (verified no PhaseAccessGuard in that file), which Phase1.tsx's own week3Worksheets/week4Worksheets arrays (lines 64-84) link directly to (e.g. path '/week-3/worksheet/p2_w1').
- **Effort:** L

**Description.** canAccessPhase(userId, 2, subs) requires isPhaseApproved(userId, 1, subs), which requires ALL 34 IDs in PHASE_WORKSHEETS_MAP[1] to have review_status === 'approved' (worksheetConfigData.ts:663-674). Many of those 34 IDs (all w1_*/w2_*/w3_*/w4_* FTP-only worksheets and the p2_w1/p2_w2/p2_w4/p3_w1/p3_w5 cross-listed ones) have no route under the gated /phase-1/* tree at all — App.tsx's dynamic route generator (lines 81-100) only iterates ALL_WORKSHEETS, whose 'Phase 1' entry contains just p1_w1-8+gc1. Those worksheets are reachable ONLY via the ungated `/week-N/worksheet/:worksheetId` route (App.tsx:144-147, no PhaseAccessGuard wrapper) — including via the very Phase1.tsx page's own 'week3Worksheets'/'week4Worksheets' sections (Phase1.tsx:64-84), which link to `/week-3/worksheet/p2_w1` and `/week-4/worksheet/p3_w1` (worksheets ALL_WORKSHEETS calls 'Phase 2'/'Phase 3').

**Root cause.** Same as above — two disjoint routing trees (per-ID static routes vs generic :worksheetId route) exist for the same domain concept and only one of them enforces the phase gate.

**Impact / failure scenario.** A brand-new hire can open the /phase-1 page, scroll to its 'Week 3'/'Week 4' sections, and submit+get approved on worksheets that are nominally 'Phase 2'/'Phase 3' content — all before Phase 1 is complete — completely defeating the Phase 2/3 lock screen (PhaseLockedView in Phase2.tsx/Phase3.tsx). Conversely, anyone who tries to satisfy the Phase 1 gate purely through gated `/phase-*` routes can never succeed, because some required worksheets sit only behind the gate they're meant to unlock.

**Steps to reproduce.** As new_joinee, before any Phase 1 worksheet is approved, navigate to /phase-1, scroll to the 'Week 3: Co-deliver' section, click 'Engagement & Active Learning' (p2_w1) -> lands on /week-3/worksheet/p2_w1 with no PhaseAccessGuard check, form loads and can be submitted.

**Suggested fix.** Pick one taxonomy and one route tree. Either gate every route that can reach a 'later-phase' worksheet with the same PhaseAccessGuard check the canonical route uses, or eliminate parallel access paths to the same worksheet_id entirely (single canonical URL per worksheet, referenced everywhere).

---

#### 6. [CRITICAL] RLS UPDATE policies missing WITH CHECK let users self-elevate role and self-approve their own worksheets

- **Dimension:** Dim 6: Database Schema & Integrity
- **Location:** `db/schema.sql:63-64 ("Update own profile"), db/schema.sql:184-187 ("Update own submissions") — identical pattern also in db/supabase_schema.sql:37-40/133-136, db/setup_correct.sql, db/__setup_supabase.sql:67-69/126-128, db/__fix_rls_recursion.sql, db/__fix_rls_jwt.sql`
- **Verification:** CONFIRMED — Verified byte-for-byte: db/schema.sql:63-64 and 184-187 (plus the same pattern in supabase_schema.sql, setup_correct.sql, __setup_supabase.sql, __fix_rls_recursion.sql, __fix_rls_jwt.sql) all define FOR UPDATE policies with USING only, no WITH CHECK; since id/user_id are immutable, Postgres reuses USING as the check and it trivially passes for any column change. Confirmed the app is a client-side SPA (src/api/supabase.ts) using the public anon key directly in the browser, making RLS the sole enforcement — so an authenticated new_joinee can indeed self-elevate role or self-approve worksheet review_status/reviewed_by via a direct supabase-js .update() call.

**Description.** Every UPDATE policy that governs a user's own row is defined as `FOR UPDATE USING (id = auth.uid())` / `FOR UPDATE USING (auth.uid() = user_id)` with NO `WITH CHECK` clause. Per Postgres RLS semantics, when WITH CHECK is omitted the USING expression is reused as the check for the *new* row — and since `id`/`user_id` never changes on an UPDATE, that check trivially passes. This means an authenticated user can update ANY column on their own row, not just the ones the UI exposes. Two concrete exploit paths: (1) `user_profiles`: a `new_joinee` can call `supabase.from('user_profiles').update({role:'academic_head'}).eq('id', myId)` directly from the browser (the anon key is committed in .env and always public in an SPA anyway) and immediately gain the 'Admin read/update all profiles' and 'Reviewers select/update submissions' RLS grants that key on `auth.jwt()->'user_metadata'->>'role'` — but even without touching the JWT, updating `user_profiles.role` alone satisfies every subquery-based policy variant present in supabase_schema.sql/__setup_supabase.sql (`auth.uid() IN (SELECT id FROM user_profiles WHERE role IN (...))`). (2) `worksheet_submissions`: a joinee can call `.update({review_status:'approved', reviewer_name:'Self', reviewed_at: now()}).eq('id', myRow)` on their own submission — self-approving their own onboarding worksheet and completely bypassing the buddy/manager review workflow that is this app's core function. No trigger, CHECK constraint, or WITH CHECK clause anywhere in db/*.sql guards `role`, `assigned_lead_id`, `assigned_buddy_id`, `review_status`, or `reviewed_by` against self-modification.

**Suggested fix.** Add explicit WITH CHECK clauses (or split into separate column-scoped policies) that pin immutable/privileged columns. E.g. for user_profiles: `WITH CHECK (id = auth.uid() AND role = (SELECT role FROM user_profiles WHERE id = auth.uid()))` is still racy — better: revoke UPDATE on `role`/`assigned_lead_id`/`assigned_buddy_id` from the authenticated role via column-level GRANTs, or use a BEFORE UPDATE trigger that raises an exception if `NEW.role IS DISTINCT FROM OLD.role` unless invoked by a service-role/definer function. Similarly for worksheet_submissions, add `WITH CHECK (auth.uid() = user_id AND review_status = OLD.review_status AND reviewed_by IS NOT DISTINCT FROM OLD.reviewed_by)` via a trigger (RLS USING/WITH CHECK cannot reference OLD directly, so this needs a BEFORE UPDATE trigger function), so joinees can only touch worksheet_data/status, never the reviewer fields.

---

#### 7. [CRITICAL] Canonical schema.sql is missing the notifications table and due_date column that are core, actively-used features

- **Dimension:** Dim 6: Database Schema & Integrity
- **Location:** `db/schema.sql (entire file — no `CREATE TABLE notifications`, no `due_date` column); compare db/__migration_notifications_dates.sql:6-51 and db/__due_date_notifications.sql`
- **Verification:** CONFIRMED — Verified directly: `grep -c notifications db/schema.sql` and `grep -c due_date db/schema.sql` both return 0, schema.sql's own header claims to incorporate 'all migrations' (listing 7 specific files, none of which is __migration_notifications_dates.sql), context.md:1614/1625/1882 instruct fresh setup to run only db/schema.sql, and useNotifications.ts/useDueDates.ts/useAutoSave.ts genuinely query/write the `notifications` table and `due_date` column on core, always-hit paths (bell polling, badge rendering, every autosave).

**Description.** db/schema.sql's header explicitly claims: "This is the ONE FILE you need to run. It incorporates all migrations" and context.md:139/1882 documents it as "the definitive schema (run this)" for fresh setup. But grepping schema.sql for 'notifications' or 'due_date' returns zero matches. The `notifications` table (with its own RLS policies) and the `worksheet_submissions.due_date` column are defined only in the separate, un-referenced file db/__migration_notifications_dates.sql. Meanwhile src/hooks/useNotifications.ts (lines 62,106,126,154) and src/hooks/useDueDates.ts (line 128) and src/hooks/useAutoSave.ts (line 120, `upsertPayload.due_date`) query/write these on every page load and every worksheet autosave. Any team member who follows the documented setup instructions (paste schema.sql into a fresh Supabase project for staging/DR/new-environment bring-up) will get a database that 500s/errors on the notification bell and due-date badges the moment a real user logs in — `relation "notifications" does not exist` and `column "due_date" of relation "worksheet_submissions" does not exist`.

**Suggested fix.** Fold the contents of db/__migration_notifications_dates.sql (and ideally __due_date_notifications.sql's function) into db/schema.sql so the file actually lives up to its 'ONE FILE, all migrations' claim, or restructure db/ into a numbered migrations/ directory with a migrations-tracking table and stop treating any single hand-maintained file as 'definitive'.

---

#### 8. [CRITICAL] Worksheet/gate submission always shows success even when the save permanently fails — silent data loss

- **Dimension:** Dim 7: Failure Handling & Recovery
- **Location:** `src/hooks/useAutoSave.ts:164-180 (save catch block never rethrows) combined with src/hooks/useWorksheet.ts:190-216 (handleSubmit) and src/hooks/useGateControl.ts:155-189 (handleSubmit)`
- **Verification:** CONFIRMED — Verified directly: useAutoSave.ts save() catch block (164-180) only sets state/schedules retries, never rethrows or rejects; flushSave (197-201) just awaits save() so it always resolves; useWorksheet.ts handleSubmit (190-216) and useGateControl.ts handleSubmit (155-189) both call setData(submitData) synchronously then await flushSave, so their catch blocks are dead code for save failures; WorksheetPage.tsx:103-104 confirms isSubmitted (driven by data.status==='submitted', set before save resolves) renders SubmittedView unconditionally.

**Description.** `save()` in useAutoSave.ts wraps everything in try/catch; on failure it calls notifyError, sets saveStatus='error', schedules up to 2 retries — but never re-throws or returns a rejected promise. `flushSave` just `await save(data)`, so it too always resolves. In `useWorksheet.handleSubmit` and `useGateControl.handleSubmit`, `await flushSave(submitData)` therefore never throws, so the `catch` block that shows 'Submission failed. Please try again.' is unreachable for genuine Supabase failures (network error, RLS denial, constraint violation, timeout). Execution always falls through to `showToast(...'submitted for review', 'success')`. Additionally, `setData(submitData)` is called synchronously before the save is even attempted, so `data.status === 'submitted'` is true immediately, which flips `isSubmitted` to true in WorksheetPage.tsx (line 103) and renders the terminal `SubmittedView` — hiding the form entirely, before the save outcome is known.

**Impact / failure scenario.** User fills out a worksheet, hits Submit while offline or during an RLS/schema error, sees a green success toast and the 'Worksheet Submitted' screen, and navigates away confident their work is saved. The `worksheet_submissions` row was never upserted (or only partially, if retries all fail). Reviewers never see the submission; the joinee has no way to know their work is gone, and there's no durable indicator (see next finding) that would let them notice later.

**Suggested fix.** Make `save()` in useAutoSave.ts re-throw after exhausting retries (or return a boolean/result the caller can check), and have `flushSave` propagate that failure so `handleSubmit` in useWorksheet/useGateControl can genuinely catch it and (a) not show the success toast, (b) not transition local `data.status` to 'submitted' until the write is confirmed. Example: track a `finalFailure` promise/flag set only after the retry budget is exhausted, and have `flushSave` reject with it.

---

#### 9. [CRITICAL] Case-mismatched status string ('Submitted' vs 'submitted') permanently strands FTP Gate Artifact submissions with no reviewer visibility

- **Dimension:** Dim 8: E2E Data Flow & Contracts
- **Location:** `src/hooks/useGateControl.ts:158-168 (sets data.status = 'Submitted'); src/hooks/useAutoSave.ts:87-93,126-130 (checks data.status === 'submitted' lowercase); src/hooks/useWorksheet.ts:221-228 (isSubmitted also checks lowercase); src/App.tsx:144-147 + src/pages/WeekWorksheetPage.tsx:42 (renders <Component /> with no targetUserId prop); src/pages/gate-controls/GateArtifact1.tsx:22-28; src/pages/WorksheetReview.tsx:74-80`
- **Verification:** CONFIRMED — Verified line-by-line: useGateControl.ts:163 sets status:'Submitted' (capital), while useAutoSave.ts's newReviewStatus/isNewSubmission checks and useWorksheet.ts:222 isSubmitted all check lowercase 'submitted'; useWorksheet.ts's own handleSubmit correctly uses lowercase, confirming useGateControl.ts is the sole outlier. WeekWorksheetPage.tsx:38 renders <Component /> with no props, App.tsx:144-147 routes new_joinee there, and WorksheetReview.tsx's handleBuddyApprove (~line 75) rejects any review_status other than pending_review/revision_submitted, blocking recovery; BuddyDashboard filters only on pending_review/revision_submitted. All claims hold.
- **Effort:** S

**Description.** GateArtifact1-4 (worksheet ids w1_g1, w2_g1, w3_g1, w4_g1 — the mandatory weekly gate checkpoints) are rendered directly to the joinee via `/week-N/worksheet/:worksheetId` → WeekWorksheetPage → `<Component />` with NO targetUserId prop (confirmed: WeekWorksheetPage.tsx:42 passes no props), so `useGateControl`'s `isBuddyMode` is false for this call path. On submit, useGateControl.ts:163 sets `status: 'Submitted'` (capital S) and, because isBuddyMode is false and it's not a revision, sets `_savedReviewStatus: ''`. That payload flows into useAutoSave.ts's save(): `newReviewStatus = data.status === 'submitted' ? (...) : (_savedReviewStatus==='approved'?...: _savedReviewStatus==='buddy_approved'?...:'')`. Because 'Submitted' !== 'submitted' (case-sensitive), the true branch (which would set review_status to 'pending_review') is never taken; the else-branch evaluates '' (since _savedReviewStatus is '') and persists review_status='' — as if the worksheet was never submitted. Separately, isNewSubmission (useAutoSave.ts:126) also requires data.status === 'submitted', so no notification is ever sent either.

**Root cause.** Two independent code paths encode the same conceptual 'submitted' state with different casing ('Submitted' in useGateControl.ts vs the lowercase 'submitted' string literal checked in useAutoSave.ts and useWorksheet.ts), with no shared enum/constant enforcing the contract, and no test coverage for useGateControl.ts (confirmed no __tests__ file exists for it) to catch the mismatch.

**Impact / failure scenario.** A joinee who fills out and clicks 'Submit Gate' on w1_g1/w2_g1/w3_g1/w4_g1 gets zero feedback that anything went wrong: `isSubmitted` in useWorksheet.ts (also gated on the lowercase 'submitted' string) stays false, so GateArtifact1.tsx's own 'Submitted' confirmation screen never renders — the same editable form just re-renders, so the user may believe the click failed and resubmit repeatedly. Meanwhile the row is written to worksheet_submissions with status='Submitted' but review_status stuck at '' forever, so it never appears in the buddy's pending-review queue (BuddyDashboard filters on review_status==='pending_review'). If a buddy manually navigates to review it anyway, WorksheetReview.tsx:74-80 explicitly refuses: 'Cannot approve: worksheet is in "" state. Only pending/re-submitted worksheets can be approved.' There is no recovery path in the UI — the submission is permanently un-reviewable, blocking completion of every FTP week gate for every joinee. (By contrast, GateControl1/2/3 — the phase-level gates — are only ever mounted in buddy mode via BuddyGatePass, so they accidentally avoid the review_status half of this bug, but still silently lose their reviewer notification because isNewSubmission uses the same broken lowercase check.)

**Steps to reproduce.** 1. As new_joinee, go to /week-1, open the Week 1 Gate artifact (w1_g1) via /week-1/worksheet/w1_g1. 2. Check required artifacts, click 'Submit Gate'. 3. Observe the page does not navigate to a 'Submitted' confirmation and the form remains editable. 4. As the assigned buddy, open BuddyDashboard — w1_g1 never appears in the pending-review list. 5. Query worksheet_submissions for that user/worksheet_id: status='Submitted', review_status=''.

**Suggested fix.** Introduce a single shared constant (e.g. WORKSHEET_STATUS.SUBMITTED = 'submitted') exported from worksheetConfig and used by every writer/reader of the `status` field (useWorksheet.ts, useGateControl.ts, useAutoSave.ts). Change useGateControl.ts:163 to use the same lowercase value. Add a regression test that submits a gate artifact in non-buddy mode and asserts review_status transitions to 'pending_review'.

---

#### 10. [CRITICAL] Complete privilege escalation: role-based RLS trusts user-editable auth.user_metadata, not a server-controlled claim

- **Dimension:** Dim 9: Security
- **Location:** `db/schema.sql:68-70,75-77,108-111,191-193,207-209 (also db/__fix_rls_jwt.sql:28-30,35-37,89-93,64-72,80-84); exploited via src/context/AuthContext.tsx (supabase.auth client) and any direct supabase-js/REST call`
- **Verification:** CONFIRMED — Verified in db/schema.sql:68-70,75-77,108-111,191-193,207-209 and db/__fix_rls_jwt.sql:28,35,61,74,88 — every admin/reviewer RLS policy gates on auth.jwt()->'user_metadata'->>'role', and no app_metadata/SECURITY DEFINER helper exists anywhere in db/ to gate role authoritatively; src/hooks/useAutoPromote.ts:69-71 confirms the app itself writes role via the plain client call supabase.auth.updateUser({data:{role:...}}), proving user_metadata is reachable/writable by any authenticated session (anon key), which any client could call with an arbitrary role value to self-escalate.

**Description.** Every 'admin/reviewer' RLS policy in the schema Newton actually ships (db/schema.sql, explicitly labeled 'DEFINITIVE DATABASE SCHEMA' incorporating the __fix_rls_jwt.sql fix) authorizes access with `auth.jwt() -> 'user_metadata' ->> 'role' IN ('academic_head','lead_instructor','onboarding_lead')`. In Supabase, `user_metadata` (raw_user_meta_data) is intentionally end-user-writable via the standard, always-available client call `supabase.auth.updateUser({ data: {...} })` — it is NOT the same as `app_metadata`, which requires the service_role key. Any authenticated 'new_joinee' can open devtools and run `await supabase.auth.updateUser({ data: { role: 'academic_head' } })`, wait for the session/JWT to refresh (or just call getSession again), and the next request's JWT will satisfy every 'admin'/'reviewer' RLS check in the app: read every user's PII in user_profiles, read/update every worksheet_submissions row org-wide (including approving/rejecting), and read all onboarding_submissions. This is a full server-side (not just UI) privilege escalation to the highest role in the system, reachable with two lines of supported SDK code and the public anon key that is already committed in .env.

**Impact / failure scenario.** Any signed-up account (including one created via the public /signup form as 'new_joinee') can grant itself 'academic_head' in its own JWT metadata and immediately gain read access to every other employee's PII (email, department, assignments) and read/approve/reject authority over every worksheet_submissions and onboarding_submissions row in the organization. No exploit tooling needed — this is the officially documented Supabase Auth client API.

**Suggested fix.** Never source authorization role from `user_metadata`. Store role in `app_metadata` (settable only via the Supabase Admin API / service_role, e.g. from a trusted server or Postgres trigger that copies `user_profiles.role` into `auth.users.raw_app_meta_data` using `auth.admin.updateUserById`), and change every RLS policy to check `auth.jwt() -> 'app_metadata' ->> 'role'` instead of `user_metadata`. Alternatively, drop metadata-based role checks entirely and use a `SECURITY DEFINER` helper function `is_reviewer(uid uuid)` that reads `user_profiles.role` for a table the user cannot self-write (see next finding) with RLS recursion avoided via `SECURITY DEFINER`.

---

#### 11. [CRITICAL] user_profiles 'Update own profile' policy has no WITH CHECK — any user can self-write their own role column to admin

- **Dimension:** Dim 9: Security
- **Location:** `db/schema.sql:62-64 (`CREATE POLICY "Update own profile" ON user_profiles FOR UPDATE USING (id = auth.uid());`) — identical in db/__fix_rls_jwt.sql:22-23 and db/__fix_rls_recursion.sql:22-24`
- **Verification:** CONFIRMED — Confirmed verbatim in db/schema.sql:63-64, db/__fix_rls_jwt.sql:22-23, db/__fix_rls_recursion.sql:23-24: `FOR UPDATE USING (id = auth.uid())` with no WITH CHECK. Per Postgres RLS semantics, when WITH CHECK is omitted the USING clause is reused to validate the new row, so the only constraint on the post-update row is `id = auth.uid()` — role is unconstrained and the CHECK(role IN (...)) column constraint still permits 'academic_head' etc., so a self-update to `role='academic_head'` on one's own row passes RLS (verified — same gap also independently exists in the co-located "Admin update profiles" policy at schema.sql:75-79, which likewise has `OR id = auth.uid()` with no WITH CHECK). Confirmed AuthContext.fetchProfile() (src/context/AuthContext.tsx:38-53) reads `role` straight from this table into `profile`, and ProtectedRoute (src/components/ProtectedRoute.tsx:35-37) gates routes on `profile?.role`, so this is a real, trivially exploitable client-side route/UI privilege escalation. One mitigating nuance not mentioned in the finding: the *other*, more consequential RLS policies (worksheet-review approve/reject, cross-user profile reads in schema.sql:66-79,193-213) gate on `auth.jwt()->'user_metadata'->>'role'` (JWT claims), not this table column, so self-elevating `user_profiles.role` alone does not by itself grant DB-level write/read access to other users' submissions/profiles — impact is confined to UI-gating bypass and profile-data integrity, not full backend admin takeover via this vector alone. The finding's stated impact (unlocking admin/buddy UI client-side) is accurately scoped and doesn't overclaim beyond that, so CRITICAL is defensible as a broken-access-control/privilege-escalation-class bug even with that caveat.

**Description.** The self-update policy for `user_profiles` only restricts *which row* can be updated (`id = auth.uid()`); it has no `WITH CHECK` clause limiting *which columns/values* may be written. Postgres RLS is row-level, not column-level, so a `new_joinee` can run `supabase.from('user_profiles').update({ role: 'academic_head' }).eq('id', myId)` and it will succeed — the row being updated is their own, satisfying `USING (id = auth.uid())`. This directly flips `user_profiles.role`, which is what `AuthContext.fetchProfile()` reads and what `ProtectedRoute`/`hasRole()`/`PhaseAccessGuard` use for all client-side route gating (src/components/ProtectedRoute.tsx:35-40), and — per src/hooks/useAutoPromote.ts:61-71 — is exactly the column the app's own legitimate promotion flow treats as the role source of truth.

**Impact / failure scenario.** A malicious new hire runs one Supabase update call from the browser console to set their own `user_profiles.role` to `academic_head`/`onboarding_lead`/`lead_instructor`. `ProtectedRoute`'s `requiredRoles` checks (src/App.tsx:116-129) now pass client-side, unlocking `/admin`, `/buddy`, `/onboarding-lead` and worksheet-review UI in their own browser — no exploit needed, this is a documented Supabase RLS anti-pattern (missing WITH CHECK).

**Suggested fix.** Add `WITH CHECK (id = auth.uid() AND role = (SELECT role FROM user_profiles WHERE id = auth.uid()))` to freeze self-editable columns, or split into a narrow self-update policy that excludes `role`/`assigned_lead_id`/`assigned_buddy_id` via a trigger (`BEFORE UPDATE` function that raises an exception if `NEW.role IS DISTINCT FROM OLD.role` unless the actor is verified admin through a SECURITY DEFINER check), and require role/assignment changes to go through a privileged RPC.

---

#### 12. [CRITICAL] worksheet_submissions self-approval: 'Update own submissions' / 'Insert own submissions' policies have no WITH CHECK on review_status/reviewed_by — a joinee can approve their own worksheets directly, bypassing the entire buddy/manager review workflow

- **Dimension:** Dim 9: Security
- **Location:** `db/schema.sql:176-187 (`Insert own submissions` WITH CHECK only restricts user_id; `Update own submissions` FOR UPDATE USING (auth.uid() = user_id) has no WITH CHECK at all); state-machine validation only exists client-side in src/pages/WorksheetReview.tsx:74-80`
- **Verification:** CONFIRMED — Verified: db/schema.sql:184-187 'Update own submissions' policy is FOR UPDATE USING (auth.uid() = user_id) with no WITH CHECK; per Postgres RLS semantics, an UPDATE policy with no WITH CHECK reuses the USING expression for the check, so any authenticated user can write arbitrary values (review_status='approved', reviewed_by=self, reviewer_name='Manager', etc.) to their own row as long as user_id is unchanged. Confirmed no trigger or SECURITY DEFINER function enforces state-machine transitions server-side (only BEFORE UPDATE trigger in schema.sql is update_updated_at_column), src/api/supabase.ts uses the anon/publishable key so RLS is the only gate, and WorksheetReview.tsx performs the approve transition via a plain supabase.from('worksheet_submissions').update() call gated only by client-side React state checks. Checked all other SQL variants (db/__fix_rls_jwt.sql, supabase_role_migration.sql, supabase_reviewer_migration.sql, setup_correct.sql) — same gap present in every version, no RPC calls exist anywhere in src/.

**Description.** Every state-machine transition (pending_review → buddy_approved → approved, or → needs_revision) is validated only in React (e.g. `if (currentStatus !== 'pending_review' && currentStatus !== 'revision_submitted') { ...bail... }` in WorksheetReview.tsx:76-80) before an ordinary `supabase.from('worksheet_submissions').update(...)` call. There is no RPC/SECURITY DEFINER function and no RLS WITH CHECK restricting which `review_status`/`reviewed_by`/`reviewer_name`/`review_history` values a row owner may write. Because the RLS policy that lets a joinee edit their own submission (`auth.uid() = user_id`, used legitimately for auto-save) has no WITH CHECK, the exact same policy lets that joinee write `{ review_status: 'approved', reviewed_by: <self>, reviewer_name: 'Manager' }` directly onto their own row from the browser console — completely bypassing buddy review and manager review.

**Impact / failure scenario.** Any new hire can self-approve all of their own worksheets across all 3 phases with a handful of `supabase.from('worksheet_submissions').update({review_status:'approved',...}).eq('id', myRowId)` calls, then (per useAutoPromote.ts logic, itself client-invoked and gated only by the equally-broken self-role-write in Finding #2) legitimately trigger — or directly replicate — the promotion to `lead_instructor` (buddy/reviewer status) without a single human review ever occurring. This defeats the core business purpose of the entire onboarding/review product.

**Suggested fix.** Add WITH CHECK clauses that pin non-owner-writable columns to their prior values for self-updates (e.g. `WITH CHECK (auth.uid() = user_id AND review_status = OLD... )` is not directly expressible in plain RLS — instead split into: (a) a narrow 'Joinee autosave' policy restricted via WITH CHECK to `review_status IN ('', 'pending_review')` and NULL reviewed_by/reviewer_name, and (b) move all approve/reject/revision transitions into `SECURITY DEFINER` RPC functions that verify caller role/assignment server-side and perform the state transition atomically, callable only by verified reviewers.

---

#### 13. [CRITICAL] Signup role is accepted as a caller-supplied parameter with no server-side allow-list — any direct API call can self-register as academic_head/onboarding_lead

- **Dimension:** Dim 9: Security
- **Location:** `src/context/AuthContext.tsx:169,174,188 (signUp(email, password, fullName, role) writes `role` straight into both auth user_metadata and the user_profiles insert); UI-side default is src/pages/Signup.tsx:31 (`signUp(email, password, fullName, 'new_joinee')`)`
- **Verification:** CONFIRMED — Confirmed: AuthContext.tsx signUp(email,password,fullName,role) forwards caller-supplied role into auth.signUp metadata and the user_profiles insert; db/schema.sql:59-60 'Insert own profile' RLS policy only checks id=auth.uid() with no role restriction, and the role CHECK constraint (line 44) permits academic_head/onboarding_lead; scripts/setup/create-admin.cjs demonstrates exactly this exploit via the public anon-key signup endpoint. Since this grants full admin privilege with zero authentication and zero existing account, CRITICAL (not just HIGH) is warranted over the reported severity.

**Description.** The `signUp()` function signature takes `role: UserRole` as a plain parameter and forwards it verbatim to `supabase.auth.signUp({ options: { data: { role } } })` and to the `user_profiles` insert. The shipped Signup.tsx page only ever calls it with `'new_joinee'`, so the UI itself is fine — but nothing server-side enforces that constraint. The only server-side guard is the CHECK constraint on `user_profiles.role` allowing any of `('new_joinee','lab_instructor','lead_instructor','academic_head','onboarding_lead','acad_ops')` — i.e. the database happily accepts a self-registered `academic_head` account. `scripts/setup/create-admin.cjs` is literally a working demonstration of this: it calls the public `/auth/v1/signup` REST endpoint with the anon key and `data: { role: 'onboarding_lead' }` and succeeds.

**Impact / failure scenario.** Anyone (no account required) can POST directly to the public Supabase auth signup endpoint (URL + anon key are both in the committed .env) with `data: { role: 'academic_head' }` to create a brand-new account that already holds the highest privilege role from the moment of signup, then insert a matching `user_profiles` row (also permitted, since 'Insert own profile' only checks `id = auth.uid()`, not role). No existing account or escalation step is even required.

**Suggested fix.** Never allow role to be client-supplied at signup. Always create new accounts with a hardcoded `new_joinee`/default role server-side (e.g. via a Postgres trigger on `auth.users` insert that sets `user_profiles.role = 'new_joinee'` unconditionally, ignoring any metadata), and require role escalation only through an authenticated admin action gated by Finding #1/#2's proper server-side role source.

---

#### 14. [CRITICAL] Unconditional, unguarded full-database wipe script checked into repo, aimed at the only Supabase project

- **Dimension:** Dim 11: Data Durability & Dangerous Scripts
- **Location:** `db/__cleanup_test_users.sql:12-46`
- **Verification:** CONFIRMED — Confirmed by reading db/__cleanup_test_users.sql lines 1-53 directly: DELETE FROM user_profiles (line 27) and DELETE FROM auth.users (line 35) have no WHERE clause at all, and the notifications/worksheet_submissions/onboarding_submissions deletes are filtered only by 'user_id IN (SELECT id FROM user_profiles)' which is not a test-user filter (no email/flag pattern) so it matches all users; header comment itself admits 'This deletes ALL data in the database except the schema itself'; file is git-tracked (committed ca0326e, 2026-06-18) and its own comments direct pasting it into the Supabase SQL Editor which runs as service_role/superuser.

**Description.** This script (misleadingly named 'cleanup_test_users') issues `DELETE FROM notifications`, `DELETE FROM worksheet_submissions`, `DELETE FROM onboarding_submissions`, `DELETE FROM user_profiles`, and `DELETE FROM auth.users` with NO WHERE clause on any of them — it deletes every row in every table, not just test users. It has no environment check, no confirmation step, no dry-run mode, and its own header comment admits 'This deletes ALL data in the database except the schema itself.' It is designed to be pasted directly into the Supabase SQL Editor (which runs as postgres/service_role and bypasses all RLS policies).

**Impact / failure scenario.** Any operator who runs this file against the live project (the only project that exists — see finding on single-environment setup) permanently destroys every onboarding record, every user account, and every auth identity, with no confirmation prompt standing in the way. A single copy-paste mistake, or someone treating the filename literally ('cleanup test users, this is safe'), causes total data loss.

**Suggested fix.** Delete this script from a shared repo entirely, or at minimum: (1) require an explicit `WHERE email LIKE 'test_%'`-style filter matching a documented test-user naming convention, (2) print a row count and require a typed confirmation ('DELETE PRODUCTION') before executing against a project whose ref does not match a designated 'test' project ID, (3) never delete auth.users unconditionally, (4) keep this script out of the main branch / gate it behind a runbook with a required backup step first.

---

#### 15. [CRITICAL] No environment separation — every 'test' script's hardcoded fallback URL is the same project as the committed production config

- **Dimension:** Dim 11: Data Durability & Dangerous Scripts
- **Location:** `.env:1-2 (VITE_SUPABASE_URL=https://fuoqoryqndtdooujslee.supabase.co); scripts/clean_setup.mjs:16-18; scripts/fix_promotion_data.mjs:10-12; fix-assignments.cjs:11-13; scripts/setup/__create_15_users.cjs:12`
- **Verification:** CONFIRMED — Verified: .env is git-tracked (not in .gitignore) with the fuoqoryqndtdooujslee project; scripts/clean_setup.mjs:16, scripts/fix_promotion_data.mjs:10, fix-assignments.cjs:11, scripts/setup/__create_15_users.cjs:12 all hardcode the identical URL/key as fallback (fix-assignments.cjs isn't even conditional), and a repo-wide grep shows every other seed/setup script (__seed_30_users.cjs, __seed_test_data.cjs, __create_users.cjs, __full_setup.cjs, __test_reviewer_flow.cjs) does the same — no second project exists anywhere in tracked files; context.md:1577/1618 documents this as 'the' project.

**Description.** There is exactly one Supabase project (`fuoqoryqndtdooujslee`) in this entire codebase. Every destructive/seed script — clean_setup.mjs, fix_promotion_data.mjs, fix-assignments.cjs, scripts/setup/__create_15_users.cjs, and others — hardcodes this same URL/anon-key pair as its fallback if env vars aren't set, and it is the exact value committed in .env. context.md:1618 explicitly documents 'Supabase project (already configured: project ID `fuoqoryqndtdooujslee`)' as the production project. Scripts named 'clean_setup', 'fix_promotion_data', etc. that were written for local QA sessions therefore write and delete against the same database that will hold real onboarding data once this launches.

**Impact / failure scenario.** Any developer running `node scripts/clean_setup.mjs` or `node fix-assignments.cjs` without realizing their shell doesn't have VITE_SUPABASE_URL exported (e.g. a fresh terminal, CI runner, or a laptop that never sourced .env) silently connects to and mutates/deletes the production database, because the fallback IS production. There is no 'you are about to hit prod' guard anywhere.

**Suggested fix.** Provision a genuinely separate Supabase project for development/QA. Remove all hardcoded URL/key fallbacks from scripts — fail loudly if env vars are unset rather than silently defaulting to a real project. Add a runtime guard that refuses to run any script whose target project ref is not in an explicit allowlist of non-prod project refs.

---

#### 16. [CRITICAL] RLS authorization trusts client-writable auth.jwt() user_metadata.role — full privilege escalation to admin/buddy/manager for any signed-up user

- **Dimension:** Dim 14: User Isolation
- **Location:** `db/schema.sql:68-72,108-112,191-216 (identical flaw repeated in db/setup_correct.sql:29-96, db/__fix_rls_jwt.sql:25-81, db/__fix_rls_recursion.sql:28-93); src/context/AuthContext.tsx:169-176 (signUp); src/hooks/useAutoPromote.ts:69-71 (updateUser)`
- **Verification:** CONFIRMED — Verified directly: db/schema.sql lines 68-72 and 108-112 gate 'Admin read/update profiles' on auth.jwt()->'user_metadata'->>'role', lines 191-216 gate reviewer select/update on the same; identical pattern confirmed in db/setup_correct.sql, db/__fix_rls_jwt.sql (same path) and db/__fix_rls_recursion.sql (auth.jwt()->>'role' top-level, same vulnerability class). AuthContext.tsx:169-176 signUp passes role into options.data (GoTrue user_metadata), and useAutoPromote.ts:69-71 genuinely calls supabase.auth.updateUser({data:{role:...}}), proving the metadata-role write path is live client-side code, not UI-only. .env is tracked in git (git ls-files) and not gitignored, corroborating the exposed-anon-key claim. Finding is accurate as described.

**Description.** Every RLS policy in the repo that grants elevated (reviewer/admin) access — on user_profiles ('Admin read all profiles', 'Admin update profiles'), worksheet_submissions ('Reviewers select/update submissions'), and onboarding_submissions — bases its authorization check on `auth.jwt() -> 'user_metadata' ->> 'role'`. Supabase's `user_metadata` (raw_user_meta_data) is standard, unrestricted, user-writable data: any authenticated client can call `supabase.auth.updateUser({ data: { role: 'academic_head' } })` for their own account and have it reflected in their next JWT. This is not a hypothetical misuse — the app itself does exactly this in useAutoPromote.ts:69-71 to legitimately promote a user, proving the code path is live and reachable from client JS. A malicious 'new_joinee' can sign up (public /signup, or call supabase.auth.signUp directly with options.data.role='academic_head' — Signup.tsx only hardcodes 'new_joinee' at the UI layer, the GoTrue API itself accepts any metadata), then either at signup or via updateUser(), set role to 'academic_head', 'lead_instructor', or 'onboarding_lead'. On next session refresh, RLS grants that user SELECT on every user_profiles row, SELECT+UPDATE on every worksheet_submissions row for every employee in the company, and SELECT on every onboarding_submissions row. Given .env (with the anon key) is committed to the repo, an attacker doesn't even need to load the app — they can hit the Supabase REST/GoTrue endpoints directly.

**Impact / failure scenario.** Any employee (or anyone who signs up) can read and modify every other employee's worksheet answers, review status, and reviewer/manager/buddy assignments across the entire company, and can approve/reject submissions company-wide, by running one line in the browser console. This is a complete breakdown of the entire user-isolation model — not a partial leak.

**Steps to reproduce.** 1. Sign up a normal account (role defaults to new_joinee). 2. In browser devtools console on the running app: `await window.__supabase_debug__ ?? null` — or simply, since the app imports supabase as a module, add one line temporarily / use any REST client: POST to `{VITE_SUPABASE_URL}/auth/v1/user` with the session's access token and body `{"data":{"role":"academic_head"}}` using the anon key from the committed .env. 3. Refresh session / re-login. 4. Query `worksheet_submissions` for any user_id — RLS now returns rows for all users; call PATCH to approve any worksheet.

**Suggested fix.** Never authorize on user_metadata. Use Supabase app_metadata (server-writable only, set via the Admin API / a trusted server function, e.g. a Postgres function called through a service-role Edge Function on role-change events) or — simpler and self-consistent with the existing schema — drop the JWT-metadata role checks entirely and rewrite every reviewer-facing RLS policy to look up the role from the `user_profiles` table (with a SECURITY DEFINER helper function to avoid the recursion the __fix_rls_recursion.sql migration was trying to avoid), e.g. `CREATE FUNCTION current_user_role() RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$ SELECT role FROM user_profiles WHERE id = auth.uid() $$;` and use `current_user_role() IN (...)` in policies — combined with fix #4 below so user_profiles.role itself can't be self-modified.

---

#### 17. [CRITICAL] Buddy A can view and approve Buddy B's assignees — no ownership enforcement at RLS, route, or component level

- **Dimension:** Dim 14: User Isolation
- **Location:** `db/schema.sql:191-216 (Reviewers select/update submissions policy); src/App.tsx:117,124,127-129 (routes); src/components/ProtectedRoute.tsx:35-40; src/pages/WorksheetReview.tsx:39-46 (canApprove = isBuddy); src/pages/PhaseReview.tsx:47-49 (canApprove = isManager && isAllBuddyApproved)`
- **Verification:** CONFIRMED — Verified directly: db/schema.sql:190-217 shows RLS SELECT/UPDATE policies on worksheet_submissions OR a bare role check (auth.jwt()->'user_metadata'->>'role' IN ('lead_instructor','academic_head'[,...])) with the assigned_lead_id/assigned_buddy_id subquery checks, so any user with that role bypasses assignment entirely; App.tsx:117,124,127-129 gate /buddy/review/:userId/:worksheetId, /buddy/gate-pass/:userId/:gateId, /admin/review-phase/:userId/:phaseNum etc. via ProtectedRoute requiredRoles only; ProtectedRoute.tsx:35-40 confirms it only checks profile.role membership, never :userId; WorksheetReview.tsx:42-50 sets canApprove = isBuddy (profile.role==='lead_instructor') with zero comparison to instructor.assigned_buddy_id, and handleBuddyApprove (lines 74-143) performs the UPDATE relying solely on this. PhaseReview.tsx:47-49 similarly derives isManager from role alone. Finding is accurate as described; severity CRITICAL is appropriate given it's a full horizontal-privilege-escalation/IDOR on the core review-approval workflow.</note>


**Description.** The task's core question — can a buddy approve another buddy's assignee — is answered yes at every layer. (1) RLS: 'Reviewers select submissions' / 'Reviewers update submissions' OR together a bare role check (`role IN ('lead_instructor','academic_head')`) with the assignment check (`auth.uid() IN (SELECT assigned_buddy_id ...)`); because it's an OR, ANY user whose role is lead_instructor can read/update ANY worksheet_submissions row regardless of assigned_buddy_id — the assignment subquery is entirely redundant/dead code for read access. (2) Routing: `/buddy/review/:userId/:worksheetId`, `/buddy/gate-pass/:userId/:gateId`, `/admin/review-phase/:userId/:phaseNum` etc. are gated in ProtectedRoute.tsx purely by `requiredRoles` (role membership), never by comparing `:userId`'s assigned_buddy_id/assigned_lead_id to the logged-in profile.id. (3) Component logic: WorksheetReview.tsx line 43 sets `canApprove = isBuddy` (`profile?.role === 'lead_instructor'`) with no comparison to `instructor.assigned_buddy_id`; PhaseReview.tsx line 49 similarly gates only on `isManager`. There is no ownership check anywhere in the review/approve code path.

**Impact / failure scenario.** Buddy A, knowing or guessing Joinee X's UUID (trivially harvestable — see next finding), can navigate to /buddy/review/{X}/{worksheetId} and click Approve or Request Revision even though X is assigned to Buddy B. Same for Manager A approving Manager B's assignee's phase. The 'assigned buddy/manager' concept that the product is built around (visible in AdminDashboard's 'Buddy Assigned'/'Manager Assigned' badges) provides zero actual access control — it is purely informational.

**Steps to reproduce.** 1. Log in as any lead_instructor (buddy) account. 2. Query `supabase.from('user_profiles').select('id').eq('role','new_joinee')` from devtools — RLS returns all joinees, including ones not assigned to this buddy (see 'Admin read all profiles' policy). 3. Navigate to /buddy/review/{any-other-joinee-id}/p1_w1. 4. Click 'Approve (Buddy)' — the UPDATE succeeds because RLS's role-based OR clause doesn't check assignment.

**Suggested fix.** Make the assignment check mandatory, not optional, in RLS: replace the OR-based policy with one where the role membership only unlocks the *category* of write and the assignment/ownership check is an AND, e.g. `(role_is_buddy() AND auth.uid() = (SELECT assigned_buddy_id FROM user_profiles WHERE id = worksheet_submissions.user_id)) OR (role_is_manager() AND auth.uid() = (SELECT assigned_lead_id ...))`. Additionally add an app-level guard in WorksheetReview.tsx/PhaseReview.tsx/BuddyGatePass.tsx that fetches the target instructor's assigned_buddy_id/assigned_lead_id and renders 'Access Restricted' (matching the existing !isReviewer branch) when it doesn't match profile.id, so the UI reflects the real security boundary instead of contradicting it.

---

#### 18. [CRITICAL] RLS trusts client-writable user_metadata.role, letting any employee self-escalate to read all colleagues' PII

- **Dimension:** Dim 15: Privacy & Compliance
- **Location:** `db/supabase_schema.sql:68-72,119,143 (and equivalent policies in db/schema.sql); src/context/AuthContext.tsx:167-176 (signUp writes role into user_metadata); src/hooks/useAutoPromote.ts:69-73 (client calls supabase.auth.updateUser({data:{role}}))`
- **Verification:** CONFIRMED — Core claim confirmed, though the finding cites the wrong file as primary: db/supabase_schema.sql:68-72,119,143 actually use safe `(SELECT id FROM user_profiles WHERE role IN (...))` subqueries, not user_metadata. The real vulnerable policies are in db/schema.sql:70,77,111,193,209 (`auth.jwt() -> 'user_metadata' ->> 'role' IN (...)`), and per context.md and the file's own header, db/schema.sql is the "DEFINITIVE" schema actually run against the live project (URL in its comment matches VITE_SUPABASE_URL in .env: fuoqoryqndtdooujslee). Client-writability is confirmed: AuthContext.tsx:170-176 (`supabase.auth.signUp({options:{data:{full_name,role}}})`) and useAutoPromote.ts:69-71 (`supabase.auth.updateUser({data:{role:'lead_instructor'}})`) both write into user_metadata, which is documented in Supabase as user-writable (unlike app_metadata). context.md itself documents this design (lines 754, 875, 1188, 1927-1933) as intentional "to avoid RLS recursion." Any authenticated user can call `supabase.auth.updateUser({data:{role:'academic_head'}})` from the console to self-escalate and gain read/write access to all colleagues' profiles and submissions — company-wide PII exposure, trivially exploitable, matches the severity described.

**Description.** Every 'admin/lead can read all X' RLS policy in the schema checks `auth.jwt() -> 'user_metadata' ->> 'role'`. `user_metadata` on a Supabase auth user is writable by the authenticated user themselves via `supabase.auth.signUp({options:{data:{role}}})` (used at signup, AuthContext.tsx:170-176) or `supabase.auth.updateUser({data:{role}})` (already called client-side elsewhere in the app, useAutoPromote.ts:69). No database trigger, check constraint, or server-side function restricts what value a user can put in their own `user_metadata.role`. There is no server/service-role boundary here — the anon key committed in .env is all that's needed.

**Impact / failure scenario.** A logged-in new_joinee (or anyone who signs up, since email confirmation is the only gate) runs `await supabase.auth.updateUser({ data: { role: 'academic_head' } })` from the browser console, refreshes their session, and the RLS policies at db/supabase_schema.sql:68-72 and :143 now treat them as an academic_head/onboarding_lead. They can then SELECT every row of `user_profiles` (all employees' full names, emails, departments, buddy/manager assignments) and every row of `worksheet_submissions` and `onboarding_submissions` (every colleague's assessment answers, self-reported competency data, and manager review_comment/review_history feedback) company-wide. This is a complete company-wide PII breach reachable with zero exploitation skill, just a documented Supabase API call.

**Suggested fix.** Never author authorization decisions from `user_metadata` (user-writable). Store role in `app_metadata` (only settable via service-role/Admin API) or, better, keep `role` solely in `user_profiles` and have RLS policies subquery that table (already partially done in db/supabase_schema.sql lines that reference `SELECT id FROM user_profiles WHERE role IN (...)`) — use only that pattern, remove all `auth.jwt() -> 'user_metadata'` role checks, and add a trigger/RLS rule that only privileged roles (via service key) can update `user_profiles.role`. Audit whether this bug has already been exploited against the live Supabase project referenced in the committed .env before launch.

---

#### 19. [CRITICAL] run_migration.cjs is non-functional — references SQL files that don't exist at the stated paths

- **Dimension:** Dim 17: Operational Readiness
- **Location:** `scripts/run_migration.cjs:36-41 (MIGRATIONS array pointing at scripts/setup/__migration_notifications_dates.sql and scripts/setup/__due_date_notifications.sql)`
- **Verification:** CONFIRMED — Confirmed via find/ls: scripts/run_migration.cjs:36,40 reference scripts/setup/__migration_notifications_dates.sql and scripts/setup/__due_date_notifications.sql, but scripts/setup/ contains only .cjs setup scripts — the actual SQL files live at db/__migration_notifications_dates.sql and db/__due_date_notifications.sql, so fs.readFileSync on line 52 would throw ENOENT on the first migration.

**Description.** The MIGRATIONS array in the repo's only migration-runner tool points at scripts/setup/__migration_notifications_dates.sql and scripts/setup/__due_date_notifications.sql. Verified with find: neither file exists under scripts/setup/. The actual files live at db/__migration_notifications_dates.sql and db/__due_date_notifications.sql. Running the script as committed throws fs.readFileSync ENOENT on the very first migration and exits before touching the database.

**Suggested fix.** Fix the hardcoded paths to point at db/, then actually run the script once end-to-end against a staging project. Better: adopt the Supabase CLI's supabase/migrations directory + `supabase db push`, which tracks applied migrations in a schema_migrations table instead of a bespoke script with hand-typed file lists.

---

#### 20. [CRITICAL] Production Supabase URL and anon key are hardcoded as literal fallback defaults in 9+ scripts, with no single source of truth for rotation

- **Dimension:** Dim 17: Operational Readiness
- **Location:** `scripts/clean_setup.mjs:16-18; scripts/fix_promotion_data.mjs:10-12; fix-assignments.cjs:11-13; __seed_30_users.cjs:18-20; __seed_test_data.cjs:18-20; scripts/setup/__create_15_users.cjs:12; scripts/setup/__create_users.cjs:4; scripts/setup/__full_setup.cjs:5; scripts/setup/__test_reviewer_flow.cjs:5; scripts/run_migration.cjs:16`
- **Verification:** CONFIRMED — Grep confirms hardcoded fallback literals for both the prod Supabase URL (fuoqoryqndtdooujslee) and the publishable/anon key (sb_publishable_1JTwEK8...) across 10 files (15 hits total; finding said 9/13 — close), with no shared config module, so the DRY/rotation-friction claim is accurate. However severity is overstated: src/api/supabase.ts shows this exact URL+publishable key pair is already the client-side key shipped in every browser bundle via VITE_-prefixed env vars, i.e. it is Supabase's intentionally-public anon key protected by RLS, not a secret — and grep found zero hardcoded service_role keys or PATs anywhere in the repo. This is a real maintainability/rotation-hygiene defect, not a critical secret-exposure vulnerability.

**Description.** Grep for the literal production project ref (fuoqoryqndtdooujslee) and the anon key (matching .env) across the repo returns 13 hits in 9 separate files, each hardcoding `process.env.VITE_SUPABASE_URL || 'https://fuoqoryqndtdooujslee.supabase.co'` (or an unconditional literal in fix-assignments.cjs:11). There is no shared config module — every script re-embeds its own copy of the prod credentials as a fallback.

**Suggested fix.** Delete all hardcoded fallbacks; require env vars and fail loudly if absent. Centralize Supabase client construction in one module all scripts import. Document a key-rotation runbook — currently impossible to execute safely since nobody can enumerate every place the key lives without a repo-wide grep.

---

#### 21. [CRITICAL] Client-controlled JWT user_metadata.role is trusted by all RLS authorization checks — trivial admin privilege escalation

- **Dimension:** Dim 19: Auth Flow Deep-Dive
- **Location:** `src/context/AuthContext.tsx:169-176,188 (signUp writes role into auth options.data and into user_profiles.insert); src/hooks/useAutoPromote.ts:69-71 (updateUser writes role into own metadata); db/schema.sql:68-80,111,193-216; db/setup_correct.sql:29-95; db/__fix_rls_jwt.sql:25-89 (RLS policies all gate on auth.jwt() -> 'user_metadata' ->> 'role')`
- **Verification:** CONFIRMED — Verified directly: src/api/supabase.ts uses the public anon key client-side; AuthContext.tsx:174 passes client-supplied role into signUp's options.data (user_metadata), AuthContext.tsx:188 inserts that same client role into user_profiles with no WITH CHECK on role (schema.sql:59-60 only checks id=auth.uid()); useAutoPromote.ts:69-71 calls auth.updateUser({data:{role}}) which anyone can call arbitrarily from the browser; and every privileged RLS policy (schema.sql:68-80,111,193,209; setup_correct.sql:32,39,65,81,95) gates on auth.jwt()->'user_metadata'->>'role', which Supabase populates from client-writable user_metadata. This is a genuine, trivially exploitable full authZ bypass (browser console: supabase.auth.updateUser({data:{role:'academic_head'}})) — severity CRITICAL is appropriate, not overrated.

**Description.** Supabase's user_metadata (as opposed to app_metadata) is fully writable by the authenticated client itself, via supabase.auth.signUp({options:{data:{role}}}) or supabase.auth.updateUser({data:{role}}) — both of which this app calls directly with a client-supplied role (AuthContext.tsx:169-176, useAutoPromote.ts:69-71). Every RLS policy that implements 'admin'/'reviewer' access across user_profiles, worksheet_submissions, and onboarding_submissions checks auth.jwt() -> 'user_metadata' ->> 'role' against values like 'academic_head', 'onboarding_lead', 'lead_instructor' (confirmed identically in db/schema.sql, db/setup_correct.sql, and db/__fix_rls_jwt.sql). This means any authenticated user — including a brand-new 'new_joinee' signup — can open devtools and run `await supabase.auth.updateUser({data:{role:'academic_head'}})`, which immediately refreshes their session with the new claim, after which every RLS check in the schema treats them as a full admin. Additionally, the 'Insert own profile' RLS policy (schema.sql:59-60, `id = auth.uid()`) places no constraint on the role column value beyond the enum CHECK — so a user can also directly insert a user_profiles row with role='academic_head' for their own id, bypassing Signup.tsx's UI-level hardcoding of 'new_joinee' entirely.

**Impact / failure scenario.** Any employee (or anyone who signs up, since there is no invite-only gating observed) can self-promote to academic_head via one browser console command and gain read/write access to all employees' PII, review data, and the ability to approve/reject their own or peers' onboarding worksheets. This is a full authZ bypass of the entire application, not an edge case.

**Suggested fix.** Never source authorization role from user_metadata. Store the authoritative role only in user_profiles.role (already done) and switch every RLS policy to a SECURITY DEFINER function that looks up the role from user_profiles by auth.uid() (guarding against RLS recursion inside the function, not via JWT trust), or use Supabase's server-only app_metadata (settable only via service-role/Edge Function) for RLS role checks. Also add a WITH CHECK (role = 'new_joinee') to the 'Insert own profile' policy so self-signup can never insert a privileged role directly.

---

## 6. HIGH findings (full detail)

#### 22. [HIGH] PHASE_WORKSHEETS_MAP restructuring is undocumented and causes cross-phase worksheets to be approved prematurely

- **Dimension:** Dim 1: Spec Compliance
- **Location:** `src/config/worksheetConfigData.ts:555-570 (PHASE_WORKSHEETS_MAP); src/pages/PhaseReview.tsx:76-127 (handleApprovePhase)`
- **Verification:** CONFIRMED — Related to the arch-dimension 'two incompatible taxonomies' CRITICAL; consistent evidence.
- **Effort:** M

**Description.** ARCHITECTURE_PLAN.md/REVIEW_FLOW.md describe a fixed 3-phase model (8+4+5 = 17 worksheets + 3 gates = 20). PHASE_WORKSHEETS_MAP[1] now contains ~34 entries (per reviewFlow.test.ts:57 comment), including p2_w1, p2_w2, p2_w4, p3_w1, p3_w5 — IDs that ALSO appear in PHASE_WORKSHEETS_MAP[2] and [3]. PhaseReview.handleApprovePhase() approves every submission with review_status==='buddy_approved' loaded via .in('worksheet_id', PHASE_WORKSHEETS_MAP[phaseNumber]). Approving 'Phase 1' therefore also flips p2/p3 worksheets to 'approved' before the joinee has entered Phase 2/3.

**Root cause.** A structural change (Phase/Week merge) shipped without de-duplicating the phase map or updating the specs.

**Impact / failure scenario.** Undermines sequential gating. Worksheets nominally in Phase 2/3 can be fully approved as a side effect of a Phase 1 review action, with no distinct phase-level approval event for the phase they actually belong to. None of the three audited plan documents mention this 'FTP week' restructuring.

**Current behavior.** Cross-listed worksheet IDs get approved via whichever phase's PhaseReview button is clicked first.

**Expected behavior.** Each worksheet belongs to exactly one phase/review bucket, or the docs describe and the code correctly implements the week-based model with non-overlapping approval sets.

**Suggested fix.** De-duplicate PHASE_WORKSHEETS_MAP so each worksheet ID appears in exactly one bucket, or explicitly document and test the intended cross-listing; update ARCHITECTURE_PLAN.md/REVIEW_FLOW.md.

---

#### 23. [HIGH] Auto-promotion notification hardcodes a stale worksheet count ('All 20 worksheets')

- **Dimension:** Dim 1: Spec Compliance
- **Location:** `src/hooks/useAutoPromote.ts:41-58, 83`
- **Effort:** S

**Description.** checkAndPromote() builds allWsIds from PHASE_WORKSHEETS_MAP[1]+[2]+[3], now ~40+ unique IDs (34 in Phase 1 alone per the code's own test comment), not 20. The promotion notification at line 83 still reads 'All 20 worksheets across all 3 phases have been approved.'

**Root cause.** Magic number left over from the pre-restructuring 20-worksheet model.

**Impact / failure scenario.** User-facing copy is factually wrong for every promoted user, and signals the promotion logic was never revisited after the FTP restructuring — raising doubt about whether the .every() check over the duplicated list still behaves as intended.

**Current behavior.** Hardcoded '20' in a template string.

**Expected behavior.** Message (and related UI copy such as 'X/20' displays) derives the total dynamically (e.g. allWsIds.length or a de-duplicated count).

**Suggested fix.** Replace the literal 20 with a computed unique count.

---

#### 24. [HIGH] Identical 'is worksheet complete' business logic and ~150 lines of page markup copy-pasted across 7 files

- **Dimension:** Dim 2: Code Quality
- **Location:** `src/pages/Phase1.tsx:148,156; src/pages/Phase2.tsx:94; src/pages/Phase3.tsx:95; src/pages/Week1.tsx:42; src/pages/Week2.tsx:44; src/pages/Week3.tsx:44; src/pages/Week4.tsx:58`
- **Verification:** CONFIRMED — Verified: the exact predicate `s?.status === 'submitted' || s?.review_status === 'approved' || s?.review_status === 'buddy_approved'` appears verbatim at Phase1.tsx:148,156, Phase2.tsx:94, Phase3.tsx:95, Week1.tsx:42, Week2.tsx:44, Week3.tsx:44, Week4.tsx:58 (8 occurrences, 7 files, exactly as cited); each file also redeclares its own StatusInfo/WorksheetMeta interfaces and an identical inline loadStatuses() Supabase query against worksheet_submissions; Phase1.tsx:236-259 vs Week1.tsx:48-71 show near-identical header/progress-bar/reviewer-legend JSX with matching inline style objects. PhaseWorksheetList.tsx already exists in src/components, confirming the proposed extraction pattern is a natural, already-precedented fix. HIGH severity is appropriate given the breadth (7 files) and the concrete correlated-bug consequence.
- **Effort:** M

**Description.** The exact expression `s?.status === 'submitted' || s?.review_status === 'approved' || s?.review_status === 'buddy_approved'` is duplicated verbatim in 8 places across 7 different page files, each with its own separate `loadStatuses`/inline Supabase fetch (`.from('worksheet_submissions').select('worksheet_id, status, review_status').eq('user_id', ...)`), its own StatusInfo/WorksheetMeta interface redeclared per file, and ~150 lines of identical inline-style header/progress-bar/reviewer-legend JSX (compare Phase1.tsx:230-283 to Week1.tsx:45-86 — same structure, same inline style objects, same class names) repeated near-verbatim in Phase2, Phase3, Week1-4.

**Impact / failure scenario.** The gate-completion bug above is a direct consequence of this pattern: the completion rule lives in 8 separate copies instead of one, so when the status vocabulary drifted (Submitted vs submitted), nobody could fix it in one place, and it's easy for a future edit to fix 6 of the 8 copies and miss 2. Any future change to what counts as 'complete' (e.g. adding a new review_status value) requires manually auditing and editing 7 files; missing even one silently produces incorrect progress percentages/badges for that phase or week.

**Suggested fix.** Extract a shared `isWorksheetComplete(status: StatusInfo): boolean` helper and a shared `useWorksheetStatuses(user, ids)` hook (mirroring the existing PhaseWorksheetList component pattern) that all Phase*/Week* pages call. Extract the shared header/progress-bar/reviewer-legend block into a `PhaseHeader` component parameterized by title/subtitle/dayRange/worksheets, the same way PhaseWorksheetList already abstracts the list rendering.

---

#### 25. [HIGH] serve-app.mjs has an unauthenticated path-traversal arbitrary file read vulnerability

- **Dimension:** Dim 4: Deployment & Ops
- **Location:** `serve-app.mjs:15-20`
- **Verification:** CONFIRMED — Confirmed by reading serve-app.mjs:15-21: fp = path.join(dist, decodeURIComponent(req.url.split('?')[0])) with only an existsSync/isFile fallback (line 17) and no containment check against dist, so a traversal path that exists on disk (e.g. ../../.env, which is present at the repo root one level above dist) passes the check and is read via fs.readFileSync and returned with 200 — the exploit is real and unauthenticated. However CRITICAL is overstated: the server binds to 127.0.0.1 only (line 23), and the script is not referenced anywhere else in the repo (no package.json script, no README, no Dockerfile/vercel/netlify config, not used by any CI); package.json already ships a safer `preview` script (`vite preview`). Since production usage isn't confirmed (though plausible if run behind a reverse proxy, which would make .env/Supabase-key exposure severe), downgrading to HIGH rather than CRITICAL.

**Description.** The only server script in the repo builds the file path as `path.join(dist, decodeURIComponent(req.url.split('?')[0]))` with no containment check against `dist`. `path.join` normalizes `..` segments, so a request like `GET /../../../../etc/passwd` (or `/../../.env`) resolves outside the `dist` directory and is read via `fs.readFileSync` and served with `res.writeHead(200, ...)`. Verified by direct simulation: `path.join('/app/dist', decodeURIComponent('/../../../../../../etc/passwd'))` resolves to `/etc/passwd`. This script is the only artifact in the repo that could plausibly run the production build (no Dockerfile, no Vercel/Netlify config exist), and nothing in the repo documents it as dev-only.

**Suggested fix.** Do not ship or use serve-app.mjs for production. If a custom server is genuinely needed, resolve the requested path with `path.normalize`/`path.resolve` and reject/​404 any resolved path that does not start with the `dist` root (`if (!resolved.startsWith(dist + path.sep)) return 404`). Prefer a maintained static-file server (e.g. `serve`, or the hosting provider's own static hosting) instead of hand-rolled file serving.

---

#### 26. [HIGH] SPA client-side routing has no server-side rewrite for any of the three documented hosting targets — refreshing any deep link 404s

- **Dimension:** Dim 4: Deployment & Ops
- **Location:** `src/App.tsx:103 (BrowserRouter); .nojekyll (root, 0 bytes); no public/404.html; no public/_redirects; no vercel.json`
- **Verification:** CONFIRMED — Verified: BrowserRouter confirmed at src/App.tsx:103; .nojekyll exists (0 bytes) with no public/404.html SPA-fallback; no public/_redirects; no vercel.json anywhere in repo; context.md:1604-1607 does list Vercel/Netlify/GitHub Pages/S3+CDN as deploy targets — finding is accurate as described.

**Description.** The app uses `BrowserRouter` (src/App.tsx:1,103), which requires the host to rewrite all unknown paths to `index.html` so client-side routing can take over. The repo ships a `.nojekyll` file (only meaningful for GitHub Pages) with no matching `public/404.html` SPA-fallback trick; there's no `public/_redirects` for Netlify; there's no `vercel.json` rewrites config for Vercel. Under all three of the hosting options the project's own docs recommend (context.md:1604-1607), directly loading or refreshing any non-root route (e.g. `/dashboard`, `/phase1`, `/worksheets/...`) returns a 404 from the static host before React Router ever runs.

**Suggested fix.** For GitHub Pages: add a `public/404.html` that redirects to `index.html` with the path preserved (the standard spa-github-pages trick). For Netlify: add `public/_redirects` with `/* /index.html 200`. For Vercel: add `vercel.json` with a rewrite of `/(.*) -> /index.html`. Pick the actual target host and add only what's needed, then verify with a real deployment (not just `vite preview`, which already handles fallback and will hide this bug).

---

#### 27. [HIGH] Missing Supabase env vars crash the entire app before React mounts, with no user-visible error — ErrorBoundary cannot catch it

- **Dimension:** Dim 4: Deployment & Ops
- **Location:** `src/api/supabase.ts:4-19; src/context/AuthContext.tsx:2; src/App.tsx:52,104`
- **Verification:** CONFIRMED — Confirmed: supabase.ts:19 createClient(supabaseUrl, supabaseKey) runs at module scope in a static import chain (main.tsx -> App.tsx -> AuthContext.tsx -> api/supabase.ts) that executes before createRoot().render() in main.tsx; verified against actual @supabase/supabase-js@2.108.2 source that the SupabaseClient constructor synchronously throws Error(\"supabaseUrl is required.\") when the URL is empty, and index.html's #root div has no fallback content, so the result is a blank page uncatchable by the React ErrorBoundary at App.tsx:52.

**Description.** `src/api/supabase.ts:19` calls `createClient(supabaseUrl, supabaseKey)` at module scope. `App.tsx` statically imports `AuthProvider` from `context/AuthContext.tsx`, which statically imports `supabase` from `api/supabase.ts` (AuthContext.tsx:2). This whole chain executes during ES module evaluation, before `createRoot(...).render(<App/>)` in src/main.tsx ever runs, and therefore before the `ErrorBoundary` component (App.tsx:52, wrapping routes inside `AuthProvider` at App.tsx:104) exists in the tree. If `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` are unset at build time (e.g. `.env` missing on a fresh clone/CI runner, or the host's env-var injection is misconfigured/misnamed), the code only does `console.error(...)` (supabase.ts:8-16) and then still calls `createClient('', '')`, which the Supabase JS client throws on synchronously for an invalid URL — producing a blank white page in production with zero user-facing indication of what went wrong, recoverable only by reading the browser console.

**Suggested fix.** Guard the client creation: if either var is missing, render a minimal static error page (a plain DOM message written before React even loads, e.g. in index.html or main.tsx pre-render) instead of letting `createClient` throw during module evaluation. At minimum, wrap the `createClient` call in a try/catch and export a sentinel/no-op client plus a boolean `isConfigured` flag that `App.tsx` checks before rendering the real app, showing a configuration-error screen instead of a blank page.

---

#### 28. [HIGH] Live production Supabase URL and anon key are hardcoded as fallback literals in 5+ committed scripts, in addition to being committed in .env

- **Dimension:** Dim 4: Deployment & Ops
- **Location:** `__seed_30_users.cjs:18-19; __seed_test_data.cjs:18-19; fix-assignments.cjs:11-12; scripts/clean_setup.mjs:16-17; scripts/fix_promotion_data.mjs:10-11; scripts/run_migration.cjs:16 (project ref)`
- **Verification:** CONFIRMED — Verified: all 6 files contain the exact hardcoded fallback URL/key (or project ref) matching .env's live values — __seed_30_users.cjs:18-19, __seed_test_data.cjs:18-19, fix-assignments.cjs:11-12 (URL is hardcoded directly, not even a fallback), scripts/clean_setup.mjs:16-17, scripts/fix_promotion_data.mjs:10-11, scripts/run_migration.cjs:16; scripts/setup/create-admin.cjs correctly requires+exits instead, confirming the inconsistency claim. Severity is warranted, not overblown: these scripts perform real .insert/.update/.delete/.upsert calls (e.g. __seed_30_users.cjs:328,331,390,393 delete/update worksheet_submissions & user_profiles), so running any of them with unset env vars silently mutates the single shared Supabase project by default — and the repo (github.com/newton-priyanshu/Onboarding) is confirmed PUBLIC, so these credentials and the default-to-prod footgun are exposed to anyone. Minor nit: framing as a pure "credential leak" is slightly imprecise since it's a publishable/anon key (RLS-gated by design, no service_role key found committed), but the core risk (no env separation, destructive scripts default to live DB, key can't be meaningfully rotated) is accurately described and justifies HIGH.

**Description.** Each of these scripts falls back to the literal production values (`SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://fuoqoryqndtdooujslee.supabase.co'`, `SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_1JTwEK8CgHC6PLtOOnYeSw_xaHwa-i9'`) when no env var is exported — the exact same value as the committed `.env` (`.env:1-2`). This means there is effectively one single Supabase project shared by every developer's local scripts, seed data, and (per context.md) production itself, with no environment separation. Anyone who clones the repo and runs a seed/fix script without deliberately overriding env vars will mutate whatever database those credentials point at. It also means the anon key can never be meaningfully rotated: even after editing `.env`, 5 other files still contain the old key as a hardcoded default, and the key is permanently retained in git history regardless.

**Suggested fix.** Remove all hardcoded fallback credentials from scripts; require the env vars to be explicitly set and `process.exit(1)` with a clear message if missing (as scripts/setup/create-admin.cjs already correctly does). Stand up separate Supabase projects for dev/staging/prod so local scripts cannot touch production data.

---

#### 29. [HIGH] No service/data-access layer — 17 files issue raw Supabase queries directly, mostly duplicating the same query

- **Dimension:** Dim 5: Architecture Integrity
- **Location:** `src/api/index.ts:1; src/pages/Phase1.tsx:126-143; src/pages/Phase2.tsx:74-86; src/pages/Phase3.tsx; src/pages/Week1.tsx, Week2.tsx, Week3.tsx; src/pages/Dashboard.tsx; src/pages/AdminDashboard.tsx; src/pages/BuddyDashboard.tsx; src/pages/OnboardingLeadDashboard.tsx; src/pages/PhaseReview.tsx; src/pages/WorksheetReview.tsx; src/components/admin/AssignmentsTab.tsx; src/hooks/useWorksheet.ts, useNotifications.ts, useAutoSave.ts; src/context/AuthContext.tsx`
- **Verification:** CONFIRMED — Verified: src/api/index.ts is literally `export { supabase } from './supabase';` (no data-access layer); Phase1.tsx:126-143 and Phase2.tsx:74-86 contain near-identical `supabase.from('worksheet_submissions').select('worksheet_id, status, review_status').eq('user_id', ...)` queries plus duplicate status-map loops (Week1.tsx:32 same pattern), with Phase1 wrapping in try/catch while Phase2/Week1 don't (confirms inconsistent error handling claim); broader grep found supabase.from( in 24 files, exceeding the reported 17, so the finding if anything understates scope.
- **Effort:** M

**Description.** src/api/index.ts only re-exports the raw Supabase client (`export { supabase } from './supabase'`) — there is no repository/query module. grep confirms 17 separate files across pages, components, hooks and context call `supabase.from(...)` / `.auth.` / `.rpc(...)` directly. Several of these (Phase1.tsx:129-136, Phase2.tsx:76-83, and the equivalent block in Week1/2/3.tsx per diff) re-implement the identical query `supabase.from('worksheet_submissions').select('worksheet_id, status, review_status').eq('user_id', user?.id)` plus the same manual status-map-building loop, independently, with inconsistent error handling (some wrap in try/catch and set a loading flag, others don't).

**Root cause.** No architectural convention was established for data access; every page author independently wrote its own Supabase call.

**Impact / failure scenario.** A schema change to worksheet_submissions (column rename, RLS policy change) requires hunting down and updating this query in 6+ places by hand; inconsistent error handling means some of these call sites will silently show stale/empty data on failure while others surface an error state.

**Steps to reproduce.** grep -rc "supabase.from(" src shows 17 distinct files with 1-3 occurrences each; diff of Phase1.tsx:126-143 vs Phase2.tsx:74-86 shows the query and status-map loop are near character-for-character identical.

**Suggested fix.** Introduce a thin data-access module (e.g. src/api/worksheets.ts) exposing typed functions like `fetchUserSubmissionStatuses(userId)`, `fetchAllSubmissions()`, etc., and have every page/hook consume those instead of calling `supabase.from` inline.

---

#### 30. [HIGH] Documentation still points engineers at an incompatible, stale schema file (supabase_schema.sql) as the source of truth for RLS

- **Dimension:** Dim 6: Database Schema & Integrity
- **Location:** `SYSTEM_ANALYSIS.md:52 ("All authorization is in supabase_schema.sql. If a feature is broken, check the Policy first.") vs. the actually-current db/schema.sql and db/__fix_rls_jwt.sql`
- **Verification:** CONFIRMED — Verified line-by-line: SYSTEM_ANALYSIS.md:52 is the only schema pointer in the doc and names supabase_schema.sql, never schema.sql. Confirmed supabase_schema.sql:11 role CHECK lacks 'new_joinee'/'onboarding_lead' (present in schema.sql:44, and AuthContext.tsx:103/169 defaults new signups to 'new_joinee'); supabase_schema.sql:100 review_status CHECK lacks 'buddy_approved' (present in schema.sql:151); supabase_schema.sql:13 assigned_lead_id references auth.users(id) vs schema.sql:46 referencing user_profiles(id); supabase_schema.sql:32/79/119/143 use recursive `IN (SELECT ... FROM user_profiles)` RLS subqueries that __fix_rls_jwt.sql explicitly replaces with auth.jwt()->'user_metadata'->>'role' checks, and schema.sql's own header states it is the 'DEFINITIVE DATABASE SCHEMA' superseding supabase_schema.sql. All cited facts check out exactly as described.

**Description.** db/supabase_schema.sql is the original, superseded schema. Its `user_profiles.role` CHECK constraint (line 11) is `CHECK (role IN ('lab_instructor', 'lead_instructor', 'academic_head', 'acad_ops'))` — it is missing both 'new_joinee' (the default role every signup gets per src/context/AuthContext.tsx:103) and 'onboarding_lead' (a whole role/dashboard in the app). Its `worksheet_submissions.review_status` CHECK (line 100) is missing 'buddy_approved', a status value the buddy-review workflow depends on and that seed/production data actively uses. Its `assigned_lead_id` FK targets `auth.users(id)` (line 13) instead of `user_profiles(id)` as in schema.sql. Its RLS policies use recursive subqueries on user_profiles (the exact pattern later fixed by __fix_rls_recursion.sql/__fix_rls_jwt.sql) and have none of the assigned_buddy_id-aware policies from supabase_reviewer_migration.sql. An engineer following SYSTEM_ANALYSIS.md's explicit pointer to this file to debug or reason about 'what the policies are' will reason about a completely wrong, years-stale authorization model, and if this file is ever accidentally (re-)run against a database it will violently conflict with the live schema (CHECK constraint rejecting valid inserts of 'new_joinee'/'onboarding_lead'/'buddy_approved').

**Suggested fix.** Delete or clearly rename supabase_schema.sql to something like supabase_schema.OLD.sql with a top-of-file banner ('SUPERSEDED — see schema.sql'), and fix SYSTEM_ANALYSIS.md's pointer. Better: delete all of the one-off __fix_*.sql / *_migration.sql files from db/ once folded into schema.sql, so there is exactly one file a reader can trust.

---

#### 31. [HIGH] notifications INSERT policy has no ownership check — any authenticated user can forge notifications as/to anyone

- **Dimension:** Dim 6: Database Schema & Integrity
- **Location:** `db/__migration_notifications_dates.sql:34-37`
- **Verification:** CONFIRMED — Verified db/__migration_notifications_dates.sql:34-37 verbatim: `CREATE POLICY \"Insert notifications\" ON notifications FOR INSERT TO authenticated WITH CHECK (true);` — no check ties user_id or from_user_id to auth.uid(); this is the only INSERT policy on the table (no later migration overrides it), so any authenticated user can indeed insert a notification with an arbitrary user_id/from_user_id, spoofing sender identity to any recipient.

**Description.** `CREATE POLICY "Insert notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (true);` places zero restriction on `user_id` (recipient) or `from_user_id` (claimed sender). Any logged-in new_joinee can call `supabase.from('notifications').insert({user_id: <any-uuid>, from_user_id: <any-uuid>, worksheet_id:'x', type:'approved', message:'You have been approved!'})` and inject an arbitrary, spoofed notification into any other user's notification feed (e.g. impersonating their manager telling them a worksheet was approved when it wasn't, or spamming/social-engineering another user). The app's own triggerNotification() helper always passes the correct fromUserId, but RLS is the actual security boundary and it enforces nothing here.

**Suggested fix.** Restrict the check to only allow inserting notifications the caller is either the recipient of, or an assigned reviewer relationship justifies, e.g. `WITH CHECK (from_user_id = auth.uid() OR auth.jwt()->'user_metadata'->>'role' IN ('lead_instructor','academic_head','onboarding_lead'))`, or move notification creation into a SECURITY DEFINER RPC function so clients never INSERT into notifications directly.

---

#### 32. [HIGH] SaveIndicator (auto-save status badge) is built but never rendered — save failures are invisible in the UI

- **Dimension:** Dim 7: Failure Handling & Recovery
- **Location:** `src/config/worksheetComponents.tsx:103 (WorksheetHeader destructures `{icon,title,subtitle,badge}`, not `saveStatus`) and src/components/WorksheetPage.tsx:128 (passes `saveStatus={saveStatus}` to WorksheetHeader, which silently drops it); `SaveIndicator` component defined at worksheetComponents.tsx:153 but has zero call sites in src/`
- **Verification:** CONFIRMED — Verified directly: worksheetComponents.tsx:103 destructures only {icon,title,subtitle,badge} (saveStatus is in the interface at line 22 but never read/rendered), WorksheetPage.tsx:128 passes saveStatus into it and it's silently dropped, and grep confirms SaveIndicator (defined at worksheetComponents.tsx:153) has zero call sites anywhere in src/ — dead component, save-failure state never surfaces persistently in the UI.

**Description.** `useWorksheet` returns `saveStatus` ('idle'|'saving'|'saved'|'error') and `WorksheetPage` passes it into `WorksheetHeader`, but `WorksheetHeader`'s prop destructuring never reads `saveStatus`, and the purpose-built `SaveIndicator` component that would render 'Failed' with an error icon is never imported/used anywhere in the codebase (confirmed via grep — only its definition and type exist).

**Impact / failure scenario.** Even in the case where auto-save (not explicit submit) fails during background editing, the only feedback is a transient toast from `notifyError` that vanishes after ~3.5s. If the user is not looking at the screen at that exact moment (e.g., they alt-tabbed, or the toast fired during typing), there is no persistent way to discover that their in-progress edits are not saved. Combined with the previous finding, there is no reliable UI surface for save failures anywhere in the app.

**Suggested fix.** Render `<SaveIndicator status={saveStatus} />` inside `WorksheetHeader` (fix the prop destructuring to include `saveStatus` and pass it through), so a failed save state persists visibly until the user dismisses/retries, not just a fading toast.

---

#### 33. [HIGH] loadWorksheetData ignores the Supabase `error` field — a transient read failure during page load can present a submitted worksheet as blank

- **Dimension:** Dim 7: Failure Handling & Recovery
- **Location:** `src/hooks/useAutoSave.ts:208-220`
- **Verification:** CONFIRMED — Confirmed at src/hooks/useAutoSave.ts:208-220: `loadWorksheetData` destructures only `data`, never `error`, from the Supabase `.maybeSingle()` call, so a Supabase-level error (RLS hiccup, transient failure) returns `data: null` without throwing, and the try/catch in useWorksheet.ts:117-144 never fires. useWorksheet.ts:132-140 then treats this identically to 'no saved data' and prefills employeeName via getOAuthName(). Worse, useAutoSave.ts:188-193 gates the initial autosave on `hasRealData`, which becomes true purely from the prefilled employeeName, and useAutoSave.ts:109 sets `worksheet_data: data` (the current, impoverished state) in the upsert payload with `onConflict: 'user_id,worksheet_id'` (line 122) — so the previously-submitted worksheet_data can be silently overwritten by the debounced autosave even without further user typing/submission, which is arguably worse than the finding's stated 'if they then type and submit' trigger.

**Description.** ```js
export async function loadWorksheetData(userId, worksheetId) {
  if (!userId || !worksheetId) return null;
  const { data } = await supabase.from('worksheet_submissions').select('*').eq('user_id', userId).eq('worksheet_id', worksheetId).maybeSingle();
  return data as SavedWorksheetData | null;
}
```
`error` is never destructured or checked. This is called from `useWorksheet.ts:119` inside a try/catch, but since this function never throws on a Supabase-level error (only `error` field is set, not an exception), the catch is dead for this case. A failed read (network blip, RLS hiccup) returns `data === null`, which `useWorksheet` interprets identically to 'no saved data yet' — it proceeds to prefill the OAuth name / blank defaults (useWorksheet.ts:132-141) rather than the user's previously-submitted content.

**Impact / failure scenario.** A user with an already-submitted (or in-progress) worksheet reloads the page during a network blip; instead of seeing their prior answers, they see a blank form pre-filled only with their name. If they then type and submit, the auto-save `upsert` (onConflict: user_id,worksheet_id) overwrites their real submission with the new, information-poor one — actual data loss of previously-approved/pending-review content.

**Suggested fix.** Check and log/surface `error` from this query; on error, do not fall through to the 'no saved data' prefill branch — instead retry or show a load-error state so the user isn't shown a false-empty form.

---

#### 34. [HIGH] Auto-save notification failures are swallowed inside triggerNotification, so a successful save can silently fail to notify the reviewer

- **Dimension:** Dim 7: Failure Handling & Recovery
- **Location:** `src/hooks/useAutoSave.ts:131-156 (calls triggerNotification per reviewer) and src/hooks/useNotifications.ts:151-165 (triggerNotification's own try/catch swallows all errors)`
- **Verification:** CONFIRMED — Confirmed: useAutoSave.ts loops reviewerUserIds calling `await triggerNotification(...)` with no error handling/return check, and useNotifications.ts's triggerNotification catches insert errors and only console.error's them without rethrowing, so save() proceeds to setSaveStatus('saved') even when the notification insert fails.

**Description.** In `useAutoSave.save()`, after the worksheet upsert succeeds, the function loops over reviewer IDs and calls `await triggerNotification(...)` for each. `triggerNotification` itself wraps its insert in try/catch and only does `console.error(...)` on failure — it never throws. So if the `notifications` insert fails (RLS denial, malformed payload, DB constraint), `save()` proceeds straight to `setSaveStatus('saved')` as if everything succeeded. This is exactly the 'worksheet saved but notification insert failed' partial-failure scenario the audit brief calls out.

**Impact / failure scenario.** A joinee submits a worksheet; the submission is persisted and the UI shows 'Saved'/'Submitted', but the assigned buddy/manager never receives a notification (no toast, no DB row, no console visibility outside dev tools). The reviewer has no way to know a submission is waiting; the joinee believes the reviewer was notified. This directly stalls the review pipeline with no error trail for support/ops to find (only a `console.error` that nobody is watching in production).

**Suggested fix.** Distinguish notification failures from save failures explicitly: still mark the worksheet as saved (that's correct — the primary write succeeded), but surface a distinct, non-fatal warning ('Saved, but we couldn't notify your reviewer — they may not see this yet') and/or log to a monitored error channel (not just console.error) so undelivered notifications can be found and retried by an admin process. Consider a `notifications` outbox/retry table if 100% delivery matters.

---

#### 35. [HIGH] db/schema.sql — the file explicitly documented as 'the ONE FILE you need to run' — is missing the notifications table and due_date column the app requires

- **Dimension:** Dim 8: E2E Data Flow & Contracts
- **Location:** `db/schema.sql:1-17 (header claims completeness), whole file (no notifications table, no due_date column); db/__migration_notifications_dates.sql:6,9-26 (where these actually live); src/hooks/useNotifications.ts:61-66; src/hooks/useDueDates.ts:126-129; src/hooks/useAutoSave.ts:22,120 (UpsertPayload.due_date)`
- **Verification:** CONFIRMED — Verified: db/schema.sql (read in full) has no CREATE TABLE notifications and no due_date column anywhere, despite its header claiming to be 'the ONE FILE you need to run' incorporating all migrations; db/__migration_notifications_dates.sql independently defines ADD COLUMN due_date and CREATE TABLE notifications and is not referenced by schema.sql. Confirmed src/hooks/useNotifications.ts fetches/inserts .from('notifications') unconditionally, useDueDates.ts selects worksheet_submissions.due_date, and useAutoSave.ts's UpsertPayload includes due_date and is written on every save — so a fresh DB built strictly from schema.sql would break these paths with a missing-relation/column error.
- **Effort:** S

**Description.** db/schema.sql's header states it 'incorporates all migrations' and is 'the ONE FILE you need to run' to stand up the database. It defines user_profiles, onboarding_submissions, and worksheet_submissions, but never creates a `notifications` table and never adds the `due_date` column to worksheet_submissions — both of which are only present in the separate, unreferenced migration file db/__migration_notifications_dates.sql. Meanwhile useNotifications.ts selects/inserts against `notifications` and useAutoSave.ts/useDueDates.ts read/write `worksheet_submissions.due_date` unconditionally.

**Impact / failure scenario.** Any operator who follows schema.sql's own instructions to provision a fresh Supabase project (e.g. new environment, disaster recovery, staging) gets a database where every notification fetch/insert (NotificationBell, every submit/approve/revision action, admin assignment, signup) throws a Postgres 42P01 'relation notifications does not exist' error, and every auto-save upsert fails or silently drops due_date. The app is non-functional out of the box for anyone who trusts the documented setup path.

**Suggested fix.** Fold __migration_notifications_dates.sql (and __due_date_notifications.sql if still desired) into schema.sql so it is genuinely complete, or update schema.sql's header to explicitly list it as a required follow-up file and add a numbered '0-based' migrations directory that's actually run in order by a setup script.

---

#### 36. [HIGH] Reviewer approve/revision actions have no optimistic-concurrency guard — stale client state can clobber newer server state

- **Dimension:** Dim 8: E2E Data Flow & Contracts
- **Location:** `src/pages/WorksheetReview.tsx:74-104 (handleBuddyApprove), :145-195 (handleBuddyRevision); src/pages/PhaseReview.tsx:76-165 (handleApprovePhase)`
- **Verification:** CONFIRMED — Verified all three cited sites: WorksheetReview.tsx:100-104 (handleBuddyApprove) and :168-172 (handleBuddyRevision) update .eq('user_id',...).eq('worksheet_id',...) with no review_status guard despite checking submission?.review_status client-side at line 76; PhaseReview.tsx:99-111 (handleApprovePhase) loops over client-filtered toApprove (line 81, filtered from possibly-stale `submissions` state) and updates .eq('id', sub.id) with no status guard. Checked db/schema.sql and db/supabase_schema.sql: review_status only has a value-enum CHECK constraint, no transition-validity trigger or optimistic-concurrency mechanism exists server-side. Severity HIGH is reasonable given this is a real lost-update race with no server-side backstop, though likelihood is probably lower than described (requires concurrent access to the same submission, e.g. two open tabs or two reviewers) — MEDIUM-HIGH is arguably more precise than HIGH but HIGH is defensible.
- **Effort:** M

**Description.** handleBuddyApprove validates the action against `submission?.review_status`, a value that was fetched once when the page loaded (WorksheetReview.tsx:76-80), then issues an UPDATE keyed only on `.eq('user_id', userId).eq('worksheet_id', worksheetId)` — with no `.eq('review_status', currentStatus)` guard. The same pattern repeats in handleBuddyRevision and in PhaseReview.tsx's handleApprovePhase (which filters `submissions.filter(s => s.review_status === 'buddy_approved')` from client-cached state before looping unconditional `.update()` calls).

**Impact / failure scenario.** If a reviewer has the same review page open in two tabs (or two reviewers with the same access — e.g. a manager and an assigned buddy both able to see a submission), a stale tab's approve/revision click will overwrite whatever the server's current state is, because the UPDATE never checks that review_status still matches what was read. Concretely: Tab A loads with review_status='pending_review'; a second action elsewhere sets it to 'approved'; Tab A (still showing pending_review) is then used to click 'Request Revision' — the UPDATE unconditionally executes and downgrades an already-approved worksheet back to 'needs_revision', and fires a duplicate/contradictory notification to the joinee. There is no server-side check (e.g. a WHERE clause on the previous status, or a Postgres trigger enforcing valid state transitions) to prevent this lost-update race.

**Suggested fix.** Add `.eq('review_status', expectedPriorStatus)` to every reviewer UPDATE and check the returned row count; if zero rows updated, refetch and show a 'this worksheet was already reviewed/updated — reload' conflict message instead of silently succeeding. Longer-term, enforce valid review_status transitions with a Postgres trigger/CHECK so even out-of-band writes can't produce contradictory states.

---

#### 37. [HIGH] Zero server-side enforcement of role-scoped review actions — RLS lets any reviewer role set the final 'approved' status, bypassing the buddy→manager two-step approval the UI implies

- **Dimension:** Dim 9: Security
- **Location:** `db/schema.sql:203-216 ('Reviewers update submissions' policy — no WITH CHECK distinguishing which review_status values lead_instructor vs academic_head may write); comment on lines 204-206 documents the intended restriction but the policy body doesn't enforce it`
- **Verification:** CONFIRMED — Verified in db/schema.sql:207-216 — the 'Reviewers update submissions' policy has only a USING clause (role/assignment check) and no WITH CHECK constraining review_status values; no trigger or SECURITY DEFINER function elsewhere in schema.sql enforces per-role transitions either (only a value-enum CHECK at line 151). Confirmed in src/pages/WorksheetReview.tsx that 'canApprove = isBuddy' (line 50) is a UI-only gate for button rendering, not a server-side restriction, so a lead_instructor can directly set review_status='approved' via a raw update call, bypassing the intended buddy→manager two-step.

**Description.** The schema's own comment says 'lead_instructor (buddy) can update: approve to buddy_approved or request revision' and 'academic_head (manager) can update: approve phase ... or request revision', implying buddies should never be able to set the final `approved` status. But the actual `USING` clause is `auth.jwt()->user_metadata->>role IN ('lead_instructor','academic_head') OR ...`, with no WITH CHECK restricting which `review_status` value each role may write. A buddy (`lead_instructor`) can therefore issue an update setting `review_status = 'approved'` directly, skipping the manager step entirely — this is enforced only by which UI buttons WorksheetReview.tsx renders (`canApprove = isBuddy` sets only 'buddy_approved', src/pages/WorksheetReview.tsx:50,84-85), not by the database.

**Impact / failure scenario.** A compromised or careless buddy account (or the self-escalated account from Finding #1/#2, which now holds `lead_instructor` in its JWT) can grant final phase approval to any joinee's worksheet without manager sign-off, corrupting the audit trail the review workflow exists to produce.

**Suggested fix.** Add WITH CHECK constraints per role (e.g. lead_instructor may only set review_status IN ('buddy_approved','needs_revision'); academic_head may only transition FROM 'buddy_approved' TO 'approved'/'needs_revision'), or move approval actions into role-checked SECURITY DEFINER RPCs as in Finding #3's fix.

---

#### 38. [HIGH] Hardcoded plaintext credentials for privileged/test accounts committed to git, targeting the live production Supabase project

- **Dimension:** Dim 9: Security
- **Location:** `scripts/setup/create-admin.cjs:12-15; fix-assignments.cjs:11-13,31-33; db/create_32_users.sql:14,80,153; __seed_30_users.cjs:17-20; __seed_test_data.cjs:18,115,422`
- **Verification:** CONFIRMED — All cited files (fix-assignments.cjs, scripts/setup/create-admin.cjs, db/create_32_users.sql, __seed_30_users.cjs, __seed_test_data.cjs) are git-tracked (confirmed via git ls-files) and contain the hardcoded password Test123! and/or the real Supabase project URL fuoqoryqndtdooujslee.supabase.co; fix-assignments.cjs:11-13 hardcodes the URL/key as a fallback and lines 30-33 sign in as priya.qa@newton.edu/Test123! exactly as claimed. The tracked .env file (also in git since initial commit, not gitignored) confirms this is the live production project URL/anon key, corroborating the impact claim.

**Description.** Multiple committed scripts hardcode the shared weak password `Test123!` and, in several cases, the real production project URL/key: `fix-assignments.cjs:11` hardcodes `https://fuoqoryqndtdooujslee.supabase.co` (no env override) and lines 31-33 sign in as a named, real-looking account `priya.qa@newton.edu` / `Test123!` specifically because it holds `academic_head` privileges ('Authenticates as Priya (academic_head) to bypass RLS for assignment updates' — comment on line 4). `scripts/setup/create-admin.cjs` creates `admin_test@test.com` / `Test123!` with role `onboarding_lead` by POSTing straight to the public `/auth/v1/signup` endpoint with the anon key. `db/create_32_users.sql` bcrypt-inserts 32 accounts directly into `auth.users` all sharing `Test123!`. All of these are permanently in git history and reference the same Supabase project already confirmed live via the committed `.env`.

**Impact / failure scenario.** If any of these scripts were ever run against the real Supabase project (the URL/key match .env exactly), the production auth.users table now permanently contains a set of accounts — including at least one manager/academic_head-level account — with a trivially guessable, publicly-committed password. Anyone with read access to this repository (or its git history, even after later 'cleanup' commits) has working login credentials for a privileged production account.

**Suggested fix.** Rotate/delete any of these accounts that exist in the live project immediately. Purge these values from git history (BFG/filter-repo) — a later commit removing the file does not remove it from history. Never hardcode credentials or fall back to literal keys in committed scripts; require env vars with no literal fallback, and keep any seed/admin-creation script out of the deployable repo (separate private tooling repo or .gitignore'd local-only scripts).

---

#### 39. [HIGH] No error reporting/monitoring service integrated anywhere in the app

- **Dimension:** Dim 10: Observability
- **Location:** `package.json:1-25 (no Sentry/Bugsnag/LogRocket/Rollbar/Datadog dependency); src/components/ErrorBoundary.tsx:27; src/utils/errorHandling.ts:31`
- **Verification:** CONFIRMED — Verified: package.json deps are only @supabase/supabase-js, dotenv, lucide-react, react, react-dom, react-router-dom, tslib, ws — no Sentry/Bugsnag/etc; grep for error/analytics SDKs across src and package.json returns zero hits; ErrorBoundary.tsx:27 componentDidCatch does only console.error; errorHandling.ts:31 notifyError does only console.error + a toast; found 24 console.error call sites (claim said ~25). Severity is arguably borderline CRITICAL vs HIGH — it's a real observability gap but the app still functions and shows a user-facing fallback UI, so I'd downgrade to HIGH rather than CRITICAL (no crash/data-loss/security breach, just lack of remote visibility).

**Description.** Grep across src and package.json for Sentry, LogRocket, Datadog, Bugsnag, Rollbar, PostHog, Mixpanel, Amplitude, gtag, or any analytics/error-tracking SDK returns zero hits. The only dependencies are @supabase/supabase-js, react, react-dom, react-router-dom, dotenv, lucide-react, tslib, ws. Every error path in the app (ErrorBoundary.componentDidCatch, notifyError(), and ~25 individual console.error call sites) terminates at console.error and nothing else. Once a user closes or refreshes the tab, every trace of the error is gone forever. For a production onboarding tool used by real employees (auth, approvals, gate promotions), there is currently no way to know an error occurred unless the affected user personally reports it with enough detail to reproduce.

**Impact / failure scenario.** A new hire's worksheet submission silently throws (e.g. a Supabase RLS policy rejects an insert, or a null-pointer in ReviewContent.tsx rendering). The ErrorBoundary catches it, shows a generic 'Something went wrong' screen, logs to a console nobody is watching, and the incident is never surfaced to engineering. Repeat for auth failures, auto-promotion failures, auto-save failures — all invisible.

**Suggested fix.** Add a lightweight error-reporting SDK (Sentry's browser SDK is the standard choice for a Vite/React app) initialized in main.tsx, wire ErrorBoundary.componentDidCatch and notifyError() to report to it with user/role context (non-PII), and capture unhandled promise rejections via window.addEventListener('unhandledrejection', ...).

---

#### 40. [HIGH] clean_setup.mjs deletes all worksheet_submissions unconditionally; only accidental absence of a DELETE RLS policy currently prevents it from working

- **Dimension:** Dim 11: Data Durability & Dangerous Scripts
- **Location:** `scripts/clean_setup.mjs:41-51; db/schema.sql:173-216 (no `FOR DELETE` policy defined on worksheet_submissions)`
- **Verification:** CONFIRMED — Confirmed: clean_setup.mjs:41-44 does `.delete().neq('user_id', all-zero-uuid)` with no scoping (verified in file), and schema.sql:173-216 plus db/supabase_schema.sql only define SELECT/INSERT/UPDATE RLS policies on worksheet_submissions -- no FOR DELETE policy exists anywhere in the repo's SQL files (grep for \"FOR DELETE\" across all .sql files returns zero matches), so the delete is currently blocked only by RLS default-deny, exactly as claimed.

**Description.** `clean_setup.mjs` calls `.from('worksheet_submissions').delete().neq('user_id', '00000000-0000-0000-0000-000000000000')` — a well-known Supabase idiom to delete every row (since no real user_id equals the all-zero UUID), with zero scoping to test users. Today this fails at runtime because schema.sql defines SELECT/INSERT/UPDATE policies for worksheet_submissions but no `FOR DELETE` policy, so Postgres RLS default-denies the delete for the anon/authenticated role the script uses — the script's own console output even says '(This is expected with RLS — we'll continue...)', showing the author is aware deletes are blocked and shipped the code anyway.

**Impact / failure scenario.** This is a landmine, not a safeguard: the moment anyone adds a legitimate `FOR DELETE` policy (e.g., to let admins delete a mis-submitted worksheet — a plausible future feature), this script silently starts succeeding and wipes every worksheet submission across all users in the live database the next time anyone runs it for 'a clean local setup.'

**Suggested fix.** Scope the delete to only test-user IDs (e.g., a documented email pattern), never to 'all rows via NOT-EQUAL-to-impossible-UUID'. Remove the script or gate it behind an explicit non-prod project check as described above.

---

#### 41. [HIGH] Production deployment checklist instructs running fabricated-data seed scripts against the live database

- **Dimension:** Dim 11: Data Durability & Dangerous Scripts
- **Location:** `context.md:1623-1633 ('Production Checklist' — '[ ] Run `db/seed_worksheets.sql` for test data (optional)'); db/seed_worksheets.sql:27-33 (INSERT ... ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status='buddy_approved', ...)`
- **Verification:** CONFIRMED — Confirmed verbatim: context.md:1626 lists "Run db/seed_worksheets.sql for test data (optional)" under the Production Checklist (context.md:1623-1633), and db/seed_worksheets.sql:27-183 does INSERT ... ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status='buddy_approved'/'pending_review'/'needs_revision' with hardcoded fake worksheet_data, reviewer names ('Neha Kapoor'), and comments for hardcoded emails (arjun.qa@newton.edu etc.). Critically, context.md documents only ONE Supabase project (ID fuoqoryqndtdooujslee) used both for local dev setup (line 1868-1869, "Optional: Run db/seed_worksheets.sql for realistic worksheet submissions" at line 1885) and explicitly listed as the configured project for "Required Services" in the Deployment section (line 1618) — i.e. there is no separate dev/staging vs. production database, so the ".qa@newton.edu" test accounts (documented with real passwords at 1889-1898) already exist in the same project referenced by the production checklist, making the ON CONFLICT clobber risk concrete rather than a remote hypothetical email collision.

**Description.** The documented production checklist tells the operator to optionally run `db/seed_worksheets.sql` on the production project. That file inserts hardcoded fake worksheet content and fabricated reviewer sign-offs (e.g., review_comment: 'Great stakeholder mapping. Approved as buddy.', reviewer_name: 'Neha Kapoor') for hardcoded emails like `arjun.qa@newton.edu`, and uses `ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'buddy_approved', reviewed_by = bid, reviewer_name = bname` — an upsert that will silently overwrite (clobber) any existing row for that user_id/worksheet_id pair, including genuine data, with the fake approval.

**Impact / failure scenario.** If a real employee is ever assigned a user_profiles.email matching one of the hardcoded QA addresses (or if this file is re-run after real users already have real submissions with the same worksheet_id — the UNIQUE(user_id, worksheet_id) constraint guarantees an ON CONFLICT hit), their genuine worksheet content and review history is silently replaced by fabricated placeholder text and a phony 'buddy approved' status, corrupting the audit trail that this app is supposed to produce.

**Suggested fix.** Remove seed_worksheets.sql from the production checklist entirely. Rename/relocate all seed scripts into a clearly separate 'dev-only, run only against DEV_PROJECT_REF' folder with a runtime project-ref check, and never advertise them as an optional production step.

---

#### 42. [HIGH] 'Fix data' scripts hardcode QA credentials and directly forge review/approval fields, bypassing the review workflow with no audit marker

- **Dimension:** Dim 11: Data Durability & Dangerous Scripts
- **Location:** `scripts/fix_promotion_data.mjs:10-12,27-30,43-52; fix-assignments.cjs:11-13,30-33`
- **Verification:** CONFIRMED — Verified against code: fix_promotion_data.mjs:27-30 signs in as arjun.qa@newton.edu/Test123! and lines 43-52 UPDATE review_status/reviewer_name/review_comment/reviewed_at to fabricate 'buddy_approved' with a canned comment, no source/audit flag; fix-assignments.cjs:11-13,30-33 hardcodes the URL/anon key and priya.qa@newton.edu/Test123!, then writes assigned_buddy_id/assigned_lead_id directly. All cited line numbers match. However this is a demo/QA-only project (db/create_32_users.sql documents 'Password for all users: Test123!' for 32 synthetic test accounts; context.md itself flags hardcoded test passwords as 'a security concern for production'), and the same anon key + Test123! password are already duplicated across ~5 other committed scripts (__seed_test_data.cjs, __seed_30_users.cjs, clean_setup.mjs, .env), so this isn't a novel exposure unique to these two files, and the Supabase key is a client-safe 'publishable' key rather than a service-role secret. Real behavior as described, but blast radius is limited to synthetic QA accounts in a single-environment demo app that is already saturated with the same exposure, so HIGH is overstated.

**Description.** fix_promotion_data.mjs signs in as a hardcoded account (`arjun.qa@newton.edu` / `Test123!`) and directly UPDATEs `worksheet_submissions.review_status`, `reviewer_name`, `review_comment`, `reviewed_at` to fabricate a 'buddy_approved' state with a canned comment ('Great work! Ready for manager review.') — bypassing the actual buddy-review UI/state machine entirely. fix-assignments.cjs similarly hardcodes `priya.qa@newton.edu` / `Test123!` and directly writes `assigned_buddy_id`/`assigned_lead_id` on user_profiles.

**Impact / failure scenario.** Both scripts write plausible-looking, indistinguishable-from-real review history and org-chart assignment data straight into the (single, production-equals-dev) database with real timestamps and a real reviewer_name, with no flag anywhere in the row indicating it was script-generated rather than a human review. If an admin ever audits worksheet_submissions.review_history to answer 'did the buddy actually review this,' these entries are false positives baked in by a maintenance script, not evidence of an actual review having happened. Plaintext QA passwords are also committed to the repo (`Test123!` for `arjun.qa@newton.edu`, `priya.qa@newton.edu`, `neha.qa@newton.edu`) which, combined with the committed anon key and prod URL, means anyone with repo access can sign in as these accounts against the live project.

**Suggested fix.** Never write fabricated review data outside of the normal review-state-machine code path used by the app (so it goes through the same validation and audit logging). If a fix-data script is genuinely required, tag the resulting rows (e.g., a `source: 'manual-fix-script'` field or an explicit review_history entry noting it was a scripted correction) and require it to target a specific user_id passed as an argument, not a hardcoded email. Rotate/remove the hardcoded test credentials, and do not commit real passwords even for QA accounts.

---

#### 43. [HIGH] Notifications table has an unrestricted INSERT policy — any authenticated user can write unlimited rows for any user_id

- **Dimension:** Dim 12: Resource & Cost Control
- **Location:** `db/__migration_notifications_dates.sql:34-37 (CREATE POLICY "Insert notifications" ... WITH CHECK (true))`
- **Verification:** CONFIRMED — Confirmed at db/__migration_notifications_dates.sql:34-37 — the INSERT policy is exactly `TO authenticated WITH CHECK (true)` with no ownership check; src/hooks/useNotifications.ts:151-165 (triggerNotification) inserts arbitrary user_id/from_user_id client-side with no server-side validation, and grep finds zero rate-limit/throttle code anywhere in src/ or db/, so any authenticated user hitting the REST endpoint directly could flood notifications for any target user_id — HIGH severity is appropriate given the described DoS/spam vector.
- **Effort:** S

**Description.** The RLS INSERT policy on `notifications` is `TO authenticated WITH CHECK (true)` — there is no check that `from_user_id = auth.uid()` or any cap on volume. Combined with self-serve signup (any of the 4 roles is selectable at signup, per Login/Signup.tsx) and zero application-level rate limiting anywhere in the codebase (confirmed by grep — no throttle/rate-limit code exists), any registered account can hit the Supabase REST endpoint directly (bypassing the UI entirely, using only their own JWT) and insert an unbounded number of notification rows targeting any other user_id.

**Impact / failure scenario.** A single compromised or malicious account can flood the notifications table indefinitely (unbounded storage growth) and drown out real notifications for any target user (since useNotifications only shows the latest 50), at zero cost/barrier to the attacker — a textbook resource-exhaustion/cost-DoS vector against a Supabase project billed by storage/bandwidth.

**Suggested fix.** Add `WITH CHECK (from_user_id = auth.uid() OR from_user_id IS NULL)` plus a per-user rate limit (e.g. a Postgres function/trigger that rejects inserts once a user has >N notifications created in the last hour), or move notification creation server-side (Edge Function with service role) instead of allowing direct client inserts.

---

#### 44. [HIGH] Admin/Onboarding-Lead dashboards use a hardcoded .limit(500) with no ordering and no pagination on worksheet_submissions — will silently truncate at realistic scale

- **Dimension:** Dim 12: Resource & Cost Control
- **Location:** `src/pages/AdminDashboard.tsx:80, src/pages/OnboardingLeadDashboard.tsx:52`
- **Verification:** CONFIRMED — Verified exact lines: AdminDashboard.tsx:80 and OnboardingLeadDashboard.tsx:52 both do supabase.from('worksheet_submissions').select(...).limit(500) with no .order() and no pagination; the capped/unordered allWorksheets array directly drives phase-ready, pending/approved counts and per-user filters (grep shows 10 downstream usages in AdminDashboard.tsx) with no truncation warning anywhere. worksheetConfigData.ts has 23 worksheet ids (matches the '~20-25 per hire' claim), and __seed_30_users.cjs seeds worksheets for 30 users and even uses .limit(1000) elsewhere for its own cleanup query, showing the codebase's own scale is already near/over the 500 cap. Severity HIGH is justified given silent, undetectable data loss that affects review/promotion decisions, though effort to fully fix (real pagination) may be more than the report's 'M' suggests if done properly with cursor UI.
- **Effort:** M

**Description.** `supabase.from('worksheet_submissions').select(...).limit(500)` has no `.order()` clause and no follow-up pagination — it is a single, silently-truncating page. worksheetConfigData.ts defines ~20-25 worksheets per new hire (Phase 1-3 + FTP weeks + gate controls), and the repo's own seed script is named `__seed_30_users.cjs`. 30 users × ~20-25 worksheets = 600-750 rows, already exceeding the 500 cap. Because there's no `.order()`, which rows get dropped is undefined/arbitrary (PostgREST default ordering is unspecified), so some employees' worksheets simply vanish from the dashboard's review-status computations with zero error, zero indicator, and zero way for an admin to know data is missing.

**Impact / failure scenario.** Once the org has ~25-30 active employees (a very near-term milestone, not a hypothetical future scale problem), the Admin Dashboard's phase-ready/pending-review/approved counts become silently wrong — some new hires' review status is invisible to reviewers, potentially blocking their promotion or masking overdue reviews.

**Suggested fix.** Replace the hard cap with real pagination (`.range()` + cursor/offset UI, or fetch aggregated counts server-side via an RPC/view) instead of a single capped fetch. At minimum add `.order('updated_at', {ascending:false})` before `.limit()` so truncation is at least deterministic, and surface a warning banner when the returned row count equals the limit (indicating more data exists).

---

#### 45. [HIGH] Admin/Onboarding-Lead dashboards run fully unbounded user_profiles queries (no .limit at all) on every dashboard load

- **Dimension:** Dim 12: Resource & Cost Control
- **Location:** `src/pages/AdminDashboard.tsx:76 and :84, src/pages/OnboardingLeadDashboard.tsx:48`
- **Verification:** CONFIRMED — Verified: AdminDashboard.tsx:76 (.in('role',['new_joinee','lab_instructor'])) and :84 (.not('role','in',...)) and OnboardingLeadDashboard.tsx:48 all query user_profiles with no .limit()/.range(), while the sibling worksheet_submissions queries in the same files do have .limit(500) — a real, unaddressed asymmetry. Minor inaccuracy in the finding: promotion sets role to 'lead_instructor' (useAutoPromote.ts:63) which is a distinct role from 'lab_instructor' used in the dashboard filter, so promoted users move from the first unbounded query to the second unbounded query (line 84) rather than staying in the same one — but since both queries are unbounded, the overall unbounded-growth-with-headcount conclusion still holds. Severity of HIGH seems slightly generous for a query that only runs on admin/lead dashboard loads (low-traffic role, cached 30s) rather than a hot path, but the underlying defect (no cap, will scale with total headcount forever) is real.
- **Effort:** M

**Description.** `supabase.from('user_profiles').select(...).in('role', ['new_joinee','lab_instructor']).order(...)` (and the buddy/manager roster query at line 84) has no `.limit()` or `.range()` whatsoever. Since `new_joinee`/promoted `lead_instructor` roles are never archived (auto-promotion just flips the role in place, per useAutoPromote.ts:61-64), the full historical roster of every employee who has ever onboarded is fetched on every single dashboard load, forever.

**Impact / failure scenario.** Query cost and dashboard load time grow linearly and unboundedly with company headcount over the company's lifetime — a company running this for 3 years with continuous hiring will eventually be pulling thousands of rows on every admin page view, with no cap in sight.

**Suggested fix.** Paginate this query (`.range()`) or add an `is_active`/onboarding-cohort filter plus a hard cap, so the query cost is bounded by 'current cohort size' rather than 'all employees ever onboarded'.

---

#### 46. [HIGH] No application-level rate limiting anywhere, combined with a publicly committed anon key — unbounded direct-API abuse is trivial

- **Dimension:** Dim 12: Resource & Cost Control
- **Location:** `src/api/supabase.ts:19 (bare createClient, no interceptor/throttle); .env (tracked in git, contains VITE_SUPABASE_PUBLISHABLE_KEY)`
- **Verification:** CONFIRMED — Verified: no supabase/ Edge Functions dir, no rate-limit/throttle/debounce logic anywhere in src/, .env tracked since initial commit (7e5ca88) with a real URL+publishable key, and supabase.ts:19 is a bare createClient with no interceptor — architecture is fully exposed to unthrottled scripted access; only nuance is the committed key is Supabase's new sb_publishable_ format which is designed to be public/RLS-protected, so 'secret leak' framing is slightly overstated but the core no-rate-limiting claim is accurate.
- **Effort:** L

**Description.** The app has no server component at all — it is a static SPA talking directly to Supabase with the anon key. A grep across `src/` for rate-limit/throttle logic returns nothing, and there is no proxy/Edge Function/API gateway in front of Supabase to enforce per-IP or per-user request caps. Because `.env` is committed to git history (confirmed: tracked since the initial commit, `git log -- .env` shows it), the anon key is trivially recoverable by anyone with repo access, and nothing in the app or database prevents that key from being used to issue requests far outside normal UI-driven cadence (e.g. scripted polling every 100ms instead of the UI's 15s, or scripted bulk inserts as in finding #1).

**Impact / failure scenario.** Nothing in the current architecture prevents a scripted client (using the recoverable anon key) from generating sustained, unbounded read/write load against the Supabase project — a direct cost and availability risk with no code-level mitigation to point to.

**Suggested fix.** Put a rate-limiting layer in front of Supabase (Cloudflare Workers/Edge Function proxy with per-IP/per-JWT token buckets), rotate the anon key and stop committing `.env`, and tighten RLS write policies (see finding #1) so even an unthrottled client can't cause unbounded writes.

---

#### 47. [HIGH] Zero route-based code splitting — entire app (40+ worksheet pages, all dashboards, admin tools) bundled into one chunk loaded on every route including /login

- **Dimension:** Dim 13: Performance
- **Location:** `src/App.tsx:1-31 (static imports of every page), src/config/worksheetConfig.tsx:38-79 (40 static imports of worksheet/gate-control components), vite.config.js:12-21`
- **Verification:** CONFIRMED — Verified directly: `grep -rn \"lazy(\" src/` and `grep -rn \"import(\" src/` both return zero matches (no code-splitting anywhere); App.tsx:1-31 statically imports every page (Dashboard, Phase1-3, Week1-4, Admin/Buddy/OnboardingLeadDashboard, WorksheetReview, PhaseReview, BuddyGatePass) plus WORKSHEET_COMPONENTS from worksheetConfig.tsx, which itself has exactly 40 static imports of individual worksheet/gate-control page components (confirmed via `grep -c \"^import.*from '../pages\"`) solely to build a lookup map; vite.config.js:19 sets chunkSizeWarningLimit: 500 with no rollupOptions.manualChunks; Skeleton.tsx exists (src/components/Skeleton.tsx) supporting the proposed Suspense fallback fix. Severity HIGH is appropriate given this affects Time-to-Interactive for every user including the pre-auth /login screen.

**Description.** App.tsx statically imports every page component (Dashboard, Phase1-3, Week1-4, AdminDashboard, BuddyDashboard, OnboardingLeadDashboard, WorksheetReview, PhaseReview, BuddyGatePass, plus Login/Signup) with no React.lazy()/Suspense anywhere in the codebase (`grep -rn "lazy(" src/` returns zero matches). Worse, App.tsx imports `WORKSHEET_COMPONENTS` from `./config/worksheetConfig`, which eagerly imports 40 separate worksheet/gate-control page components (src/config/worksheetConfig.tsx:38-79) purely to build a route→component lookup table used only for the dynamic worksheet routes. This means a user who only ever visits `/login` downloads the JS for all 40 worksheet forms, all four dashboards (Admin/Buddy/OnboardingLead/Dashboard), ReviewContent.tsx (1043 lines), Navbar.tsx, and the 35KB worksheetConfigData.ts — none of which are needed until much later in the flow, if ever (most roles never see most of these pages). vite.config.js:19 (`chunkSizeWarningLimit: 500`) shows the warning threshold was raised rather than the bundle being split, suggesting this was noticed and suppressed rather than fixed.

**Impact / failure scenario.** First paint of the login screen for a brand-new visitor (before any auth, before knowing the user's role) requires downloading and parsing JS for admin dashboards, buddy review tools, and all 33 worksheet forms across all 3 phases + 4 FTP weeks. On a slow connection or low-end device this directly delays Time-to-Interactive for the very first screen every user sees, and it means role-irrelevant code (e.g., a new_joinee downloading AdminDashboard/PhasesReadyTab/AssignmentsTab) is always shipped to everyone.

**Suggested fix.** Convert route-level imports in App.tsx to `React.lazy(() => import('./pages/...'))` wrapped in `<Suspense>` with a fallback (Skeleton components already exist in src/components/Skeleton.tsx). For WORKSHEET_COMPONENTS, either lazy-load each entry (`w1_o1: lazy(() => import('../pages/worksheets/ftp/W1O1'))`) or split the map by phase/week so only the active phase's worksheets are fetched. This alone would let Vite emit per-route chunks and shrink the initial bundle to auth + shell only.

---

#### 48. [HIGH] Buddy-mode worksheet write path lets an unassigned buddy overwrite a joinee's submitted answers, not just approve them

- **Dimension:** Dim 14: User Isolation
- **Location:** `src/hooks/useWorksheet.ts:89,104-113 (overrideUserId); src/hooks/useGateControl.ts:84-91 (targetUserId passed as overrideUserId); src/pages/BuddyGatePass.tsx:117-125 (targetUserId={userId} taken directly from route :userId with no ownership check); src/hooks/useAutoSave.ts upsert (onConflict: 'user_id,worksheet_id')`
- **Verification:** CONFIRMED — Verified end-to-end: BuddyGatePass.tsx:33,122 takes :userId from route with no assigned_buddy_id check, passes as targetUserId -> useGateControl.ts:90 overrideUserId -> useWorksheet.ts:104-113 builds a synthetic user with id=overrideUserId -> useAutoSave.ts:106-122 upserts worksheet_data (full content) with user_id=that id via onConflict 'user_id,worksheet_id'; RLS 'Reviewers update submissions' policy (checked in __fix_rls_jwt.sql, __fix_rls_recursion.sql, __setup_supabase.sql, supabase_reviewer_migration.sql) grants UPDATE to any role IN ('lead_instructor','academic_head','onboarding_lead') via OR, independent of assigned_buddy_id/assigned_lead_id match, so an unassigned buddy's write is not blocked server-side either.

**Description.** BuddyGatePass.tsx reads `:userId` straight from the URL and passes it as `targetUserId` into GateControl1/2/3, which flow into `useGateControl` -> `useWorksheet({ overrideUserId: targetUserId })`. useWorksheet then autosaves/upserts worksheet content with `user_id = overrideUserId` (the joinee's ID), not the acting buddy's own ID. Since the RLS 'Reviewers update submissions' policy grants UPDATE to any lead_instructor role for any row (finding above), this upsert's UPDATE branch succeeds even when the acting buddy is not the joinee's assigned buddy — meaning any buddy can silently modify the *content* (milestones, fields, review_status) of any joinee's gate-control worksheet, not merely change its approval status.

**Impact / failure scenario.** An unassigned or even malicious buddy account can tamper with another employee's submitted worksheet data before or after their real buddy reviews it, corrupting the audit trail (review_history is appended by whoever holds the session, and worksheet_data itself is directly overwritable).

**Steps to reproduce.** 1. Log in as buddy B who is not assigned to joinee X. 2. Navigate to /buddy/gate-pass/{X}/gc1. 3. Edit milestone fields and submit — GateControl1's handleSubmit calls flushSave which upserts to worksheet_submissions with user_id=X via RLS's role-only bypass; the write succeeds.

**Suggested fix.** Same root fix as the ownership finding: RLS UPDATE/INSERT policies for worksheet_submissions must AND the assignment check, and BuddyGatePass/GateControl components should verify `targetUserId`'s assigned_buddy_id === profile.id before rendering the form or calling handleSubmit.

---

#### 49. [HIGH] user_profiles self-update RLS policy has no column restriction — any user can set their own role, assigned_lead_id, or assigned_buddy_id directly

- **Dimension:** Dim 14: User Isolation
- **Location:** `db/schema.sql:62-64 ("Update own profile" ... USING (id = auth.uid())); identical in db/setup_correct.sql:26-27, db/__fix_rls_jwt.sql:21-23, db/__fix_rls_recursion.sql:22-24`
- **Verification:** CONFIRMED — Confirmed in db/schema.sql:63-64 (and identically in setup_correct.sql:26-27, __fix_rls_jwt.sql:22-23, __fix_rls_recursion.sql:23-24): `CREATE POLICY "Update own profile" ON user_profiles FOR UPDATE USING (id = auth.uid());` has no WITH CHECK, and role/assigned_lead_id/assigned_buddy_id are ordinary columns (schema.sql:39-50) with no column-level GRANT restriction, so a user can UPDATE their own row's role. AuthContext.tsx:40/119 selects role directly from user_profiles into `profile`, and profile.role gates ProtectedRoute.tsx:36-38 plus Navbar/AdminDashboard/BuddyDashboard/PhaseReview/WorksheetReview/OnboardingLeadDashboard client-side checks, confirming the UI-unlock impact as described.

**Description.** The 'Update own profile' policy only restricts *which row* a user may update (their own, by id) — it has no WITH CHECK clause restricting which *columns* may change. Since `role`, `assigned_lead_id`, and `assigned_buddy_id` are ordinary columns on the same row, any authenticated user can call `supabase.from('user_profiles').update({ role: 'academic_head' }).eq('id', myOwnId)` directly and it will pass RLS. AuthContext.tsx reads `profile.role` from this exact table to drive ProtectedRoute's client-side gating (ProtectedRoute.tsx:35-40), so this single UPDATE call is enough to unlock the /admin, /buddy, and /onboarding-lead UI shells and their review dashboards for anyone.

**Impact / failure scenario.** A brand-new new_joinee account can self-promote to academic_head/onboarding_lead/lead_instructor purely through the user_profiles table (independent of the auth.updateUser() escalation path in finding #1), unlocking every admin/reviewer UI surface and (once combined with the also-broken worksheet_submissions RLS or the JWT-metadata trick) full company-wide data access.

**Steps to reproduce.** 1. Log in as any user. 2. `await supabase.from('user_profiles').update({role:'academic_head'}).eq('id', (await supabase.auth.getUser()).data.user.id})`. 3. Reload — ProtectedRoute now treats this user as academic_head and routes to /admin succeed.

**Suggested fix.** Add a WITH CHECK / trigger that prevents self-service role and assignment changes, e.g. a BEFORE UPDATE trigger that raises an exception if `NEW.role IS DISTINCT FROM OLD.role` or `NEW.assigned_lead_id/assigned_buddy_id IS DISTINCT FROM OLD.*` unless the acting user is a genuine admin (checked via a SECURITY DEFINER role-lookup function, not JWT metadata). Role/assignment changes should go through a dedicated RPC restricted to admins.

---

#### 50. [HIGH] No right-to-erasure: zero DELETE policies exist, only a full-database wipe script

- **Dimension:** Dim 15: Privacy & Compliance
- **Location:** `db/*.sql (grep for 'FOR DELETE' across all schema files returns nothing); db/__cleanup_test_users.sql:1-53`
- **Verification:** CONFIRMED — Verified: grep across all db/*.sql shows every CREATE POLICY is FOR SELECT/INSERT/UPDATE only, zero DELETE policies exist; db/__cleanup_test_users.sql:1-52 confirmed as an unconditional full-table wipe (DELETE FROM user_profiles with no WHERE, DELETE FROM auth.users) explicitly documented as a pre-launch 'clean slate' script; and src/ has no delete-user code path (only unrelated Map.delete() calls in queryCache.ts/errorHandling.ts) or admin UI for per-person erasure.

**Description.** None of the RLS-enabled tables (`user_profiles`, `worksheet_submissions`, `onboarding_submissions`, `notifications`) has a DELETE policy defined anywhere in the schema files. The only script that performs deletes, db/__cleanup_test_users.sql, unconditionally deletes ALL rows from all four tables plus `auth.users` with no WHERE clause targeting a specific person — it's explicitly a 'clean slate before going live' script, not an erasure tool, and requires direct Supabase SQL console / service_role access to run.

**Impact / failure scenario.** A departing employee (or a GDPR/CCPA data-subject-erasure request) cannot have their name, email, assessment answers, or manager feedback deleted through the app, and there is no admin UI or SQL runbook to delete just one user's data without wiping the entire company's onboarding history.

**Suggested fix.** Add a DELETE RLS policy scoped to `auth.uid() = user_id` (or service-role-only) for each PII table, and build an admin-triggered 'delete this employee's data' flow (cascade across user_profiles, worksheet_submissions, onboarding_submissions, notifications, and the auth.users record itself) that can be invoked per-person, plus a documented SLA for responding to erasure requests.

---

#### 51. [HIGH] No admin override exists for a worksheet stuck in needs_revision — not even the assigned buddy, manager, or admin can act on it

- **Dimension:** Dim 17: Operational Readiness
- **Location:** `src/pages/WorksheetReview.tsx:50-51,259 (`canApprove = isBuddy`; `isReadOnly = isOnboardingLead || (isManager && submission?.review_status !== 'buddy_approved')`; `canBuddyAct = canApprove && isPending`, and isPending excludes needs_revision)`
- **Verification:** CONFIRMED — Verified in src/pages/WorksheetReview.tsx: isPending (line 256) covers only pending_review|revision_submitted, so canBuddyAct (259) and the buddy action block (371-404) are hidden once status is needs_revision; managers are read-only unless already buddy_approved (51) and PhaseReview.tsx's canApprove (173) requires isAllBuddyApproved, so a needs_revision item blocks phase approval too; AdminDashboard.tsx only reads/aggregates review_status, never updates it; the only two .update() calls on worksheet_submissions in the whole src tree are WorksheetReview.tsx:102/170 (buddy approve/revision), and useAutoSave.ts shows the joinee's own resubmission is what flips needs_revision->revision_submitted. db/schema.sql:207-216 shows academic_head *does* have RLS UPDATE rights on worksheet_submissions, confirming a DB-level override is possible but no UI path exists for it — so this is a real product gap, not a misread.

**Description.** Once review_status is 'needs_revision', isPending (pending_review | revision_submitted) is false, so canBuddyAct is false and the entire 'Buddy Review Decision' action block is hidden (lines 371-404 only render if canBuddyAct). Managers are read-only unless already buddy_approved; onboarding_lead is always read-only. The only actor who can move a needs_revision item forward is the joinee resubmitting. If the joinee is unresponsive or the requesting buddy has left, the item is permanently stuck with zero UI path for any reviewer/admin to force it back to pending or approve it directly — the only recourse is an undocumented manual SQL UPDATE against production.

**Suggested fix.** Add an explicit admin/manager override action gated to academic_head/admin that can transition a needs_revision item back to pending_review or to approved, writing a review_history entry recording it as an administrative override (who/when/why).

---

#### 52. [HIGH] No mechanism to deactivate/offboard a user whose buddy or manager has left the company

- **Dimension:** Dim 17: Operational Readiness
- **Location:** `src/pages/AdminDashboard.tsx; src/components/admin/AssignmentsTab.tsx — grep for deactivate/suspend/disable/is_active/archived across src returns zero matches`
- **Verification:** CONFIRMED — Verified: AssignmentsTab.tsx (full file read) confirms buddyCandidates at line 30 filters only by i.id !== selectedInstructor with no active/status check, and the assign-manager/assign-buddy handlers (lines 73-102) only write assigned_lead_id/assigned_buddy_id; grep across all db/*.sql schema files shows no is_active/status/deactivate/archived column on user_profiles anywhere, so a departed buddy/manager remains selectable and retains full access with no offboarding path — HIGH severity is appropriate given it's a real security/data-integrity gap, though 'reviewer permissions indefinitely' framing slightly overstates since actual login revocation is a Supabase auth-layer concern outside this app's control, not something this app broke.

**Description.** AssignmentsTab.tsx only lets an admin reassign assigned_buddy_id/assigned_lead_id to a different active user going forward (lines 73-102). There is no UI, hook, or DB column anywhere in src to mark a departed employee's account inactive, revoke their login, or exclude them from buddy/manager selection dropdowns (buddyCandidates at line 30 filters only by `i.id !== selectedInstructor`, not by any active flag). A buddy who has left the company keeps a fully functional login and reviewer permissions indefinitely, and can still be mistakenly selected as a buddy for a new joinee.

**Suggested fix.** Add an is_active/status column to user_profiles, an admin action to deactivate a user (blocking their session/role checks and filtering them from assignment dropdowns), and a documented offboarding runbook step.

---

#### 53. [HIGH] No schema migration framework — db/ is 16 loose, unordered SQL files with no version tracking, and no supabase/migrations project exists

- **Dimension:** Dim 17: Operational Readiness
- **Location:** `db/ (schema.sql, supabase_schema.sql, setup_correct.sql, supabase_role_migration.sql, supabase_reviewer_migration.sql, __fix_rls_jwt.sql, __fix_rls_recursion.sql, __fix_review_columns.sql, __migration_notifications_dates.sql, __due_date_notifications.sql, __setup_supabase.sql, __cleanup_test_users.sql, __setup_test_data.sql, create_32_users.sql, seed_worksheets.sql, seed_ftp_worksheets.sql); confirmed absence of supabase/config.toml or supabase/migrations via find`
- **Verification:** CONFIRMED — Verified: db/ contains exactly the 16 files listed, no supabase/config.toml or supabase/migrations/ exist anywhere (confirmed via find), and db/schema.sql lines 5-16 literally claim to be the 'ONE FILE... incorporates all migrations' listing the other files by name with no enforcement mechanism; additionally there's an unmentioned 17th loose file at repo root (supabase_migration_add_buddy_approved.sql), so the finding if anything understates the sprawl.

**Description.** There is no Supabase CLI project, no migrations table, no numbered/timestamped migration files, and no up/down pairing. db/schema.sql claims at lines 5-8 to be 'the ONE FILE you need to run. It incorporates all migrations,' but that claim is unverifiable — nothing enforces that schema.sql is actually a superset of the loose __fix_*.sql files sitting alongside it, which read as one-off hotfixes applied by hand with no record of when or against which environment. There is no way to determine, looking at this repo today, which of the 16 SQL files have actually been run against the live production database.

**Suggested fix.** Migrate to the Supabase CLI migrations workflow (`supabase migration new`, `supabase db push`), which timestamps and tracks applied migrations. Retire or clearly archive the ad hoc __fix_*.sql/setup_*.sql files once folded into tracked migrations.

---

#### 54. [HIGH] No CI/CD pipeline exists at all — nothing gates deploys on tests passing, and the documented rollback strategy depends on a pipeline that doesn't exist

- **Dimension:** Dim 17: Operational Readiness
- **Location:** `repo root — no .github/workflows directory (confirmed via ls, No such file or directory) and no .yml/.yaml files anywhere; scripts/pre-commit.sh:41-74 (always exits 0, never runs tests/build); context.md:1636-1640 ('Rollback Strategy: Deploy previous build from CI/CD pipeline')`
- **Verification:** CONFIRMED — Verified directly: no .github directory, zero .yml/.yaml files repo-wide; scripts/pre-commit.sh (read in full) never invokes npm test/build/lint and exits 0 on every branch including the CLI-missing, token-expired, and fallback-error paths; context.md:1636-1640 verbatim states 'Deploy previous build from CI/CD pipeline' as the rollback strategy despite no pipeline existing. All cited evidence matches exactly.

**Description.** There is no CI configuration anywhere in the repo. The only pre-commit gate, scripts/pre-commit.sh, is not installed by default (must be manually copied into .git/hooks/pre-commit), removes itself if the external 'CodeRabbit' CLI isn't installed or its token expires (lines 22-27, 49-55), and on every other error path 'proceeds with commit' (line 73-74) — it never runs npm test, npm run build, or lint. context.md's own documented rollback strategy says 'Deploy previous build from CI/CD pipeline,' which is not achievable because no such pipeline exists.

**Suggested fix.** Add a CI workflow that runs npm test and npm run build on every PR and blocks merge on failure, plus a deploy workflow that can redeploy a prior build/commit to fulfil the documented rollback strategy.

---

#### 55. [HIGH] Toast/status system has no ARIA live region — screen readers never announce success, error, or save-status messages

- **Dimension:** Dim 18: UI/UX & Accessibility
- **Location:** `src/components/Toast.tsx:104-136 (toast container div), src/config/worksheetComponents.tsx:153-177 (SaveIndicator)`
- **Verification:** CONFIRMED — Verified both citations: Toast.tsx:104 container div has no role/aria-live attribute, and worksheetComponents.tsx:166-167 SaveIndicator span also lacks it; repo-wide grep for aria-live/role=status/role=alert returns zero matches, confirming no live region exists anywhere to compensate.

**Description.** The ToastProvider renders its toast list in a plain `<div>` with no `role="status"`/`role="alert"` and no `aria-live` attribute anywhere in the component. Every user-facing confirmation in the app (worksheet approved, revision requested, buddy/manager assignment saved, auto-save failed, phase promoted) is delivered exclusively through this visual toast. The autosave `SaveIndicator` (worksheetComponents.tsx:153) that shows 'Saving…/Saved/Failed' is also a plain `<span>` with no live-region semantics.

**Impact / failure scenario.** A screen-reader user gets zero feedback that their action succeeded, failed, or that unsaved work just failed to save — for a workflow whose entire point is submitting worksheets for review, this is a critical usability gap for assistive-tech users and fails WCAG 2.1 SC 4.1.3 (Status Messages).

**Steps to reproduce.** Navigate any worksheet with a screen reader (VoiceOver/NVDA) enabled, submit a form or trigger an auto-save failure (e.g. go offline mid-edit). Toast appears visually but nothing is announced.

**Suggested fix.** Add `role="status" aria-live="polite"` (and `aria-live="assertive"` for error-type toasts) to the toast container in Toast.tsx:104, and `aria-live="polite"` to the SaveIndicator wrapper in worksheetComponents.tsx:166.

---

#### 56. [HIGH] 151 of 158 worksheet form fields render a visible label that is not programmatically associated with its input

- **Dimension:** Dim 18: UI/UX & Accessibility
- **Location:** `src/config/worksheetComponents.tsx:131-141 (FieldGroup) — reproduced across ~25 files in src/pages/worksheets/, e.g. src/pages/worksheets/ftp/W1O1.tsx:33-35, W3E1.tsx:18-19, W2D2.tsx:23-24, W4D2.tsx:19,27`
- **Verification:** CONFIRMED — Verified directly: FieldGroup (src/config/worksheetComponents.tsx:131-141) renders label htmlFor={id||undefined} but never clones/injects id onto children; FieldGroupProps.id is optional and grep confirms only 7/158 <FieldGroup label=...> call sites pass id (and those 7, e.g. Phase1Worksheet1.tsx:34-35, require the developer to manually duplicate the same id onto the child <input> for it to work). Cited example W1O1.tsx:33-34 confirmed to have no id on FieldGroup or the input, so label and input are not programmatically associated.

**Description.** `FieldGroup` renders `<label htmlFor={id || undefined}>{label}</label>{children}`, but does not clone/inject the `id` onto its child `<input>`. Grepping the codebase: `<FieldGroup label=` appears 158 times across worksheet pages, but only 7 of those call sites also pass an `id` prop (verified via grep). In every other case (`<FieldGroup label="Your Name" required><input className="lux-input" .../></FieldGroup>`), the rendered `<label>` has `htmlFor={undefined}` and the `<input>` has no `id`, so there is no programmatic label/control relationship.

**Impact / failure scenario.** Screen-reader users hear only 'edit text' with no field name for the vast majority of worksheet inputs across the app's core data-entry surface; sighted mouse users lose the standard 'click label to focus field' affordance. This is a WCAG 1.3.1 / 3.3.2 failure at scale, not an isolated bug.

**Steps to reproduce.** Open any FTP worksheet (e.g. /week-1/worksheet/w1_o1) with a screen reader and Tab to the 'Your Name' field, or click directly on the label text — focus does not move to the input and the label is not announced with the field.

**Suggested fix.** Generate a stable id in `FieldGroup` (e.g. from a slugified `label` or a required `id` prop) and use `React.cloneElement` to inject `id`/`aria-labelledby` onto the single child input, or require every call site to pass an explicit id (enforce via TypeScript by making `id` required).

---

#### 57. [HIGH] Gate-artifact checklist toggles are keyboard-inaccessible, blocking phase-gate completion for keyboard-only users

- **Dimension:** Dim 18: UI/UX & Accessibility
- **Location:** `src/pages/gate-controls/GateArtifact1.tsx:71, GateArtifact2.tsx:71, GateArtifact3.tsx:50, GateArtifact4.tsx:53`
- **Verification:** CONFIRMED — Verified directly: GateArtifact1.tsx:71, GateArtifact2.tsx:71, GateArtifact3.tsx:50, GateArtifact4.tsx:53 are all bare div onClick toggles with no role/tabIndex/onKeyDown, while GateControl1-3.tsx and PhaseWorksheetList.tsx (cited comparisons) correctly implement role=button, tabIndex={0}, onKeyDown, and aria-label at the exact lines claimed; W1O1.tsx correctly uses a native checkbox as claimed for the fix suggestion. Since allRequiredMet (used to gate the Submit button) depends on these unreachable controls, keyboard-only users genuinely cannot complete the gate.

**Description.** The 'Required Artifacts' checklist items are `<div key={i} onClick={...}>` with no `role="button"`/`role="checkbox"`, no `tabIndex`, and no `onKeyDown` handler. This is the exact same interaction pattern implemented correctly (role, tabIndex, onKeyDown, aria-label) in the sibling files GateControl1.tsx:118-122, GateControl2.tsx:122-126, GateControl3.tsx:147-151/174-178, and in PhaseWorksheetList.tsx:44-47 — confirming the team knows the correct pattern but didn't apply it consistently to GateArtifact1-4.

**Impact / failure scenario.** A keyboard-only or switch-device user cannot confirm required gate artifacts, meaning they cannot complete a gate that blocks progression to the next onboarding phase — a core, phase-blocking flow becomes literally impossible to complete without a mouse.

**Steps to reproduce.** Tab through a Gate Artifact worksheet (e.g. the artifact-confirmation page for Phase 1 gate) using only the keyboard. Focus never lands on the artifact checklist rows — they are unreachable and cannot be toggled.

**Suggested fix.** Apply the same `role="button" tabIndex={0} onKeyDown={e => { if (e.key==='Enter'||e.key===' ') {...} }}` pattern already used in GateControl1-3.tsx to the four GateArtifact*.tsx files, or better, replace the custom div with a native `<label><input type="checkbox" .../></label>` as already correctly done in the FTP worksheet checkboxes (e.g. W1O1.tsx:44-49).

---

#### 58. [HIGH] No password reset / forgot-password flow exists anywhere in the app

- **Dimension:** Dim 19: Auth Flow Deep-Dive
- **Location:** `src/pages/Login.tsx (entire file — no forgot-password link/route); src/App.tsx:110-113 (only /login, /signup, /auth/callback routes registered); no resetPasswordForEmail call found anywhere in src/`
- **Verification:** CONFIRMED — Verified: Login.tsx (src/pages/Login.tsx) has no forgot-password link; App.tsx registers only /login, /signup, /auth/callback as auth routes with no reset-password route; grep across src/ finds zero calls to resetPasswordForEmail (only unrelated auth.updateUser calls in useAutoPromote.ts for role metadata) — self-service password recovery is genuinely absent.

**Description.** There is no 'Forgot password?' link on the Login page, no reset-password route registered in App.tsx, no call to supabase.auth.resetPasswordForEmail() anywhere in the codebase, and no admin-side tool to reset another user's password. The only account-recovery path available to a user who forgets their password is signing in with Google (if that identity happens to be linked) — for anyone who signed up with email/password, there is zero self-service recovery.

**Impact / failure scenario.** A new hire who mistypes or forgets their password during onboarding — a near-certainty at company scale — is permanently locked out with no in-app recourse, generating support tickets that require someone with direct Supabase dashboard/service-role access to intervene manually.

**Suggested fix.** Add a 'Forgot password?' link on Login.tsx that calls supabase.auth.resetPasswordForEmail(email, {redirectTo: origin + '/auth/reset-password'}), plus a new /auth/reset-password route/page that calls supabase.auth.updateUser({password}) after the recovery session is established, mirroring the existing AuthCallback pattern.

---

#### 59. [HIGH] Auto-promotion updates the reviewer's own session role instead of the promoted user's, and never syncs the promoted user's JWT

- **Dimension:** Dim 19: Auth Flow Deep-Dive
- **Location:** `src/hooks/useAutoPromote.ts:60-75, invoked from src/pages/PhaseReview.tsx (reviewer-only route)`
- **Verification:** CONFIRMED — Verified in useAutoPromote.ts:61-71 — profile update correctly targets .eq('id', userId), but auth.updateUser() takes no userId and per Supabase semantics always mutates the caller's own session metadata; checkAndPromote is only invoked from PhaseReview.tsx:150, a route gated to academic_head/onboarding_lead in App.tsx:120-121, confirming the caller is always the reviewer, not the joinee being promoted.

**Description.** checkAndPromote(userId) correctly updates the target new joinee's user_profiles.role row (.eq('id', userId), lines 61-64), but the very next call, supabase.auth.updateUser({data:{role:'lead_instructor'}}) (lines 69-71), takes no userId parameter — Supabase's updateUser always mutates the CURRENTLY AUTHENTICATED CLIENT's own session, never an arbitrary user. Since this function is only invoked from PhaseReview.tsx, a reviewer-only route (academic_head/onboarding_lead), it is the reviewer's OWN browser session whose user_metadata.role silently gets overwritten to 'lead_instructor' every time they approve a joinee's final phase. Combined with the CRITICAL RLS-trust finding above, the reviewer's own admin privileges can degrade mid-session after a routine approval action, while the actually-promoted new joinee's JWT still reflects their old role until they separately log out and back in.

**Impact / failure scenario.** An academic_head approving a final worksheet unexpectedly loses admin-level RLS access mid-session (their own JWT now says 'lead_instructor'), while the intended beneficiary of the promotion doesn't get their new reviewer privileges recognized by JWT-based RLS policies until they manually re-login — a confusing, silent state-desync bug directly caused by misusing auth.updateUser().

**Suggested fix.** Remove the supabase.auth.updateUser() call from useAutoPromote entirely (role authorization should never live in user_metadata per the CRITICAL fix above); if immediate JWT-role sync for the promoted user is still needed under some interim design, it must be done via a service-role Edge Function targeting the specific userId, never via the caller's own auth.updateUser().

---

#### 60. [HIGH] Zero test coverage for authentication flows (Login, Signup, AuthContext, AuthCallback)

- **Dimension:** Dim 20: Testing & Input Validation
- **Location:** `src/context/AuthContext.tsx, src/pages/Login.tsx, src/pages/Signup.tsx, src/pages/AuthCallback.tsx`
- **Verification:** CONFIRMED — Verified: `find . -iname '*.test.*' -not -path node_modules` returns only ReviewContent, reviewFlow, useAutoPromote, useAutoSave, useDueDates, useNotifications tests — no file references Login, Signup, AuthCallback, or AuthContext/useAuth. Read AuthContext.tsx (260 lines) and confirmed signUp/signIn/signInWithGoogle/signOut/hasRole/fetchProfile/createProfileFromAuth/buildProfileFromMetadata all exist with the RLS-recursion fallback (line 44-49, 60-63) and metadata-based role fallback (`meta.role` at line 80, matches cited 79-80) exactly as described, all untested.

**Description.** grep across the repo for test files referencing Login, Signup, AuthCallback, or AuthContext returns zero results (`find . -iname '*login*test*'` etc. all empty). The entire signUp/signIn/signInWithGoogle/signOut/hasRole/fetchProfile/createProfileFromAuth/buildProfileFromMetadata logic in AuthContext.tsx (261 lines, includes RLS-recursion fallback logic and auto profile creation) has no automated test coverage at all. This is the single most security-sensitive code path in the app (who gets an account, what role they get, what happens when profile fetch fails) and it is completely unverified by tests.

**Impact / failure scenario.** A regression in signUp/fetchProfile/hasRole (e.g. a role check inversion, or the RLS-recursion fallback silently defaulting a user to the wrong role — buildProfileFromMetadata defaults role to 'new_joinee' via meta.role, which is user-supplied signup metadata) would ship undetected. Example: AuthContext.tsx:79-80 falls back to `meta.role` read straight from auth user_metadata when RLS recursion is hit — if that fallback path is ever exercised for an admin-check UI decision, a user who signed up with crafted metadata could see incorrect role-gated UI, and no test would catch it.

**Suggested fix.** Add unit tests for signUp/signIn error paths (duplicate email, weak password rejection by Supabase, network failure) and for fetchProfile's three branches (success, PGRST116 not-found -> auto-create, RLS-recursion -> metadata fallback), mocking supabase.auth and supabase.from as already done in the hook tests (same vi.mock pattern used in useAutoSave.test.ts is directly reusable here).

---

#### 61. [HIGH] Zero component-rendering tests despite @testing-library/react and jsdom being installed

- **Dimension:** Dim 20: Testing & Input Validation
- **Location:** `package.json:23,32 (devDependencies), all files under src/pages/**, src/components/**`
- **Verification:** CONFIRMED — Verified via package.json (both @testing-library/react ^16.3.2 and jsdom ^29.1.1 are devDependencies), `grep -rl \"@testing-library/react\" src/` and `grep -rln \"render(\" src/ --include=*.test.*` both return zero matches, and the 6 existing test files (934 lines, 73 it() blocks) under src/components/__tests__ and src/hooks/__tests__ only test ReviewContent logic/hooks with mocked deps — no component mounting. ProtectedRoute.tsx and PhaseAccessGuard.tsx exist under src/components/ and have no corresponding test files at all, confirming the two critical access-gating components are entirely untested at any level.

**Description.** `@testing-library/react` and `jsdom` are devDependencies but `grep -rl "@testing-library/react" src/` and `grep -rl "render(" src/ --include=*.test.*` both return zero matches. All 6 existing test files (934 lines total, 70 `it()` blocks) test pure functions or hooks with every dependency mocked at the module boundary — none of them mount a single React component. This means every page (Login, Signup, all ~25 worksheet pages, AdminDashboard, BuddyDashboard, OnboardingLeadDashboard, WorksheetReview, PhaseReview, ReviewContent's actual render output, Navbar, ProtectedRoute, PhaseAccessGuard) has zero verification that it renders without throwing, that form validation messages actually appear in the DOM, or that button clicks trigger the right handlers.

**Impact / failure scenario.** A typo in JSX, a missing null-check on `profile` before `.role` access, or a broken conditional render (e.g. showing the approve button to the wrong role) ships with green tests. Nothing currently exercises ProtectedRoute or PhaseAccessGuard — the two components that gate access to protected content — even at the render level.

**Suggested fix.** Add smoke-render tests for at least ProtectedRoute, PhaseAccessGuard, Login, Signup, and WorksheetReview using @testing-library/react's `render`/`screen`/`fireEvent`, since the tooling is already a dependency but entirely unused.

---

#### 62. [HIGH] useGateControl has zero tests and contains a fail-open bug in the gate-completion check

- **Dimension:** Dim 20: Testing & Input Validation
- **Location:** `src/hooks/useGateControl.ts:50-53 (checkPhaseWorksheetsComplete), no corresponding __tests__ file exists`
- **Verification:** CONFIRMED — Verified src/hooks/useGateControl.ts:50-53 contains exactly the described fail-open path (`return { complete: true, missing: [] }; // Allow submit on error`) reached from handleSubmit's gate check (line 133-153), and src/hooks/__tests__/ has tests for useAutoPromote, useDueDates, useNotifications, useAutoSave but none for useGateControl — finding is accurate as described.

**Description.** `find src -iname "*gatecontrol*" -path "*test*"` returns nothing — the gate control hook, which governs whether a joinee can submit a phase gate-pass (the mechanism that blocks phase promotion until prerequisite worksheets are approved), has no test file at all, unlike its sibling hooks (useAutoSave, useDueDates, useNotifications, useAutoPromote) which are all tested. Reading the implementation: on a Supabase query error, `checkPhaseWorksheetsComplete` returns `{ complete: true, missing: [] }` with the comment `// Allow submit on error` (line 52), i.e. any transient network/DB error during the completion check causes the gate to silently open rather than block.

**Impact / failure scenario.** If the `worksheet_submissions` select query errors for any reason (RLS misconfiguration, timeout, connection drop — plausible given the repo has multiple RLS-recursion fix scripts in db/, e.g. __fix_rls_recursion.sql), a joinee can submit a gate-pass worksheet without any of the prerequisite worksheets being buddy/manager approved, bypassing the entire review gate for that phase. No test exists to document or catch this fail-open behavior; a reviewer reading the tested surface of the codebase would not know this edge case exists.

**Suggested fix.** Write tests for useGateControl/checkPhaseWorksheetsComplete covering: all worksheets approved (allow), some missing (block), and the query-error path — and reconsider whether fail-open is the intended behavior for a review gate (fail-closed is safer for an approval gate).

---

#### 63. [HIGH] No tests for admin/lead/buddy dashboard flows or the actual approve/reject review UI

- **Dimension:** Dim 20: Testing & Input Validation
- **Location:** `src/pages/AdminDashboard.tsx, src/pages/BuddyDashboard.tsx, src/pages/OnboardingLeadDashboard.tsx, src/pages/WorksheetReview.tsx, src/pages/PhaseReview.tsx, src/components/admin/AssignmentsTab.tsx, src/components/admin/PhasesReadyTab.tsx`
- **Verification:** CONFIRMED — Verified: `find` for admin-test files returns nothing; the only 'review' test (src/hooks/__tests__/reviewFlow.test.ts) imports solely from config/worksheetConfigData.ts (pure helpers), never WorksheetReview.tsx or PhaseReview.tsx; WorksheetReview.tsx:146 exactly matches `if (!comment.trim())` inside handleBuddyRevision, which calls supabase.update() directly with hand-written review_status strings — none of this handler logic is exercised by any test in the repo.

**Description.** `find . -iname "*admin*test*"` returns nothing. `reviewFlow.test.ts` (the only 'review' test) exclusively tests pure helper functions from worksheetConfigData.ts (getPhaseReviewStatus, getBuddyApprovedSheets, getPhaseWorksheetsByStatus) — it never touches WorksheetReview.tsx or PhaseReview.tsx, which are the actual pages containing the approve/reject/needs_revision button handlers and the required-comment validation (`if (!comment.trim())` at WorksheetReview.tsx:146). The state machine transition code itself (submitted -> pending_review -> buddy_approved/needs_revision -> approved, and the auto-promotion trigger) is only tested via its data-shape helpers, not via the actual click handlers that write to the DB.

**Impact / failure scenario.** A bug in the actual approve/reject button wiring (e.g. wrong review_status string passed to supabase.update, or the revision-comment requirement being bypassable via a different code path than the one at line 146) would not be caught by the existing suite, since it never invokes WorksheetReview's handlers.

**Suggested fix.** Add tests that mock supabase and exercise WorksheetReview's approve/reject/needs-revision handlers directly (extract them to testable functions the way useAutoPromote/useNotifications already are, or test via component render + fireEvent).

---

#### 64. [HIGH] No tests for RLS/authorization boundaries anywhere in the suite

- **Dimension:** Dim 20: Testing & Input Validation
- **Location:** `db/schema.sql, db/*fix_rls*.sql, src/components/ProtectedRoute.tsx, src/components/PhaseAccessGuard.tsx — no test file references any of these`
- **Verification:** CONFIRMED — Verified: only 6 test files exist (all in src/components|hooks/__tests__), none reference ProtectedRoute, PhaseAccessGuard, Navigate, requiredRoles, or useAuth (grep found zero matches); ProtectedRoute.tsx and PhaseAccessGuard.tsx both contain real role/access-gating logic (Navigate to /login or / on unauthorized role, canAccessPhase check) that goes untested; db/schema.sql has 13 CREATE POLICY statements and db/__fix_rls_jwt.sql + db/__fix_rls_recursion.sql exist confirming prior RLS breakage; package.json has no e2e/pgTAP test runner, only vitest.

**Description.** There is no test (unit, integration, or otherwise) that asserts a new_joinee cannot read another user's worksheet_submissions, that a buddy can only see their assigned joinees, or that role-gated routes actually redirect unauthorized roles. The repo's own RLS fix scripts (__fix_rls_jwt.sql, __fix_rls_recursion.sql) indicate RLS has been broken/patched multiple times in this project's history, yet nothing regression-tests the policies or the client-side role gates that depend on them.

**Impact / failure scenario.** Since Supabase RLS is the *only* authorization boundary in this architecture (no custom server), an untested RLS policy regression directly means unauthorized data access in production, and the test suite provides no safety net for that class of bug.

**Suggested fix.** At minimum, add client-side tests asserting ProtectedRoute/PhaseAccessGuard redirect logic for each role against each guarded route. RLS policies themselves ideally need a pgTAP or integration-level test against a real/local Supabase instance, which is entirely absent here.

---

#### 65. [HIGH] README.md is 100% stock Vite boilerplate — zero project-specific setup instructions

- **Dimension:** Dim 21: Documentation & Onboarding
- **Location:** `README.md:1-17`
- **Verification:** CONFIRMED — Verified README.md (17 lines) is verbatim stock Vite/React boilerplate with no project-specific content; confirmed 8 other root markdown/txt docs (ARCHITECTURE_PLAN.md, QA_REPORT.md, REVIEW_FLOW.md, SYSTEM_ANALYSIS.md, TYPESCRIPT_MIGRATION_*.md, UI_IMPROVEMENTS.md, context.md) exist unlinked from README.

**Description.** The entire README is the default `npm create vite@latest` template text ("This template provides a minimal setup to get React working in Vite with HMR...", links to @vitejs/plugin-react docs). It contains no mention of Newton, Supabase, onboarding domain, env vars, DB setup, roles, or how to run the app against a real backend. A new developer cloning the repo gets no entry point at all — the real onboarding material is scattered across 8 other root-level markdown/txt files and a 100KB context.md that README does not even link to.

**Suggested fix.** Replace README.md with a real project README: what the app is, prerequisites, `cp .env.example .env` + Supabase project setup, which single SQL file to run (see DB ordering finding), `npm install && npm run dev`, `npm run test`, `npm run build`, and links to the other docs (marking which are current vs historical).

---

#### 66. [HIGH] TYPESCRIPT_MIGRATION_EXECUTION.md is actively false — describes a migration as not-started when it is ~99% complete

- **Dimension:** Dim 21: Documentation & Onboarding
- **Location:** `TYPESCRIPT_MIGRATION_EXECUTION.md:1-40 (checklist items 8.1-10.10, all unchecked)`
- **Verification:** CONFIRMED — Verified: doc shows all 10 phases at 0/10 with every checkbox unchecked, but `find src -name '*.jsx' -o -name '*.js'` (excl. tests) returns only src/config/theme.js out of 107 source files; cited targets like Phase1.jsx, GateControl1/2/3.jsx, and Phase1Worksheet1-8.jsx already exist as .tsx under src/pages/, src/pages/gate-controls/, src/pages/worksheets/ — doc is stale/misleading as claimed.

**Description.** The doc's checklist items (e.g. "8.1 Convert src/pages/Phase1.jsx → .tsx", "9.1 Convert Phase1Worksheet1.jsx → .tsx", listing GateControl1/2/3.jsx, all Phase2/3 worksheets) are all unchecked, implying the codebase is still largely JSX. In reality `find src -name '*.jsx' -o -name '*.js'` (excluding tests) returns exactly ONE file (src/config/theme.js) out of 101 source files — the migration is done. The referenced files don't even exist anymore under those names (e.g. src/pages/gate-controls/GateControl1.tsx already exists as .tsx, not .jsx, and lives in a subdirectory the doc doesn't mention). A new developer trusting this doc would believe there's a large pending TS migration effort and could waste time "finishing" work already finished, or distrust the type safety of the app.

**Suggested fix.** Delete TYPESCRIPT_MIGRATION_EXECUTION.md and TYPESCRIPT_MIGRATION_PLAN.md, or mark them clearly as historical/completed at the top with a completion date, since they no longer reflect reality.

---

## 7. Findings by system area

### Auth & Authorization (RLS, JWT, roles)
C:8 H:7 M:11 L:4

- **[CRITICAL]** Complete privilege escalation: role-based RLS trusts user-editable auth.user_metadata, not a server-controlled claim — `db/schema.sql:68-70,75-77,108-111,191-193,207-209 (also db/__fix_rls_jwt.sql:28-30,35-37,89-93,64-72,80-84)`
- **[CRITICAL]** user_profiles 'Update own profile' policy has no WITH CHECK — any user can self-write their own role column to admin — `db/schema.sql:62-64 (`CREATE POLICY "Update own profile" ON user_profiles FOR UPDATE USING (id = auth.uid())`
- **[CRITICAL]** worksheet_submissions self-approval: 'Update own submissions' / 'Insert own submissions' policies have no WITH CHECK on review_status/reviewed_by — a joinee can approve their own worksheets directly, bypassing the entire buddy/manager review workflow — `db/schema.sql:176-187 (`Insert own submissions` WITH CHECK only restricts user_id`
- **[CRITICAL]** Signup role is accepted as a caller-supplied parameter with no server-side allow-list — any direct API call can self-register as academic_head/onboarding_lead — `src/context/AuthContext.tsx:169,174,188 (signUp(email, password, fullName, role) writes `role` straight into both auth user_metadata and the user_profiles insert)`
- **[CRITICAL]** RLS authorization trusts client-writable auth.jwt() user_metadata.role — full privilege escalation to admin/buddy/manager for any signed-up user — `db/schema.sql:68-72,108-112,191-216 (identical flaw repeated in db/setup_correct.sql:29-96, db/__fix_rls_jwt.sql:25-81, db/__fix_rls_recursion.sql:28-93)`
- **[CRITICAL]** Buddy A can view and approve Buddy B's assignees — no ownership enforcement at RLS, route, or component level — `db/schema.sql:191-216 (Reviewers select/update submissions policy)`
- **[CRITICAL]** RLS trusts client-writable user_metadata.role, letting any employee self-escalate to read all colleagues' PII — `db/supabase_schema.sql:68-72,119,143 (and equivalent policies in db/schema.sql)`
- **[CRITICAL]** Client-controlled JWT user_metadata.role is trusted by all RLS authorization checks — trivial admin privilege escalation — `src/context/AuthContext.tsx:169-176,188 (signUp writes role into auth options.data and into user_profiles.insert)`
- **[HIGH]** Zero server-side enforcement of role-scoped review actions — RLS lets any reviewer role set the final 'approved' status, bypassing the buddy→manager two-step approval the UI implies — `db/schema.sql:203-216 ('Reviewers update submissions' policy — no WITH CHECK distinguishing which review_status values lead_instructor vs academic_head may write)`
- **[HIGH]** Hardcoded plaintext credentials for privileged/test accounts committed to git, targeting the live production Supabase project — `scripts/setup/create-admin.cjs:12-15`
- **[HIGH]** Buddy-mode worksheet write path lets an unassigned buddy overwrite a joinee's submitted answers, not just approve them — `src/hooks/useWorksheet.ts:89,104-113 (overrideUserId)`
- **[HIGH]** user_profiles self-update RLS policy has no column restriction — any user can set their own role, assigned_lead_id, or assigned_buddy_id directly — `db/schema.sql:62-64 ("Update own profile" ... USING (id = auth.uid()))`
- **[HIGH]** No right-to-erasure: zero DELETE policies exist, only a full-database wipe script — `db/*.sql (grep for 'FOR DELETE' across all schema files returns nothing)`
- **[HIGH]** No password reset / forgot-password flow exists anywhere in the app — `src/pages/Login.tsx (entire file — no forgot-password link/route)`
- **[HIGH]** Auto-promotion updates the reviewer's own session role instead of the promoted user's, and never syncs the promoted user's JWT — `src/hooks/useAutoPromote.ts:60-75, invoked from src/pages/PhaseReview.tsx (reviewer-only route)`

### Database & schema
C:4 H:5 M:8 L:2

- **[CRITICAL]** RLS UPDATE policies missing WITH CHECK let users self-elevate role and self-approve their own worksheets — `db/schema.sql:63-64 ("Update own profile"), db/schema.sql:184-187 ("Update own submissions") — identical pattern also in db/supabase_schema.sql:37-40/133-136, db/setup_correct.sql, db/__setup_supabase.sql:67-69/126-128, db/__fix_rls_recursion.sql, db/__fix_rls_jwt.sql`
- **[CRITICAL]** Canonical schema.sql is missing the notifications table and due_date column that are core, actively-used features — `db/schema.sql (entire file — no `CREATE TABLE notifications`, no `due_date` column)`
- **[CRITICAL]** Unconditional, unguarded full-database wipe script checked into repo, aimed at the only Supabase project — `db/__cleanup_test_users.sql:12-46`
- **[CRITICAL]** No environment separation — every 'test' script's hardcoded fallback URL is the same project as the committed production config — `.env:1-2 (VITE_SUPABASE_URL=https://fuoqoryqndtdooujslee.supabase.co)`
- **[HIGH]** Documentation still points engineers at an incompatible, stale schema file (supabase_schema.sql) as the source of truth for RLS — `SYSTEM_ANALYSIS.md:52 ("All authorization is in supabase_schema.sql. If a feature is broken, check the Policy first.") vs. the actually-current db/schema.sql and db/__fix_rls_jwt.sql`
- **[HIGH]** notifications INSERT policy has no ownership check — any authenticated user can forge notifications as/to anyone — `db/__migration_notifications_dates.sql:34-37`
- **[HIGH]** clean_setup.mjs deletes all worksheet_submissions unconditionally; only accidental absence of a DELETE RLS policy currently prevents it from working — `scripts/clean_setup.mjs:41-51`
- **[HIGH]** Production deployment checklist instructs running fabricated-data seed scripts against the live database — `context.md:1623-1633 ('Production Checklist' — '[ ] Run `db/seed_worksheets.sql` for test data (optional)')`
- **[HIGH]** 'Fix data' scripts hardcode QA credentials and directly forge review/approval fields, bypassing the review workflow with no audit marker — `scripts/fix_promotion_data.mjs:10-12,27-30,43-52`

### Review / submission flow & data integrity
C:3 H:6 M:16 L:6

- **[CRITICAL]** Gate Control / Gate Artifact submissions never enter the review queue — 'Submitted' vs 'submitted' casing mismatch — `src/hooks/useGateControl.ts:163 (writes status: 'Submitted'), src/hooks/useAutoSave.ts:87,126 (checks data.status === 'submitted'), src/hooks/useWorksheet.ts:198,222 (writes/reads lowercase 'submitted'), src/pages/WorksheetReview.tsx:77,265`
- **[CRITICAL]** Worksheet/gate submission always shows success even when the save permanently fails — silent data loss — `src/hooks/useAutoSave.ts:164-180 (save catch block never rethrows) combined with src/hooks/useWorksheet.ts:190-216 (handleSubmit) and src/hooks/useGateControl.ts:155-189 (handleSubmit)`
- **[CRITICAL]** Case-mismatched status string ('Submitted' vs 'submitted') permanently strands FTP Gate Artifact submissions with no reviewer visibility — `src/hooks/useGateControl.ts:158-168 (sets data.status = 'Submitted')`
- **[HIGH]** Identical 'is worksheet complete' business logic and ~150 lines of page markup copy-pasted across 7 files — `src/pages/Phase1.tsx:148,156`
- **[HIGH]** SaveIndicator (auto-save status badge) is built but never rendered — save failures are invisible in the UI — `src/config/worksheetComponents.tsx:103 (WorksheetHeader destructures `{icon,title,subtitle,badge}`, not `saveStatus`) and src/components/WorksheetPage.tsx:128 (passes `saveStatus={saveStatus}` to WorksheetHeader, which silently drops it)`
- **[HIGH]** loadWorksheetData ignores the Supabase `error` field — a transient read failure during page load can present a submitted worksheet as blank — `src/hooks/useAutoSave.ts:208-220`
- **[HIGH]** Auto-save notification failures are swallowed inside triggerNotification, so a successful save can silently fail to notify the reviewer — `src/hooks/useAutoSave.ts:131-156 (calls triggerNotification per reviewer) and src/hooks/useNotifications.ts:151-165 (triggerNotification's own try/catch swallows all errors)`
- **[HIGH]** db/schema.sql — the file explicitly documented as 'the ONE FILE you need to run' — is missing the notifications table and due_date column the app requires — `db/schema.sql:1-17 (header claims completeness), whole file (no notifications table, no due_date column)`
- **[HIGH]** Reviewer approve/revision actions have no optimistic-concurrency guard — stale client state can clobber newer server state — `src/pages/WorksheetReview.tsx:74-104 (handleBuddyApprove), :145-195 (handleBuddyRevision)`

### Frontend / React / UI-UX
C:0 H:4 M:15 L:10

- **[HIGH]** Zero route-based code splitting — entire app (40+ worksheet pages, all dashboards, admin tools) bundled into one chunk loaded on every route including /login — `src/App.tsx:1-31 (static imports of every page), src/config/worksheetConfig.tsx:38-79 (40 static imports of worksheet/gate-control components), vite.config.js:12-21`
- **[HIGH]** Toast/status system has no ARIA live region — screen readers never announce success, error, or save-status messages — `src/components/Toast.tsx:104-136 (toast container div), src/config/worksheetComponents.tsx:153-177 (SaveIndicator)`
- **[HIGH]** 151 of 158 worksheet form fields render a visible label that is not programmatically associated with its input — `src/config/worksheetComponents.tsx:131-141 (FieldGroup) — reproduced across ~25 files in src/pages/worksheets/, e.g. src/pages/worksheets/ftp/W1O1.tsx:33-35, W3E1.tsx:18-19, W2D2.tsx:23-24, W4D2.tsx:19,27`
- **[HIGH]** Gate-artifact checklist toggles are keyboard-inaccessible, blocking phase-gate completion for keyboard-only users — `src/pages/gate-controls/GateArtifact1.tsx:71, GateArtifact2.tsx:71, GateArtifact3.tsx:50, GateArtifact4.tsx:53`

### Deploy / Ops / Observability / Cost
C:2 H:13 M:17 L:8

- **[CRITICAL]** run_migration.cjs is non-functional — references SQL files that don't exist at the stated paths — `scripts/run_migration.cjs:36-41 (MIGRATIONS array pointing at scripts/setup/__migration_notifications_dates.sql and scripts/setup/__due_date_notifications.sql)`
- **[CRITICAL]** Production Supabase URL and anon key are hardcoded as literal fallback defaults in 9+ scripts, with no single source of truth for rotation — `scripts/clean_setup.mjs:16-18`
- **[HIGH]** serve-app.mjs has an unauthenticated path-traversal arbitrary file read vulnerability — `serve-app.mjs:15-20`
- **[HIGH]** SPA client-side routing has no server-side rewrite for any of the three documented hosting targets — refreshing any deep link 404s — `src/App.tsx:103 (BrowserRouter)`
- **[HIGH]** Missing Supabase env vars crash the entire app before React mounts, with no user-visible error — ErrorBoundary cannot catch it — `src/api/supabase.ts:4-19`
- **[HIGH]** Live production Supabase URL and anon key are hardcoded as fallback literals in 5+ committed scripts, in addition to being committed in .env — `__seed_30_users.cjs:18-19`
- **[HIGH]** No error reporting/monitoring service integrated anywhere in the app — `package.json:1-25 (no Sentry/Bugsnag/LogRocket/Rollbar/Datadog dependency)`
- **[HIGH]** Notifications table has an unrestricted INSERT policy — any authenticated user can write unlimited rows for any user_id — `db/__migration_notifications_dates.sql:34-37 (CREATE POLICY "Insert notifications" ... WITH CHECK (true))`
- **[HIGH]** Admin/Onboarding-Lead dashboards use a hardcoded .limit(500) with no ordering and no pagination on worksheet_submissions — will silently truncate at realistic scale — `src/pages/AdminDashboard.tsx:80, src/pages/OnboardingLeadDashboard.tsx:52`
- **[HIGH]** Admin/Onboarding-Lead dashboards run fully unbounded user_profiles queries (no .limit at all) on every dashboard load — `src/pages/AdminDashboard.tsx:76 and :84, src/pages/OnboardingLeadDashboard.tsx:48`
- **[HIGH]** No application-level rate limiting anywhere, combined with a publicly committed anon key — unbounded direct-API abuse is trivial — `src/api/supabase.ts:19 (bare createClient, no interceptor/throttle)`
- **[HIGH]** No admin override exists for a worksheet stuck in needs_revision — not even the assigned buddy, manager, or admin can act on it — `src/pages/WorksheetReview.tsx:50-51,259 (`canApprove = isBuddy``
- **[HIGH]** No mechanism to deactivate/offboard a user whose buddy or manager has left the company — `src/pages/AdminDashboard.tsx`
- **[HIGH]** No schema migration framework — db/ is 16 loose, unordered SQL files with no version tracking, and no supabase/migrations project exists — `db/ (schema.sql, supabase_schema.sql, setup_correct.sql, supabase_role_migration.sql, supabase_reviewer_migration.sql, __fix_rls_jwt.sql, __fix_rls_recursion.sql, __fix_review_columns.sql, __migration_notifications_dates.sql, __due_date_notifications.sql, __setup_supabase.sql, __cleanup_test_users.sql, __setup_test_data.sql, create_32_users.sql, seed_worksheets.sql, seed_ftp_worksheets.sql)`
- **[HIGH]** No CI/CD pipeline exists at all — nothing gates deploys on tests passing, and the documented rollback strategy depends on a pipeline that doesn't exist — `repo root — no .github/workflows directory (confirmed via ls, No such file or directory) and no .yml/.yaml files anywhere`

### Architecture / Docs / Testing
C:2 H:8 M:20 L:8

- **[CRITICAL]** Two incompatible worksheet-to-phase taxonomies drive routing vs. gating, and disagree on which phase a worksheet belongs to — `src/config/worksheetConfigData.ts:509-545 (ALL_WORKSHEETS) vs :555-569 (PHASE_WORKSHEETS_MAP) vs :399-404 (WK_WORKSHEETS_MAP)`
- **[CRITICAL]** Phase-access gate is both undeliverable (circular dependency) and trivially bypassable via the parallel /week-N route tree — `src/components/PhaseAccessGuard.tsx:86`
- **[HIGH]** No service/data-access layer — 17 files issue raw Supabase queries directly, mostly duplicating the same query — `src/api/index.ts:1`
- **[HIGH]** Zero test coverage for authentication flows (Login, Signup, AuthContext, AuthCallback) — `src/context/AuthContext.tsx, src/pages/Login.tsx, src/pages/Signup.tsx, src/pages/AuthCallback.tsx`
- **[HIGH]** Zero component-rendering tests despite @testing-library/react and jsdom being installed — `package.json:23,32 (devDependencies), all files under src/pages/**, src/components/**`
- **[HIGH]** useGateControl has zero tests and contains a fail-open bug in the gate-completion check — `src/hooks/useGateControl.ts:50-53 (checkPhaseWorksheetsComplete), no corresponding __tests__ file exists`
- **[HIGH]** No tests for admin/lead/buddy dashboard flows or the actual approve/reject review UI — `src/pages/AdminDashboard.tsx, src/pages/BuddyDashboard.tsx, src/pages/OnboardingLeadDashboard.tsx, src/pages/WorksheetReview.tsx, src/pages/PhaseReview.tsx, src/components/admin/AssignmentsTab.tsx, src/components/admin/PhasesReadyTab.tsx`
- **[HIGH]** No tests for RLS/authorization boundaries anywhere in the suite — `db/schema.sql, db/*fix_rls*.sql, src/components/ProtectedRoute.tsx, src/components/PhaseAccessGuard.tsx — no test file references any of these`
- **[HIGH]** README.md is 100% stock Vite boilerplate — zero project-specific setup instructions — `README.md:1-17`
- **[HIGH]** TYPESCRIPT_MIGRATION_EXECUTION.md is actively false — describes a migration as not-started when it is ~99% complete — `TYPESCRIPT_MIGRATION_EXECUTION.md:1-40 (checklist items 8.1-10.10, all unchecked)`

## 8. Refuted findings (dropped after adversarial verification)

These were reported by an auditor but a skeptic agent refuted them against the code. Documented for transparency:

- **BuddyGatePass load has no try/catch — unhandled rejection leaves the page stuck on the loading skeleton forever** — Code matches lines 39-50 exactly, but the core claim (unhandled rejection → stuck forever on skeleton) is false: supabase-js's PostgrestBuilder.then() only throws when .throwOnError() is explicitly called (not used here); by default all failures (network, RLS denial, .single() 0/N-row errors) resolve as {data: null, error} rather than rejecting, so the unconditional `setLoading(false)` on the next line always runs. The render path even degrades gracefully via `joinee?.full_name || userId` (line 98) and `{joinee && ...}` (line 103), so a failed fetch just shows the userId instead of the name — not an infinite skeleton. The real (much smaller) gap is that `error` is silently discarded with no user-facing error state, which is a minor UX nit, not a HIGH-severity stuck-page bug.
- **PHASE_WORKSHEETS_MAP circular dependency permanently locks Phase 2 and Phase 3 for every user** — Refuted: PHASE_WORKSHEETS_MAP[1] does include p2_w1..p2_w4/p3_w1/p3_w5, but the finding's core premise — that /phase-2/worksheet-N is 'the only place' to fill these out — is false. Phase1.tsx (always-accessible, no guard) links to /week-2, /week-3, /week-4 worksheets via /week-N/worksheet/:worksheetId routes (App.tsx:144-147), which are wrapped only in ProtectedRoute, never PhaseAccessGuard. WeekWorksheetPage.tsx renders WORKSHEET_COMPONENTS[worksheetId], and worksheetConfig.tsx confirms p2_w1..p2_w4/p3_w1/p3_w5 map to the same components (Phase2Worksheet1-4, Phase3Worksheet1/5) writing the same worksheet_id — so users complete them via the open FTP-week flow, satisfying isPhaseApproved(1) with no deadlock.

---
*Generated by a 20-dimension multi-agent audit. Companion files: `AUDIT_FINDINGS_DETAIL.md` (all severities), `AUDIT_FIX_CHECKLIST.md` (prioritized remediation).*