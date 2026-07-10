# Independent Deep Review — Codex (gpt-5.6-sol, ultra effort)

_Second-opinion review run in parallel with the 20-dimension audit, against the same code (`origin/main` @ 2456096), read-only, in an isolated git worktree. It independently reached the same verdict and top-5 criticals, and surfaced several items folded into the remediation._

## Executive summary

**Verdict: NO — this repository is not safe to deploy.**

The highest-risk failures are verifiable from current HEAD:

- Any authenticated user can self-promote to an administrator/reviewer.
- Joinees can directly mark their own worksheets approved and forge review history.
- Merely opening an approved worksheet can revoke its approval.
- A failed worksheet read can overwrite existing saved data with defaults.
- The advertised database schema and migration runners cannot reliably install the claimed security fixes.
- Core gate, assessment, notification, password-recovery, and promotion flows are broken.

If this is already deployed, assume authorization roles and documented test accounts may be compromised until the live `pg_policies`, functions, users, and audit history are inspected.

## Critical findings

### C1 — Any authenticated user can self-promote to an administrator

**Location:** [db/schema.sql:68](`db/schema.sql:68`), `db/schema.sql:75-79,108-112,191-216,321-332`; `src/context/AuthContext.tsx:71-112,169-175`; `src/hooks/useAutoPromote.ts:68-71`

**Why it is a problem:** Multiple RLS policies authorize using `auth.jwt()->'user_metadata'->>'role'`, which the authenticated client can change through `auth.updateUser`. The purported `get_user_role()` hardening still falls back to that claim. In addition, `"Admin update profiles"` includes `OR id = auth.uid()` with no role-column restriction, so a user can directly update their own `user_profiles.role`.

An attacker can set `role:'academic_head'`, refresh the JWT, update their profile, then read or modify other profiles, assessments, and worksheet submissions.

**Suggested fix:** Remove every authorization reference and fallback to `user_metadata`. Store roles only in server-controlled `app_metadata` or a protected profile table accessed through a tightly scoped `SECURITY DEFINER` helper. Deny direct client changes to `role`, initialize roles server-side, revoke existing sessions, and audit current role assignments.

### C2 — The hardening policies do not replace the permissive policies

**Location:** [db/schema.sql:63](`db/schema.sql:63`), `db/schema.sql:185-187,207-216,335-374`; `supabase_migration_fix_rls_security.sql:64-115`; `db/__migration_notifications_dates.sql:34-37`

**Why it is a problem:** Policy names do not match:

- `"Update own profile"` is created, but `"Users can update own profile"` is dropped.
- `"Update own submissions"` is created, but `"Users can update own submissions"` is dropped.
- `"Reviewers update submissions"` is created, but `"Reviewers can update submissions"` is dropped.
- Legacy `"Insert notifications"` remains because hardening drops `"Users can insert notifications"`.

PostgreSQL combines permissive policies with OR. Adding a stricter policy therefore does not restrict any surviving permissive policy.

**Suggested fix:** In one transactional migration, inventory `pg_policies`, drop every actual legacy policy name, and create exactly one reviewed policy set per operation. Add an automated assertion against the resulting policy catalog.

### C3 — Joinees can self-approve and forge the complete review record

**Location:** [db/schema.sql:179](`db/schema.sql:179`), `db/schema.sql:150-151,185-216,350-374`; `supabase_migration_fix_rls_security.sql:82-115`; `scripts/fix_promotion_data.mjs:28-55`

**Why it is a problem:** Owner INSERT checks only `user_id`, allowing a row to be created already `approved` with arbitrary reviewer fields. Owner UPDATE permits every valid review status, including `buddy_approved` and `approved`. Reviewer policies do not enforce assignment, `reviewer_type`, old state, or role-specific transitions.

There is no transition trigger: the CHECK constraint only validates membership, and the only worksheet trigger updates timestamps. The repository’s own `fix_promotion_data.mjs` logs in as a joinee and writes `buddy_approved`, demonstrating the permission.

**Suggested fix:** Remove direct client access to workflow and audit columns. Implement transactional server-side operations for draft save, submit, resubmit, buddy decision, and manager phase approval. Validate caller role, assignment, expected previous state, and immutable terminal states; append review events server-side.

### C4 — Opening a worksheet can revoke approval and corrupt audit data

**Location:** [src/hooks/useAutoSave.ts:86](`src/hooks/useAutoSave.ts:86`), `src/hooks/useAutoSave.ts:95-124,191-203`; `src/hooks/useWorksheet.ts:92-99,120-132,197-203`; `src/components/WorksheetPage.tsx:82-106`

**Why it is a problem:** Initial worksheet state always contains five `_saved*` keys, so `Object.keys(...).length > 2` is always true. Autosave therefore runs after hydration without any user edit—even when the component renders an Approved view.

Normal submission persists `status:'submitted'` inside `worksheet_data`. On a later open:

- `approved + submitted` becomes `pending_review`.
- `needs_revision + submitted` becomes `revision_submitted`.
- `revision_submitted + submitted` becomes `pending_review`.

Hydration also omits `_savedReviewedBy`, while autosave explicitly writes `reviewed_by:null`. `dueDateSetRef` starts false on each mount, so opening non-approved rows also overwrites persisted deadlines.

**Suggested fix:** Track an explicit dirty flag and never autosave the hydration render. Draft autosave must update content only; it must omit every workflow, reviewer, audit, and deadline column. Move state transitions to explicit server operations.

### C5 — A failed SELECT can wipe an existing saved or approved worksheet

**Location:** [src/hooks/useAutoSave.ts:218](`src/hooks/useAutoSave.ts:218`), `src/hooks/useWorksheet.ts:120-146`; `src/hooks/useAutoSave.ts:191-203`

**Why it is a problem:** `loadWorksheetData()` discards Supabase’s `error` and returns `data`. Consequently, `{data:null,error}` is indistinguishable from a confirmed missing row. `useWorksheet` initializes defaults and sets `loaded=true`, enabling the unconditional autosave.

A transient SELECT failure followed by a recovered write replaces the existing worksheet JSON with defaults, resets review state, and clears reviewer attribution.

**Suggested fix:** Throw or return the query error separately. Maintain distinct `loading`, `loaded`, `notFound`, and `loadError` states. Once loading fails, disable all saves for that mount until the user explicitly retries and receives a successful read.

## High findings

### H1 — There is no reliable database installation or migration path

**Location:** [db/schema.sql:37](`db/schema.sql:37`), `db/schema.sql:39,261-267,282-321`; `scripts/run_rls_migration.cjs:38-120,153-198`; `scripts/run_migration.cjs:53-105`; `context.md:1879-1885`

**Why it is a problem:**

- Fresh `db/schema.sql` alters `user_profiles` before creating it.
- On an existing DB, it drops the role constraint, then `CREATE TABLE IF NOT EXISTS` does not recreate it.
- A notifications policy calls `get_user_role()` before that function is defined.
- The RLS runner’s comment filter retains only 8 of 21 parsed statements, skipping core hardening while retaining an unmatched policy DROP.
- The older runner discards comment-prefixed SQL and shreds PL/pgSQL function bodies on internal semicolons.
- The documented optional `setup_correct.sql` recreates insecure `user_metadata` and owner-update policies.
- Canonical notification types exclude `due_soon` and `overdue`, although the due-date function inserts them.

Both runners continue after failures and can still print completion.

**Suggested fix:** Replace all bespoke runners and hand-maintained “definitive” schemas with ordered Supabase CLI migrations. Execute transactionally, stop on the first failure, track versions, and integration-test the exact resulting tables, constraints, policies, functions, and triggers.

### H2 — Gate pass creation is rejected by RLS, then reported as successful

**Location:** [src/App.tsx:75](`src/App.tsx:75`), `src/config/worksheetConfigData.ts:521,531,542`; `src/pages/BuddyGatePass.tsx:121-122`; `src/hooks/useWorksheet.ts:104-114`; `src/hooks/useAutoSave.ts:107-124,167-210`; `db/schema.sql:179-182`

**Why it is a problem:** Joinee routes filter out `gc1`, `gc2`, and `gc3`; buddies are expected to create them for a target user. The buddy flow substitutes the joinee’s ID into the upsert. For an absent gate row, upsert performs INSERT, but RLS permits INSERT only when `auth.uid() = user_id`. Reviewer UPDATE permission cannot authorize an INSERT.

The first two save failures are swallowed while retries are scheduled, so `flushSave()` resolves and the buddy sees a success message even though no gate exists.

**Suggested fix:** Create gates through an assigned-buddy-only transactional RPC or pre-create rows server-side. Keep retries awaited and report success only after the server returns the created row.

### H3 — Legitimate review and promotion operations are non-atomic and incorrect

**Location:** [src/pages/PhaseReview.tsx:83](`src/pages/PhaseReview.tsx:83`), `src/pages/PhaseReview.tsx:103-180`; `src/pages/WorksheetReview.tsx:97-127,168-195`; `src/hooks/useAutoPromote.ts:60-75`

**Why it is a problem:**

- Phase approval requires only one `buddy_approved` row and no pending rows; missing and `needs_revision` worksheets are ignored.
- The handler approves the subset and announces the entire phase complete.
- Review UPDATEs do not include expected `review_status` or `updated_at`, so stale tabs can overwrite decisions.
- Each decision replaces a cached `review_history` array, losing concurrent events.
- Promotion updates the target profile, then calls `auth.updateUser()` without a target ID—changing the logged-in manager’s metadata, not the promoted joinee’s trusted role claim.

**Suggested fix:** Move review and promotion to transactional RPCs with compare-and-set state predicates. Re-read all expected phase worksheets in the transaction, append normalized immutable review events, and update the target user’s authoritative role server-side.

### H4 — Final assessment authorization is inverted and the UI cannot save it

**Location:** [src/pages/Assessment.tsx:53](`src/pages/Assessment.tsx:53`), `src/pages/Assessment.tsx:109-116`; `src/App.tsx:142`; `db/schema.sql:86-122`

**Why it is a problem:** The UI says a Faculty Lead completes the assessment, but the route allows any authenticated user. INSERT omits `user_id`, while RLS requires `auth.uid() = user_id`, so first submission is rejected. Managers may read other users’ assessments but cannot update them; the owner can directly control their own assessment fields through the API.

**Suggested fix:** Require a target joinee ID and perform assessment through an assigned-manager-only RPC. Restrict the route accordingly and deny joinees direct writes to assessor-controlled fields.

### H5 — Documented privileged test credentials must be assumed compromised

**Location:** [db/create_32_users.sql:14](`db/create_32_users.sql:14`), `db/create_32_users.sql:21-83`; `context.md:1868,1882-1898`; `fix-assignments.cjs:31-36`; `scripts/clean_setup.mjs:15,27-31,65-69`

**Why it is a problem:** The documented setup directly creates email-confirmed `academic_head`, `onboarding_lead`, and reviewer accounts with one committed password. Another script authenticates using the documented academic-head credential. Setup documentation points developers at the same concrete Supabase project reference.

If those seeds have ever run against the deployed project, anyone with repository access has privileged credentials.

**Suggested fix:** Before launch, delete or reset every seeded account, revoke their sessions, and review authentication/audit logs. Move all seed tooling to a separately guarded non-production project using randomly generated credentials.

### H6 — Notifications are either silently blocked or forgeable

**Location:** [db/schema.sql:281](`db/schema.sql:281`), `db/__migration_notifications_dates.sql:34-37`; `src/hooks/useAutoSave.ts:132-155`; `src/context/AuthContext.tsx:192-204`; `src/hooks/useNotifications.ts:151-184`

**Why it is a problem:** Under the canonical restricted policy, a joinee may insert only a notification addressed to themselves. Worksheet submit instead inserts notifications addressed to reviewers, so RLS rejects them. Signup similarly tries to enumerate privileged users that a joinee cannot read. `triggerNotification()` catches the error and returns success.

On legacy installs, the differently named `"Insert notifications"` policy remains `WITH CHECK (true)`, allowing authenticated users to forge messages to arbitrary recipients.

**Suggested fix:** Generate notifications inside the trusted state-transition transaction or a database trigger. Clients should never choose arbitrary recipients or notification types.

### H7 — A public `SECURITY DEFINER` function crosses RLS boundaries

**Location:** [db/__due_date_notifications.sql:16](`db/__due_date_notifications.sql:16`), `db/__due_date_notifications.sql:30-35,48-64,80-98`

**Why it is a problem:** `check_due_date_notifications()` is `SECURITY DEFINER`, has no caller check or fixed search path, and the repository never revokes default PUBLIC execution. If installed, an API caller can invoke it to scan all active worksheets, create notifications, and receive other users’ UUIDs, worksheet IDs, and due dates despite RLS.

**Suggested fix:** Revoke execution from PUBLIC, `anon`, and `authenticated`; grant it only to the cron/service owner. Set a fixed search path and return only a non-sensitive aggregate.

## Medium findings

### M1 — Supabase `{error}` results are ignored across core read paths

**Location:** [src/pages/AdminDashboard.tsx:77](`src/pages/AdminDashboard.tsx:77`)

**Complete data-only/ignored-result inventory:** `src/context/AuthContext.tsx:73,96,117,137`; `src/pages/AuthCallback.tsx:23`; `src/components/PhaseAccessGuard.tsx:62-72`; `src/components/WeekAccessGuard.tsx:85-118`; `src/hooks/useAutoSave.ts:71-76,223-240`; `src/hooks/useDueDates.ts:126-146`; `src/hooks/useNotifications.ts:61-75,105-132,176-211`; `src/hooks/useWorksheet.ts:136`; `src/pages/AdminDashboard.tsx:77-89`; `src/pages/BuddyDashboard.tsx:63-75`; `src/pages/OnboardingLeadDashboard.tsx:49-60`; `src/pages/Assessment.tsx:53`; `src/pages/BuddyGatePass.tsx:42-48`; `src/pages/Dashboard.tsx:57-66`; `src/pages/Phase1.tsx:69-79`; `src/pages/Phase2.tsx:75-87`; `src/pages/Phase3.tsx:76-88`; `src/pages/PhaseReview.tsx:70-79`; `src/pages/Week1.tsx:23-31`; `Week2.tsx:23-31`; `Week3.tsx:23-31`; `Week4.tsx:25-36`; `src/pages/WorksheetReview.tsx:52-65`.

**Why it is a problem:** Supabase query failures resolve rather than throw, so most surrounding `try/catch` blocks never execute. Dashboards render or cache empty business state, completed work appears not started, notification writes are optimistically reflected locally, and the worksheet assignment lookup explicitly fails open.

**Suggested fix:** Introduce one shared result-unwrapping helper that throws whenever `error` is present. Require explicit loading/error/empty states and assert returned or affected rows for mutations.

### M2 — Password recovery is a dead link

**Location:** [src/pages/Login.tsx:125](`src/pages/Login.tsx:125`), `src/App.tsx:99-103,145-146`

**Why it is a problem:** `/forgot-password` has no route or page. There is no `resetPasswordForEmail`, recovery-event handling, or password-update flow, so the link renders the 404 page.

**Suggested fix:** Implement reset-request and recovery pages, configure allowed Supabase redirect URLs, handle `PASSWORD_RECOVERY`, and test expired and reused links.

### M3 — Generic week URLs bypass week and phase gating

**Location:** [src/App.tsx:133](`src/App.tsx:133`), `src/pages/WeekWorksheetPage.tsx:12-42`; `src/config/worksheetConfig.tsx:89-105`

**Why it is a problem:** Guard selection is based only on the URL’s week prefix. `WeekWorksheetPage` accepts any registered worksheet ID without checking canonical week membership. A joinee can visit `/week-1/worksheet/w4_g1` or `/week-1/worksheet/p3_w1` and render/save future content without passing the relevant guard.

**Suggested fix:** Validate the route parameter against the canonical worksheet-to-week mapping and enforce progression again on the server when accepting submissions.

## False alarms explicitly rejected

- **The tracked Supabase publishable key is not a secret.** `.env` contains an `sb_publishable_` browser key, not a service-role key or PAT. The real vulnerability is unsafe RLS and committed account passwords.
- **No stored-XSS sink was found.** Database content is rendered through React JSX; there is no `dangerouslySetInnerHTML`, `innerHTML`, or raw HTML renderer in `src/`.
- **No classic SQL injection path was found.** Client values are passed through Supabase query-builder methods rather than concatenated SQL.
- **The synthetic target `User` object is not authentication impersonation.** It does not change `auth.uid()`; that is why cross-user gate INSERT fails.
- **Missing explicit `WITH CHECK` does not mean PostgreSQL performs no new-row check.** It reuses `USING`; the actual defect is that ownership-only expressions leave privileged columns and transitions unrestricted.
- **The self-table role lookup in the new UPDATE policy is not independently recursive under the canonical nonrecursive SELECT policies.**
- **SPA fallback and CI are present.** `vercel.json` supplies the Vercel rewrite and `.github/workflows/ci.yml` runs typecheck, lint, tests, and build.

## Most important fix first

**Stop deployment and replace the database trust boundary first:** ship one atomic, verified migration that removes all `user_metadata` authorization, drops every permissive legacy policy, and moves worksheet/review/role transitions into server-enforced transactional operations. Until that is done, client or UI fixes cannot make the system safe.