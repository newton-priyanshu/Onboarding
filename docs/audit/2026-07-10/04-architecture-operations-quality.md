# Production Readiness Audit — Architecture, Operations & Quality

_Audit date: 2026-07-10 · Part of the [2026-07-10 audit](./README.md)_

## Architecture & Scalability — score 40/100

The SPA has decent surface-level organization (config modules, shared WorksheetPage abstraction, lazy-loaded reviewer routes) but a fundamentally two-tier architecture with no trusted server layer: the entire review state machine, role promotion, gating, and notification fan-out execute in the browser against permissive RLS. There is no data-access layer (25+ inline supabase queries), worksheet definitions are triple-duplicated, dashboards use unordered limit(500) full-table fetches that break at ~14 concurrent hires, and the DB schema is 17 uncoordinated SQL files with no migration tooling. Scales neither in load nor in code-size without a service/RPC tier and a query layer.

**Done well:** Worksheet pages are declarative wrappers around a shared WorksheetPage component (e.g. src/pages/worksheets/Phase1Worksheet2.tsx) rather than 24 copy-pasted forms · Route-level code splitting: admin/buddy/review pages lazy-loaded with Suspense (src/App.tsx:26-31), plus per-route ErrorBoundary reset (App.tsx:97) · Central config layer exists: worksheetConfigData.ts holds ALL_WORKSHEETS, reviewer maps, phase-gating helpers, and dynamic routes are generated from it (App.tsx:76-94) · src/constants/status.ts is a well-documented single source for status strings, and hooks (useAutoSave, useGateControl, useWorksheet) do import it · src/api/supabase.ts throw-proxy gives clear runtime errors when env vars are missing instead of undefined-method crashes

### C11 — Entire review/promotion state machine runs in the untrusted browser with no server enforcement

**Severity:** Critical _(adversarially verified: CONFIRMED)_

**Location:** src/hooks/useAutoPromote.ts:61-71, src/hooks/useAutoSave.ts:88-95, src/pages/WorksheetReview.tsx:124/192, src/pages/PhaseReview.tsx:109, db/schema.sql:354-364

**Description:** All state transitions (pending_review->buddy_approved->approved, needs_revision, revision_submitted) are computed and written client-side. useAutoPromote updates the user's OWN user_profiles.role to lead_instructor and writes auth user_metadata role (lines 69-71), which get_user_role() (schema.sql:329-331) trusts. The RLS WITH CHECK for own-row updates only enumerates allowed values — 'approved' included — with no transition-order enforcement.

**Why it is a problem:** Any new hire can set their own review_status='approved' via a direct PostgREST call, skip all reviews, and (via user_metadata role) satisfy reviewer RLS checks. Business rules cannot be trusted; every future feature inherits this broken trust boundary.

**Steps to reproduce:** As a new_joinee, run supabase.from('worksheet_submissions').update({review_status:'approved'}).eq('user_id', myId) from the console — passes WITH CHECK at db/schema.sql:358-364.

**Expected behavior:** Transitions and role changes only via server-validated RPC/trigger.

**Current behavior:** Client writes any review_status; own-role update + user_metadata role writable from browser.

**Root cause:** No server tier was ever designed; supabase-js is called directly from components with RLS as the only (value-level, not transition-level) guard.

**Suggested fix:** Move transitions and promotion into Postgres: SECURITY DEFINER RPCs (approve_worksheet, promote_user) plus a trigger validating review_status transitions against the old row; make get_user_role() read app_metadata only. Client becomes a thin caller.

> Verifier evidence: useAutoPromote.ts:61-71 writes role client-side; schema.sql:328-331 get_user_role() falls back to client-writable user_metadata; schema.sql:358-363 WITH CHECK allows 'approved' with no ordering. Worse: schema.sql:336/351-352 DROP POLICY names ("Users can update own profile/submissions") don't match originals ("Update own profile":63, "Update own submissions":185, no WITH CHECK), so old permissive policies survive and OR-bypass 9b/9c entirely.

### H34 — Admin/Lead dashboards fetch the whole worksheet_submissions table with unordered limit(500) — silently wrong beyond ~14 hires

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** src/pages/AdminDashboard.tsx:83, src/pages/OnboardingLeadDashboard.tsx:55

**Description:** Both dashboards run supabase.from('worksheet_submissions').select(...).limit(500) with no .order(), no user filter, no pagination. A hire generates ~35 rows (17 phase sheets + gates + 18 FTP sheets), so the 500-row cap is hit at roughly 14 active hires, and without ORDER BY Postgres returns an arbitrary subset.

**Why it is a problem:** Progress stats, pending-review queues, and phase-completion indicators become nondeterministically incomplete exactly when the program scales past one cohort — approvals appear missing, reviewers miss submissions. No error is surfaced.

**Steps to reproduce:** Seed 20 hires with full submissions; AdminDashboard shows differing progress counts across refreshes.

**Expected behavior:** Scoped, ordered, paginated or aggregated queries.

**Current behavior:** Unordered global limit(500) scan per dashboard load.

**Suggested fix:** Filter server-side (e.g. .in('user_id', visibleHireIds)), select only needed columns, add .order('updated_at') plus keyset pagination, or replace with an aggregating Postgres view/RPC returning per-user rollups.

> Verifier evidence: AdminDashboard.tsx:83 and OnboardingLeadDashboard.tsx:55 both run limit(500) with no order/filter/pagination; worksheetConfigData.ts:399,565 shows ~40 unique sheets+gates per hire, so cap hits at ~12 hires — cumulative, since past hires' rows are never filtered. BuddyDashboard.tsx:72 shows the correct filtered/ordered pattern exists elsewhere.

### H35 — No data-access layer: 25+ inline supabase.from() call sites across 15 pages/components

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** src/api/supabase.ts (client only), e.g. src/pages/PhaseReview.tsx:71-72, WorksheetReview.tsx:84-85, BuddyDashboard.tsx:64-72, Week1-4.tsx:23-26, components/PhaseAccessGuard.tsx:63, components/admin/AssignmentsTab.tsx:76

**Description:** src/api contains only the client singleton; queries, error handling, and caching are hand-rolled per page. utils/queryCache.ts (81 lines) is used by just 3 dashboards with manual prefix invalidation (AdminDashboard.tsx:211); everything else refetches on every mount. The same worksheet_submissions-by-user query is reimplemented at least 8 times with different column lists.

**Why it is a problem:** Schema changes fan out across ~15 files; no consistent staleness/retry/error policy; components are untestable without mocking the global client; each guard/page navigation issues redundant network calls.

**Root cause:** Organic growth: hooks were added for worksheet editing, but reviewer/dashboard pages bypassed them.

**Suggested fix:** Introduce a repository layer (src/api/submissions.ts, profiles.ts, notifications.ts) wrapped by React Query (or extend queryCache) so pages consume typed hooks; forbid supabase imports outside src/api via an ESLint restriction.

> Verifier evidence: src/api holds only supabase.ts; 53 raw .from() sites in 18 files (claim said 25+). worksheet_submissions-by-user duplicated 11x with varying columns (Week1-3.tsx:23, Phase2.tsx:75, PhaseReview.tsx:72, WorksheetReview.tsx:84, guards). queryCache.ts = 81 lines, used only by 3 dashboards; AdminDashboard.tsx:211 invalidateCacheByPrefix('admin-'). errorHandling.ts is toast-only, no retry/staleness policy.

### M59 — Worksheet field definitions triple-duplicated with manual-sync warning baked in

**Severity:** Medium

**Location:** src/pages/worksheets/* (24 files, defaultData/requiredFields), src/config/worksheetConfigData.ts:509-583 (ALL_WORKSHEETS/maps), src/components/ReviewContent.tsx:380 (FIELD_SECTIONS) and :818

**Description:** Each worksheet's fields exist in three places: the page component's defaultData, the config metadata maps (ALL_WORKSHEETS, WORKSHEET_REVIEWER, PHASE_WORKSHEETS_MAP, WSID_* maps), and ReviewContent's FIELD_SECTIONS for reviewer rendering. ReviewContent.tsx:818 literally emits a runtime message telling developers to 'Update FIELD_SECTIONS in ReviewContent.tsx' when fields are unmapped — drift is an acknowledged, expected failure mode.

**Why it is a problem:** Adding or changing one worksheet touches 5+ files across pages/config/components; missed sync silently renders reviewer views with unlabeled or missing fields, corrupting the review process. ReviewContent is already 1,043 lines and grows with every worksheet.

**Suggested fix:** Make worksheetConfigData the single schema source: define fields (key, label, type, section, required) per worksheet once; generate defaultData, requiredFields, and reviewer sections from it. Delete FIELD_SECTIONS.

**Example implementation:**

```
const P1_W2 = defineWorksheet({id:'p1_w2', fields:[{key:'mentorName', label:'Mentor Name', required:true}, ...]}) → derives defaultData, requiredFields, review sections.
```

### M60 — Review-status string literals hardcoded in 8+ files despite an existing constants module

**Severity:** Medium

**Location:** src/pages/WorksheetReview.tsx (17 literals), BuddyDashboard.tsx (13), AdminDashboard.tsx (12), PhaseReview.tsx (4), OnboardingLeadDashboard.tsx (3), Dashboard.tsx (4), useGateControl.ts (5), config/worksheetComponents.tsx (5)

**Description:** src/constants/status.ts declares 'Every file that reads or writes status ... should import from here', and hooks mostly comply, but the five reviewer/dashboard pages — the heaviest state-machine writers — use raw 'pending_review'/'buddy_approved'/'needs_revision'/'revision_submitted' strings (~60 occurrences verified via grep). SUBMISSION_STATUS itself encodes mixed casing ('In Progress' vs 'submitted') that these literals must reproduce exactly.

**Why it is a problem:** A single typo or casing slip in any writer corrupts the state machine silently (DB CHECK permits all enumerated values); refactoring status values requires auditing ~16 files; the constants module gives false confidence.

**Suggested fix:** Sweep all literals to REVIEW_STATUS/SUBMISSION_STATUS imports, type columns as unions derived from the constants (typeof REVIEW_STATUS[keyof ...]), and add an ESLint no-restricted-syntax rule banning the raw strings.

### M61 — Database schema managed as 17 overlapping SQL files with no migration tooling

**Severity:** Medium

**Location:** db/ (schema.sql, __fix_rls_jwt.sql, __fix_rls_recursion.sql, setup_correct.sql, supabase_schema.sql, seed files, etc.), repo root supabase_migration_fix_rls_security.sql and supabase_migration_add_buddy_approved.sql; no supabase/migrations directory

**Description:** Canonical schema.sql coexists with fix/setup/seed scripts in db/ and two migration files at repo root; nothing defines application order or tracks what the live database actually has. Internal contradictions already exist (schema.sql:206 comment says onboarding_lead is read-only; policy at :366-374 grants it UPDATE).

**Why it is a problem:** Impossible to reproduce the production database or verify that critical RLS hardening (the WITH CHECK policies) was ever applied; new environments and new developers are guesswork; drift between code assumptions and live schema is undetectable in CI.

**Suggested fix:** Adopt supabase CLI migrations: baseline current live schema as migration 0001, move fixes into ordered migrations, delete superseded files, and run 'supabase db lint/diff' in CI.

### M62 — Notification fan-out is client-side sequential inserts from the acting user's browser

**Severity:** Medium

**Location:** src/hooks/useNotifications.ts:150-165 (triggerNotification), src/hooks/useAutoPromote.ts:87-96 (per-manager await loop), src/context/AuthContext.tsx:193-200 (signup notifies all managers+leads in a loop)

**Description:** Every workflow event inserts notification rows one-by-one from the browser, awaiting each. Recipient lists are fetched client-side (getReviewerUserIds selects all profiles with a role). Errors are swallowed with console.error; closing the tab mid-loop leaves partial fan-out; there is no outbox, dedupe, or retry.

**Why it is a problem:** O(recipients) round trips per event grows with staff count; notifications silently go missing (reviewers never see a submission); the pattern cannot support future channels (email) without a server anyway.

**Suggested fix:** Replace with an AFTER UPDATE trigger on worksheet_submissions (and on user_profiles for signup/promotion) that inserts notifications transactionally, or a single Edge Function endpoint; client stops writing to notifications for others entirely.

### M63 — Phase/week gating is advisory client-side re-fetching, and Week/Phase pages are copy-paste quadruplicates

**Severity:** Medium

**Location:** src/components/PhaseAccessGuard.tsx:63, src/components/WeekAccessGuard.tsx:86, src/pages/Week1-4.tsx (4.3-4.4KB near-identical, differ by weekNum), src/pages/Phase2.tsx:75 vs Phase3.tsx:76

**Description:** PhaseAccessGuard/WeekAccessGuard each query worksheet_submissions on every mount to decide access, but RLS lets a hire upsert any of their worksheet rows regardless of phase (useAutoSave upsert path), so gates only hide UI. Week1-4.tsx and Phase2/Phase3 pages duplicate the same fetch-and-render logic per number instead of a parameterized route (/week/:n), even though WeekWorksheetPage already demonstrates the parameterized pattern.

**Why it is a problem:** Gate bypass via direct API writes undermines the program's sequencing guarantees; four-way duplication means every gating or layout fix must be applied 4x (drift already likely), and each guarded navigation adds a redundant query.

**Suggested fix:** Parameterize to /week/:weekNum and /phase/:phaseNum single components; enforce gating in the DB (insert/update policy or trigger checking prior-phase approval); cache the access decision per session instead of per mount.

### L27 — Live Supabase credentials committed: .env is git-tracked and not ignored

**Severity:** Low _(adversarially verified: DOWNGRADED to this severity)_

**Location:** .env (git-tracked, confirmed via git ls-files), .gitignore (no .env entry)

**Description:** .env containing VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY for project fuoqoryqndtdooujslee is tracked in git; .gitignore lists only *.local. There is exactly one environment — no dev/staging/prod separation, and CI (.github/workflows/ci.yml) has no env injection, so builds implicitly use the committed production credentials.

**Why it is a problem:** Anyone with repo access gets the production endpoint; no way to point CI/preview at a non-prod project; key rotation requires a commit. Environment config is unmanageable as the team or environment count grows.

**Expected behavior:** Only .env.example tracked; per-environment secrets injected at build time.

**Current behavior:** .env in version control with real project credentials.

**Suggested fix:** Add .env to .gitignore, git rm --cached .env, rotate the key, keep only .env.example; inject env via Vercel/GitHub Actions secrets per environment.

> Verifier evidence: .env:2 key is sb_publishable_* — a Supabase publishable key, public by design and shipped in the client bundle anyway; no secret key present. Facts confirmed (.env in git ls-files, .gitignore only *.local, ci.yml has no env injection), but impact is env-config hygiene, not credential exposure; Vite env vars can already override .env in CI.

### L28 — Three conflicting authorities for role assignment

**Severity:** Low _(adversarially verified: DOWNGRADED to this severity)_

**Location:** src/context/AuthContext.tsx:184-190 (signUp inserts caller-chosen role) and :103 (createProfileFromAuth trusts user_metadata role), db/schema.sql:377-403 (trigger forces new_joinee), db/schema.sql:338-348 (RLS blocks self role change), src/hooks/useAutoPromote.ts:61-71

**Description:** Signup lets the client insert any role; the DB handle_new_user trigger forces new_joinee; the hardened own-profile RLS blocks self role changes unless get_user_role() is academic_head — yet useAutoPromote has the promoted user update their own role. These three mechanisms contradict each other: either promotion silently fails against the policy, or succeeds only via the client-writable user_metadata backdoor.

**Why it is a problem:** The flagship auto-promotion feature is architecturally unreliable (depends on which SQL file was actually applied), and role integrity depends on which of three code paths ran. Debugging role bugs requires reading client, trigger, and policy simultaneously.

**Expected behavior:** One server-side function owns all role transitions.

**Current behavior:** Client, trigger, and RLS each partially own role assignment with contradictory rules.

**Suggested fix:** Single authority: a promote_to_buddy() SECURITY DEFINER RPC (invoked by the manager's final approval, not the joinee's client) that updates role and app_metadata via a service context; remove role from the signup payload and from client updates.

> Verifier evidence: checkAndPromote's sole caller is PhaseReview.tsx:157, gated by isManager (role==='academic_head', :56,:180); schema.sql:75-79 "Admin update profiles" and the academic_head exemption at :346 permit that update, so promotion cannot fail as claimed. Signup.tsx:31 hardcodes 'new_joinee', matching trigger (:393) and fallback (AuthContext.tsx:103). Only a redundant-writer maintainability smell remains.

### L29 — Dead 'progressUpdate' event bus feeds the Navbar progress bar stale data

**Severity:** Low

**Location:** src/App.tsx:157-171 (listener + localStorage), src/components/Navbar.tsx:289-303 (renders progress); zero dispatchEvent calls in src (verified by grep); duplicated footer line App.tsx:194-195

**Description:** App.tsx listens for a window CustomEvent 'progressUpdate' and persists it to localStorage, but nothing in src ever dispatches it — the Navbar progress percentage only ever shows whatever a previous build wrote to localStorage, never updating in-session. The footer also renders 'Faculty Onboarding Programme' twice (App.tsx:194-195).

**Why it is a problem:** Users see a frozen or wrong progress figure in the global nav; the ad-hoc window-event state channel bypasses React data flow and will confuse future maintainers into 'fixing' it by dispatching events instead of deleting it.

**Suggested fix:** Delete the event/localStorage plumbing; derive progress in Navbar from the same submissions source Dashboard uses (via a shared hook/context), and remove the duplicated footer line.

## Performance — score 64/100

The app has decent baseline hygiene — lazy-loaded admin routes, Promise.all fan-out, a TTL query cache, debounced autosave, and DB indexes — but the initial bundle is a single 768 kB (197 kB gzip) chunk because all 40 worksheet/gate components are statically imported into the route table. Data-layer patterns that are fine at 5 users degrade at scale: dashboards fetch the entire worksheet_submissions table (capped at 500 rows) including JSONB history, every session polls notifications every 15 s even in hidden tabs, and phase approval issues serial round trips per worksheet. Fixable in a few focused days; nothing is architecturally broken.

**Done well:** Admin/buddy/review pages are code-split via React.lazy + Suspense (src/App.tsx:26-31), producing separate chunks (AdminDashboard 20 kB, ReviewContent 30 kB, etc. in build output) · Dashboards parallelize queries with Promise.all and mostly project explicit columns instead of select(*) (src/pages/AdminDashboard.tsx:77-88, BuddyDashboard.tsx:63-72, OnboardingLeadDashboard.tsx:49-55) · A working TTL query cache with key/prefix invalidation is used by all three reviewer dashboards (src/utils/queryCache.ts, invalidateCacheByPrefix after mutations) · Autosave is debounced at 1.5 s with timer cleanup and bounded retry/backoff (src/hooks/useAutoSave.ts:191-203, 172-186); notification polling cleans up its interval on unmount (src/hooks/useNotifications.ts:95-98) · DB indexes cover the hot query paths: worksheet_submissions(user_id), (user_id,worksheet_id), notifications(user_id), user_profiles role/lead/buddy (db/schema.sql:228-236, 410-414); public/ assets are small (largest 44 kB logo.png)

### H36 — Admin/Lead dashboards fetch the entire worksheet_submissions table with a hard 500-row cap and JSONB payloads

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** src/pages/AdminDashboard.tsx:82-84, src/pages/OnboardingLeadDashboard.tsx:54-55, src/pages/BuddyDashboard.tsx:71-72

**Description:** AdminDashboard and OnboardingLeadDashboard load worksheet_submissions with no user filter, .limit(500), and (Admin/Buddy) include the review_history JSONB column in a list query. Each hire produces up to 37 rows (17 phase + FTP sheets), so 500 rows ≈ 13-29 hires before silent truncation. review_history grows with every review action, multiplying payload size on a dashboard that renders only status chips.

**Why it is a problem:** At ~15+ concurrent hires the admin dashboard silently drops submissions (hires appear 'not started'), and before that it transfers hundreds of KB of unused JSONB per load (and per 30 s cache expiry). Query time and payload grow linearly with total org history.

**Steps to reproduce:** Seed 30 new_joinee users with 17 submissions each (510 rows); open /admin — the last hire(s) show zero progress because rows past 500 are never fetched.

**Expected behavior:** Filtered, paginated, projection-only query (or aggregate view) whose cost is bounded by what the screen displays

**Current behavior:** select('user_id, worksheet_id, review_status, status, updated_at, review_history').limit(500) with no user filter

**Root cause:** Client-side aggregation of a whole table instead of filtered/paginated queries or a server-side view; review_history selected but only status fields rendered in list view.

**Suggested fix:** Drop review_history from list queries (fetch it lazily per-worksheet), filter by the displayed hires' user_ids (already known from the instructors query), and paginate or use a Postgres view/RPC that returns per-user status counts.

> Verifier evidence: AdminDashboard.tsx:83 selects review_history with no user filter, no order, limit(500); review_history never read in that file. ~39 worksheet IDs/hire (worksheetConfigData.ts:565,399). No order means arbitrary rows dropped once total org history exceeds 500, and it counts all hires ever, not just concurrent — slightly worse than claimed.

### M64 — Monolithic 768 kB initial bundle: all 40 worksheet/gate components eagerly imported

**Severity:** Medium _(adversarially verified: DOWNGRADED to this severity)_

**Location:** src/config/worksheetConfig.tsx:38-79 (static imports), src/App.tsx:33 (static import of config); build output dist/assets/index-C313OXve.js 767.85 kB / 196.84 kB gzip

**Description:** worksheetConfig.tsx statically imports all 17 phase worksheets, 3 gate controls, 16 FTP worksheets, and 4 gate artifacts (~280 kB of source) into WORKSHEET_COMPONENTS, and App.tsx imports it at module top level. Verified by build: everything lands in one 767.85 kB chunk; no per-worksheet chunks exist. Vite's own 500 kB warning fires. There is also no manualChunks vendor split, so react-dom + supabase-js + router + app code invalidate together on every deploy.

**Why it is a problem:** Every visitor — including the /login page and admins who can never open a worksheet — downloads and parses ~197 kB gzip / 768 kB raw JS before first paint. On mid-range mobile this is roughly 1-2 s of extra parse/compile. Any one-line app change busts the entire cached bundle.

**Expected behavior:** Initial chunk under ~250 kB raw; worksheet pages loaded on demand; stable vendor chunk across deploys

**Current behavior:** Single index chunk 767.85 kB (196.84 kB gzip) containing react-dom, supabase-js, router, and all 40 worksheet pages

**Root cause:** WORKSHEET_COMPONENTS built from static imports so route generation stays synchronous; no lazy() wrapper per worksheet and no build.rollupOptions manualChunks.

**Suggested fix:** Convert WORKSHEET_COMPONENTS to lazy components (Record<string, LazyExoticComponent>) and wrap the generated routes in the existing Suspense fallback; add a vendor manualChunks split (react/react-dom/router vs @supabase/supabase-js) in vite.config.js.

**Example implementation:**

```
export const WORKSHEET_COMPONENTS = { p1_w1: lazy(() => import('../pages/worksheets/Phase1Worksheet1')), ... };
// App.tsx route element: <Suspense fallback={<PageFallback/>}><Component/></Suspense>
```

> Verifier evidence: worksheetConfig.tsx:38-79 statically imports all 40 components; App.tsx:33 imports it eagerly; dist/assets/index-C313OXve.js is 749.9 KiB; vite.config.js has no manualChunks. But worksheet source is ~187 kB not 280 kB, heavy dashboards are already lazy (App.tsx:26-31), and ~197 kB gzip is near-median — perf smell, not High-severity risk.

### M65 — Notifications polled every 15 s per session with no realtime channel, backoff, or hidden-tab pause

**Severity:** Medium

**Location:** src/hooks/useNotifications.ts:49 (pollInterval=15000), :93 (setInterval); consumer src/components/NotificationBell.tsx:46 (mounted in Navbar on every page); grep confirms zero visibilitychange/document.hidden usage in src/

**Description:** Every authenticated session runs a 15 s setInterval hitting notifications (order by created_at, limit 50) forever, including backgrounded tabs and idle sessions. Supabase realtime is available (realtime client is verified present in the bundle) but unused. Each poll also calls setNotifications with a fresh array, re-rendering NotificationBell every 15 s even when nothing changed.

**Why it is a problem:** 240 requests/hour per open tab. With 50 concurrent users that is ~12k queries/hour of mostly-identical reads against Postgres — meaningful load on a Supabase free/small tier and wasted mobile battery/data. Latency of notification delivery is still up to 15 s.

**Expected behavior:** Push-based updates or visibility-gated polling with change detection

**Current behavior:** Unconditional 15 s polling in all tabs for the lifetime of the session

**Root cause:** Polling chosen over supabase.channel() postgres_changes subscription; no Page Visibility API integration.

**Suggested fix:** Subscribe to postgres_changes on notifications filtered by user_id and drop the interval, or as a cheap fix: pause polling when document.hidden, raise interval to 60 s, and skip setState when the newest id and unread count are unchanged.

**Example implementation:**

```
supabase.channel('notif:'+u.id).on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:`user_id=eq.${u.id}`},fetchNotifications).subscribe()
```

### M66 — Phase approval issues serial UPDATE + notification round trips per worksheet

**Severity:** Medium

**Location:** src/pages/PhaseReview.tsx:106-134 (for..of with two awaits per sheet), :141-154 (serial buddy notifications), then checkAndPromote at :157 adds more serial awaits (src/hooks/useAutoPromote.ts:88-96 serial manager notifications)

**Description:** handleApprovePhase loops over up to 8 buddy_approved worksheets, awaiting an UPDATE then a notification INSERT for each — ~16 sequential round trips — followed by serial buddy notifications and the auto-promote check's own serial manager-notification loop. useAutoSave has the same serial-notification pattern (useAutoSave.ts:148-156).

**Why it is a problem:** With ~100 ms RTT to Supabase, approving Phase 1 blocks the button spinner for 2-3+ s and multiplies partial-failure windows (some sheets approved, some not, mid-loop). Latency scales linearly with worksheets per phase and reviewers notified.

**Expected behavior:** 1-3 round trips (bulk update + batched notification insert)

**Current behavior:** Up to ~20 sequential network round trips per phase approval click

**Root cause:** Sequential await-in-loop instead of batched update or parallel dispatch; per-row review_history append forces per-row updates client-side.

**Suggested fix:** Batch: single .update().in('id', ids) where fields are identical, or Promise.allSettled over the per-row updates; fire notifications with Promise.allSettled. Longer term, move phase approval into one Postgres RPC that updates rows and inserts notifications atomically.

**Example implementation:**

```
await Promise.allSettled(toApprove.map(sub => approveOne(sub))); await Promise.allSettled(buddyIds.map(id => triggerNotification({...})))
```

### M67 — Every debounced autosave performs an extra SELECT whose result is discarded

**Severity:** Medium

**Location:** src/hooks/useAutoSave.ts:70-84 (conflict pre-read), :123 (upsert)

**Description:** On every save (fires 1.5 s after each edit pause, i.e. potentially dozens of times per worksheet session), save() first SELECTs updated_at for conflict detection, logs a console.warn if it differs, then upserts anyway ('last-write-wins'). The pre-read changes no behavior — it only doubles the write path's queries and latency.

**Why it is a problem:** 2x round trips and 2x DB queries on the app's hottest write path (all 40 worksheet forms autosave through this). Under slow networks the save spinner lingers twice as long; under concurrent editing it still silently overwrites, so the cost buys nothing.

**Expected behavior:** Single round trip per autosave; conflicts either genuinely handled or not queried for

**Current behavior:** SELECT updated_at → warn → unconditional upsert on every autosave

**Root cause:** Half-implemented optimistic-concurrency check: detection wired up, resolution never implemented.

**Suggested fix:** Either delete the pre-read, or make it useful and free: perform a conditional UPDATE guarded by .eq('updated_at', savedAt) and surface a real conflict UI when 0 rows match (single round trip either way).

### L30 — PhaseAccessGuard/WeekAccessGuard re-query all submissions on every guarded navigation and on user object identity change

**Severity:** Low

**Location:** src/components/PhaseAccessGuard.tsx:56-74 (query, deps [user, phaseNum]), src/components/WeekAccessGuard.tsx:65-86 (same pattern)

**Description:** Every navigation to a Phase 2/3 or Week 2+ worksheet mounts the guard, which fetches the user's full worksheet_submissions list and blocks render with a 'Loading…' screen until it resolves. It ignores the existing queryCache, and its effect depends on the user object reference, so any AuthContext state change (e.g. token refresh event) re-triggers the fetch.

**Why it is a problem:** A hire clicking through the 4 Phase 2 worksheets pays 4 identical queries and 4 blocking loading flashes in under a minute. Adds one full RTT to every guarded page's time-to-content.

**Expected behavior:** Cached access decision reused across navigations within a short TTL

**Current behavior:** Fresh blocking query per guarded route mount

**Root cause:** Per-mount fetch with no caching and an unstable object dependency instead of user.id.

**Suggested fix:** Use fetchWithCache(`phase-access-${user.id}`, ..., {ttl: 30_000}) and invalidate on submission approval; depend on user?.id instead of user; render children optimistically for already-verified phases within the session.

### L31 — select('*') on review pages pulls full rows including unneeded columns

**Severity:** Low

**Location:** src/pages/PhaseReview.tsx:71 (user_profiles '*'), src/pages/WorksheetReview.tsx:84-85 (both queries '*'), src/hooks/useAutoSave.ts:223-228 (loadWorksheetData '*')

**Description:** PhaseReview legitimately needs worksheet_data (rendered via ReviewContent at PhaseReview.tsx:347), but user_profiles select('*') pulls every profile column for a header that shows name/email, and loadWorksheetData's select('*') — the loader behind all 40 worksheet forms — pulls review_history and metadata whether or not the form displays them. review_history grows unboundedly (appended on every review action, schema JSONB).

**Why it is a problem:** Payload on the most-visited pages (worksheet forms) grows with review churn; a heavily-revised worksheet ships its whole audit trail on every open. Modest today, compounding over time.

**Expected behavior:** Column projections matching what each screen renders

**Current behavior:** Full-row fetches including unbounded review_history JSONB on the worksheet-open hot path

**Root cause:** Convenience select('*') instead of column projection on JSONB-bearing tables.

**Suggested fix:** Project explicit columns: loadWorksheetData needs worksheet_data, review_status, review_comment, reviewer_name, reviewed_at, updated_at (add review_history only where the history panel renders); user_profiles queries need id, full_name, email, role.

### L32 — No vendor chunk splitting or bundle-size guard in CI

**Severity:** Low

**Location:** vite.config.js:17-25 (build block has no rollupOptions/manualChunks), .github/workflows/ci.yml (runs vite build but asserts nothing about output size)

**Description:** Beyond the eager worksheet imports (finding 1), react-dom, react-router-dom 7, and @supabase/supabase-js (gotrue+postgrest+realtime all verified in the chunk) share the app chunk. CI builds but never fails on size regressions — the 500 kB warning is already firing unnoticed in every build.

**Why it is a problem:** Every deploy invalidates the full 197 kB gzip download for returning users even when only app code changed; future dependency additions will silently inflate the bundle.

**Expected behavior:** Stable cached vendor chunks and a CI budget that fails on regressions

**Current behavior:** One app+vendor chunk, unmonitored growth

**Root cause:** Default single-chunk rolldown output; no size budget enforcement.

**Suggested fix:** Add manualChunks ({vendor-react: ['react','react-dom','react-router-dom'], vendor-supabase: ['@supabase/supabase-js']}) and a CI size check (e.g. size-limit or a simple stat assertion on dist/assets/*.js).

## Deployment Readiness — score 54/100

Build and CI fundamentals are solid: `npm run build` (tsc + vite) passes, all 158 vitest tests pass, and CI gates typecheck/lint/test/build on main. But deployment hygiene is weak: the live Supabase .env is committed to git with no .gitignore entry, there is exactly one environment (seed/admin scripts with published 'Test123!' passwords point at the same production project), vercel.json ships zero security or caching headers, and there is no error monitoring — production errors vanish into the console with sourcemaps disabled.

**Done well:** CI (.github/workflows/ci.yml:23-33) gates typecheck, eslint, vitest, and vite build on push/PR to main; all pass locally (158/158 tests, build in ~0.8s) · vercel.json SPA rewrite is correct for a client-routed app; Vercel filesystem-first serving keeps /assets and manifest.json working · src/api/supabase.ts:32-56 validates env at startup with a clear throwing proxy instead of silent undefined crashes; .env.example documents both required vars and warns against service_role exposure · No console.log in shipped src (only 31 console.error / 5 console.warn on error paths); sourcemaps off so source is not exposed · Route-level ErrorBoundary (App.tsx:97) that resets on navigation; engines pinned node>=20 matching CI's node 20; dist/ correctly gitignored

### H37 — No environment separation: seed/admin scripts with published password target the production Supabase project

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** scripts/setup/create-admin.cjs:16 (password = 'Test123!'), __seed_30_users.cjs:17, scripts/e2e-full-flow.mjs:48; all read VITE_SUPABASE_URL from the committed .env

**Description:** There is exactly one Supabase project for dev, e2e, seeding, and production. Tracked scripts create users — including an academic_head admin (create-admin.cjs) — with the hardcoded password 'Test123!' that is printed in the repo, against whatever .env points to (currently the prod project).

**Why it is a problem:** Running any seed/e2e script pollutes production data and plants admin accounts with a publicly known password. There is no staging target to rehearse deploys or migrations against; db/ migration drift (root supabase_migration_*.sql vs db/schema.sql) cannot be validated before hitting prod.

**Steps to reproduce:** node scripts/setup/create-admin.cjs with the repo's .env creates an academic_head user with password Test123! in the production project

**Root cause:** Single Supabase project reused for all purposes; scripts default to the committed prod .env.

**Suggested fix:** Create a separate staging Supabase project; make scripts require an explicit SUPABASE_URL/key argument or a .env.staging file and refuse to run against the production URL; delete or rotate any 'Test123!' accounts already in the prod project.

> Verifier evidence: .env is git-tracked with one Supabase URL (git ls-files); 'Test123!' hardcoded at create-admin.cjs:16, __seed_30_users.cjs:17, e2e-full-flow.mjs:48; repo newton-priyanshu/Onboarding is PUBLIC. Minor: create-admin.cjs:18 makes 'onboarding_lead' (still admin per db/schema.sql:370), not academic_head; db/schema.sql:393 trigger may force new_joinee if applied — unverifiable due to migration drift.

### M68 — vercel.json ships no security headers and no immutable caching for hashed assets

**Severity:** Medium

**Location:** vercel.json:1-5 (entire file is one SPA rewrite)

**Description:** The Vercel config contains only the catch-all rewrite. No Content-Security-Policy, X-Frame-Options/frame-ancestors, X-Content-Type-Options, Referrer-Policy, or HSTS; no Cache-Control: immutable for /assets/* even though Vite fingerprints filenames.

**Why it is a problem:** The app (auth tokens in localStorage, role-gated dashboards) is clickjackable and has no CSP mitigation against XSS exfiltration to arbitrary hosts. Hashed assets get Vercel's default revalidation caching instead of immutable, costing repeat-visit performance.

**Root cause:** Minimal vercel.json written for routing only; headers never configured.

**Suggested fix:** Add a headers block: immutable caching for /assets/(.*), plus security headers (CSP allowing self + fuoqoryqndtdooujslee.supabase.co + fonts.googleapis/gstatic, frame-ancestors 'none', nosniff, strict referrer).

**Example implementation:**

```
"headers": [{"source":"/assets/(.*)","headers":[{"key":"Cache-Control","value":"public, max-age=31536000, immutable"}]},{"source":"/(.*)","headers":[{"key":"X-Frame-Options","value":"DENY"},{"key":"X-Content-Type-Options","value":"nosniff"}]}]
```

### M69 — No production error monitoring; sourcemaps disabled with a contradictory comment

**Severity:** Medium

**Location:** src/components/ErrorBoundary.tsx:26-27 (console.error only); vite.config.js:17-18 (comment says 'Generate sourcemaps for production debugging' but sourcemap: false); no sentry/datadog/posthog/web-vitals anywhere in src (verified grep)

**Description:** ErrorBoundary catches render crashes but only console.errors them; the 31 console.error call sites across src are the entire observability story. sourcemap: false means even manual debugging of prod stack traces is against minified names, contradicting the config comment.

**Why it is a problem:** Production failures (RLS errors, failed submissions, auto-promote failures) are invisible to the team — users must report bugs manually. Minified, unsymbolicated stack traces make triage of reported issues slow. No uptime or health signal for the Supabase dependency.

**Root cause:** No error-tracking service was ever integrated; sourcemap comment copied without matching config ('hidden' was likely intended).

**Suggested fix:** Integrate Sentry (or similar) in main.tsx with the React ErrorBoundary hook, report from ErrorBoundary.componentDidCatch, and set sourcemap: 'hidden' with sourcemaps uploaded to the tracker rather than served to users.

**Example implementation:**

```
build: { sourcemap: 'hidden' } // + sentryVitePlugin({ sourcemaps: { filesToDeleteAfterUpload: 'dist/**/*.map' } })
```

### M70 — 768 KB main JS chunk exceeds the project's own 500 KB limit; worksheet pages not code-split

**Severity:** Medium

**Location:** Verified build output: dist/assets/index-C313OXve.js = 767.85 kB (196.84 kB gzip); vite.config.js:24 chunkSizeWarningLimit: 500; App.tsx:76-94 imports all 17+ worksheet pages eagerly via ALL_WORKSHEETS

**Description:** Every production build emits the rolldown oversized-chunk warning. Admin/buddy/review pages are lazy, but the main bundle still contains react, react-router, supabase-js, and every new-hire worksheet page eagerly, so the warning limit the project set for itself is permanently tripped.

**Why it is a problem:** ~200 KB gzip of JS on first paint for every role — a buddy or admin downloads all 17 worksheet pages they can never open. The always-firing warning trains developers to ignore build warnings, so a future genuine regression (e.g. accidental double-bundle) goes unnoticed.

**Steps to reproduce:** npm run build → '(!) Some chunks are larger than 500 kB after minification'

**Root cause:** Worksheet routes generated from worksheetConfig are statically imported; no manualChunks/advancedChunks vendor split configured.

**Suggested fix:** Lazy-load worksheet pages the same way admin pages are (React.lazy per ALL_WORKSHEETS entry) and add a vendor chunk split for react/react-dom/supabase-js; then the 500 KB limit becomes a real gate.

### M71 — CI does not gate deployment: Vercel git integration deploys on push regardless of CI outcome

**Severity:** Medium

**Location:** .github/workflows/ci.yml:1-33 (no deploy job, no concurrency, no environment/secrets); vercel.json (no ignoreCommand); no .vercel/ or deploy config in repo

**Description:** CI validates code but is decoupled from deployment. With standard Vercel git integration (the only deploy mechanism evidenced by vercel.json), a push to main deploys immediately even if the CI run fails, unless branch protection/required checks are configured in dashboards — nothing in the repo enforces it. CI also lacks concurrency cancellation and only runs on main pushes/PRs.

**Why it is a problem:** A red build (failing tests or even failing tsc) can go live: Vercel runs its own `vite build` (not `npm run build`), so the tsc --noEmit gate in package.json is bypassed at deploy time — type errors that fail CI can still produce a deployed bundle.

**Root cause:** Deploy pipeline was never wired to CI; Vercel's default build command skips the repo's tsc step.

**Suggested fix:** Either set Vercel's build command to `npm run build` and enable 'require checks to pass' branch protection on main, or move to a CI-driven deploy (vercel deploy --prebuilt in a job that needs: validate). Add `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`.

**Example implementation:**

```
# vercel.json
"buildCommand": "npm run build"
```

### L33 — Production .env with live Supabase credentials is committed to git; .gitignore does not exclude it

**Severity:** Low _(adversarially verified: DOWNGRADED to this severity)_

**Location:** .env:1-2 (tracked, confirmed via git ls-files); .gitignore (only *.local, no .env entry); first committed in 7e5ca88

**Description:** The tracked .env contains the real production project URL (fuoqoryqndtdooujslee.supabase.co) and sb_publishable_ key. .gitignore's only env pattern is *.local, so any future secret added to .env will also be committed.

**Why it is a problem:** Credentials live in git history forever — rotation requires a key rotation AND history rewrite. Every clone/fork points at production; the committed file also makes builds silently 'work' anywhere with prod config, defeating environment separation. If a service_role key is ever pasted into .env, it ships to the repo.

**Steps to reproduce:** git ls-files | grep '^\.env$' → prints .env; cat .env shows live URL + key

**Root cause:** Vite starter .gitignore was never extended with .env; credentials committed in the initial commit and never removed.

**Suggested fix:** Add `.env` and `.env.*` (keep !.env.example) to .gitignore, `git rm --cached .env`, rotate the publishable key in Supabase, and set VITE_ vars in Vercel project settings (Preview + Production) and GitHub Actions secrets instead.

**Example implementation:**

```
# .gitignore
.env
.env.*
!.env.example
```

> Verifier evidence: .env is tracked with real URL + sb_publishable_ key and .gitignore lacks a .env entry (only *.local), but src/api/supabase.ts:4-5 consumes it via VITE_ vars that Vite embeds in the public client bundle anyway; the anon/publishable key is public by design, no service_role usage exists, and .env.example warns against committing secrets.

### L34 — Dead GitHub Pages/Netlify deployment artifacts ship in the Vercel bundle

**Severity:** Low

**Location:** .nojekyll (tracked, root); public/404.html (meta-refresh to '/', writes sessionStorage.redirect which nothing in src/ or index.html ever reads — verified grep); public/_redirects (Netlify syntax)

**Description:** Three files from two previous hosting targets remain tracked and (for the public/ pair) are copied into every dist. The 404.html redirect trick is half-implemented: it saves the deep-link path to sessionStorage but no restore code exists, so if it were ever served the user's path is silently dropped.

**Why it is a problem:** Confuses future maintainers about the actual deploy target, and public/404.html can shadow platform 404 handling; on any accidental redeploy to GitHub Pages, all deep links would break silently instead of loudly.

**Root cause:** Hosting migrated GitHub Pages → (Netlify?) → Vercel without cleanup.

**Suggested fix:** Delete .nojekyll, public/404.html, and public/_redirects; rely solely on vercel.json rewrites.

### L35 — Render-blocking third-party Google Fonts and a PWA manifest with no service worker

**Severity:** Low

**Location:** index.html:11-13 (fonts.googleapis.com stylesheet, blocking); index.html:8 + public/manifest.json (display: standalone) with no service worker registration anywhere in src/ or index.html

**Description:** First paint depends on an external CDN with no fallback strategy, and the app advertises itself as installable (standalone manifest, icons) but has zero offline capability — an installed 'app' white-screens without network and its fonts stall on slow connections.

**Why it is a problem:** External CDN outage or corporate-network font blocking degrades every page load; installed-PWA users get a broken-feeling app offline. Minor, but it undermines the PWA effort just shipped in the rebrand commit.

**Root cause:** Manifest/icons added (scripts/generate-icons.mjs) without the service-worker half of the PWA; fonts left on CDN.

**Suggested fix:** Self-host the two font families as woff2 in public/ (removes CDN dependency and helps a future CSP), and either add a minimal service worker (vite-plugin-pwa) or drop display:standalone until offline support exists.

### L36 — Script-only packages (dotenv, ws) declared as production dependencies; version stuck at 0.0.0

**Severity:** Low

**Location:** package.json:21 (dotenv), :27 (ws), :4 (version 0.0.0); no usage of either in src/ (import.meta.env is Vite-native; ws/dotenv only used by node scripts)

**Description:** dotenv and ws are runtime dependencies of node-side scripts, not the shipped frontend, but sit in dependencies; tslib is likewise unused by the Vite bundle. version remains 0.0.0 with no release tagging, so deployed builds are not traceable to a version.

**Why it is a problem:** Inflates prod install surface and dependency-audit noise on every Vercel build; 0.0.0 versioning means incident triage cannot map a deployed bundle back to a tagged release.

**Root cause:** Script tooling deps added via plain `npm install`; no release process established.

**Suggested fix:** Move dotenv/ws (and tslib if unused) to devDependencies, and adopt tagged releases (even simple v0.x git tags) so Vercel deployments map to commits/versions.

## Testing — score 40/100

npm test passes: 158 tests in 10 files, ~2s, and CI (.github/workflows/ci.yml) runs typecheck, lint, tests, build on push/PR to main. However, all tests are node-env pure-function tests — zero component/DOM tests, zero tests for auth/authorization (AuthContext, ProtectedRoute, access guards), and the review state machine is tested only via derivation helpers, never the code that actually writes transitions (useAutoSave, WorksheetReview, PhaseReview). E2E exists only as a manual script that mutates the real Supabase project and requires pasting SQL into the dashboard. No coverage measurement or thresholds exist.

**Done well:** All 158 tests pass deterministically in ~2s with no network dependency; wired into CI (ci.yml runs npm test before build) · reviewFlow.test.ts (258 lines) meaningfully tests phase-readiness derivation: needs_revision, revision_submitted, approved-counts-as-buddy_approved, cross-user filtering, cross-phase independence · worksheetConfigData.test.ts (58 tests) and ReviewContent.test.ts do strong structural config validation: every worksheet has FIELD_SECTIONS, no orphans, no duplicate sections/fields, naming conventions · Logic was extracted into exported pure functions (checkAndPromote, calculateDueDate, getDueDateInfo, triggerNotification, getReviewerUserIds, loadWorksheetData) and tested including error paths · errorHandling and queryCache utilities have dedicated unit tests (11 and 16 tests)

### H38 — Zero tests for authentication and authorization layer

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** src/context/AuthContext.tsx (264 lines, no test file), src/components/ProtectedRoute.tsx (43 lines), src/components (PhaseAccessGuard/WeekAccessGuard); no src/context/__tests__ or src/pages/__tests__ directories exist

**Description:** hasRole() in AuthContext drives ALL client authorization, and AuthContext contains risky logic: JWT-metadata profile fallback, OAuth auto-profile creation, client-side signUp role insert. ProtectedRoute and the phase/week access guards gate every route. None of this has a single test.

**Why it is a problem:** A regression letting a new_joinee reach /admin, or breaking the OAuth profile-creation path, would ship silently through green CI. These are the highest-consequence code paths in the app.

**Steps to reproduce:** grep -rn 'AuthContext\|ProtectedRoute' src --include='*.test.*' returns nothing; only 10 test files exist, none render components.

**Suggested fix:** Add jsdom render tests: ProtectedRoute redirects unauthenticated to /login and wrong-role to /; PhaseAccessGuard blocks phase 2 until phase 1 approved; AuthContext signUp/OAuth fallback paths with mocked supabase.auth.

> Verifier evidence: AuthContext.tsx:80 (metadata role fallback), :103-112 (OAuth auto-profile with client role), :184-189 (client-side role insert), :235 (hasRole); ProtectedRoute.tsx:36-38 gates by profile.role. No test file covers any of these; only __tests__ dirs are utils/components/hooks/config. ci.yml runs only vitest; e2e-full-flow.mjs is not in CI.

### H39 — Review state machine transitions untested where they are actually written

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** src/hooks/useAutoSave.ts:88-94 (review_status computation, not exported, not tested); src/pages/WorksheetReview.tsx and src/pages/PhaseReview.tsx (zero test files); src/hooks/__tests__/useAutoSave.test.ts (covers only loadWorksheetData and getOAuthName)

**Description:** The transition logic — pending_review on submit, needs_revision -> revision_submitted on resubmit, never-overwrite-approved, due_date set only once (useAutoSave.ts:95-100), buddy approve and needs_revision writes in WorksheetReview, bulk phase-approve in PhaseReview — has no tests. reviewFlow.test.ts only tests read-side derivation helpers from worksheetConfigData.

**Why it is a problem:** The core business workflow (submit -> review -> approve) can regress without any test failing; e.g. autosave clobbering an 'approved' status or resubmit not producing revision_submitted would go undetected. Especially dangerous since there is no DB-level transition enforcement to backstop it.

**Suggested fix:** Extract the newReviewStatus computation (useAutoSave.ts:88-94) into an exported pure function and table-test all (status, _savedReviewStatus) combinations; add renderHook tests for the save/submit path and render tests for WorksheetReview approve/needs_revision and PhaseReview bulk approve with a mocked supabase.

**Example implementation:**

```
export function computeReviewStatus(status: string, saved: ReviewStatus): ReviewStatus { ... } // then table-test 10 combinations
```

> Verifier evidence: useAutoSave.ts:88-94 unexported transition ternary; useAutoSave.test.ts:15 imports only loadWorksheetData/getOAuthName; reviewFlow.test.ts:4-9 imports only worksheetConfigData read helpers; no test files for WorksheetReview.tsx/PhaseReview.tsx; db/schema.sql:151 CHECK is value-set only, no transition trigger; no e2e in package.json.

### H40 — E2E flow is manual-only, not in CI, and runs against the real production Supabase project

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** scripts/e2e-full-flow.mjs:16 ('Usage: node scripts/e2e-full-flow.mjs'), :449-455 (prints 'Run this in Supabase SQL Editor: UPDATE auth.users SET email_confirmed_at = NOW()...'); .github/workflows/ci.yml (no e2e step)

**Description:** The only end-to-end validation of the full onboarding flow (user creation -> submissions -> buddy approval -> manager phase approval -> promotion) is a script that creates real auth users in the live project (loads .env VITE_SUPABASE_URL), and requires a human to paste SQL into the Supabase dashboard mid-run to confirm emails and assign buddies.

**Why it is a problem:** The most important integration behavior (RLS policies + state machine + promotion) is never verified automatically; running the script pollutes the production database with test users; there is no separate test environment, so it can never be CI-gated as-is.

**Steps to reproduce:** Read scripts/e2e-full-flow.mjs header and line 449+; grep 'e2e' .github/workflows/ci.yml returns nothing.

**Suggested fix:** Stand up a local Supabase (supabase start) or dedicated test project applying db/schema.sql; use service_role locally to seed/confirm users so the manual SQL step disappears; add a nightly or PR-labeled CI job running the script; make it exit non-zero on failure.

> Verifier evidence: ci.yml:23-33 has no e2e step; all hook tests use vi.mock. e2e-full-flow.mjs:24-45 loads the sole .env (points to hosted *.supabase.co, no test env exists), :159-175 creates real auth users with password 'Test123!' (:48), :452-454 prints the auth.users email-confirm SQL. Only nuance: assignment SQL (:281-284) is a fallback, not always required mid-run.

### M72 — useGateControl.test.ts is tautological — never exercises the hook

**Severity:** Medium

**Location:** src/hooks/__tests__/useGateControl.test.ts:56-79 vs src/hooks/useGateControl.ts (209 lines)

**Description:** Its 3 tests assert that the hook function is defined, that a locally-declared constant equals 'submitted' (lines 62-67: `const SUBMITTED = 'submitted'; expect(SUBMISSION_STATUS.SUBMITTED).toBe('submitted')`), and that a locally-declared array cycles. useGateControl's real logic — gate readiness from other sheets' buddy_approved/approved status, buddy-mode approval writes — is never invoked.

**Why it is a problem:** False coverage signal: the file passes forever regardless of what useGateControl does. Gate control is a business-critical checkpoint (phase promotion depends on it) with effectively zero test protection.

**Suggested fix:** Replace with renderHook tests (or extract readiness computation to a pure function): gate ready only when all non-gate phase sheets are buddy_approved/approved; buddy approval writes correct review_status and review_history.

**Example implementation:**

```
const { result } = renderHook(() => useGateControl('gc1', 1)); // with mocked supabase returning mixed statuses; expect(result.current.ready).toBe(false)
```

### M73 — useAutoPromote and useDueDates tests validate against a stale worksheet map that diverges from production

**Severity:** Medium

**Location:** src/hooks/__tests__/useAutoPromote.test.ts:15-21 (mocked PHASE_WORKSHEETS_MAP with 20 IDs, asserts '5/20 worksheets approved' at :71); src/hooks/__tests__/useDueDates.test.ts:39-43 (hardcoded 20-ID list); real map in src/config/worksheetConfigData.ts has 23 IDs (Phase 1 = 12 incl. w1_o1, w1_e1, w1_o2, w1_g1)

**Description:** checkAndPromote's promotion threshold is tested only against a fabricated 20-worksheet config; the production requirement (all 23 including FTP Week 1 sheets) is never tested. useDueDates' 'all known worksheet IDs' test omits the four w1_* IDs, so a missing due-date offset for an FTP sheet would pass silently.

**Why it is a problem:** Config drift is exactly the regression class these tests should catch (the map was recently restructured for the FTP merge), and they are structurally blind to it — promotion could fire early/late or FTP sheets could lose due dates without a red test.

**Suggested fix:** In useAutoPromote.test.ts, derive the expected total from the real PHASE_WORKSHEETS_MAP (import it, or mirror it in one shared fixture) instead of a hand-rolled 20-ID map; in useDueDates.test.ts iterate Object.values(PHASE_WORKSHEETS_MAP).flat() and assert calculateDueDate is non-null for every ID.

### M74 — No component/DOM tests despite testing-library being installed

**Severity:** Medium

**Location:** package.json devDependencies (@testing-library/react 16.x, @testing-library/jest-dom, jsdom present); vite.config.js (no `test` block — no environment/setupFiles config); grep for render/renderHook/testing-library across src/**/*.test.* returns zero matches

**Description:** All 158 tests run in the default node environment against extracted pure functions. Not one component, page, or hook is rendered: Dashboard.tsx (21.5KB), WorksheetReview.tsx (24KB), PhaseReview, BuddyDashboard (20.8KB), Navbar (20.1KB), Login/Signup, useWorksheet (266 lines incl. validate() at :179) have zero rendered coverage.

**Why it is a problem:** UI wiring, hook effects, form validation, and role-branching dashboards can break while CI stays green; the installed testing stack is dead weight suggesting intended-but-abandoned coverage.

**Suggested fix:** Add a `test: { environment: 'jsdom', setupFiles: './src/test/setup.ts' }` block to vite.config.js and start with the highest-value renders: ProtectedRoute, useWorksheet submit/validate, WorksheetReview action buttons, Dashboard role branching.

### M75 — No coverage measurement or enforcement anywhere

**Severity:** Medium

**Location:** package.json (no @vitest/coverage-v8/istanbul in devDependencies; node_modules/@vitest contains no coverage package); vite.config.js (no coverage config); .github/workflows/ci.yml:30 (bare `npm test`)

**Description:** There is no way to run coverage today (`vitest run --coverage` would fail for lack of a provider), no thresholds, and no reporting in CI. 10 test files cover a src tree with ~60+ modules.

**Why it is a problem:** Nobody can see that auth, guards, pages, and most hooks are at 0% — coverage blindness is why the gaps above have persisted; future regressions in untested files are invisible.

**Suggested fix:** npm i -D @vitest/coverage-v8; add coverage config with modest initial thresholds (e.g. lines 40%) and a ratchet policy; publish the summary in CI.

### M76 — RLS policies and DB-level rules have no automated tests

**Severity:** Medium

**Location:** db/schema.sql (policies at :338-348 own-update WITH CHECK, :354-364 'Users can update own submissions', :366-374 reviewer update); no pgTAP/SQL test files anywhere (no db/tests, no supabase/tests); only exercise is manual scripts/e2e-full-flow.mjs

**Description:** Because all state-machine transitions are written client-side, RLS is the only real security boundary — yet no test asserts, e.g., that a user cannot set their own review_status to 'approved' (currently they can per schema.sql:354-364), that self role-change is blocked, or that reviewer policies scope correctly.

**Why it is a problem:** Policy regressions during the frequent schema/migration churn (multiple overlapping root SQL files) would be caught only in production; the known self-approval hole has no failing test driving its fix.

**Suggested fix:** Add pgTAP tests (supabase test db) or a node integration suite against local Supabase asserting: joinee cannot write review_status='approved'/'buddy_approved' on own rows, cannot change own role, reviewer roles can only update review fields. Write the self-approval test first — it should fail today and gate the RLS fix.

## Dependencies — score 78/100

Dependency hygiene is solid at the core: package-lock.json (lockfileVersion 3) is committed and exactly in sync with package.json (npm ci --dry-run clean), the prod tree is tiny (20 packages), and versions are current (React 19.2, Vite 8, Tailwind 4, supabase-js 2 minors behind). npm audit reports exactly one vulnerable package — undici 7.27.2, high severity, but reached only via the jsdom devDependency, with a fix available inside jsdom's ^7.25.0 range. The real gaps are three dev-only packages (ws, dotenv, tslib) misclassified as production dependencies, and no dependency-update automation or audit gate in CI.

**Done well:** package-lock.json committed and verified in sync with package.json (root deps/devDeps match; npm ci --dry-run reports 'up to date') · Only 1 vulnerable package in the entire 355-package tree (undici, dev-only via jsdom), zero prod-tree vulnerabilities · Small production dependency surface: 20 prod packages; all prod deps except ws/dotenv/tslib verifiably imported in src/ · CI (.github/workflows/ci.yml:16-21) uses npm ci with pinned node-version 20, satisfying the engines ">=20" constraint in package.json:6-8 · Stack versions current: React 19.2.6 with matching @types 19.2.x and @testing-library/react 16.3.2 (React-19 compatible); lucide-react 1.21.0 is on the current 1.x major (latest 1.24.0), disproving the 'ancient' lead

### M77 — High-severity undici vulnerabilities (7 advisories) via jsdom, fix available but unapplied

**Severity:** Medium

**Location:** package-lock.json (node_modules/undici@7.27.2, sole parent jsdom@29.1.1 per npm ls); package.json:44 (jsdom ^29.1.1)

**Description:** npm audit reports undici 7.27.2 with 7 advisories (3 high: TLS cert validation bypass GHSA-vmh5-mc38-953g CVSS 7.4, WebSocket DoS GHSA-vxpw-j846-p89q 7.5, cross-origin request routing GHSA-hm92-r4w5-c3mj 7.5; plus 2 moderate, 2 low), all fixed in >=7.28.0. jsdom declares undici ^7.25.0, so the fix is a lockfile-only update.

**Why it is a problem:** Dev/test-only exposure (jsdom is a devDependency), so no direct production runtime risk — but it fails any npm audit gate, and undici performs real network I/O inside CI test runs, a supply-chain surface.

**Steps to reproduce:** cd repo && npm audit --json → metadata.vulnerabilities.high: 1, undici range 7.0.0-7.27.2, fixAvailable: true

**Root cause:** Lockfile pinned undici at 7.27.2 before 7.28.0 shipped; no audit step or bot to flag it.

**Suggested fix:** Run `npm update undici` (or `npm audit fix`) to bump the lockfile to >=7.28.0 within jsdom's existing ^7.25.0 range; commit the lockfile.

**Example implementation:**

```
npm update undici && npm audit # expect 0 vulnerabilities
```

### M78 — Node-only script tooling (ws, dotenv) and redundant tslib declared as production dependencies

**Severity:** Medium

**Location:** package.json:21 (dotenv ^17.4.2), :26 (tslib ^2.8.1), :27 (ws ^8.21.0)

**Description:** ws is imported only by Node maintenance/E2E scripts (scripts/e2e-full-flow.mjs:20, scripts/create-test-users.mjs:9, scripts/delete_all_users.mjs:5, root __seed_30_users.cjs:15, etc.). dotenv is used only in scripts/setup/create-admin.cjs:1 — the frontend uses Vite's import.meta.env. tslib is never imported anywhere in src/ or scripts/ (grep: 0 hits) and is already supplied transitively by every @supabase/* subpackage; tsconfig has no importHelpers.

**Why it is a problem:** Prod dependency list misrepresents the runtime surface: security reviews and `npm install --omit=dev` (e.g., on a CI/deploy host) pull Node server packages into a purely static browser app, and future auditors waste time chasing ws advisories that never affect the shipped bundle.

**Root cause:** Seed/E2E scripts share the app's package.json; their deps were added with `npm install` instead of `-D`.

**Suggested fix:** Move ws and dotenv to devDependencies and delete tslib entirely; verify with `npm ci && npm test && npm run build`.

**Example implementation:**

```
npm uninstall tslib && npm install -D ws dotenv (removes them from "dependencies", re-adds under devDependencies)
```

### M79 — No dependency-update automation and no audit gate in CI

**Severity:** Medium

**Location:** .github/ (no dependabot.yml, no renovate.json — verified by ls); .github/workflows/ci.yml:21-33 (steps: npm ci, tsc, lint, test, build — no audit)

**Description:** There is no Dependabot/Renovate configuration and the single CI workflow never runs npm audit, so vulnerable transitive pins (like the current undici 7.27.2) sit unnoticed until someone runs audit manually. 13 packages are already behind their wanted range (npm outdated), all silently accumulating.

**Why it is a problem:** A direct-dependency CVE in supabase-js, react-router-dom, or vite would ship to production with no signal; drift compounds and makes eventual upgrades riskier.

**Root cause:** CI was set up for correctness checks only; dependency lifecycle was never wired in.

**Suggested fix:** Add .github/dependabot.yml (npm ecosystem, weekly) and an `npm audit --omit=dev --audit-level=high` step in ci.yml (plus a non-blocking full audit).

**Example implementation:**

```
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: {interval: weekly}
```

### L37 — esbuild pinned as a direct devDependency, shadowing Vite's own requirement

**Severity:** Low

**Location:** package.json:39 (esbuild ^0.28.1); npm ls esbuild shows it deduped with vite@8.0.16's internal esbuild@0.28.1

**Description:** esbuild is declared directly but nothing in the repo invokes it outside of Vite/Vitest internals (no esbuild import or CLI usage in scripts or configs). Today it dedupes to the exact version Vite wants; on the next Vite major/minor the direct ^0.28.1 caret can force a second esbuild copy or a version Vite wasn't tested with.

**Why it is a problem:** Future upgrade friction and possible duplicate binary installs; also one more direct dep to track in audits for no functional benefit.

**Root cause:** Likely added once to satisfy an install error or override, then left behind.

**Suggested fix:** Remove the direct esbuild devDependency and let Vite resolve its own; run the full build to confirm (`npm uninstall esbuild && npm run build && npm test`).

### L38 — Open-ended engines range with no .nvmrc; local dev (node 24) diverges from CI (node 20)

**Severity:** Low

**Location:** package.json:6-8 ("engines": {"node": ">=20"}); .github/workflows/ci.yml:18 (node-version: 20); local node v24.14.0; no .nvmrc/.node-version file (verified)

**Description:** engines is a floor, not a pin, and there is no .nvmrc or engine-strict setting, so developers (currently on node 24) build and lock dependencies on a different Node major than CI (20) and whatever Vercel defaults to. Native/optional deps like sharp resolve platform- and Node-version-specific artifacts; local node_modules already shows 6 extraneous packages from such drift.

**Why it is a problem:** "Works on my machine" build differences between dev, CI, and Vercel; lockfile churn from optional native deps resolved under different Node versions.

**Root cause:** Engine constraint added as a minimum without a companion version pin file.

**Suggested fix:** Add a .nvmrc (e.g. `20` or `24`), align ci.yml node-version to it, and set the same Node version in Vercel project settings.

**Example implementation:**

```
echo "20" > .nvmrc  # and read it in CI: node-version-file: .nvmrc
```

### L39 — Minor version drift across 13 packages, including supabase-js and typescript one major behind

**Severity:** Low

**Location:** package.json:20 (@supabase/supabase-js ^2.108.2, latest 2.110.2), :47 (typescript ^6.0.3, latest 7.0.2), :48 (vite ^8.0.12 → 8.1.4); full list via npm outdated

**Description:** npm outdated shows 13 packages behind: all but typescript are within-range (wanted==latest) and would update with a plain `npm update`. typescript is one major behind (6.0.3 vs 7.0.2). supabase-js — the security-critical client for an app whose entire backend is Supabase RLS — is 2 minors behind.

**Why it is a problem:** Low individually, but the auth/RLS client (supabase-js) is exactly the package where lagging on patches is costly; the drift also confirms no update cadence exists (see automation finding).

**Root cause:** No scheduled update process; lockfile frozen since the last manual install.

**Suggested fix:** Run `npm update` to take all wanted-range bumps now; schedule the typescript 6→7 major separately with a tsc --noEmit + full test pass.

## Documentation — score 32/100

Documentation volume is high but almost entirely stale, contradictory, or misplaced. README.md is the untouched Vite starter template; there is no setup, database-bootstrap, or deployment guide anywhere despite 15+ overlapping SQL files and a Vercel deploy. The de facto architecture doc (context.md, 100KB) predates the rebrand and the entire FTP weekly track, and 690KB of prior-audit output sits at repo root making assertions now contradicted by current code. A new team could not stand up this project from its docs.

**Done well:** '.env.example' is genuinely good: correct variable names, where to find values, and an explicit warning never to expose the service_role key (.env.example:1-7) · REVIEW_FLOW.md's state diagram and transition tables closely match the implemented state machine in src/constants/status.ts (pending_review/buddy_approved/approved/needs_revision/revision_submitted) · src/constants/status.ts is exemplary self-documenting code: JSDoc on every constant plus an explicit note explaining the casing-drift rationale · PRODUCTION_FIXES_TODO.md is actively maintained (header says 'Last updated: 2026-07-10') and tracks fix sessions against files · context.md is genuinely comprehensive in structure (28 sections covering routing, DB, auth, business logic) — a strong skeleton to regenerate from

### M80 — Architecture doc context.md is stale: pre-rebrand, pre-FTP-track, wrong worksheet count, foreign machine path

**Severity:** Medium _(adversarially verified: DOWNGRADED to this severity)_

**Location:** /home/ash1794/projects/Onboarding/context.md:1-6 (title 'Newton School of Technology', 'Generated: June 23, 2026', 'Project Root: /Users/priyanshuverma/Desktop/untitled folder 3'), :110 ('all 20/20 approved')

**Description:** The 100KB/2007-line de facto architecture reference was generated 2026-06-23, before ~95 files changed (rebrand, FTP weekly track, PWA, E2E scripts). It still uses the old 'Newton' name, cites another developer's Desktop folder as project root, claims 20/20 worksheets for auto-promotion (actual: 17 non-gate worksheets via PHASE_WORKSHEETS_MAP in useAutoPromote.ts:41-44), and contains zero mention of the Week1-4/FTP track (src/config/weeklyWorksheets.ts, src/components/ftp/) — grep for 'FTP|week-' across context.md/REVIEW_FLOW.md/ARCHITECTURE_PLAN.md returns 0 hits.

**Why it is a problem:** New developers will trust the most detailed doc in the repo and get wrong facts: wrong product name, wrong promotion logic, and no awareness that the FTP weekly track exists.

**Steps to reproduce:** head -6 context.md; grep -n '20/20' context.md; grep -ci 'ftp' context.md (0).

**Expected behavior:** Architecture doc regenerated (or dated/marked historical) after the rebrand and FTP addition, with correct counts and coverage of both onboarding tracks.

**Current behavior:** Comprehensive but frozen at June 23; materially wrong on branding, promotion threshold, and missing an entire product track.

**Root cause:** Doc was a one-shot generated snapshot; no regeneration after major churn.

**Suggested fix:** Regenerate or prune context.md to a maintained ARCHITECTURE.md; add a 'last verified against commit X' header; document the FTP track and correct the 17-worksheet promotion rule.

> Verifier evidence: context.md:1-6 has old 'Newton' name and foreign path; :110 says 20/20 but worksheetConfigData.ts:565-574 defines 23 IDs; 0 FTP mentions confirmed. But doc-only (no runtime impact), date-stamped as snapshot, and audit's facts wrong: 42 files changed not ~95, 20 non-gate not 17, src/components/ftp/ doesn't exist.

### M81 — 690KB of stale prior-audit and one-off analysis docs at repo root, now contradicted by current code

**Severity:** Medium

**Location:** Repo root: PRODUCTION_READINESS_AUDIT.md (221KB, line 98 claims 'no CI/CD... no committed config for any of the three hosting targets' — false now: .github/workflows/ci.yml and vercel.json exist), AUDIT_FINDINGS_DETAIL.md (414KB), AUDIT_FIX_CHECKLIST.md (55KB), TYPESCRIPT_MIGRATION_PLAN.md/_EXECUTION.md, UI_IMPROVEMENTS.md, QA_REPORT.md (June 15), SYSTEM_ANALYSIS.md (references .jsx files that are now .ts), Newton_Onboarding_Engineering_Review.txt, onboarding.pdf, __seed_30_users.cjs, __seed_test_data.cjs, fix-assignments.cjs

**Description:** Thirteen markdown files plus a txt, a pdf, and three seed/fix .cjs scripts sit at root. The largest ones are snapshots of a prior audit whose claims are now wrong (e.g. 'no CI/CD'), and 9 of them still use the pre-rebrand 'Newton' name while zero repo docs mention 'AARAMBH' or 'NST BLR'. SYSTEM_ANALYSIS.md documents .jsx components in a TypeScript codebase.

**Why it is a problem:** New team members cannot tell current truth from history; stale claims ('no CI', 'Newton', '.jsx', '20/20') will be acted on. The 414KB findings file also bloats every clone and grep.

**Steps to reproduce:** grep -rlni newton *.md (9 files); grep -n 'no CI/CD' PRODUCTION_READINESS_AUDIT.md:98 vs ls .github/workflows/.

**Expected behavior:** Root holds README + a small docs/ tree; historical reports moved to docs/archive/ with 'HISTORICAL — as of <date>' headers or deleted; seed scripts moved under scripts/.

**Current behavior:** Root directory doubles as an archive of contradictory point-in-time reports; signal-to-noise for a new reader is very poor.

**Suggested fix:** Create docs/archive/, move all dated reports there with a banner, delete superseded ones, relocate __seed_*.cjs and fix-assignments.cjs into scripts/, and update names to the new brand in any doc kept live.

### M82 — ARCHITECTURE_PLAN.md presents unimplemented proposals with no status markers, misleading readers about DB-level enforcement

**Severity:** Medium

**Location:** /home/ash1794/projects/Onboarding/ARCHITECTURE_PLAN.md:18 ('Proposed (enforced in schema + code)') vs db/schema.sql:240-251 (only updated_at triggers; no transition-validation trigger exists)

**Description:** The doc proposes strict DB-enforced review-state transitions and reads as if adopted ('enforced in schema + code'). No such trigger or constraint exists in db/schema.sql — the only triggers are updated_at housekeeping and handle_new_user. Other sections (due-date table with seeded durations incl. gc1-gc3) mix implemented and unimplemented items with no ✅/❌ status.

**Why it is a problem:** A reviewer or new dev reading this doc would believe the review state machine has DB-level enforcement; in reality any user can set their own review_status to any CHECK-allowed value (transition-order gap). The doc actively masks a known security weakness.

**Steps to reproduce:** sed -n '14,40p' ARCHITECTURE_PLAN.md; grep -n TRIGGER db/schema.sql — no transition trigger.

**Expected behavior:** Each section marked Implemented/Not implemented with pointers to the code/migration that realizes it, or the file retitled 'PROPOSAL (not implemented)'.

**Current behavior:** A design proposal indistinguishable from documentation of current behavior.

**Suggested fix:** Add per-section implementation status, or move to docs/proposals/ and cross-link the actual enforcement gap in the security backlog.

### M83 — REVIEW_FLOW.md contains wrong promotion threshold and omits the FTP weekly track and onboarding_lead review route

**Severity:** Medium

**Location:** /home/ash1794/projects/Onboarding/REVIEW_FLOW.md:126 ('Auto-promote | 20/20 worksheets approved'); permission table ~:105-113 (onboarding_lead 'read-only', no request-revision)

**Description:** The otherwise-accurate state-machine doc says promotion requires 20/20 worksheets; actual code promotes when all 17 non-gate worksheets in PHASE_WORKSHEETS_MAP are approved (src/hooks/useAutoPromote.ts:41-50; worksheetConfigData.ts has 21 configs incl. 4 gates). It also never mentions the parallel Week1-4/FTP worksheet track, and its claim that onboarding_lead is read-only conflicts with the live /onboarding-lead/review/:userId/:worksheetId WorksheetReview route in src/App.tsx and the role-only reviewer UPDATE RLS policy (db/schema.sql:366-374).

**Why it is a problem:** This is the doc reviewers/buddies would be trained from; wrong permissions and thresholds cause incorrect process expectations and hide that onboarding_lead can actually mutate submissions.

**Steps to reproduce:** grep -n '20/20' REVIEW_FLOW.md; read useAutoPromote.ts:41-57; grep 'onboarding-lead/review' src/App.tsx.

**Expected behavior:** Correct 17-worksheet threshold, an FTP-track section (or explicit exclusion note), and a permission table matching actual routes/RLS.

**Current behavior:** Best doc in the repo, but three material facts are wrong or missing.

**Suggested fix:** Update the threshold, reconcile the permission matrix against App.tsx routes and schema.sql policies, and add FTP-track coverage.

### M84 — scripts/ directory (including destructive and service-role tooling) has no documentation

**Severity:** Medium

**Location:** /home/ash1794/projects/Onboarding/scripts/ — delete_all_users.mjs (mass-deletes users, notes it 'requires the Supabase service_role key' at :90-92), e2e-full-flow.mjs (27.9KB E2E driver), clean_setup.mjs, create-test-users.mjs, run_migration.cjs, setup/__full_setup.cjs, setup/create-admin.cjs, pre-commit.sh; no README.md

**Description:** Fifteen-plus operational scripts — some destructive (delete_all_users), some requiring service-role credentials, some one-off fixes (fix_promotion_data.mjs) — ship with no README explaining purpose, required env vars, target environment, or safety. package.json's cr-* scripts also depend on an undocumented CodeRabbit CLI at $HOME/.local/bin (package.json:15-17).

**Why it is a problem:** High risk of a new team member running a destructive script against the production Supabase project (whose credentials are conveniently committed in .env). E2E flow, the main verification asset, is unusable without tribal knowledge.

**Steps to reproduce:** ls scripts/ scripts/setup/; find scripts -name 'README*' (none); grep -n service_role scripts/delete_all_users.mjs.

**Expected behavior:** scripts/README.md table: script, purpose, required env vars, environment (local/staging/prod), destructive flag.

**Current behavior:** Script intent discoverable only by reading source; nothing distinguishes 'safe local seed' from 'wipes all users'.

**Suggested fix:** Add scripts/README.md with a per-script table; prefix destructive scripts with confirmation prompts; document e2e-full-flow.mjs usage in the main README's testing section.

### L40 — README.md is the untouched default Vite template with zero project information

**Severity:** Low _(adversarially verified: DOWNGRADED to this severity)_

**Location:** /home/ash1794/projects/Onboarding/README.md:1-17

**Description:** README is the stock 'React + Vite' template. It never names the product (NST BLR - AARAMBH), lists no prerequisites, no install/run/test commands, no env setup, no Supabase requirement, no link to any other doc. Line 16 even recommends 'integrating TypeScript' — the project is already fully TypeScript.

**Why it is a problem:** The single entry point for any new developer, contractor, or auditor conveys nothing. Combined with no other setup guide, handoff to a real team requires oral tradition.

**Steps to reproduce:** cat README.md — observe stock Vite template text.

**Expected behavior:** Project overview, roles/domain summary, prerequisites (Node >=20, Supabase project), quickstart (npm install, cp .env.example .env, npm run dev/test/build), links to architecture and deployment docs.

**Current behavior:** Generic create-vite boilerplate describing plugin options and React Compiler.

**Root cause:** Template never replaced after scaffold; docs grew as ad-hoc root-level analysis files instead.

**Suggested fix:** Rewrite README with product name, stack, quickstart, env setup, test/build/deploy commands, and a docs index pointing to REVIEW_FLOW.md and a regenerated architecture doc.

> Verifier evidence: README.md:1-17 is indeed the stock Vite template (line 16 suggests adding TypeScript despite tsconfig.json and `tsc --noEmit` in package.json:11). But context.md lines ~1855-1903 contain full setup instructions (prereqs, npm install, npm run dev, db/setup_correct.sql) and .env.example documents Supabase env vars — so "no other setup guide / oral tradition" is false.

### L41 — No database setup guide despite 15 overlapping SQL files with no documented order or canonical source

**Severity:** Low _(adversarially verified: DOWNGRADED to this severity)_

**Location:** /home/ash1794/projects/Onboarding/db/ (15 .sql files, no README); root supabase_migration_fix_rls_security.sql, supabase_migration_add_buddy_approved.sql

**Description:** db/ contains schema.sql plus 14 other SQL files (__setup_supabase.sql, __fix_rls_recursion.sql, supabase_schema.sql, setup_correct.sql, seed_worksheets.sql, seed_ftp_worksheets.sql, ...) and two more migrations sit at repo root. Nothing anywhere states which file is canonical, what order to run them, or which are obsolete. scripts/run_migration.cjs / run_rls_migration.cjs exist but are undocumented.

**Why it is a problem:** A new team cannot recreate the Supabase database. Wrong-order or legacy-file execution would produce a DB that diverges from the RLS policies the app's security depends on (e.g. the hardened own-update policy at db/schema.sql:338-348).

**Steps to reproduce:** ls db/ — no README; grep -rl 'schema.sql' *.md returns no setup instructions referencing it.

**Expected behavior:** db/README.md declaring schema.sql canonical, listing bootstrap order (schema → seeds → migrations), marking legacy files deprecated or deleting them.

**Current behavior:** A pile of double-underscore-prefixed and legacy SQL files; the only hint is the filename schema.sql.

**Suggested fix:** Add db/README.md with an ordered bootstrap runbook; move applied one-off migrations into db/migrations/ with numbered prefixes; delete or archive superseded files.

> Verifier evidence: db/schema.sql:1-17 declares "This is the ONE FILE you need to run", lists the 7 superseded files, and gives run steps. context.md:1879-1885 has a step-by-step "Database Setup" (schema.sql first, seeds optional); context.md:138-149 documents each db/ file and run_migration.cjs. Root migrations are subsumed (schema.sql:335-364 hardened policies, :146-151 buddy_approved). Only gap: stock README.md and undeleted legacy files.

### L42 — No env/secret-handling documentation, and the repo actively contradicts its own .env.example guidance (.env tracked in git)

**Severity:** Low _(adversarially verified: DOWNGRADED to this severity)_

**Location:** /home/ash1794/projects/Onboarding/.gitignore:1-25 (no .env entry); .env:1-2 (live URL https://fuoqoryqndtdooujslee.supabase.co + sb_publishable_ key, git-tracked per git ls-files); .env.example:6-7

**Description:** No document explains environment handling for dev, CI, or Vercel. .env.example correctly warns about key hygiene, yet .gitignore omits .env and a real .env with the production Supabase URL/key is committed. CI (.github/workflows/ci.yml) and Vercel env configuration are documented nowhere.

**Why it is a problem:** New devs will copy the observed pattern and commit real credentials; deploy env setup on Vercel is guesswork; the security posture the docs claim is not the one practiced.

**Steps to reproduce:** git ls-files | grep '^\.env$'; grep -c 'env' .gitignore (0 matches for .env).

**Expected behavior:** .env in .gitignore, .env removed from tracking (history scrubbed — separate security finding), plus a short ENV/SETUP section documenting local, CI, and Vercel env var configuration.

**Current behavior:** Guidance exists only as a 2-line comment in .env.example, and the repo's own state violates it.

**Suggested fix:** Add '.env' and '.env.*' (keeping !.env.example) to .gitignore, git rm --cached .env, and document env setup for local/CI/Vercel in README.

**Example implementation:**

```
# .gitignore
.env
.env.*
!.env.example
```

> Verifier evidence: .gitignore:1-25 lacks .env and git tracks .env — true. But .env holds only the sb_publishable_ (anon) key, public by design and bundled client-side anyway (context.md:1581-1583). Env docs exist: context.md:1559-1618 covers dev .env, production keys, RLS, and hosting env setup. Residual risk is gitignore hygiene, not credential exposure.

### L43 — No deployment or operations documentation for the Vercel + Supabase production path

**Severity:** Low _(adversarially verified: DOWNGRADED to this severity)_

**Location:** /home/ash1794/projects/Onboarding/vercel.json (rewrite only); .github/workflows/ci.yml (no deploy step); no DEPLOY/OPS doc in repo (grep -l 'vercel' *.md matches only stale audit files)

**Description:** The only deploy artifacts are a 4-line vercel.json rewrite and a CI workflow that validates but does not deploy. Nothing documents: how the Vercel project is linked, where env vars are set, how DB migrations reach the live Supabase project (fuoqoryqndtdooujslee), rollback, or the roles of the legacy public/404.html and public/_redirects (Netlify-style) files that coexist confusingly with vercel.json.

**Why it is a problem:** Bus-factor of one: the team receiving this handoff cannot deploy, roll back, or migrate the production database without reverse-engineering.

**Steps to reproduce:** cat vercel.json; grep -i deploy .github/workflows/ci.yml (none); ls public/ shows _redirects + 404.html alongside vercel.json.

**Expected behavior:** A DEPLOYMENT.md covering Vercel project setup, env vars, migration application procedure against live Supabase, and removal/explanation of the legacy 404.html/_redirects artifacts.

**Current behavior:** Deployment knowledge lives entirely outside the repo.

**Suggested fix:** Write DEPLOYMENT.md (Vercel link, env vars, migration runbook, rollback); delete or document public/404.html and public/_redirects.

> Verifier evidence: context.md §23 (lines 1588-1639) documents build, Vercel deploy steps, env vars, Supabase migrations (db/schema.sql per line 1614/1882), rollback, and names project fuoqoryqndtdooujslee (line 1620); .env.example documents required vars. Residual gap: Vercel project linkage and stale public/404.html + public/_redirects are undocumented.

### L44 — No contributor-facing project metadata: LICENSE, CONTRIBUTING, CHANGELOG, or accurate package identity

**Severity:** Low

**Location:** /home/ash1794/projects/Onboarding/package.json:2-4 (name 'onboarding-site', version '0.0.0'); repo root (no LICENSE, CONTRIBUTING.md, CHANGELOG.md, CODEOWNERS)

**Description:** The package is still named 'onboarding-site' at version 0.0.0 with no license, contribution guide, changelog, or code ownership. Branch/PR conventions, review expectations, and the pre-commit hook install flow (cr-install-hook) are undocumented for teammates.

**Why it is a problem:** Legal status of the code is undefined for an org handoff, and every process question (how to branch, how reviews work, how hooks install) requires asking the original author.

**Steps to reproduce:** ls | grep -iE 'license|contributing|changelog' (none); head -5 package.json.

**Expected behavior:** At minimum LICENSE (or explicit proprietary notice), CONTRIBUTING.md covering branch/test/review workflow, and a versioning/changelog convention before team handoff.

**Current behavior:** Zero contributor scaffolding beyond CI itself.

**Suggested fix:** Add LICENSE/proprietary notice, CONTRIBUTING.md (setup, test, PR, hook install), set package name/version to match the AARAMBH product, and start a CHANGELOG.

## Code Quality & Maintainability — score 48/100

TypeScript hygiene is genuinely strong (strict + noUncheckedIndexedAccess, tsc clean, 158/158 tests pass, zero console.log/TODOs), but the lint quality gate is broken and ignored: npm run lint fails with 44 errors + 2 fatal config parse errors, and the last 4+ CI runs on main are red at the Lint step while commits keep landing. Beyond the gate, there is heavy copy-paste duplication (Week1-3 pages identical, 25 raw worksheet_submissions query sites), 154 status magic-string occurrences despite a constants module, several 400-1000 line components, an untyped JSONB worksheet data model, and severe repo clutter including a git-tracked .env.

**Done well:** tsconfig is maximally strict: strict, noUncheckedIndexedAccess, noUnusedLocals/Parameters, noFallthroughCasesInSwitch; npx tsc --noEmit passes with zero errors · Test suite green: 10 files, 158 tests pass in ~2s (vitest), including config-data and hook tests · No console.log or TODO/FIXME/HACK markers in src; the 36 console.* calls are console.error/warn in error paths only · src/constants/status.ts is a well-documented single source of truth with helper predicates (isCompleteReviewStatus) — the right pattern exists, it just isn't fully adopted · Lazy loading + Suspense for admin/review routes, and a path alias (@/*) configured in tsconfig

### C12 — Lint gate broken: 44 ESLint errors + 2 fatal config errors; CI red on main and ignored

**Severity:** Critical _(adversarially verified: CONFIRMED)_

**Location:** eslint.config.js:22 (parserOptions.project), vite.config.js, .github/workflows/ci.yml:26-27

**Description:** npm run lint (eslint .) fails with 44 errors, 35 warnings, and 2 fatal parsing errors: eslint.config.js sets parserOptions.project:'./tsconfig.json' for all **/*.{js,ts,tsx} files, but tsconfig only includes src/, so eslint.config.js and vite.config.js themselves fail to parse. gh run list shows the last 4 CI runs all FAIL, and gh run view confirms the failing step is 'Lint' — yet rebrand/PWA/E2E commits merged anyway.

**Why it is a problem:** The only automated code-quality gate is non-functional and being bypassed. Every new defect lands unreviewed by tooling; the 44 errors include real React runtime bugs (see next finding). A permanently red CI trains the team to ignore all failures.

**Steps to reproduce:** npm run lint → exit 1; gh run view 29087093703 --json jobs shows step 'Lint' conclusion=failure

**Root cause:** Flat config applies typed-linting parserOptions.project to config files outside tsconfig's include:['src']; error backlog never triaged

**Suggested fix:** Scope typed linting to files:['src/**/*.{ts,tsx}'] or add allowDefaultProject; then burn down the 44 errors and make CI green a merge requirement

**Example implementation:**

```
{ files: ['src/**/*.{ts,tsx}'], languageOptions: { parserOptions: { project: './tsconfig.json' } } }
```

> Verifier evidence: eslint.config.js:21-23 sets project:'./tsconfig.json' for all **/*.{js,jsx,ts,tsx}; tsconfig.json includes only src. `npx eslint .` yields exactly 44 errors/35 warnings with fatal parse errors on eslint.config.js and vite.config.js. Last 4 CI runs FAIL; run 29087093703 shows Lint=failure, Tests/Build=skipped — CI provides zero signal on main.

### M85 — .env with live Supabase URL and publishable key is committed; .gitignore does not exclude it

**Severity:** Medium _(adversarially verified: DOWNGRADED to this severity)_

**Location:** .env (git-tracked, verified via git ls-files and git show HEAD:.env); .gitignore (zero 'env' entries)

**Description:** git ls-files lists .env; git show HEAD:.env contains VITE_SUPABASE_URL=https://fuoqoryqndtdooujslee.supabase.co and VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... . .gitignore has no env pattern, so future secret additions (e.g. a service_role key someone pastes for scripts/setup/create-admin.cjs which reads VITE_SUPABASE_SERVICE_ROLE_KEY) would also be committed.

**Why it is a problem:** Environment config is baked into history; anyone with repo access gets the project endpoint+key, and the missing .gitignore entry is a loaded gun for a real secret leak. (Cross-cutting with the security dimension.)

**Suggested fix:** Add .env* (except .env.example) to .gitignore, git rm --cached .env, rotate the key, and rely on Vercel env vars

**Example implementation:**

```
.gitignore: .env\n.env.local\n.env.*.local
```

> Verifier evidence: git ls-files shows .env tracked; git show HEAD:.env has the cited URL and sb_publishable_ key; .gitignore lacks any env entry; scripts/setup/create-admin.cjs:5 reads VITE_SUPABASE_SERVICE_ROLE_KEY. But the committed key is the anon/publishable key — public by design, shipped in every client bundle — so only latent (not actual) secret exposure.

### M86 — 154 status/review-status magic-string occurrences across 23 src files despite a constants module

**Severity:** Medium _(adversarially verified: DOWNGRADED to this severity)_

**Location:** src/constants/status.ts exists but literals remain in 14 non-test files incl. src/pages/WorksheetReview.tsx, PhaseReview.tsx, Dashboard.tsx, AdminDashboard.tsx, BuddyDashboard.tsx, OnboardingLeadDashboard.tsx, src/hooks/useGateControl.ts, useAutoSave.ts, useWorksheet.ts, src/utils/worksheetHelpers.ts, src/components/WeekAccessGuard.tsx

**Description:** grep for 'pending_review|buddy_approved|needs_revision|revision_submitted|approved' literals (excluding constants/status.ts) finds 154 occurrences in 23 files (14 non-test). The constants module also bakes in inconsistent casing: SUBMISSION_STATUS mixes 'In Progress'/'Not Started' (title case) with 'submitted' (lowercase), which the file's own docstring admits is a casing-drift risk.

**Why it is a problem:** The review state machine — the app's core business logic — is stringly-typed at every call site. A typo ('needs_revison') compiles clean because most comparisons are on plain string fields; renaming a state requires touching 23 files.

**Suggested fix:** Finish the migration to REVIEW_STATUS/SUBMISSION_STATUS constants; type review_status as a union derived from the constants (typeof REVIEW_STATUS[keyof ...]) so literals fail typecheck; normalize casing in a DB migration

**Example implementation:**

```
export type ReviewStatus = typeof REVIEW_STATUS[keyof typeof REVIEW_STATUS];
```

> Verifier evidence: Literal spread is real (193 quoted literals, 20 non-test files; only 8 import src/constants/status.ts) and SUBMISSION_STATUS casing mix confirmed. But src/types/supabase.ts:56-65 defines ReviewStatus/SubmissionStatus unions used by WorksheetSubmission (line 116-117); tsc rejects 'needs_revison' with TS2367 at comparison sites (WorksheetReview.tsx:277-280, BuddyDashboard.tsx:86). Typos only compile clean in untyped writes (createClient lacks Database generic, src/api/supabase.ts:48) and string-typed hooks (useGateControl.ts:59, useAutoSave.ts:21). Maintainability issue, not stringly-typed core logic.

### M87 — Copy-paste page duplication: Week1-3 are byte-identical modulo the week number; no data-access layer (25 raw worksheet_submissions queries)

**Severity:** Medium

**Location:** src/pages/Week1.tsx, Week2.tsx, Week3.tsx (83 lines each; normalized diff = 1 line), Week4.tsx; src/pages/Phase2.tsx vs Phase3.tsx (heavily parallel); 25 supabase.from('worksheet_submissions') call sites across 20 files; 19 from('user_profiles') sites

**Description:** Week1-3 differ only in the number substituted into routes/config lookups — sed-normalizing '1'->'N' vs '2'->'N' yields a 1-line diff. The loadStatuses/useEffect fetch pattern is re-implemented per page. There is no repository/service layer: 20 files each build their own supabase queries against worksheet_submissions, and dashboards duplicate profile+submission join logic.

**Why it is a problem:** Any query change (column rename, new review state, RLS-driven select shape) must be replicated in up to 20 places; the Week pages guarantee fixes get applied to some weeks and not others.

**Suggested fix:** Collapse Week1-4 into one WeekPage taking weekNum from route params (the FTP worksheet route already does this); extract a src/api/submissions.ts data-access module wrapping the common queries

**Example implementation:**

```
<Route path="/week-:weekNum" element={<WeekPage />} />
```

### M88 — Oversized components: ReviewContent.tsx is 1,043 lines; six more files exceed 350 lines

**Severity:** Medium

**Location:** src/components/ReviewContent.tsx (1043 lines/43.7KB), src/config/worksheetConfigData.ts (802), src/config/worksheetComponents.tsx (496), src/pages/WorksheetReview.tsx (464), src/pages/Dashboard.tsx (432), src/components/Navbar.tsx (428), src/pages/BuddyDashboard.tsx (390)

**Description:** ReviewContent.tsx renders read-only views for all 17+ worksheet types in one file and carries 2 lint errors including an immutability violation at :806. WorksheetReview.tsx mixes data loading, the approve/needs-revision state machine writes, an inline StatusBadge component, and ~300 lines of inline-styled JSX.

**Why it is a problem:** These files are the hot spots for the review workflow; their size plus 1,291 inline style={{}} objects across src makes diffs unreviewable and encourages the copy-paste drift already observed.

**Suggested fix:** Split ReviewContent into per-worksheet-type renderers (mirroring src/pages/worksheets/ structure); extract WorksheetReview's mutation logic into a hook (useReviewActions) and StatusBadge into src/components

### M89 — Repo clutter: ~800KB of audit/planning markdown, seed/debug scripts, a PDF, and 17 overlapping SQL files are git-tracked with no canonical migration ordering

**Severity:** Medium

**Location:** Repo root: PRODUCTION_READINESS_AUDIT.md (221KB), AUDIT_FINDINGS_DETAIL.md (414KB), context.md (100KB), __seed_30_users.cjs (30.6KB), __seed_test_data.cjs (30.9KB), fix-assignments.cjs, serve-app.mjs, onboarding.pdf, Newton_Onboarding_Engineering_Review.txt, supabase_migration_*.sql (x2); db/ (15 SQL files: schema.sql, supabase_schema.sql, setup_correct.sql, __fix_rls_jwt.sql, __fix_rls_recursion.sql, seed_*.sql, ...)

**Description:** 31 tracked files sit at repo root including one-off fix scripts (fix-assignments.cjs), duplicate seeders, and 12 markdown planning docs. Database DDL exists in at least 4 overlapping variants (db/schema.sql, db/supabase_schema.sql, db/setup_correct.sql, root supabase_migration_*.sql) with no numbering or applied-state tracking; which one matches the live fuoqoryqndtdooujslee DB is undeterminable from the repo.

**Why it is a problem:** New contributors cannot tell canonical schema from legacy; ESLint even lints the seed .cjs files. Schema drift between the 4 DDL variants is a latent production incident.

**Suggested fix:** Move docs to docs/, seed/debug scripts to scripts/ (or delete one-offs), adopt supabase CLI migrations (supabase/migrations/NNNN_*.sql) and delete superseded SQL

### M90 — Worksheet data model is untyped: Record<string, any> plus 20 'as any' casts over JSONB payloads

**Severity:** Medium

**Location:** src/components/WorksheetPage.tsx:30-31 (data: Record<string, any>); src/pages/worksheets/ftp/W2C3.tsx:41-74 (10 '(data.mcqs as any[])' casts), W2E1.tsx:41-70, W2O1.tsx:40-41, W4O1.tsx:25, W3E1.tsx:12

**Description:** worksheet_data JSONB flows through the app as Record<string, any>; FTP worksheet forms index into it with repeated '(data.X as any[])?.[i-1]?.field' expressions. ESLint reports 22 no-explicit-any warnings. useWorksheet also injects reviewer metadata into the same bag as _saved* keys, mixing form data with review state under the any umbrella.

**Why it is a problem:** noUncheckedIndexedAccess and strict mode are effectively disabled for the app's primary data structure — field renames, shape mismatches between save and review render, and off-by-one array indexing all compile clean.

**Suggested fix:** Define per-worksheet payload interfaces (or zod schemas) keyed by worksheet id in worksheetConfigData, and type WorksheetPage generically: WorksheetPage<T>

**Example implementation:**

```
interface W2C3Data { mcqs: Mcq[]; codingQuestions: CodingQ[] } ... data: T; updateField<K extends keyof T>(k: K, v: T[K])
```

### L45 — Lint errors include real React runtime defects: component defined during render, use-before-declare in effects, sync setState in effects

**Severity:** Low _(adversarially verified: DOWNGRADED to this severity)_

**Location:** src/pages/WorksheetReview.tsx:284,315; src/pages/Dashboard.tsx:49; src/pages/Phase1.tsx:60; src/pages/PhaseReview.tsx:62; src/pages/Week1-4.tsx:19-20; src/components/ReviewContent.tsx:806; 9 set-state-in-effect sites (App.tsx:160, AuthCallback.tsx:17, PhaseAccessGuard.tsx:61, WeekAccessGuard.tsx:68, useNotifications.ts:84, ...)

**Description:** WorksheetReview.tsx:284 defines function StatusBadge inside the component and renders it at :315 — it is recreated (state/DOM reset) every render. 10 react-hooks/immutability errors flag callbacks accessed before declaration in dependency arrays (loadData/loadStatuses pattern repeated in 8 pages). 9 react-hooks/set-state-in-effect errors flag synchronous setState in effects causing cascading renders. ReviewContent.tsx:806 mutates a variable defined outside the component during render.

**Why it is a problem:** These are correctness hazards under React 19 (concurrent rendering), not style nits: badge remount flicker, stale-closure refetch bugs, and double-render cascades on auth/guard pages that gate the whole app.

**Steps to reproduce:** npx eslint src --format json; filter severity 2

**Suggested fix:** Hoist StatusBadge to module scope; convert the loadX-before-useEffect pattern to useCallback declared before the effect; move derived-state setState into render-time computation or event handlers

> Verifier evidence: WorksheetReview.tsx:284 StatusBadge is stateless/hook-free (remount invisible); Dashboard.tsx:55 and Phase1.tsx:66 are hoisted function declarations with [user] deps and commented eslint-disables — no stale closure possible; App.tsx:160 and PhaseAccessGuard.tsx:61 are standard mount-time setState (one extra pre-paint render); ReviewContent.tsx:806 window global is read synchronously at :933. Lint errors real, runtime impacts overstated.

### L46 — Tailwind 4 is installed and wired into Vite but unused: 0 utility-class usages vs 1,291 inline style objects

**Severity:** Low

**Location:** package.json:31,46 (tailwindcss, @tailwindcss/vite); vite.config.js:3,8; grep for utility classNames across src/**/*.tsx = 0 files

**Description:** tailwindcss + @tailwindcss/vite are dependencies and the plugin runs on every build, but no component uses Tailwind utilities — styling is 1,291 inline style={{...}} objects plus a custom 'lux-*' class system. The stack description claims a Tailwind app; the code is not one.

**Why it is a problem:** Dead dependency adds build time and misleads contributors about the styling convention; inline-style objects are recreated per render and can't be themed/audited centrally.

**Suggested fix:** Either remove tailwindcss/@tailwindcss/vite from package.json and vite.config.js, or commit to it and migrate the lux-* + inline-style hybrid incrementally

### L47 — Dead/legacy code still routed: Assessment.tsx and Stakeholders.tsx use the legacy onboarding_submissions table; GH-Pages/Netlify artifacts shipped on Vercel

**Severity:** Low

**Location:** src/pages/Assessment.tsx (191 lines, only src file querying from('onboarding_submissions')), src/pages/Stakeholders.tsx (5.1KB) — both mounted for any authenticated role in src/App.tsx; public/404.html, public/_redirects, .nojekyll (root)

**Description:** Assessment.tsx is the sole consumer of the legacy onboarding_submissions table and remains reachable at /assessment for every role; Stakeholders.tsx similarly legacy. public/404.html and public/_redirects are GitHub-Pages/Netlify SPA-fallback artifacts copied into every Vercel deploy, where vercel.json rewrites already handle routing; .nojekyll is tracked at root.

**Why it is a problem:** Legacy pages keep a deprecated table (and its RLS policies) alive and expand the authenticated attack/maintenance surface; the deploy artifacts confuse which platform is canonical.

**Suggested fix:** Delete Assessment/Stakeholders routes and pages (or gate them), drop onboarding_submissions after data migration, remove public/404.html, public/_redirects, .nojekyll

### L48 — Rebrand regression: footer line duplicated in App.tsx (visible on every page)

**Severity:** Low

**Location:** src/App.tsx:194-195

**Description:** Two identical <p> elements render 'Faculty Onboarding Programme' twice in the global footer — verified in current working tree: lines 194 and 195 are byte-identical.

**Why it is a problem:** User-visible cosmetic defect on every authenticated page; also a marker that the rebrand commit shipped without review (consistent with red CI).

**Suggested fix:** Delete line 195

**Example implementation:**

```
<p style={{...}}>Faculty Onboarding Programme</p>  // keep one
```

