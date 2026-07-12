# AARAMBH Independent Production Readiness Audit

**Audit date:** 12 July 2026  
**Commit audited:** `9b27db893310ec01c412f9142036ef26ffa948ac` on `main`  
**Verdict:** **Not safe for production deployment**

The application has three release-blocking failures:

1. Any joinee can chain profile self-assignment with the privileged gate RPC to promote themselves to `lead_instructor`.
2. The server-side promotion requirements are exposed through an unprotected Data API table.
3. The legitimate final-approval flow never promotes the target joinee but tells the manager that it did.

## Verification performed

- `npx tsc --noEmit`: passed.
- ESLint: passed with **27 warnings**.
- Write-free production build: passed; 1,905 modules transformed.
  - Main JS: 323,735 bytes uncompressed.
  - Worksheet configuration chunk: 81,247 bytes.
- Installed direct versions:
  - React 19.2.7
  - Supabase JS 2.108.2
  - Vite 8.0.16
  - Vitest 4.1.9
- Vite 8.0.16 is newer than the 8.0.5 fix for the reviewed Vite advisory. The reviewed React advisory concerns React Server Components, which this client-only SPA does not use. [Vite advisory](https://github.com/advisories/GHSA-p9ff-h696-f583), [React advisory](https://github.com/react/react/security/advisories/GHSA-rv78-f8rc-xrxh)
- No `dangerouslySetInnerHTML`, direct `innerHTML`, `eval`, dynamic function construction, client-built SQL, or open external redirect was found.
- Tests could not execute in this read-only audit environment because Vite attempted to create `node_modules/.vite-temp` and received `EROFS`. This is an audit-environment limitation, not proof of test failure.
- `npm audit` could not reach the npm registry (`EAI_AGAIN`), so the dependency assessment is not a complete vulnerability scan.
- No live Supabase or Vercel access was available. Applied migrations, key rotation, SMTP, OAuth, redirect allowlists, backups and production environment variables remain externally unverified.

---

# Critical findings

## C-01 — Any joinee can directly self-promote through the gate RPC

- **Severity:** Critical
- **Location:** [`20260710000006_row_level_security.sql:65`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000006_row_level_security.sql:65), [`20260710000007_gate_submission_rpc.sql:25`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000007_gate_submission_rpc.sql:25), [`20260710000003_review_state_machine.sql:107`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000003_review_state_machine.sql:107), [`20260710000005_promotion_rpc_and_due_dates.sql:54`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000005_promotion_rpc_and_due_dates.sql:54)
- **Description:** A user may change every field on their own profile except `role`, including `assigned_buddy_id`. The privileged gate RPC then authorizes any caller whose UUID equals that field. It accepts arbitrary worksheet IDs and any valid review status, while fresh inserts bypass the UPDATE-only state-machine trigger.
- **Why it matters:** A newly registered joinee can manufacture fully approved submissions and become a `lead_instructor` without any reviewer.
- **Steps to reproduce:**
  1. Sign in as a `new_joinee`.
  2. Update the caller’s `assigned_buddy_id` to the caller’s own UUID.
  3. Call `upsert_gate_submission` for every promotion-required worksheet with `p_status='approved'`.
  4. Call `promote_user_if_eligible`.
- **Expected vs current:** Assignment fields should be admin-controlled and the RPC should accept only `gc1`, `gc2` or `gc3` with a server-derived status. Currently the complete privilege-escalation chain is available to the joinee.
- **Root cause:** Authorization is based on client-writable profile data, and privileged RPC parameters are trusted without server-side domain or transition validation.
- **Suggested fix:** Revoke direct writes to assignment fields; replace them with an audited administrative RPC. Remove `p_status`, hard-reject non-gate IDs, derive `buddy_approved` internally, validate target role and phase prerequisites, and enforce initial insert states server-side.

## C-02 — Promotion requirements are exposed as a writable Data API table

- **Severity:** Critical
- **Location:** [`20260710000005_promotion_rpc_and_due_dates.sql:19`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000005_promotion_rpc_and_due_dates.sql:19), [`20260710000006_row_level_security.sql:13`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000006_row_level_security.sql:13)
- **Description:** `promotion_required_worksheets` is created in `public` but omitted from the RLS migration and all explicit `REVOKE` statements.
- **Why it matters:** On Supabase’s documented existing-project defaults, new public tables receive Data API privileges for `anon` and `authenticated`. A user can remove requirements until one approved worksheet remains and self-promote, or add bogus requirements to block all promotions. [Supabase API security documentation](https://supabase.com/docs/guides/api/securing-your-api)
- **Steps to reproduce:** As an authenticated joinee, delete requirement rows except one already-approved ID, then invoke `promote_user_if_eligible`.
- **Expected vs current:** Promotion criteria must be server-only configuration. The repository currently relies on undocumented external grant changes for protection.
- **Root cause:** The RLS inventory covers only four application tables and misses the security-sensitive fifth table.
- **Suggested fix:** `REVOKE ALL` from `PUBLIC`, `anon`, and `authenticated`; enable RLS with no client policies; grant only the migration/service role. Add a CI assertion over table ACLs and `pg_policies`.

## C-03 — Final manager approval never promotes the joinee but reports success

- **Severity:** Critical
- **Location:** [`PhaseReview.tsx:162`](/home/ash1794/projects/Onboarding/src/pages/PhaseReview.tsx:162), [`useAutoPromote.ts:23`](/home/ash1794/projects/Onboarding/src/hooks/useAutoPromote.ts:23), [`20260710000005_promotion_rpc_and_due_dates.sql:37`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000005_promotion_rpc_and_due_dates.sql:37), [`useAutoPromote.test.ts:77`](/home/ash1794/projects/Onboarding/src/hooks/__tests__/useAutoPromote.test.ts:77)
- **Description:** The manager checks the target joinee locally, but the no-argument RPC operates only on `auth.uid()`. It therefore checks the manager, returns `promoted:false`, and does not update the joinee. The hook ignores returned data and treats any response without a transport error as successful.
- **Why it matters:** The terminal onboarding journey is non-functional, while staff receive a false success message.
- **Steps to reproduce:** Approve the final phase as an academic head, inspect the success toast, then inspect the target’s `user_profiles.role`.
- **Expected vs current:** The target should be promoted atomically and the UI should display the authoritative server result. Currently the target remains `new_joinee`.
- **Root cause:** A caller-only remediation was not reconciled with the manager-initiated workflow; the RPC response contract is discarded.
- **Suggested fix:** Implement an assigned-manager-only `approve_phase_and_promote(target_user_id, phase)` transaction or a server trigger. Verify the complete canonical set, update the target, and require the client to honor returned `promoted` and `message` values.

---

# High findings

## H-01 — Reviewer RLS violates least privilege

- **Severity:** High
- **Location:** [`20260710000006_row_level_security.sql:76`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000006_row_level_security.sql:76), [`20260710000006_row_level_security.sql:85`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000006_row_level_security.sql:85), [`20260710000006_row_level_security.sql:143`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000006_row_level_security.sql:143), [`20260710000006_row_level_security.sql:154`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000006_row_level_security.sql:154)
- **Description:** Every lead instructor can read every profile and worksheet, update every profile, and act on any joinee whose assignment is NULL.
- **Why it matters:** A newly promoted buddy immediately gains organization-wide faculty PII and worksheet data. A buddy can also assign themselves to another joinee and review that user’s work.
- **Steps to reproduce:** Sign in as a lead instructor, query an unassigned user’s submissions, then update that user’s `assigned_buddy_id`.
- **Expected vs current:** Buddies should see and mutate only explicitly assigned joinees. Current role-wide clauses make assignment predicates ineffective.
- **Root cause:** Broad role-based OR conditions and fail-open NULL-assignment fallbacks.
- **Suggested fix:** Scope lead reads and updates to `assigned_buddy_id=auth.uid()`. Remove the NULL wildcard. Restrict assignment administration to a narrow, audited academic-head/onboarding-lead RPC.

## H-02 — Reviewed content and audit records remain client-mutable

- **Severity:** High
- **Location:** [`20260710000003_review_state_machine.sql:35`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000003_review_state_machine.sql:35), [`20260710000006_row_level_security.sql:117`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000006_row_level_security.sql:117), [`20260710000006_row_level_security.sql:136`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000006_row_level_security.sql:136)
- **Description:** The state trigger returns immediately when `review_status` is unchanged. Owners may therefore rewrite approved worksheet JSON, identifiers, phase, reviewer type and deadlines. Initial inserts may also contain forged reviewer names, timestamps, comments and history.
- **Why it matters:** Reviewers can approve one snapshot while the joinee later replaces it without re-review. The purported audit trail cannot be trusted.
- **Steps to reproduce:** Insert a pending row with fabricated `review_history`, then PATCH `worksheet_data` on an approved row without changing `review_status`.
- **Expected vs current:** Reviewed snapshots and server audit fields should be immutable. Both operations currently pass.
- **Root cause:** Direct table writes expose workflow/audit columns, and the trigger validates only status changes.
- **Suggested fix:** Use narrow draft, submit and review RPCs. Reject owner content changes outside draft/needs-revision states, derive reviewer identity and time from `auth.uid()`/`now()`, require array/non-null history, and use `COALESCE` when appending.

## H-03 — Autosave and submission writes are non-serialized and can lie about success

- **Severity:** High
- **Location:** [`useWorksheet.ts:241`](/home/ash1794/projects/Onboarding/src/hooks/useWorksheet.ts:241), [`useAutoSave.ts:131`](/home/ash1794/projects/Onboarding/src/hooks/useAutoSave.ts:131), [`useAutoSave.ts:241`](/home/ash1794/projects/Onboarding/src/hooks/useAutoSave.ts:241), [`WorksheetPage.tsx:82`](/home/ash1794/projects/Onboarding/src/components/WorksheetPage.tsx:82)
- **Description:** Submit changes local status before persistence, causing an immediate Submitted view. An already-running or newly scheduled background save is not cancelled or serialized and can persist `status='submitted'` without the review transition. Revision resubmission also leaves the local saved review status stale.
- **Why it matters:** Users can see a permanent success screen after a failed submission, reviewer queues can miss orphaned rows, and stale autosaves can modify reviewed content.
- **Steps to reproduce:** Delay/fail the explicit submit upsert while permitting a later ordinary autosave; click Submit and inspect both UI and stored status.
- **Expected vs current:** Submission state and review transition should commit atomically, with rollback on failure. Current independent last-write-wins paths can produce partial state.
- **Root cause:** Optimistic mutation, whole-document upserts, no version/CAS token, and no per-worksheet write queue.
- **Suggested fix:** Implement submission as a server transaction. Serialize autosaves, suspend them during submission, compare versions, update local status only after success, and rollback on error.

## H-04 — Manager “Request revision” always fails

- **Severity:** High
- **Location:** [`WorksheetReview.tsx:242`](/home/ash1794/projects/Onboarding/src/pages/WorksheetReview.tsx:242), [`PhaseReview.tsx:177`](/home/ash1794/projects/Onboarding/src/pages/PhaseReview.tsx:177), [`20260710000003_review_state_machine.sql:83`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000003_review_state_machine.sql:83), [`20260710000006_row_level_security.sql:176`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000006_row_level_security.sql:176)
- **Description:** Both manager interfaces attempt `buddy_approved → needs_revision`. The database trigger and manager RLS policy permit only `buddy_approved → approved`.
- **Why it matters:** Managers cannot return deficient work after buddy approval.
- **Steps to reproduce:** Open a buddy-approved worksheet as academic head, enter a comment and request revision.
- **Expected vs current:** The worksheet should enter `needs_revision`, or the action should not exist. The database rejects it.
- **Root cause:** Frontend and database transition matrices diverged.
- **Suggested fix:** Add the manager-revision edge consistently to the trigger and RLS, require assignment and a non-empty comment, and cover it with SQL integration tests.

## H-05 — Phase approval accepts incomplete phases

- **Severity:** High
- **Location:** [`PhaseReview.tsx:105`](/home/ash1794/projects/Onboarding/src/pages/PhaseReview.tsx:105), [`PhaseReview.tsx:224`](/home/ash1794/projects/Onboarding/src/pages/PhaseReview.tsx:224)
- **Description:** `canApprove` requires at least one buddy-approved row and no pending rows but ignores missing and needs-revision worksheets. The database performs only per-row updates and has no phase-level invariant.
- **Why it matters:** A manager can receive “Phase approved” after approving a single worksheet while the rest are missing.
- **Steps to reproduce:** Create one buddy-approved row, omit the other phase rows, open the direct phase-review URL and approve.
- **Expected vs current:** Every required row should exist and be buddy-approved in one transaction. Current behavior approves only rows present.
- **Root cause:** Completeness is client-derived and not part of the database command.
- **Suggested fix:** Add a canonical worksheet-definition table and transactional phase-approval RPC that locks and verifies the exact required set.

## H-06 — Reused worksheet IDs make later weekly tasks impossible

- **Severity:** High
- **Location:** [`weeklyWorksheets.ts:24`](/home/ash1794/projects/Onboarding/src/config/weeklyWorksheets.ts:24), [`weeklyWorksheets.ts:35`](/home/ash1794/projects/Onboarding/src/config/weeklyWorksheets.ts:35), [`weeklyWorksheets.ts:48`](/home/ash1794/projects/Onboarding/src/config/weeklyWorksheets.ts:48), [`weeklyWorksheets.ts:59`](/home/ash1794/projects/Onboarding/src/config/weeklyWorksheets.ts:59), [`20260710000001_initial_schema.sql:150`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000001_initial_schema.sql:150)
- **Description:** `p1_w6` represents different Week 1 and Week 2 work; `p3_w5` represents different Week 3 and Week 4 work. Storage allows only one row per user and worksheet ID.
- **Why it matters:** Completing the earlier occurrence makes the later route load a locked submitted row, preventing completion of the distinct deliverable.
- **Steps to reproduce:** Submit Week 1 `p1_w6`, unlock Week 2, and open Week 2 `p1_w6`. Repeat for `p3_w5`.
- **Expected vs current:** Each scheduled deliverable should have independent state. Current occurrences collide.
- **Root cause:** A reusable form/component ID is being used as a curriculum-occurrence identifier.
- **Suggested fix:** Assign unique occurrence IDs or introduce a curriculum-instance entity and migrate existing data. Add a uniqueness test across all weekly definitions.

## H-07 — Onboarding-lead reviewer and buddy configurations deadlock work

- **Severity:** High
- **Location:** [`worksheetConfigData.ts:419`](/home/ash1794/projects/Onboarding/src/config/worksheetConfigData.ts:419), [`AssignmentsTab.tsx:62`](/home/ash1794/projects/Onboarding/src/components/admin/AssignmentsTab.tsx:62), [`20260710000004_server_side_notifications.sql:38`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000004_server_side_notifications.sql:38), [`20260710000006_row_level_security.sql:196`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000006_row_level_security.sql:196)
- **Description:** Several worksheets designate `onboarding_lead` as reviewer and submissions notify only onboarding leads. The assignment UI also allows onboarding leads as buddies. However, onboarding leads have no worksheet update policy and cannot access the buddy route.
- **Why it matters:** The notified/assigned reviewer cannot perform the required approval, while the authorized buddy may receive no alert.
- **Steps to reproduce:** Assign an onboarding lead as buddy or submit `p1_w4`, `p1_w5` or `p2_w4`; attempt first-stage review.
- **Expected vs current:** Configuration, notifications, routes and RLS should implement one role model. They currently contradict one another.
- **Root cause:** Legacy `reviewer_type` remains operational despite the database enforcing a universal buddy-first pipeline.
- **Suggested fix:** Choose one model and align configuration, routes, notifications, trigger transitions and RLS. Do not allow an ineligible role to be assigned.

## H-08 — Anonymous users can execute the due-date administration RPC

- **Severity:** High
- **Location:** [`20260710000005_promotion_rpc_and_due_dates.sql:100`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000005_promotion_rpc_and_due_dates.sql:100)
- **Description:** `check_due_date_notifications()` is `SECURITY DEFINER`, performs an organization-wide scan and writes notifications, but has no caller check or explicit revoke.
- **Why it matters:** Under documented Supabase public-function defaults, an anonymous caller can bypass RLS, enumerate user UUID/worksheet/due-date metadata and repeatedly force database work. [Supabase API security documentation](https://supabase.com/docs/guides/api/securing-your-api)
- **Steps to reproduce:** With the browser publishable key only, POST to `/rest/v1/rpc/check_due_date_notifications`.
- **Expected vs current:** Only an internal scheduler should execute the function and it should expose no row-level data.
- **Root cause:** Search-path hardening was applied, but execution privileges were not.
- **Suggested fix:** Revoke execute from `PUBLIC`, `anon` and `authenticated`; move it to a private schema or grant only a dedicated scheduler role; return aggregate status only.

## H-09 — Assessment records are attached to the assessor, not the faculty member

- **Severity:** High
- **Location:** [`Assessment.tsx:59`](/home/ash1794/projects/Onboarding/src/pages/Assessment.tsx:59), [`20260710000001_initial_schema.sql:94`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000001_initial_schema.sql:94), [`20260710000006_row_level_security.sql:95`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000006_row_level_security.sql:95)
- **Description:** The form accepts a target instructor’s name/email but stores `user_id` as the signed-in assessor. The target exists only as unconstrained text.
- **Why it matters:** Assessments belong to managers rather than joinees, second assessors cannot safely update them, duplicates make `.maybeSingle()` fail, and a joinee can create an “assessment” directly through the API.
- **Steps to reproduce:** Submit an assessment for a joinee as a manager and inspect `user_id`; repeat from another reviewer.
- **Expected vs current:** Subject and assessor should be separate foreign keys with assignment-scoped authorization.
- **Root cause:** Legacy owner-authored submission RLS was reused for an assessor-authored domain object.
- **Suggested fix:** Add `subject_user_id`, `assessed_by`, uniqueness/versioning and a server-side assessment RPC. Remove direct client writes to authoritative assessment fields.

## H-10 — Deadline data is calculated from invented dates and remains user-controlled

- **Severity:** High
- **Location:** [`useDueDates.ts:48`](/home/ash1794/projects/Onboarding/src/hooks/useDueDates.ts:48), [`useAutoSave.ts:96`](/home/ash1794/projects/Onboarding/src/hooks/useAutoSave.ts:96), [`useAutoSave.ts:168`](/home/ash1794/projects/Onboarding/src/hooks/useAutoSave.ts:168), [`PhaseWorksheetList.tsx:74`](/home/ash1794/projects/Onboarding/src/components/PhaseWorksheetList.tsx:74), [`20260710000006_row_level_security.sql:65`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000006_row_level_security.sql:65)
- **Description:** A missing start date falls back to 30 days ago. Autosave may calculate before the profile query finishes and permanently store the wrong due date. Owners can also change their own `start_date` and worksheet `due_date`.
- **Why it matters:** New faculty may appear overdue on day one, while users can evade overdue reporting by editing authorization-unrestricted date fields.
- **Steps to reproduce:** Open a worksheet immediately after signup under a delayed profile request, or PATCH an owned due date into the future.
- **Expected vs current:** Deadlines should derive from an admin-controlled start date on the server. Current browser-generated values are accepted as authoritative.
- **Root cause:** Multiple client-side date sources, an unsafe demo fallback and unrestricted profile/submission updates.
- **Suggested fix:** Make start dates admin-managed, calculate due dates in a server trigger/RPC, block saves until the authoritative value loads, and remove the demo fallback from production.

## H-11 — CI does not test the actual authorization boundary or core journeys

- **Severity:** High
- **Location:** [`.github/workflows/ci.yml:21`](/home/ash1794/projects/Onboarding/.github/workflows/ci.yml:21), [`vitest.config.ts:18`](/home/ash1794/projects/Onboarding/vitest.config.ts:18), [`useAutoPromote.test.ts:77`](/home/ash1794/projects/Onboarding/src/hooks/__tests__/useAutoPromote.test.ts:77), [`e2e-full-flow.mjs:159`](/home/ash1794/projects/Onboarding/scripts/e2e-full-flow.mjs:159)
- **Description:** CI runs mocked Vitest tests but never starts Supabase, applies migrations, verifies ACL/RLS/RPC behavior, or drives a browser. The promotion unit test treats an empty successful RPC response as promotion.
- **Why it matters:** Both Critical database exploits and the broken promotion journey can merge with green CI.
- **Steps to reproduce:** Introduce an RLS regression or return `{promoted:false}` from the RPC; current mocks do not detect the production behavior.
- **Expected vs current:** CI should exercise malicious and legitimate users against a disposable migrated database and browser.
- **Root cause:** Tests mock the data boundary, while the old “E2E” script provisions roles through metadata the hardened signup trigger ignores.
- **Suggested fix:** Add pinned Supabase CLI setup, database reset/lint, SQL or pgTAP role-matrix tests, and Playwright flows for auth, revision, phase approval and promotion.

## H-12 — Database security deployment is manual and unverified

- **Severity:** High
- **Location:** [`.github/workflows/ci.yml:21`](/home/ash1794/projects/Onboarding/.github/workflows/ci.yml:21), [`db/README.md:23`](/home/ash1794/projects/Onboarding/db/README.md:23), [`db/README.md:92`](/home/ash1794/projects/Onboarding/db/README.md:92), [`REMEDIATION.md:47`](/home/ash1794/projects/Onboarding/docs/audit/2026-07-10/REMEDIATION.md:47)
- **Description:** Frontend deployment neither validates nor applies migrations. There is no schema-version assertion, backup step, rollback procedure or restore drill.
- **Why it matters:** A successful Vercel deployment can run against old vulnerable RLS or a schema missing required RPCs.
- **Steps to reproduce:** Deploy `main` without running `supabase db push`; Vercel succeeds independently of database state.
- **Expected vs current:** Database and compatible frontend should be promoted through one controlled release sequence with recovery evidence.
- **Root cause:** Migration files exist, but release orchestration remains a manual side channel.
- **Suggested fix:** Test migrations twice on scratch DB, back up, apply through an approved deployment job, verify migration/policy catalog state, then promote the frontend. Document database and frontend rollback.

## H-13 — Missing or placeholder production environment variables do not fail the build

- **Severity:** High
- **Location:** [`package.json:11`](/home/ash1794/projects/Onboarding/package.json:11), [`.github/workflows/ci.yml:32`](/home/ash1794/projects/Onboarding/.github/workflows/ci.yml:32), [`supabase.ts:4`](/home/ash1794/projects/Onboarding/src/api/supabase.ts:4)
- **Description:** Environment validation occurs only when the browser executes the application. Vite successfully builds with missing or truthy placeholder Supabase values.
- **Why it matters:** Vercel can publish a green deployment where login, signup and every data operation fail.
- **Steps to reproduce:** Build with both variables unset or with `.env.example` placeholders, then load the artifact.
- **Expected vs current:** CI and Vercel should reject invalid production configuration before publishing. Current code installs a throwing runtime proxy.
- **Root cause:** No prebuild environment schema or placeholder validation exists.
- **Suggested fix:** Add a prebuild validator for required variables, URL shape, key format and placeholders. Run it before typecheck/build in CI and Vercel.

---

# Medium findings

## M-01 — Gate prerequisites and approval evidence are not authoritatively validated

- **Severity:** Medium
- **Location:** [`useGateControl.ts:131`](/home/ash1794/projects/Onboarding/src/hooks/useGateControl.ts:131), [`GateControl1.tsx:37`](/home/ash1794/projects/Onboarding/src/pages/gate-controls/GateControl1.tsx:37), [`GateControl2.tsx:36`](/home/ash1794/projects/Onboarding/src/pages/gate-controls/GateControl2.tsx:36), [`GateControl3.tsx:38`](/home/ash1794/projects/Onboarding/src/pages/gate-controls/GateControl3.tsx:38)
- **Description:** Buddy mode explicitly skips prerequisite checks. Gate 1 and 2 require only an employee name; most milestones, evidence, decisions and signatures remain optional.
- **Why it matters:** A materially blank gate can become buddy-approved and enter manager approval.
- **Steps to reproduce:** Open a gate as buddy, provide only the employee name and submit.
- **Expected vs current:** Required phase completion and evidence should be checked server-side. Current validation is presentation-only.
- **Root cause:** No authoritative gate schema or server prerequisite rule exists.
- **Suggested fix:** Define gate-specific validation, enforce canonical prerequisites and evidence inside the gate RPC, and reject blank/default milestone sets.

## M-02 — Standard worksheet load failures become an endless spinner

- **Severity:** Medium
- **Location:** [`useWorksheet.ts:143`](/home/ash1794/projects/Onboarding/src/hooks/useWorksheet.ts:143), [`WorksheetPage.tsx:82`](/home/ash1794/projects/Onboarding/src/components/WorksheetPage.tsx:82)
- **Description:** The hook exposes `loadError` and `retryLoad`, but the shared worksheet page ignores both and renders Loading whenever `loaded` is false.
- **Why it matters:** A transient network or RLS failure leaves most worksheets inaccessible without recovery.
- **Steps to reproduce:** Fail `loadWorksheetData` and open a standard worksheet.
- **Expected vs current:** Users should see a clear error and Retry action. Current UI remains on Loading.
- **Root cause:** The shared view does not consume the hook’s error-recovery API.
- **Suggested fix:** Render the error state before Loading and wire it to `retryLoad`.

## M-03 — Notification delivery and navigation contracts are incomplete

- **Severity:** Medium
- **Location:** [`20260710000004_server_side_notifications.sql:27`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000004_server_side_notifications.sql:27), [`AssignmentsTab.tsx:73`](/home/ash1794/projects/Onboarding/src/components/admin/AssignmentsTab.tsx:73), [`useNotifications.ts:172`](/home/ash1794/projects/Onboarding/src/hooks/useNotifications.ts:172), [`NotificationBell.tsx:65`](/home/ash1794/projects/Onboarding/src/components/NotificationBell.tsx:65)
- **Description:** Decision events are only partially generated server-side. Assignment notifications attempt cross-user client inserts that RLS denies, and errors are swallowed. The bell treats every event as a worksheet event, despite signup and promotion notifications carrying empty IDs.
- **Why it matters:** Users miss assignments/revisions/approvals, while signup and promotion clicks open malformed or incorrect routes.
- **Steps to reproduce:** Assign a buddy, request revision, and click a signup or promotion notification.
- **Expected vs current:** Workflow operations should atomically create typed events with valid destinations. Current delivery is partial and routing is inferred from incomplete data.
- **Root cause:** Notifications lack a typed event/entity/action contract.
- **Suggested fix:** Generate all workflow notifications in trusted RPCs/triggers, return failures, and store a validated internal destination or typed action payload.

## M-04 — Authentication state, profile state and JWT roles can become stale

- **Severity:** Medium
- **Location:** [`AuthContext.tsx:36`](/home/ash1794/projects/Onboarding/src/context/AuthContext.tsx:36), [`AuthContext.tsx:151`](/home/ash1794/projects/Onboarding/src/context/AuthContext.tsx:151), [`AuthContext.tsx:242`](/home/ash1794/projects/Onboarding/src/context/AuthContext.tsx:242), [`20260710000002_role_resolution_and_signup.sql:14`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000002_role_resolution_and_signup.sql:14)
- **Description:** Profile requests have no generation/user check or cancellation. `SIGNED_IN` starts a profile fetch without resetting loading, and only that event refreshes the profile. Database role synchronization does not invalidate existing JWTs.
- **Why it matters:** Protected deep links can redirect before hydration; an old request can install another user’s profile after account switching; promoted/demoted roles remain stale until token refresh.
- **Steps to reproduce:** Sign out or switch accounts while a profile request is delayed, or change a privileged role while retaining the existing token.
- **Expected vs current:** Profile and authorization state should correspond to the active session and sensitive revocation should take effect promptly.
- **Root cause:** Session, profile and role freshness share incomplete asynchronous lifecycle handling.
- **Suggested fix:** Add request generations/AbortController, set profile loading on every user change, verify IDs before committing results, refresh session/profile after role changes, and revoke sessions for privileged demotions.

## M-05 — Password reset accepts an unrelated authenticated session

- **Severity:** Medium
- **Location:** [`ResetPassword.tsx:23`](/home/ash1794/projects/Onboarding/src/pages/ResetPassword.tsx:23), [`ResetPassword.tsx:75`](/home/ash1794/projects/Onboarding/src/pages/ResetPassword.tsx:75)
- **Description:** Any existing session makes the page ready, not only a session established by `PASSWORD_RECOVERY`.
- **Why it matters:** Opening an expired or cross-account recovery link while signed in changes the current account’s password and presents a misleading login redirect.
- **Steps to reproduce:** Sign in as account A, open an invalid reset link, and submit a new password.
- **Expected vs current:** Only a valid recovery exchange should authorize this page. An ordinary session currently suffices.
- **Root cause:** `getSession()` is treated as proof of recovery context.
- **Suggested fix:** Require the recovery event/code exchange, handle URL errors explicitly, and define whether the recovery session is retained or signed out after success.

## M-06 — Institutional enrollment and production auth controls are not release-controlled

- **Severity:** Medium
- **Location:** [`Signup.tsx:18`](/home/ash1794/projects/Onboarding/src/pages/Signup.tsx:18), [`AuthContext.tsx:197`](/home/ash1794/projects/Onboarding/src/context/AuthContext.tsx:197), [`ForgotPassword.tsx:21`](/home/ash1794/projects/Onboarding/src/pages/ForgotPassword.tsx:21), [`README.md:115`](/home/ash1794/projects/Onboarding/README.md:115)
- **Description:** The internal faculty portal offers unrestricted email/Google signup, accepts six-character passwords, and explicitly reveals registered addresses through the zero-identities response. Redirect allowlists, Google provider settings, email confirmation and SMTP remain external dashboard state.
- **Why it matters:** Unauthorized internet users can create joinee records and notification load, while recovery/OAuth may fail after launch despite green CI.
- **Steps to reproduce:** Register a non-institutional address, repeat with a known address, or deploy to a fresh Supabase project without dashboard configuration.
- **Expected vs current:** Enrollment eligibility, generic responses, password policy and provider/redirect settings should be documented and verified release controls.
- **Root cause:** Business enrollment policy and auth-service configuration are not represented in versioned infrastructure.
- **Suggested fix:** Use invitations or a server-side domain/allowlist check, generic duplicate responses, stronger password/MFA policy, CAPTCHA/rate limits, and production auth smoke tests.

## M-07 — Browser and in-memory caches are not user-scoped or cleared on logout

- **Severity:** Medium
- **Location:** [`useAutoSave.ts:293`](/home/ash1794/projects/Onboarding/src/hooks/useAutoSave.ts:293), [`App.tsx:175`](/home/ash1794/projects/Onboarding/src/App.tsx:175), [`queryCache.ts:26`](/home/ash1794/projects/Onboarding/src/utils/queryCache.ts:26), [`AuthContext.tsx:231`](/home/ash1794/projects/Onboarding/src/context/AuthContext.tsx:231)
- **Description:** Employee name, progress and fallback dates use global localStorage keys. The dashboard query cache is process-global, and logout clears neither.
- **Why it matters:** On shared devices, the next user can inherit another faculty member’s displayed name/progress or stale reviewer data. Assignment refresh can also return cached pre-mutation data.
- **Steps to reproduce:** Use account A, sign out, then sign in as account B in the same browser.
- **Expected vs current:** Cache keys should include user/project identity and all user data should be cleared on session change.
- **Root cause:** Caches were designed around a single-user browser session.
- **Suggested fix:** Namespace keys by user ID, clear all local/in-memory caches on auth changes, and invalidate relevant dashboard keys after mutations.

## M-08 — Progression UI uses inconsistent completion definitions

- **Severity:** Medium
- **Location:** [`WeekAccessGuard.tsx:130`](/home/ash1794/projects/Onboarding/src/components/WeekAccessGuard.tsx:130), [`Dashboard.tsx:28`](/home/ash1794/projects/Onboarding/src/pages/Dashboard.tsx:28), [`Dashboard.tsx:97`](/home/ash1794/projects/Onboarding/src/pages/Dashboard.tsx:97)
- **Description:** Week gating treats `status='submitted'` as complete even when `review_status='needs_revision'`. Dashboard progress counts every approved row but divides by a smaller phase list that omits gates and unrelated weekly rows.
- **Why it matters:** Users can advance while revisions remain outstanding, see progress beyond 100%, or see a phase complete while its gate still blocks access.
- **Steps to reproduce:** Request revision after submission, or approve additional FTP/gate rows and inspect dashboard progress.
- **Expected vs current:** All progression views should derive from one canonical state/set. Current calculations disagree.
- **Root cause:** Duplicated client-side predicates and worksheet lists.
- **Suggested fix:** Define one server-backed completion model, make `needs_revision` incomplete, filter numerator and denominator to the same set, and clamp display values defensively.

## M-09 — Weekly and buddy gate routes lose curriculum context

- **Severity:** Medium
- **Location:** [`WeekWorksheetPage.tsx:42`](/home/ash1794/projects/Onboarding/src/pages/WeekWorksheetPage.tsx:42), [`Phase2Worksheet3.tsx:8`](/home/ash1794/projects/Onboarding/src/pages/worksheets/Phase2Worksheet3.tsx:8), [`BuddyDashboard.tsx:24`](/home/ash1794/projects/Onboarding/src/pages/BuddyDashboard.tsx:24), [`BuddyGatePass.tsx:25`](/home/ash1794/projects/Onboarding/src/pages/BuddyGatePass.tsx:25)
- **Description:** Weekly routes reuse legacy components whose return paths point to phase pages. The buddy dashboard also offers FTP gates `w1_g1`–`w4_g1`, while `BuddyGatePass` recognizes only `gc1`–`gc3`.
- **Why it matters:** Users are sent to locked/wrong pages, and valid-looking buddy actions terminate at “Invalid Gate Pass.”
- **Steps to reproduce:** Complete `p2_w3` from Week 2 and use Back, or click a generated FTP gate action.
- **Expected vs current:** Route-instance context should determine the return destination and supported gate component.
- **Root cause:** Navigation context is hardcoded inside reusable components, and gate registries are inconsistent.
- **Suggested fix:** Pass occurrence/back-route context from `WeekWorksheetPage` and use one canonical gate registry for dashboard actions, routes and components.

## M-10 — Fixed query caps silently truncate operational dashboards

- **Severity:** Medium
- **Location:** [`BuddyDashboard.tsx:77`](/home/ash1794/projects/Onboarding/src/pages/BuddyDashboard.tsx:77), [`AdminDashboard.tsx:84`](/home/ash1794/projects/Onboarding/src/pages/AdminDashboard.tsx:84), [`OnboardingLeadDashboard.tsx:56`](/home/ash1794/projects/Onboarding/src/pages/OnboardingLeadDashboard.tsx:56)
- **Description:** Buddy submissions are limited to 200; admin/monitoring profiles to 500 and worksheets to 2,000, without pagination or truncation indicators.
- **Why it matters:** A buddy with roughly six fully active joinees can lose older rows from readiness calculations. Larger cohorts disappear silently from admin views.
- **Steps to reproduce:** Create more rows than the configured limits and compare dashboard counts with database totals.
- **Expected vs current:** Complete paginated data or server aggregates should be used. Current oldest rows vanish silently.
- **Root cause:** Query limits are being used as dataset boundaries.
- **Suggested fix:** Add cursor pagination, explicit `hasMore` states and server-side readiness/count aggregates.

## M-11 — Polling and due processing will scale poorly and can duplicate events

- **Severity:** Medium
- **Location:** [`useNotifications.ts:50`](/home/ash1794/projects/Onboarding/src/hooks/useNotifications.ts:50), [`20260710000005_promotion_rpc_and_due_dates.sql:115`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000005_promotion_rpc_and_due_dates.sql:115), [`20260710000001_initial_schema.sql:274`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000001_initial_schema.sql:274)
- **Description:** Every logged-in tab polls every 15 seconds. Due processing loops over every incomplete row, performs per-row COUNT/INSERT operations and lacks a due-date index or unique event key. Concurrent promotion/due calls can duplicate notifications.
- **Why it matters:** Database load grows with active tabs and total history rather than current work; retries can create duplicate user-facing events.
- **Steps to reproduce:** Open multiple tabs/users or invoke the due/promotion functions concurrently.
- **Expected vs current:** Realtime/event-driven updates, set-based processing and idempotent inserts should be used.
- **Root cause:** Client polling and check-then-write loops with indexes that do not match hot access patterns.
- **Suggested fix:** Use Supabase Realtime or visibility-aware backoff, rewrite due processing as `INSERT … SELECT … ON CONFLICT`, add event uniqueness and indexes such as partial `due_date` and `(user_id, created_at DESC)`.

## M-12 — CI runs on an end-of-life Node version

- **Severity:** Medium
- **Location:** [`package.json:6`](/home/ash1794/projects/Onboarding/package.json:6), [`.github/workflows/ci.yml:16`](/home/ash1794/projects/Onboarding/.github/workflows/ci.yml:16)
- **Description:** CI pins Node 20 and the package accepts every version `>=20`. Node 20 is EOL, and Supabase ended Node 20 support on 30 June 2026. [Node release status](https://nodejs.org/en/about/previous-releases), [Supabase support notice](https://supabase.com/changelog/45715-deprecation-notice-dropping-support-for-node-js-20)
- **Why it matters:** CI no longer receives runtime security fixes and permitted dependency updates may stop supporting it.
- **Steps to reproduce:** Inspect the workflow and compare it with current Node/Supabase support status.
- **Expected vs current:** Development, CI and Vercel should use one supported LTS version.
- **Root cause:** Runtime pins were not advanced with the dependency ecosystem.
- **Suggested fix:** Pin Node 24 consistently using `engines`, `.node-version`, CI and Vercel, and declare the npm package-manager version.

## M-13 — Test/reset scripts can target production with predictable credentials

- **Severity:** Medium
- **Location:** [`create-test-users.mjs:12`](/home/ash1794/projects/Onboarding/scripts/create-test-users.mjs:12), [`clean_setup.mjs:15`](/home/ash1794/projects/Onboarding/scripts/clean_setup.mjs:15), [`e2e-full-flow.mjs:23`](/home/ash1794/projects/Onboarding/scripts/e2e-full-flow.mjs:23)
- **Description:** Scripts consume generic environment variables, share `Test123!`, lack a production-project refusal and include delete-all/test-account operations.
- **Why it matters:** A developer pointed at production can create predictable accounts or attempt destructive data operations.
- **Steps to reproduce:** Configure the root environment for production and run one of the scripts.
- **Expected vs current:** Test tooling should require a dedicated project and explicit confirmation. Current scripts act on the configured endpoint.
- **Root cause:** No environment isolation or destructive-operation guardrail.
- **Suggested fix:** Require `TEST_SUPABASE_*`, deny the production project ref, generate credentials, require a confirmation token and archive incompatible scripts.

## M-14 — Production failures are invisible to operators

- **Severity:** Medium
- **Location:** [`ErrorBoundary.tsx:26`](/home/ash1794/projects/Onboarding/src/components/ErrorBoundary.tsx:26), [`main.tsx:1`](/home/ash1794/projects/Onboarding/src/main.tsx:1), [`vite.config.js:16`](/home/ash1794/projects/Onboarding/vite.config.js:16)
- **Description:** Render crashes, failed saves and auth/data failures terminate at `console.error`. There is no remote telemetry, release identifier, correlation ID, synthetic journey monitor or alerting; sourcemaps are disabled.
- **Why it matters:** Operators may learn about failed onboarding only from users and cannot correlate incidents with deployments.
- **Steps to reproduce:** Throw inside a routed component or make Supabase unavailable.
- **Expected vs current:** Privacy-filtered production errors and critical-journey failures should be monitored and tied to a deployment SHA.
- **Root cause:** Error UI was implemented without an observability pipeline.
- **Suggested fix:** Add client error/performance telemetry, hidden sourcemap upload, release SHA, save/auth alerts and synthetic production smoke tests.

## M-15 — Self-hosted fonts add approximately 2 MiB of unoptimized assets

- **Severity:** Medium
- **Location:** [`index.css:9`](/home/ash1794/projects/Onboarding/src/styles/index.css:9), [`vercel.json:20`](/home/ash1794/projects/Onboarding/vercel.json:20), [`public/fonts`](/home/ash1794/projects/Onboarding/public/fonts)
- **Description:** Eight full TTF files total approximately 2 MiB. The explicit immutable cache rule covers `/assets/*`, not `/fonts/*`.
- **Why it matters:** Users download substantially more typography data than necessary, particularly across pages using multiple weights.
- **Steps to reproduce:** Inspect the Network panel while visiting pages that use the different Inter and Playfair faces.
- **Expected vs current:** Subset or variable WOFF2 files with versioned immutable caching should be used.
- **Root cause:** CDN fonts were copied as full TTF files without web optimization.
- **Suggested fix:** Convert/subset to WOFF2 or variable fonts, version filenames and add a long-lived immutable font cache rule.

## M-16 — Database domains permit arbitrary and nullable operational state

- **Severity:** Medium
- **Location:** [`20260710000001_initial_schema.sql:75`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000001_initial_schema.sql:75), [`20260710000001_initial_schema.sql:112`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000001_initial_schema.sql:112), [`20260710000003_review_state_machine.sql:54`](/home/ash1794/projects/Onboarding/supabase/migrations/20260710000003_review_state_machine.sql:54)
- **Description:** Role, user IDs, review state, JSON and multiple booleans remain nullable. Worksheet ID, phase and general status have no canonical FK/domain. NULL review status evades `NOT IN` validation, while authenticated owners can create arbitrary pending worksheet IDs and large JSON payloads.
- **Why it matters:** Invalid rows, reviewer notification spam, storage abuse and state-machine bypasses can enter through the Data API.
- **Steps to reproduce:** Insert an owned pending submission with an unknown worksheet ID/phase and oversized JSON, or PATCH `review_status` to NULL.
- **Expected vs current:** Worksheet identity and all workflow fields should have strict, non-null server domains and bounded payloads.
- **Root cause:** Text/JSON columns and destination-only trigger checks substitute for a canonical worksheet definition/schema.
- **Suggested fix:** Add a worksheet-definition FK, NOT NULL and phase/status constraints, null-safe exact transition edges, request-size controls and server-side payload validation.

---

# Low findings

## L-01 — Important interactive controls are not keyboard operable

- **Severity:** Low
- **Location:** [`NotificationBell.tsx:203`](/home/ash1794/projects/Onboarding/src/components/NotificationBell.tsx:203), [`GateControl1.tsx:118`](/home/ash1794/projects/Onboarding/src/pages/gate-controls/GateControl1.tsx:118), [`Signup.tsx:91`](/home/ash1794/projects/Onboarding/src/pages/Signup.tsx:91)
- **Description:** Notification rows and milestone controls are clickable `div` elements without focus/keyboard semantics. Password visibility buttons lack accessible labels.
- **Why it matters:** Keyboard and assistive-technology users cannot reliably operate core controls.
- **Steps to reproduce:** Navigate the bell or gate form using Tab, Enter and Space with no mouse.
- **Expected vs current:** Interactive elements should be semantic links/buttons with visible focus and accessible names.
- **Root cause:** Pointer handlers were attached to non-interactive presentation elements.
- **Suggested fix:** Use buttons/links, add focus styles, keyboard behavior, popup semantics and descriptive `aria-label`s.

## L-02 — CSP still permits all inline styles

- **Severity:** Low
- **Location:** [`vercel.json:14`](/home/ash1794/projects/Onboarding/vercel.json:14)
- **Description:** `style-src` includes `'unsafe-inline'`.
- **Why it matters:** This weakens CSP’s defense-in-depth against style injection, although no current frontend XSS sink was found.
- **Steps to reproduce:** Inspect the deployed Content-Security-Policy.
- **Expected vs current:** Styles should use trusted static CSS, hashes or nonces.
- **Root cause:** Extensive React inline style objects.
- **Suggested fix:** Incrementally migrate styles to static CSS/Tailwind and remove `'unsafe-inline'`.

## L-03 — Lint allows correctness warnings to accumulate

- **Severity:** Low
- **Location:** [`eslint.config.js:45`](/home/ash1794/projects/Onboarding/eslint.config.js:45), [`AuthContext.tsx:242`](/home/ash1794/projects/Onboarding/src/context/AuthContext.tsx:242), [`package.json:12`](/home/ash1794/projects/Onboarding/package.json:12)
- **Description:** CI exits successfully with 27 warnings, including hook dependency and React correctness warnings.
- **Why it matters:** New stale-closure or mutation warnings can accumulate while the quality gate remains green.
- **Steps to reproduce:** Run `npm run lint`, then `npx eslint . --max-warnings=0`.
- **Expected vs current:** Correctness rules or a warning baseline should gate regressions.
- **Root cause:** Broad warning downgrades with no warning budget.
- **Suggested fix:** Resolve semantic warnings and enforce zero warnings or a non-increasing baseline.

## L-04 — Release and database documentation overstate current behavior

- **Severity:** Low
- **Location:** [`CHANGELOG.md:10`](/home/ash1794/projects/Onboarding/CHANGELOG.md:10), [`db/README.md:46`](/home/ash1794/projects/Onboarding/db/README.md:46), [`package.json:4`](/home/ash1794/projects/Onboarding/package.json:4)
- **Description:** The changelog claims a service worker/offline-ready PWA despite no service worker or registration. It declares `1.0.0-beta` while package metadata remains `0.0.0`. The migration-order table omits migration 07.
- **Why it matters:** Operators cannot reliably map releases or follow complete database deployment instructions.
- **Steps to reproduce:** Search for service-worker registration and compare the migration table with the directory.
- **Expected vs current:** Documentation should describe shipped behavior and every required migration.
- **Root cause:** Release documentation was updated independently of implementation and migration inventory.
- **Suggested fix:** Correct the PWA claim, align version/release metadata, add deploy SHA reporting and document migration 07.

---

# July 10 prior-audit cross-check

| Status | Prior item |
|---|---|
| Fixed in current tree | Signup no longer sends a caller-selected role; server forces `new_joinee`. |
| Fixed in current tree | `.env` is no longer tracked and `.env.example` contains placeholders. |
| Fixed in current tree | Former Week 2 rejected-promise infinite loader has an error path. |
| Fixed in current tree | Vercel CSP/security headers, error boundary, Dependabot, CI and worksheet lazy loading exist. |
| Fixed in current tree | Security-definer functions use a fixed empty `search_path`; FK delete behavior and worksheet uniqueness exist. |
| Partially fixed | RLS/state-machine migrations exist, but assignment fields, approved content, audit metadata and privileged RPC inputs remain unsafe. |
| Partially fixed | Password-reset pages exist, but recovery-context validation and production redirect configuration remain incomplete. |
| Partially fixed | Notifications moved partly server-side, but decisions and assignments remain incomplete or broken. |
| Still unresolved | Live migration application and app-metadata backfill are not verifiable. |
| Still unresolved | Seeded predictable-password accounts, staging isolation, monitoring, backups/restore and rollback evidence remain unverified. |
| Still present in history | The former `.env` is recoverable from Git history. It contained a publishable browser key rather than a service-role key, but rotation/project audit status cannot be verified. |

The prior report’s high confidence in the backend and its “production-ready with minor issues” verdict is not supported by current SQL behavior.

---

# Severity counts

| Severity | Count |
|---|---:|
| Critical | 3 |
| High | 13 |
| Medium | 16 |
| Low | 4 |
| **Total** | **36** |

# Scores

| Category | Score |
|---|---:|
| Production Readiness | **24/100** |
| Security | **20/100** |
| Code Quality | **58/100** |
| Maintainability | **52/100** |
| Performance | **63/100** |
| Scalability | **40/100** |
| UI/UX | **47/100** |
| Documentation | **54/100** |
| Testing | **28/100** |

# Can this application be safely deployed to production today?

## **No**

## Prioritized fix checklist

### P0 — Required before any production deployment

- [ ] Close the self-promotion chain: protect assignment fields and replace the gate RPC with a strict gate-only implementation.
- [ ] Revoke all client access to `promotion_required_worksheets`.
- [ ] Revoke public/anonymous execution of every non-public function, especially the due-date RPC.
- [ ] Implement one atomic, authorized phase-approval and target-promotion transaction.
- [ ] Make reviewed worksheet snapshots and audit metadata server-authoritative and immutable.
- [ ] Align manager revision transitions across client, trigger and RLS.
- [ ] Apply the corrected migrations to a disposable Supabase instance and execute an adversarial role matrix before touching production.
- [ ] Verify the live project’s actual ACLs, policies, migration versions and role metadata.

### P1 — Required before go-live approval

- [ ] Give every weekly curriculum occurrence a unique persistence identity and migrate colliding data.
- [ ] Serialize autosave/submit writes and add versioned conflict detection.
- [ ] Align onboarding-lead, buddy and manager configuration, routes, notifications and RLS.
- [ ] Replace the assessment table contract with separate subject and assessor identities.
- [ ] Move start/due-date calculation and enforcement to the server.
- [ ] Add build-time environment validation.
- [ ] Add disposable Supabase, RLS/RPC and browser journey tests to CI.
- [ ] Establish a database-first deployment pipeline with backup, verification and rollback.
- [ ] Verify invite/domain policy, SMTP, OAuth, reset redirect allowlist, rate limits and seeded account cleanup.

### P2 — Production hardening

- [ ] Add dashboard pagination/server aggregates and replace 15-second polling.
- [ ] Add production telemetry, release identification and synthetic journey monitoring.
- [ ] Upgrade CI/Vercel to Node 24.
- [ ] Isolate or remove destructive test scripts.
- [ ] Fix keyboard accessibility, cache isolation, font delivery, lint warnings and release documentation.