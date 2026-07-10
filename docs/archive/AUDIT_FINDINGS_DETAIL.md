# Newton Onboarding — Full Audit Findings (all severities)

**Audit date:** 2026-07-09. Companion to `PRODUCTION_READINESS_AUDIT.md`. Every finding below survived adversarial verification (CRITICAL/HIGH) or was reported at MEDIUM/LOW.

Totals: 21 CRITICAL · 45 HIGH · 90 MEDIUM · 40 LOW.

## Dim 1: Spec Compliance — 24/100

> The implementation diverges sharply from what ARCHITECTURE_PLAN.md and REVIEW_FLOW.md promise. The 'strict, DB-enforced' review state machine exists only as a value-set CHECK constraint (db/schema.sql:151) — there is no trigger validating state transitions, and the RLS UPDATE policies place no restriction on which columns/values a joinee or reviewer can write, so a joinee can self-approve via a raw API call. The exact 'status case inconsistency' bug the plan called out to fix was fixed for ordinary worksheets but never for Gate Controls, silently breaking gate submission and permanently blocking Phase 2/3. The docs describe a clean 20-worksheet 3-phase model that the code has replaced with a larger overlapping 'FTP week' structure never reflected in any audited document. QA_REPORT.md's '0 critical bugs' verdict predates this drift and cannot be trusted.

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

#### 3. [HIGH] PHASE_WORKSHEETS_MAP restructuring is undocumented and causes cross-phase worksheets to be approved prematurely

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

#### 4. [HIGH] Auto-promotion notification hardcodes a stale worksheet count ('All 20 worksheets')

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

#### 5. [MEDIUM] ReviewContent FIELD_SECTIONS still reference fields removed by the documented 'dead state' bug fixes

- **Dimension:** Dim 1: Spec Compliance
- **Location:** `src/components/ReviewContent.tsx:384 (p1_w1: mentorName, mentorEmail), :434 (p1_w6: reflectionDoubts, reflectionLabDiff) vs src/pages/worksheets/Phase1Worksheet1.tsx:14-20 and Phase1Worksheet6.tsx`
- **Effort:** S

**Description.** ARCHITECTURE_PLAN.md §4 documents these fields as dead state to be removed from p1_w1/p1_w6 — done in the worksheet components' defaultData, but ReviewContent.tsx's FIELD_SECTIONS map (used to render submitted data for reviewers) was never updated and still lists these nonexistent keys. The file's own drift warning (ReviewContent.tsx:815-819) only fires the opposite direction, so this staleness is invisible to the codebase's own safety net.

**Impact / failure scenario.** Reviewers see blank/undefined rows for phantom fields.

**Current behavior.** Stale field references render empty values in the review UI.

**Expected behavior.** FIELD_SECTIONS kept in sync with each worksheet's actual defaultData shape.

**Suggested fix.** Remove mentorName/mentorEmail from p1_w1's section map and reflectionDoubts/reflectionLabDiff from p1_w6's; add a reverse drift check to ReviewContent.test.ts.

---

#### 6. [MEDIUM] Notifications table allows any authenticated user to spoof notifications to any user (spec confirmation)

- **Dimension:** Dim 1: Spec Compliance
- **Location:** `db/__migration_notifications_dates.sql:35-37 — CREATE POLICY 'Insert notifications' ... WITH CHECK (true)`
- **Effort:** S

**Description.** ARCHITECTURE_PLAN.md §3 defines notifications as system-triggered. The RLS INSERT policy places no constraint on user_id/from_user_id/type/message — any authenticated user can insert an arbitrary notification addressed to any other user, impersonating any from_user_id with fabricated type:'approved' messages.

**Impact / failure scenario.** Spoofing/spam vector inconsistent with the declarative-RLS security pattern the docs claim.

**Current behavior.** WITH CHECK (true).

**Expected behavior.** Restrict inserts to from_user_id = auth.uid() (or NULL for system) and/or move notification creation server-side.

**Suggested fix.** Tighten the INSERT policy's WITH CHECK clause.

---

#### 7. [MEDIUM] Due-date notification automation is dormant by default and unverifiable from the repo

- **Dimension:** Dim 1: Spec Compliance
- **Location:** `db/__due_date_notifications.sql:108-122 (the cron.schedule(...) call is commented out)`
- **Effort:** S

**Description.** ARCHITECTURE_PLAN.md §3 lists due_soon/overdue as automated daily-check notifications. check_due_date_notifications() exists, but the pg_cron schedule registration is commented out with 'Uncomment and run after enabling pg_cron.' No evidence in the repo that this step was performed against the live project.

**Impact / failure scenario.** Unless manually enabled out-of-band, due-date/overdue notifications silently never fire. QA_REPORT.md lists notifications/due dates under 'Not tested (needs SQL migration)'.

**Current behavior.** Feature code exists but is not wired to run automatically.

**Expected behavior.** The cron job is confirmed active in production, or the docs flag this as an open item.

**Suggested fix.** Confirm pg_cron is enabled and the schedule registered; add a smoke test or admin-visible status indicator.

---

#### 8. [LOW] QA_REPORT.md's clean bill of health predates significant undocumented restructuring and should not be relied on

- **Dimension:** Dim 1: Spec Compliance
- **Location:** `QA_REPORT.md:1-6 (dated June 15, 2026, '30/30 tests pass', '0 critical bugs')`
- **Effort:** S

**Description.** The report covers a version before the FTP/week restructuring and does not exercise Gate Control submission end-to-end in a way that would have caught the status casing regression. Two of this review's CRITICAL findings directly contradict its '0 critical bugs' conclusion.

**Impact / failure scenario.** Stakeholders reading QA_REPORT.md as a launch-readiness signal would be misled.

**Current behavior.** Stale QA sign-off document still present at repo root.

**Expected behavior.** QA pass re-run against current main with the gate-control submit→review→approve flow exercised per role.

**Suggested fix.** Re-run QA against current main; version/date-stamp the report against a specific commit SHA.

---

#### 9. [LOW] TypeScript migration plan appears substantially complete but tracking docs go untouched

- **Dimension:** Dim 1: Spec Compliance
- **Location:** `src/**/*.tsx, src/**/*.ts vs TYPESCRIPT_MIGRATION_PLAN.md / TYPESCRIPT_MIGRATION_EXECUTION.md (all checkboxes unchecked)`
- **Effort:** S

**Description.** The execution tracker shows 0/10 for every phase, but src/ is almost entirely .ts/.tsx — the migration is functionally done but the tracking document was never updated. tsc --noEmit could not be run in the sandbox, so full completion (vs 'compiles with any casts') is unverified from static reading.

**Impact / failure scenario.** Documentation drift; the planning docs cannot be used to gauge actual TS coverage.

**Current behavior.** Trackers unchecked despite a near-complete migration.

**Expected behavior.** Trackers reflect reality, or are deleted; tsc --noEmit runs in CI to give a real completion signal.

**Suggested fix.** Update or delete the execution tracker; run tsc --noEmit in CI.

---

## Dim 2: Code Quality — 32/100

> Static analysis only — node_modules is not installed in this environment so `npm test`/`npm run lint` could not be executed (both failed with 'Permission denied' / missing binaries); no CI config exists at the repo root to confirm these gates run anywhere. Reading the source directly surfaced a critical, fully-traced production bug caused by uncentralized status strings, massive copy-pasted business logic across the Phase1-3/Week1-4 pages, a 1043-line God Component (ReviewContent.tsx) with zero behavioral test coverage, four dead 'fix-fg' migration scripts plus a pile of orphaned one-off admin scripts committed to the repo, and systemic silent error-swallowing on every dashboard's data load. TypeScript config itself is reasonably strict (strict, noUnusedLocals, noUncheckedIndexedAccess), which is the one bright spot.

#### 1. [CRITICAL] Gate Control / Gate Artifact submissions never enter the review queue — 'Submitted' vs 'submitted' casing mismatch

- **Dimension:** Dim 2: Code Quality
- **Location:** `src/hooks/useGateControl.ts:163 (writes status: 'Submitted'), src/hooks/useAutoSave.ts:87,126 (checks data.status === 'submitted'), src/hooks/useWorksheet.ts:198,222 (writes/reads lowercase 'submitted'), src/pages/WorksheetReview.tsx:77,265`
- **Verification:** CONFIRMED — Verified: useGateControl.ts:163 writes status:'Submitted' (capital), while useAutoSave.ts:87/126 and useWorksheet.ts:198/222 all check/write lowercase 'submitted', and WorksheetReview.tsx:77 blocks approve unless review_status is 'pending_review'/'revision_submitted' (which stays '' for gate submissions); the symptom-patch at WorksheetReview.tsx:265 (status === '' && submission.status === 'Submitted') is present verbatim, confirming the bug was already observed downstream.
- **Effort:** S

**Description.** useGateControl.handleSubmit (used by all 7 gate pages: GateControl1/2/3.tsx and GateArtifact1-4.tsx) writes `status: 'Submitted'` with a capital S. Every consumer of that field elsewhere checks the lowercase literal `'submitted'`: useAutoSave.ts line 87 computes `newReviewStatus` from `data.status === 'submitted'` — since it's false, review_status is left as `''` instead of `'pending_review'`. Line 126's `isNewSubmission` check (also `data.status === 'submitted'`) is likewise false, so `triggerNotification` is never called — the reviewer is never notified. useWorksheet.ts line 222's `isSubmitted` derived state is also permanently false for these pages, so the 'Submitted' confirmation screen (GateControl1.tsx:65-78, GateArtifact*.tsx) never renders after submit — the form just falls through to itself, looking to the user like nothing happened. Finally, WorksheetReview.tsx:77 hard-blocks the buddy/manager approve action unless `review_status` is exactly `'pending_review'` or `'revision_submitted'` — since it's `''`, `handleBuddyApprove` returns the error 'Cannot approve: worksheet is in "" state.' WorksheetReview.tsx:265 has a special-cased badge-rendering patch (`status === '' && submission.status === 'Submitted'`) that someone already added as a symptom-level workaround for exactly this bug, without fixing the root cause — proving the bug is real and previously observed, not theoretical.

**Impact / failure scenario.** Employee submits Gate Control 1 (30-day milestone review). Toast says 'Gate submitted for review.' Buddy/manager dashboards (BuddyDashboard.tsx:83, AdminDashboard.tsx:117/166, OnboardingLeadDashboard.tsx:77, PhaseReview.tsx:169 — all filter on review_status === 'pending_review') never show it in their pending queue because review_status is ''. No notification is sent. If a reviewer manually navigates to the WorksheetReview URL for that user/worksheet, clicking Approve is explicitly rejected by the guard at line 77. The gate — which is the mechanism that unlocks the next phase — is permanently stuck; the employee cannot be approved through the normal review flow for any of the 7 gate pages.

**Suggested fix.** Introduce a single shared status constant module (e.g. src/constants/status.ts exporting SUBMISSION_STATUS = { SUBMITTED: 'submitted', IN_PROGRESS: 'In Progress', ... } as const) and use it everywhere status/review_status literals appear (useGateControl.ts, useWorksheet.ts, useAutoSave.ts, WorksheetReview.tsx, all Phase/Week pages). As an immediate hotfix, change useGateControl.ts:163 from `status: 'Submitted'` to `status: 'submitted'` to match the rest of the codebase, then remove the now-unnecessary special case at WorksheetReview.tsx:265.

---

#### 2. [HIGH] Identical 'is worksheet complete' business logic and ~150 lines of page markup copy-pasted across 7 files

- **Dimension:** Dim 2: Code Quality
- **Location:** `src/pages/Phase1.tsx:148,156; src/pages/Phase2.tsx:94; src/pages/Phase3.tsx:95; src/pages/Week1.tsx:42; src/pages/Week2.tsx:44; src/pages/Week3.tsx:44; src/pages/Week4.tsx:58`
- **Verification:** CONFIRMED — Verified: the exact predicate `s?.status === 'submitted' || s?.review_status === 'approved' || s?.review_status === 'buddy_approved'` appears verbatim at Phase1.tsx:148,156, Phase2.tsx:94, Phase3.tsx:95, Week1.tsx:42, Week2.tsx:44, Week3.tsx:44, Week4.tsx:58 (8 occurrences, 7 files, exactly as cited); each file also redeclares its own StatusInfo/WorksheetMeta interfaces and an identical inline loadStatuses() Supabase query against worksheet_submissions; Phase1.tsx:236-259 vs Week1.tsx:48-71 show near-identical header/progress-bar/reviewer-legend JSX with matching inline style objects. PhaseWorksheetList.tsx already exists in src/components, confirming the proposed extraction pattern is a natural, already-precedented fix. HIGH severity is appropriate given the breadth (7 files) and the concrete correlated-bug consequence.
- **Effort:** M

**Description.** The exact expression `s?.status === 'submitted' || s?.review_status === 'approved' || s?.review_status === 'buddy_approved'` is duplicated verbatim in 8 places across 7 different page files, each with its own separate `loadStatuses`/inline Supabase fetch (`.from('worksheet_submissions').select('worksheet_id, status, review_status').eq('user_id', ...)`), its own StatusInfo/WorksheetMeta interface redeclared per file, and ~150 lines of identical inline-style header/progress-bar/reviewer-legend JSX (compare Phase1.tsx:230-283 to Week1.tsx:45-86 — same structure, same inline style objects, same class names) repeated near-verbatim in Phase2, Phase3, Week1-4.

**Impact / failure scenario.** The gate-completion bug above is a direct consequence of this pattern: the completion rule lives in 8 separate copies instead of one, so when the status vocabulary drifted (Submitted vs submitted), nobody could fix it in one place, and it's easy for a future edit to fix 6 of the 8 copies and miss 2. Any future change to what counts as 'complete' (e.g. adding a new review_status value) requires manually auditing and editing 7 files; missing even one silently produces incorrect progress percentages/badges for that phase or week.

**Suggested fix.** Extract a shared `isWorksheetComplete(status: StatusInfo): boolean` helper and a shared `useWorksheetStatuses(user, ids)` hook (mirroring the existing PhaseWorksheetList component pattern) that all Phase*/Week* pages call. Extract the shared header/progress-bar/reviewer-legend block into a `PhaseHeader` component parameterized by title/subtitle/dayRange/worksheets, the same way PhaseWorksheetList already abstracts the list rendering.

---

#### 3. [MEDIUM] Four dead 'fix-fg' scripts and multiple orphaned one-off admin scripts committed to the repo, targeting files that no longer exist

- **Dimension:** Dim 2: Code Quality
- **Location:** `scripts/setup/fix-fg.cjs, scripts/setup/fix-fg.js, scripts/setup/fix-fg.mjs, scripts/setup/fix-fg-all.cjs`
- **Verification:** not-required
- **Effort:** S

**Description.** All four fix-fg variants operate exclusively on `src/pages/worksheets/*.jsx` (e.g. fix-fg.cjs:5 `fs.readdirSync(dir).filter(f => f.endsWith('.jsx'))`; fix-fg-all.cjs:5 `glob.sync('src/pages/worksheets/*.jsx')`). I verified there are zero .jsx files anywhere in src/ (`find src -name '*.jsx'` returns nothing) — the worksheet pages were migrated to TypeScript (src/pages/worksheets/*.tsx) and refactored to use the shared `FieldGroup`/`WorksheetPage` components (confirmed by reading Phase1Worksheet1.tsx, which has no `FG` component at all — `grep -rln 'function FG|const FG' src/pages/worksheets/*.tsx` returns 0 matches). These scripts are 100% dead: running any of them today does nothing (empty file list) or, for fix-fg-all.cjs, would immediately throw `Cannot find module 'glob'` since `glob` is not declared in package.json dependencies at all. None of the 12 scripts under scripts/setup/ (__create_15_users.cjs, __create_users.cjs, __full_setup.cjs, __test_reviewer_flow.cjs, create-admin.cjs, plus root-level __seed_30_users.cjs, __seed_test_data.cjs, fix-assignments.cjs) are referenced by any npm script or doc.

**Impact / failure scenario.** Dead code inflates the surface area a new engineer has to understand, and a script named 'fix-fg-all.cjs' sitting in the repo signals to future maintainers that FG-related bugs might still exist and be fixable this way, wasting investigation time. The broken `require('glob')` also means even a curious contributor who tries to run it hits an immediate crash.

**Suggested fix.** Delete scripts/setup/fix-fg.cjs, fix-fg.js, fix-fg.mjs, fix-fg-all.cjs. Audit the remaining scripts/setup/*.cjs and root __*.cjs files for actual current use; move any still-needed ones into a documented `scripts/` with a README explaining when to run them, and delete the rest.

---

#### 4. [MEDIUM] ReviewContent.tsx is a 1043-line, ~42KB God Component mixing static config data with 20 rendering functions — and only the config half has test coverage

- **Dimension:** Dim 2: Code Quality
- **Location:** `src/components/ReviewContent.tsx:1-1043 (FIELD_SECTIONS config at 380-760, 20 top-level functions including SignatureBadge, DateBadge, StringField, TableRenderer, ChecklistRenderer, ScoreGridRenderer, MilestonesRenderer, renderWithLayout, renderGeneric, renderField, renderBooleansList)`
- **Verification:** not-required
- **Effort:** M

**Description.** A single file defines: field-formatting helpers (toLabel, isSignature, isDateField, shouldSkip, isBooleanField, renderValue), 7 distinct renderer components, a 380-line FIELD_SECTIONS layout-config object (lines 380-760) describing per-worksheet section layouts, and the exported `ReviewContent` component plus 4 more layout-dispatch functions. It violates single-responsibility on two axes at once (data vs. rendering) and is by far the largest file in src/pages+components (2nd is Navbar.tsx at 429 lines, less than half the size). src/components/__tests__/ReviewContent.test.ts (139 lines) only imports and asserts against `FIELD_SECTIONS` — none of the 20 rendering functions (TableRenderer, ChecklistRenderer, ScoreGridRenderer, MilestonesRenderer, renderField, renderWithLayout, renderGeneric, etc.) have any test.

**Impact / failure scenario.** This component renders the reviewer-facing view of every worksheet submission across the whole app (the actual approve/reject decision surface for buddies, managers, and onboarding leads). A regression in renderField's type-dispatch logic or in TableRenderer would silently mis-render or drop reviewer-visible data with no test to catch it, and the file is large enough that reviewers are likely to skim rather than carefully read diffs to it.

**Suggested fix.** Split into src/components/review/fieldSections.ts (the FIELD_SECTIONS config + getSectionLayout/getArrayHeaders/getScoreLabels), src/components/review/renderers/*.tsx (one file per renderer: TableRenderer, ChecklistRenderer, ScoreGridRenderer, MilestonesRenderer, SignatureBadge, DateBadge), and a slim ReviewContent.tsx that composes them. Add render tests (React Testing Library, already a devDependency) for at least TableRenderer, ChecklistRenderer, ScoreGridRenderer, and renderField's type dispatch.

---

#### 5. [MEDIUM] Status/review_status/notification-type string literals are scattered across 29+ files with no shared constant, causing the critical gate-submission bug above

- **Dimension:** Dim 2: Code Quality
- **Location:** `src/hooks/useAutoSave.ts, useAutoPromote.ts, useGateControl.ts, useWorksheet.ts; src/pages/Phase1-3.tsx, Week1-4.tsx, Dashboard.tsx, AdminDashboard.tsx, BuddyDashboard.tsx, OnboardingLeadDashboard.tsx, PhaseReview.tsx, WorksheetReview.tsx (113 occurrences of the literals 'submitted'/'approved'/'needs_revision'/'buddy_approved'/'pending_review'/'revision_submitted' across 29 files, per grep)`
- **Verification:** not-required
- **Effort:** M

**Description.** src/types/supabase.ts does define proper string-union types (`ReviewStatus`, `SubmissionStatus`) which give compile-time protection against typos when a variable is explicitly typed as `ReviewStatus`/`SubmissionStatus` — but most of the call sites operate on the loosely-typed generic worksheet `data: Record<string, unknown>` bag (see useWorksheet.ts:39 `data: Record<string, unknown>`), so `data.status === 'submitted'` and `status: 'Submitted'` are both just `unknown`/string comparisons that TypeScript cannot catch. There is no runtime constants object (e.g. `STATUS.SUBMITTED`) that all 29 files import, so nothing stops two files from drifting on casing, as already happened.

**Impact / failure scenario.** Already demonstrated by the CRITICAL finding above — this is the root cause of that bug, and remains a latent risk for the other status values (e.g. 'buddy_approved' vs 'BuddyApproved') since nothing enforces consistency beyond developer discipline and code review.

**Suggested fix.** Export a single `STATUS`/`REVIEW_STATUS` const object from src/types/supabase.ts (or a new src/constants/status.ts) and require all 29 call sites to reference it instead of inline literals. Combined with typing `data` more strongly (or at least the specific fields being compared) this converts the class of bug into a compile-time error.

---

#### 6. [MEDIUM] Every dashboard/page data-load failure is silently swallowed — console.error only, no user-visible error state

- **Dimension:** Dim 2: Code Quality
- **Location:** `src/pages/Dashboard.tsx:60-64; src/pages/AdminDashboard.tsx:95-99; src/pages/BuddyDashboard.tsx:74-78; src/pages/OnboardingLeadDashboard.tsx:58-61; src/pages/Phase1.tsx:138-142 (and the equivalent inline try/catch-less awaits in Phase2/3, Week1-4 which don't even wrap the Supabase call in try/catch)`
- **Verification:** not-required
- **Effort:** M

**Description.** Every dashboard/page's data-loading function follows the same pattern: `try { ...supabase call... } catch (err) { console.error('Failed to load X:', err); } finally { setLoading(false); }`. There is no `setError(...)`/error UI state anywhere in these files — on network failure, RLS rejection, or any Supabase error, the loading spinner simply disappears and the page renders with empty/default state (e.g. Dashboard.tsx would show 0 submissions, Phase1.tsx would show 0/N progress) with no indication to the user that data failed to load rather than genuinely being empty. Phase2.tsx/Phase3.tsx/Week1-4.tsx (e.g. Week1.tsx:31-38) don't even have a try/catch around the Supabase call — an exception there is entirely unhandled and would only be caught by the top-level ErrorBoundary (a full-page crash) rather than being handled gracefully within the component.

**Impact / failure scenario.** A transient network blip or RLS misconfiguration makes a new hire's dashboard appear to show 'you have completed 0 of 30 worksheets' instead of communicating a load failure, which is misleading and, worse, in Phase2/Week1-style pages with no try/catch, would throw during data loading and trip the app-wide ErrorBoundary, taking down the whole page for a transient/retryable error.

**Suggested fix.** Add a shared `useAsyncData`/`useSupabaseQuery` hook that standardizes loading/error/retry state, and render an inline error banner with a retry button on failure rather than falling back to an empty-looking success state.

---

#### 7. [MEDIUM] useGateControl.ts — the hook implementing the core gate-approval business rule — has zero test coverage, and fails open on error

- **Dimension:** Dim 2: Code Quality
- **Location:** `src/hooks/useGateControl.ts (6.8K, no corresponding test file); compare to src/hooks/__tests__/ which covers useAutoPromote, useAutoSave, useDueDates, useNotifications, and reviewFlow but not useGateControl`
- **Verification:** not-required
- **Effort:** M

**Description.** `checkPhaseWorksheetsComplete` (useGateControl.ts:29-69) and `handleSubmit` (117-189) encode the rule that a gate control can only be submitted once all sibling worksheets in the phase are buddy_approved/approved, and drive the submission side-effects (review_status transitions, buddy-approval metadata, notifications). Despite being consumed by 7 pages, there is no test file exercising it, unlike every other hook in src/hooks. Separately, line 51-52 (`if (error) { console.error(...); return { complete: true, missing: [] }; }`) makes the completion check fail OPEN on a Supabase query error — meaning a transient DB error during the gate check silently allows submission of a gate control even when the prerequisite worksheets are not actually verified as approved.

**Impact / failure scenario.** The bug documented in the CRITICAL finding above (gate submissions never reaching review) went unnoticed because there is no test asserting what review_status/status ends up in the database after `handleSubmit`. The fail-open-on-error behavior (line 52) also means any RLS hiccup on the `worksheet_submissions` SELECT silently bypasses the gate's core integrity check rather than blocking submission — the opposite of what a gate is for.

**Suggested fix.** Add src/hooks/__tests__/useGateControl.test.ts mirroring the existing hook test style, asserting the exact status/review_status values written after handleSubmit in both buddy and non-buddy modes, and asserting checkPhaseWorksheetsComplete's return value on a mocked Supabase error. Change the fail-open behavior at line 52 to surface the error to the user (`setSubmitError`) instead of silently allowing submission.

---

#### 8. [MEDIUM] Due-date engine defaults to a hardcoded 'demo' start date that is never actually set in production, making all due-date badges meaningless

- **Dimension:** Dim 2: Code Quality
- **Location:** `src/hooks/useDueDates.ts:48-57 (getDefaultStartDate), :24-44 (DEFAULT_DUE_OFFSETS)`
- **Verification:** not-required
- **Effort:** M

**Description.** `getDefaultStartDate()`'s doc comment reads 'For demo/simulation, this is 30 days ago' and falls back to `new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)` whenever `localStorage.getItem('onboarding_start_date')` returns null. I grepped the entire src/ tree for `onboarding_start_date` and the only occurrence is this read at line 54 — nothing anywhere in the codebase (signup flow, admin assignment flow, AuthContext, or any Supabase write) ever calls `localStorage.setItem('onboarding_start_date', ...)`. So this key is permanently unset for every real user, and the function always falls through to 'always exactly 30 days before whatever moment the code executes'.

**Impact / failure scenario.** Due date badges rendered via `getDueDateInfo` (e.g. 'Overdue by Nd', 'Due in Nd', used wherever useDueDates/calculateDueDate is consumed) are computed against a start date that has no relationship to when the employee actually started onboarding, is per-browser (localStorage, not per-user in the DB) even if it were ever set, and recomputes to a moving target ('30 days before right now') every session. A new hire on day 2 of actual onboarding would see a worksheet due-offset of e.g. 7 days evaluated against a start date of '30 days ago', showing it as already overdue by 23 days on their first login.

**Suggested fix.** Store the employee's actual onboarding start date as a column on user_profiles (or derive it from auth.users.created_at) set at account-creation/assignment time, and have useDueDates fetch it from Supabase per-user instead of localStorage. Remove the 'demo/simulation' fallback from the code path that ships to production, or explicitly gate it behind a dev-only flag.

---

#### 9. [LOW] TS/JS mix: one lone untyped .js file (theme.js) is excluded from type-checking despite being the single source of truth imported by ~16+ TypeScript files

- **Dimension:** Dim 2: Code Quality
- **Location:** `src/config/theme.js:1-19; tsconfig.json:10 (checkJs: false)`
- **Verification:** not-required
- **Effort:** S

**Description.** Every other config/hook/component in src/ is .ts/.tsx. theme.js is the sole .js file, and its own doc comment says it's the 'single source of truth' consumed by '16+ files' (confirmed by grep — `t.ch`/`t.wg`/`t.gd` etc. appear throughout Phase1.tsx, Phase2.tsx, Week1.tsx, GateControl1.tsx, and more). Because tsconfig.json sets `checkJs: false`, this file gets zero type checking, and TS can't verify that every consumer accesses a key that actually exists on `t`.

**Impact / failure scenario.** A typo like `t.chh` in a .tsx file would still type-check (since `t`'s shape isn't verified against actual usage) if inference from the plain-JS export widens incorrectly, or worse, a rename of a key in theme.js silently breaks every consumer with no compiler error pinpointing theme.js itself as the source.

**Suggested fix.** Rename theme.js to theme.ts (it's a trivial 19-line object literal with primitive string values — near-zero migration cost) to bring it under the same strict type checking as the rest of the codebase, consistent with the TYPESCRIPT_MIGRATION docs already present in the repo suggesting a JS→TS migration was intentionally underway.

---

#### 10. [LOW] Widespread use of `: any` (29 occurrences across 13 files) defeats the otherwise-strict TypeScript configuration

- **Dimension:** Dim 2: Code Quality
- **Location:** `13 files including src/pages/worksheets/Phase1Worksheet1.tsx:50 (`(s: any, i: number) =>`), :68 (`(c: any, i: number) =>`)`
- **Verification:** not-required
- **Effort:** L

**Description.** tsconfig.json enables `strict: true` and eslint.config.js sets `@typescript-eslint/no-explicit-any` to only 'warn' (not 'error'), so `any` usages compile cleanly and lint only as warnings. 29 occurrences remain across 13 files, mostly in worksheet pages iterating over `data.stakeholders`/`data.conversations`-style array fields that are typed as `unknown` on the shared `Record<string, unknown>` worksheet data bag.

**Impact / failure scenario.** Each `any` is a hole in the type system exactly at the boundary where worksheet-specific typed data is destructured from the generic Supabase JSON blob — the place where type safety would matter most for catching field-name typos (e.g. `s.responsability` instead of `s.responsibility`) at compile time instead of at runtime as a silently-undefined value in the rendered form.

**Suggested fix.** Define per-worksheet payload interfaces (the pattern already started in src/types/worksheets/p1_w1.ts) for every worksheet and thread them through instead of `Record<string, unknown>` + `any` casts at the render site; bump the eslint rule to 'error' once the remaining 29 sites are typed.

---

#### 11. [LOW] Test/lint automation could not be verified to run — node_modules absent in the audited environment, no CI config found in repo

- **Dimension:** Dim 2: Code Quality
- **Location:** `package.json:6-8 (test/lint scripts), repo root (no .github/workflows, no other CI config found)`
- **Verification:** not-required
- **Effort:** S

**Description.** In this audit environment `npm test -- --run` and `npm run lint` both fail immediately with 'Permission denied' because node_modules/.bin does not exist — dependencies were never installed. This may be purely an artifact of this sandbox rather than the real dev/CI environment, so I'm not scoring the codebase itself down heavily for it, but combined with PROJECT CONTEXT confirming no CI/CD config exists at the repo root, there is no evidence in the repo that `npm test` or `npm run lint` are enforced anywhere before merge (no pre-push hook, only a local `scripts/pre-commit.sh` that must be manually installed via `npm run cr-install-hook`, which is opt-in per-developer).

**Impact / failure scenario.** 934 lines / 87 test cases of hook tests exist but nothing in the repository guarantees they're run before code lands on main; a regression (like the CRITICAL gate-submission bug found above) can merge undetected even if a test for it existed, because there's no gate enforcing green tests.

**Suggested fix.** Add a CI workflow (e.g. .github/workflows/ci.yml) that runs `npm ci && npm run lint && npm test -- --run` on every PR, and make it a required check before merge.

---

## Dim 3: React Frontend Audit — 58/100

> The React layer is functionally complete and mostly well-structured (useWorksheet/useAutoSave correctly use cancellation flags and mountedRef guards, routing is fully protected, Toast context is properly memoized), but it has one clear architectural defect explicitly worth blocking on: AuthContext's value/actions are never memoized, so every login/logout/profile-refresh forces a synchronous re-render cascade through ~28 consumers app-wide. Beyond that, the app has zero code-splitting (every page and the 42KB ReviewContent/35KB worksheetConfigData ship in one bundle), a global ErrorBoundary that takes the Navbar down with any single page crash, several data-fetching effects (WorksheetReview, PhaseReview, PhaseAccessGuard) that lack cancellation guards and can race on rapid navigation between same-shaped routes, and a duplicated NotificationBell/useNotifications polling instance under the mobile drawer. None of these are showstoppers for a first production launch at modest scale, but the AuthContext memoization gap and the error-boundary blast radius should be fixed before launch; the rest are reasonable to ship with tracked follow-ups.

#### 1. [MEDIUM] AuthContext value and action functions are recreated every render — unbounded re-render blast radius

- **Dimension:** Dim 3: React Frontend Audit
- **Location:** `src/context/AuthContext.tsx:169-251 (signUp/signIn/signInWithGoogle/signOut/hasRole/refreshProfile defined as plain functions, not useCallback) and :239-249 (value object literal, no useMemo)`
- **Verification:** CONFIRMED — Verified: value object (lines 239-249) is a new literal every render, all 6 actions (signUp/signIn/signInWithGoogle/signOut/hasRole/refreshProfile, lines 169-249) are plain functions with no useCallback; grep confirms 28 consumer files call useAuth(); Toast.tsx comparison checks out (uses useCallback for showToast/removeToast/clearToasts). Mechanism (state setter -> new value -> cascade to all context consumers) is standard React behavior, correctly described. Downgrading slightly since impact on specific 'expensive' components (ReviewContent, Navbar) is asserted but not verified as unmemoized/actually expensive in practice, and no evidence of user-visible perf problems is cited — this is a real but somewhat speculative-impact perf/hygiene issue rather than a correctness bug.

**Description.** The `value` object passed to `<AuthContext.Provider>` is a brand-new object literal on every render of `AuthProvider`, and every function on it (signUp, signIn, signInWithGoogle, signOut, hasRole, refreshProfile) is a plain function declared in the component body, so it also gets a new identity every render — none of it is wrapped in useMemo/useCallback. `useAuth()` is called directly by ~28 components across the app (Navbar, ProtectedRoute, PhaseAccessGuard, NotificationBell, every worksheet/gate-control page, every dashboard, WorksheetPage, PhaseReview, WorksheetReview, AssignmentsTab, etc — verified via grep). Any state change inside AuthProvider (setUser, setProfile, setLoading — which fire in sequence on every login, on SIGNED_IN events, and on every call to refreshProfile) forces React to re-render every single one of those ~28 consumers on the same tick, even the ones that only read a single primitive like `profile?.role`. On initial load this is 2-3 cascading full-tree re-renders (getSession → setUser → fetchProfile → setProfile → setLoading), and it repeats on every refreshProfile() call.

**Impact / failure scenario.** Every login, logout, or refreshProfile() call synchronously re-renders the entire authenticated app tree, including expensive components like ReviewContent (1043 lines) and Navbar (429 lines with many inline style objects), and defeats any future attempt to memoize children with React.memo since the new function identities (signIn, hasRole, etc.) invalidate memoization/dependency arrays for any child that uses them as an effect or memo dependency.

**Suggested fix.** Wrap the action functions in useCallback (stable deps) and wrap the context value in useMemo keyed on [user, profile, loading]: `const value = useMemo(() => ({ user, profile, loading, signUp, signIn, signInWithGoogle, signOut, hasRole, refreshProfile }), [user, profile, loading]);` — this is the same pattern already correctly applied in ToastProvider (src/components/Toast.tsx), which memoizes showToast/removeToast/clearToasts via useCallback.

---

#### 2. [MEDIUM] Global ErrorBoundary wraps Navbar and footer together with routed page content

- **Dimension:** Dim 3: React Frontend Audit
- **Location:** `src/App.tsx:106-174 (ErrorBoundaryRouteResetter wraps <Navbar>, <main><Routes>...</Routes></main>, and <footer> as siblings inside one boundary)`
- **Verification:** not-required

**Description.** There is exactly one ErrorBoundary in the app (src/components/ErrorBoundary.tsx), and in App.tsx it is placed around Navbar + the routed `<main>` + the footer together, not just around the routed content. A render-time exception thrown by any single page (e.g. a bug in ReviewContent.tsx while rendering a malformed worksheet_data blob, or any of the ~50 page components) unmounts the Navbar and footer along with the page, replacing the entire viewport with the full-screen fallback ('Something went wrong' + Refresh/Try Again buttons) and leaving the user with no navigation chrome to escape to a working page other than a full reload.

**Impact / failure scenario.** A single malformed worksheet submission (attacker-controlled or just corrupted data, since worksheet_data is stored as freeform JSONB and rendered by ReviewContent without a schema) that throws during render takes out the entire UI for that user, not just the one review page — they cannot click 'Dashboard' or 'Sign Out' from the fallback screen without a full page reload.

**Suggested fix.** Move the ErrorBoundary to wrap only `<main><Routes>...</Routes></main>` (already keyed by `location.key` for auto-reset), and keep Navbar/footer outside it (or give them their own lightweight boundary) so navigation survives an isolated page-render crash.

---

#### 3. [MEDIUM] Race condition / no request cancellation in async data-loading effects reused across param changes

- **Dimension:** Dim 3: React Frontend Audit
- **Location:** `src/pages/WorksheetReview.tsx:53-72 (loadData), src/pages/PhaseReview.tsx:56-74 (loadData), src/components/PhaseAccessGuard.tsx:56-71`
- **Verification:** not-required

**Description.** WorksheetReview and PhaseReview both fetch on a `useEffect` keyed by URL params (`userId`, `worksheetId` / `phaseNum`) using a plain async function with no AbortController and no 'cancelled' flag — unlike useWorksheet.ts (src/hooks/useWorksheet.ts:114-148), which correctly uses a `cancelled` boolean to guard against stale responses. Because these routes (`/admin/review/:userId/:worksheetId`, `/buddy/review/:userId/:worksheetId`, `/admin/review-phase/:userId/:phaseNum`, etc.) match on a fixed path pattern, React Router keeps the same component instance mounted across navigations that only change the params (e.g. clicking through consecutive notifications, or using the browser back/forward buttons between two review pages of the same shape). If a reviewer navigates from reviewing worksheet A to worksheet B quickly, and network response A resolves after response B (out-of-order), `setSubmission`/`setInstructor` from the stale A request silently overwrites the B data that's already showing — the reviewer would see and could act on the wrong instructor's or wrong worksheet's data. PhaseAccessGuard has the same issue guarding phase access — a stale response could momentarily show a locked/unlocked phase incorrectly.

**Impact / failure scenario.** A buddy/manager clicking 'Approve' on a review page right after navigating to it (common when working through a queue of notifications quickly) can end up approving/requesting revision on data that was silently replaced by a slower, stale network response for a *different* user's worksheet — because `submission`/`instructor` state was overwritten out of order.

**Suggested fix.** Apply the same `let cancelled = false; ... return () => { cancelled = true }` guard already used correctly in useWorksheet.ts to WorksheetReview.loadData, PhaseReview.loadData, and PhaseAccessGuard's effect, checking `cancelled` before every setState call.

---

#### 4. [MEDIUM] Two concurrent NotificationBell / useNotifications instances poll independently

- **Dimension:** Dim 3: React Frontend Audit
- **Location:** `src/components/Navbar.tsx:134 (desktop nav, permanently mounted, only CSS-hidden via `.desktop-nav-lux { display: none }` on narrow viewports) and src/components/Navbar.tsx:319-321 (mobile drawer, mounted whenever mobileOpen is true)`
- **Verification:** not-required

**Description.** Navbar renders `<NotificationBell />` twice: once inside `.desktop-nav-lux` (hidden with `display:none` via CSS media query at line 391-392, but never actually unmounted from the DOM at any viewport width) and once inside the mobile drawer block that is only rendered `{mobileOpen && (...)}`. Each `NotificationBell` instance calls `useNotifications(user)` independently (src/hooks/useNotifications.ts:47-99), which sets up its own 15-second `setInterval` poll and its own local `notifications`/`unreadCount` state. When a user on a narrow viewport opens the mobile menu, there are now two live polling intervals hitting Supabase's `notifications` table for the same user every 15 seconds, and the two dropdown's read/unread state can diverge (marking as read in one doesn't update the other's cached list until its next poll).

**Impact / failure scenario.** Doubles notification-read Supabase traffic while the mobile drawer is open (and permanently keeps one instance mounted regardless of viewport, since the desktop copy is only display:none, never removed from the tree), and can show inconsistent unread counts between the two bells if a user marks a notification read from one instance and looks at the other before the next 15s poll.

**Suggested fix.** Render a single `<NotificationBell />` and reposition it with CSS/flex order for mobile vs desktop layouts instead of mounting two separate component instances, or lift the `useNotifications` call to Navbar and pass the data down as props to a single instance.

---

#### 5. [MEDIUM] AuthCallback nested setTimeout not covered by effect cleanup — stray navigate() after unmount

- **Dimension:** Dim 3: React Frontend Audit
- **Location:** `src/pages/AuthCallback.tsx:10-31`
- **Verification:** not-required

**Description.** The effect's cleanup function (line 30, `return () => clearTimeout(timer)`) only cancels the OUTER 1000ms `timer` (declared line 19). It does not cancel: (1) the 4000ms `setTimeout` in the error branch (line 15), whose handle is never stored; or (2) the inner `setTimeout(() => navigate('/login', {replace:true}), 2000)` on line 25, which is created inside the `.then()` callback of `supabase.auth.getSession()` and is likewise never stored or cleared. If the component unmounts (e.g. the user navigates elsewhere manually, or a fast OAuth round-trip completes and React unmounts AuthCallback) after the outer timer already fired but before the nested timers complete, those nested `navigate()` calls still fire on an unmounted component, and `setStatus` calls before them produce a 'setState on unmounted component' warning. The error-branch 4000ms timer is likewise never cancelled if the user leaves the error screen before it fires.

**Impact / failure scenario.** A user who sees the OAuth error screen and manually clicks a link within 4 seconds can get forcibly `navigate()`-ed back to `/login` a moment later, overriding wherever they had just navigated to, because the stray timer from the unmounted AuthCallback still fires.

**Suggested fix.** Store every setTimeout handle created in the effect (including the nested one inside `.then()`) and clear all of them in the single cleanup function, e.g. by tracking handles in a ref array, or by checking a `cancelled` flag before each `navigate()`/`setStatus()` call inside the async chain.

---

#### 6. [MEDIUM] No code-splitting or lazy loading anywhere in the app

- **Dimension:** Dim 3: React Frontend Audit
- **Location:** `src/App.tsx:9-31 (static imports of every page component) and src/config/worksheetConfig.tsx:38-79 (static imports of all ~30 worksheet/gate-control components)`
- **Verification:** not-required

**Description.** `grep -rn "React.lazy|lazy(|Suspense" src` returns zero matches. Every page (Dashboard, all 3 Phase pages, all 25+ worksheet pages, all gate controls/artifacts, all admin/buddy/onboarding-lead dashboards, PhaseReview, WorksheetReview) plus the 42KB ReviewContent.tsx, 20KB Navbar.tsx, and 35KB worksheetConfigData.ts are pulled into one synchronous import graph rooted at App.tsx and bundled together by Vite with no `React.lazy`/`Suspense` boundary anywhere in the codebase.

**Impact / failure scenario.** Every visitor — including a brand-new joinee who will only ever touch Phase 1 worksheets — downloads and parses the code for the admin dashboard, all three review flows, every gate control, and every FTP worksheet template on first load, inflating initial bundle size/TTI for no benefit; this scales worse as more worksheet types are added (worksheetConfigData.ts is already 798 lines / 35KB).

**Suggested fix.** Wrap route-level page components in `React.lazy(() => import(...))` with a `<Suspense fallback={...}>` boundary around `<Routes>` in App.tsx, at minimum for the admin/buddy/onboarding-lead dashboards and the review pages, which are only needed by a subset of roles.

---

#### 7. [LOW] AuthContext's async profile-loading helpers ignore the mounted guard after their own await

- **Dimension:** Dim 3: React Frontend Audit
- **Location:** `src/context/AuthContext.tsx:36-131 (fetchProfile, buildProfileFromMetadata, createProfileFromAuth) called from the effect at :134-166`
- **Verification:** not-required

**Description.** The auth-state-change effect checks `if (!mounted) return;` before calling `fetchProfile(session.user.id)` (line 138/141, line 148-152), but `fetchProfile`/`buildProfileFromMetadata`/`createProfileFromAuth` are async functions that call `setProfile`/`setLoading` in their own `finally` blocks after their own `await supabase...` calls resolve, with no re-check of the outer `mounted` flag at that point.

**Impact / failure scenario.** If AuthProvider is ever unmounted while a profile fetch is in flight (e.g. in tests, during Vite HMR, or if AuthProvider is later moved below a route boundary that can unmount), React logs 'Can't perform a React state update on an unmounted component' and does unnecessary work. Low real-world impact today since AuthProvider sits at the permanent root of the tree and effectively never unmounts in production.

**Suggested fix.** Thread the `mounted` ref/flag into fetchProfile/buildProfileFromMetadata/createProfileFromAuth (e.g. pass it as a parameter or use a module-level ref) and check it before each setState call inside those functions, not just before invoking them.

---

#### 8. [LOW] useDueDates hook has the same unguarded-async-effect race condition and is unused dead code

- **Dimension:** Dim 3: React Frontend Audit
- **Location:** `src/hooks/useDueDates.ts:120-152`
- **Verification:** not-required

**Description.** The exported `useDueDates(userId, worksheetIds)` hook fetches from Supabase inside a fire-and-forget async IIFE in `useEffect` with no cancellation guard and calls `setDueDates` unconditionally when it resolves. It is exported from `src/hooks/index.ts` and covered by a unit test, but `grep -rn "useDueDates(" src --include=*.tsx` returns zero call sites — only the pure helper functions `getDueDateInfo`/`calculateDueDate` (used in PhaseWorksheetList.tsx) are actually consumed. The hook itself is unreachable in the shipped app today.

**Impact / failure scenario.** No current runtime impact since it's dead code, but it's a live trap in the public hooks API: whoever wires it into a component next (it looks like the 'correct' way to get due dates) will inherit an unguarded race condition where fast prop/param changes can let a stale response overwrite fresher due-date data.

**Suggested fix.** Either delete the unused hook (keep only the pure calculateDueDate/getDueDateInfo/formatDueDate helpers that are actually used), or fix it now with a cancellation guard so it's safe if/when someone adopts it.

---

#### 9. [LOW] Widespread exhaustive-deps violations with no eslint-disable, unlike the codebase's own precedent

- **Dimension:** Dim 3: React Frontend Audit
- **Location:** `src/pages/Dashboard.tsx:47 (loadSubmissions not in deps), src/pages/Phase1.tsx:121 (loadStatuses), src/pages/WorksheetReview.tsx:53 (loadData), src/pages/PhaseReview.tsx:56 (loadData), src/pages/AdminDashboard.tsx:68, src/pages/BuddyDashboard.tsx:55, src/pages/OnboardingLeadDashboard.tsx:41`
- **Verification:** not-required

**Description.** `eslint.config.js` enables `reactHooks.configs.flat.recommended`, which includes `react-hooks/exhaustive-deps`. Elsewhere in the codebase (src/context/AuthContext.tsx:165, src/hooks/useNotifications.ts:76/116) the team correctly acknowledges an intentional deps omission with `// eslint-disable-next-line react-hooks/exhaustive-deps` and a comment explaining why. The seven call sites above omit their `load*`/fetch helper function from the dependency array with no such comment, meaning the lint rule would currently flag them as warnings/errors with no documented justification. They happen to be safe today only because the omitted function is redefined fresh every render and closes over the current props, but that safety is incidental, not enforced, and the missing suppression comments suggest `npm run lint` output is not being triaged before merge.

**Impact / failure scenario.** Not an active runtime bug today, but it means real exhaustive-deps regressions (a genuinely stale closure introduced in a future edit) would ship undetected, since the lint signal for this rule is already noisy/ignored across ~7 files.

**Suggested fix.** Either wrap the load functions in useCallback and add them to the deps array (preferred, makes intent explicit and machine-checkable), or add the same reasoned `eslint-disable-next-line react-hooks/exhaustive-deps` pattern already used correctly in AuthContext.tsx/useNotifications.ts, and add `eslint .` to CI so this class of regression is caught.

---

#### 10. [LOW] Post-approval setTimeout reload has no unmount cleanup

- **Dimension:** Dim 3: React Frontend Audit
- **Location:** `src/pages/PhaseReview.tsx:156-159`
- **Verification:** not-required

**Description.** After `handleApprovePhase` succeeds, a bare `setTimeout(() => { loadData(); }, 1500)` is scheduled with no stored handle and no cleanup on unmount.

**Impact / failure scenario.** A manager who clicks 'Approve Phase' and immediately clicks the always-visible 'Back to Dashboard' button (line 224) within 1.5s triggers `loadData()` (which calls `setInstructor`/`setSubmissions`) on an already-unmounted PhaseReview instance, producing a console warning and a wasted Supabase round trip.

**Suggested fix.** Store the timeout handle in a ref and clear it in a useEffect cleanup, or guard the deferred `loadData()` call with a `mounted` ref.

---

## Dim 4: Deployment & Ops — 18/100

> Deployment and Ops posture is not production-ready. There is no CI/CD, no Dockerfile, and no committed config for any of the three hosting targets the project's own docs suggest (Vercel/Netlify/GitHub Pages), so a BrowserRouter SPA with no 404/redirect fallback will 404 on every deep-link refresh regardless of which is chosen. The only server script in the repo (serve-app.mjs) has a straightforward path-traversal arbitrary-file-read bug. Env var handling fails unsafely: missing Supabase credentials crash the app during module evaluation, before the app's own ErrorBoundary can ever catch it, yielding a silent blank screen. Secrets hygiene is poor beyond the already-known committed .env — the same live production Supabase URL/anon key are hardcoded as fallback literals in five-plus utility scripts, meaning there is effectively no dev/prod environment separation. The build pipeline also never type-checks the strict TypeScript config and ships the entire app as one eagerly-loaded bundle. This would not pass a launch review as-is.

#### 1. [HIGH] serve-app.mjs has an unauthenticated path-traversal arbitrary file read vulnerability

- **Dimension:** Dim 4: Deployment & Ops
- **Location:** `serve-app.mjs:15-20`
- **Verification:** CONFIRMED — Confirmed by reading serve-app.mjs:15-21: fp = path.join(dist, decodeURIComponent(req.url.split('?')[0])) with only an existsSync/isFile fallback (line 17) and no containment check against dist, so a traversal path that exists on disk (e.g. ../../.env, which is present at the repo root one level above dist) passes the check and is read via fs.readFileSync and returned with 200 — the exploit is real and unauthenticated. However CRITICAL is overstated: the server binds to 127.0.0.1 only (line 23), and the script is not referenced anywhere else in the repo (no package.json script, no README, no Dockerfile/vercel/netlify config, not used by any CI); package.json already ships a safer `preview` script (`vite preview`). Since production usage isn't confirmed (though plausible if run behind a reverse proxy, which would make .env/Supabase-key exposure severe), downgrading to HIGH rather than CRITICAL.

**Description.** The only server script in the repo builds the file path as `path.join(dist, decodeURIComponent(req.url.split('?')[0]))` with no containment check against `dist`. `path.join` normalizes `..` segments, so a request like `GET /../../../../etc/passwd` (or `/../../.env`) resolves outside the `dist` directory and is read via `fs.readFileSync` and served with `res.writeHead(200, ...)`. Verified by direct simulation: `path.join('/app/dist', decodeURIComponent('/../../../../../../etc/passwd'))` resolves to `/etc/passwd`. This script is the only artifact in the repo that could plausibly run the production build (no Dockerfile, no Vercel/Netlify config exist), and nothing in the repo documents it as dev-only.

**Suggested fix.** Do not ship or use serve-app.mjs for production. If a custom server is genuinely needed, resolve the requested path with `path.normalize`/`path.resolve` and reject/​404 any resolved path that does not start with the `dist` root (`if (!resolved.startsWith(dist + path.sep)) return 404`). Prefer a maintained static-file server (e.g. `serve`, or the hosting provider's own static hosting) instead of hand-rolled file serving.

---

#### 2. [HIGH] SPA client-side routing has no server-side rewrite for any of the three documented hosting targets — refreshing any deep link 404s

- **Dimension:** Dim 4: Deployment & Ops
- **Location:** `src/App.tsx:103 (BrowserRouter); .nojekyll (root, 0 bytes); no public/404.html; no public/_redirects; no vercel.json`
- **Verification:** CONFIRMED — Verified: BrowserRouter confirmed at src/App.tsx:103; .nojekyll exists (0 bytes) with no public/404.html SPA-fallback; no public/_redirects; no vercel.json anywhere in repo; context.md:1604-1607 does list Vercel/Netlify/GitHub Pages/S3+CDN as deploy targets — finding is accurate as described.

**Description.** The app uses `BrowserRouter` (src/App.tsx:1,103), which requires the host to rewrite all unknown paths to `index.html` so client-side routing can take over. The repo ships a `.nojekyll` file (only meaningful for GitHub Pages) with no matching `public/404.html` SPA-fallback trick; there's no `public/_redirects` for Netlify; there's no `vercel.json` rewrites config for Vercel. Under all three of the hosting options the project's own docs recommend (context.md:1604-1607), directly loading or refreshing any non-root route (e.g. `/dashboard`, `/phase1`, `/worksheets/...`) returns a 404 from the static host before React Router ever runs.

**Suggested fix.** For GitHub Pages: add a `public/404.html` that redirects to `index.html` with the path preserved (the standard spa-github-pages trick). For Netlify: add `public/_redirects` with `/* /index.html 200`. For Vercel: add `vercel.json` with a rewrite of `/(.*) -> /index.html`. Pick the actual target host and add only what's needed, then verify with a real deployment (not just `vite preview`, which already handles fallback and will hide this bug).

---

#### 3. [HIGH] Missing Supabase env vars crash the entire app before React mounts, with no user-visible error — ErrorBoundary cannot catch it

- **Dimension:** Dim 4: Deployment & Ops
- **Location:** `src/api/supabase.ts:4-19; src/context/AuthContext.tsx:2; src/App.tsx:52,104`
- **Verification:** CONFIRMED — Confirmed: supabase.ts:19 createClient(supabaseUrl, supabaseKey) runs at module scope in a static import chain (main.tsx -> App.tsx -> AuthContext.tsx -> api/supabase.ts) that executes before createRoot().render() in main.tsx; verified against actual @supabase/supabase-js@2.108.2 source that the SupabaseClient constructor synchronously throws Error(\"supabaseUrl is required.\") when the URL is empty, and index.html's #root div has no fallback content, so the result is a blank page uncatchable by the React ErrorBoundary at App.tsx:52.

**Description.** `src/api/supabase.ts:19` calls `createClient(supabaseUrl, supabaseKey)` at module scope. `App.tsx` statically imports `AuthProvider` from `context/AuthContext.tsx`, which statically imports `supabase` from `api/supabase.ts` (AuthContext.tsx:2). This whole chain executes during ES module evaluation, before `createRoot(...).render(<App/>)` in src/main.tsx ever runs, and therefore before the `ErrorBoundary` component (App.tsx:52, wrapping routes inside `AuthProvider` at App.tsx:104) exists in the tree. If `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` are unset at build time (e.g. `.env` missing on a fresh clone/CI runner, or the host's env-var injection is misconfigured/misnamed), the code only does `console.error(...)` (supabase.ts:8-16) and then still calls `createClient('', '')`, which the Supabase JS client throws on synchronously for an invalid URL — producing a blank white page in production with zero user-facing indication of what went wrong, recoverable only by reading the browser console.

**Suggested fix.** Guard the client creation: if either var is missing, render a minimal static error page (a plain DOM message written before React even loads, e.g. in index.html or main.tsx pre-render) instead of letting `createClient` throw during module evaluation. At minimum, wrap the `createClient` call in a try/catch and export a sentinel/no-op client plus a boolean `isConfigured` flag that `App.tsx` checks before rendering the real app, showing a configuration-error screen instead of a blank page.

---

#### 4. [HIGH] Live production Supabase URL and anon key are hardcoded as fallback literals in 5+ committed scripts, in addition to being committed in .env

- **Dimension:** Dim 4: Deployment & Ops
- **Location:** `__seed_30_users.cjs:18-19; __seed_test_data.cjs:18-19; fix-assignments.cjs:11-12; scripts/clean_setup.mjs:16-17; scripts/fix_promotion_data.mjs:10-11; scripts/run_migration.cjs:16 (project ref)`
- **Verification:** CONFIRMED — Verified: all 6 files contain the exact hardcoded fallback URL/key (or project ref) matching .env's live values — __seed_30_users.cjs:18-19, __seed_test_data.cjs:18-19, fix-assignments.cjs:11-12 (URL is hardcoded directly, not even a fallback), scripts/clean_setup.mjs:16-17, scripts/fix_promotion_data.mjs:10-11, scripts/run_migration.cjs:16; scripts/setup/create-admin.cjs correctly requires+exits instead, confirming the inconsistency claim. Severity is warranted, not overblown: these scripts perform real .insert/.update/.delete/.upsert calls (e.g. __seed_30_users.cjs:328,331,390,393 delete/update worksheet_submissions & user_profiles), so running any of them with unset env vars silently mutates the single shared Supabase project by default — and the repo (github.com/newton-priyanshu/Onboarding) is confirmed PUBLIC, so these credentials and the default-to-prod footgun are exposed to anyone. Minor nit: framing as a pure "credential leak" is slightly imprecise since it's a publishable/anon key (RLS-gated by design, no service_role key found committed), but the core risk (no env separation, destructive scripts default to live DB, key can't be meaningfully rotated) is accurately described and justifies HIGH.

**Description.** Each of these scripts falls back to the literal production values (`SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://fuoqoryqndtdooujslee.supabase.co'`, `SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_1JTwEK8CgHC6PLtOOnYeSw_xaHwa-i9'`) when no env var is exported — the exact same value as the committed `.env` (`.env:1-2`). This means there is effectively one single Supabase project shared by every developer's local scripts, seed data, and (per context.md) production itself, with no environment separation. Anyone who clones the repo and runs a seed/fix script without deliberately overriding env vars will mutate whatever database those credentials point at. It also means the anon key can never be meaningfully rotated: even after editing `.env`, 5 other files still contain the old key as a hardcoded default, and the key is permanently retained in git history regardless.

**Suggested fix.** Remove all hardcoded fallback credentials from scripts; require the env vars to be explicitly set and `process.exit(1)` with a clear message if missing (as scripts/setup/create-admin.cjs already correctly does). Stand up separate Supabase projects for dev/staging/prod so local scripts cannot touch production data.

---

#### 5. [MEDIUM] No CI/CD pipeline and no chosen hosting target — deployment is entirely manual and undocumented

- **Dimension:** Dim 4: Deployment & Ops
- **Location:** `repo root (no .github/workflows, no Dockerfile, no vercel.json, no netlify.toml)`
- **Verification:** CONFIRMED — Verified: no .github/workflows, no *.yml/yaml CI config anywhere, no Dockerfile, no vercel.json/netlify.toml (find confirms empty); context.md:1606-1608 lists Vercel/Netlify/GitHub Pages as interchangeable options without commitment, and README.md is still the unedited default Vite template with zero deployment docs; package.json has lint/test/build scripts but nothing invokes them automatically — only an opt-in local pre-commit hook exists. Downgraded from HIGH to MEDIUM: this is a real process gap but the app is a small, presumably-manually-deployed onboarding tool (no evidence of high-stakes production traffic or active multi-contributor merge risk), so it's an operational maturity gap rather than a severity-HIGH defect actively causing harm.

**Description.** There is no `.github/workflows` directory, no other CI config file anywhere in the repo, and no Dockerfile. `npm run build`, `npm run lint`, and `npm test` are never run automatically on push/PR — nothing gates what gets deployed. context.md:1602-1611 lists three possible hosts (Vercel, Netlify, GitHub Pages) as options rather than committing to one, and none of the corresponding config (vercel.json, netlify.toml, or a Pages-publish workflow) exists. Combined with no build/deploy automation, shipping to production is a fully manual, unverified, human-driven process.

**Suggested fix.** Pick one hosting target and commit its config (vercel.json / netlify.toml / a GitHub Actions workflow that builds and pushes `dist/` to `gh-pages`). Add a CI workflow that runs `npm ci && npm run lint && npm test && npm run build` on every PR and blocks merge on failure.

---

#### 6. [MEDIUM] Build pipeline performs no TypeScript type-checking — strict tsconfig is entirely unenforced

- **Dimension:** Dim 4: Deployment & Ops
- **Location:** `package.json:8 (`"build": "vite build"`); tsconfig.json:2,15 (`strict: true`, `noUnusedLocals: true`)`
- **Verification:** not-required

**Description.** `npm run build` is only `vite build`. Vite/esbuild strips TypeScript types without type-checking them. There is no `tsc -b`/`tsc --noEmit` step anywhere in package.json scripts, and no CI to run one separately. Despite `tsconfig.json` enabling `strict`, `noUnusedLocals`, `noUnusedParameters`, and `noUncheckedIndexedAccess`, none of these diagnostics can ever block a production build — a change that violates them will build and deploy silently.

**Suggested fix.** Change the build script to `"build": "tsc -b && vite build"` (or add a separate `typecheck` script run in CI before build/deploy).

---

#### 7. [MEDIUM] No route-level code splitting — entire app (all ~25 worksheet pages, admin dashboards, 42KB review UI) ships in the initial bundle

- **Dimension:** Dim 4: Deployment & Ops
- **Location:** `src/App.tsx (all page imports are static top-level imports; no `React.lazy`/`Suspense` usage found in the file); vite.config.js:15-22 (no `manualChunks` configured)`
- **Verification:** not-required

**Description.** Every page component — Login, Signup, all Phase/Week worksheets, PhaseReview, WorksheetReview, AdminDashboard, BuddyDashboard, OnboardingLeadDashboard, etc. — is statically imported in App.tsx with no `React.lazy`/`Suspense` anywhere. Combined with `ReviewContent.tsx` (42KB source), `Navbar.tsx` (20KB), and `worksheetConfigData.ts` (35KB) all being reachable from the eagerly-loaded route tree, a user who only needs the login page still downloads code for every dashboard and worksheet. No `manualChunks` is configured in vite.config.js to split vendor/route bundles either.

**Suggested fix.** Convert route components to `React.lazy(() => import(...))` and wrap `<Routes>` in `<Suspense>` with a loading fallback; this alone typically cuts the initial JS payload by more than half for an app this size.

---

#### 8. [MEDIUM] scripts/setup/create-admin.cjs reads a non-existent env var name and will always fail

- **Dimension:** Dim 4: Deployment & Ops
- **Location:** `scripts/setup/create-admin.cjs:4 (`process.env.VITE_SUPABASE_ANON_KEY`) vs .env:2 / .env.example:4 (`VITE_SUPABASE_PUBLISHABLE_KEY`)`
- **Verification:** not-required

**Description.** The script reads `VITE_SUPABASE_ANON_KEY`, but that variable is never defined anywhere in the repo — `.env` and `.env.example` both only define `VITE_SUPABASE_PUBLISHABLE_KEY`. Running this script as documented (it loads `.env` via dotenv at line 1) will always hit the `if (!SUPABASE_URL || !SUPABASE_ANON_KEY)` guard at line 6-9 and `process.exit(1)` with "Missing Supabase credentials in .env", even with a fully correct `.env` file. This is dead/broken ops tooling that has evidently never been run end-to-end since the env var naming diverged, which does not inspire confidence in the rest of the unreviewed setup scripts (`__full_setup.cjs`, `__create_users.cjs`, the four `fix-fg.*` variants, etc.).

**Suggested fix.** Rename to `process.env.VITE_SUPABASE_PUBLISHABLE_KEY` to match the actual convention, and add a smoke test or CI step that actually exercises the setup scripts against a throwaway project so drift like this is caught.

---

#### 9. [LOW] serve-app.mjs, if ever used as the real server, serves plaintext HTTP with no compression and no cache headers

- **Dimension:** Dim 4: Deployment & Ops
- **Location:** `serve-app.mjs:14,19-20,23`
- **Verification:** not-required

**Description.** Beyond the path-traversal bug, the server binds plain `http` (no TLS) and every response is `res.writeHead(200, { 'Content-Type': ... })` with no `Cache-Control`, `ETag`, or `Content-Encoding` header, and no gzip/brotli compression of any kind — every asset (including large JS bundles) is sent uncompressed and uncached on every single request. It also always returns HTTP 200 even for genuinely missing files (falls back to serving `index.html`), so there is no way to distinguish a real 404 from a successful SPA route from the outside.

**Suggested fix.** If used at all, put this behind a reverse proxy (nginx/Caddy) that terminates TLS, gzips/brotlis text assets, and sets long-lived `Cache-Control: immutable` headers on hashed asset filenames plus `Cache-Control: no-cache` on `index.html`. Better: don't use a hand-rolled server for production at all (see CI/CD finding).

---

#### 10. [LOW] No `engines` field pinning Node/npm version

- **Dimension:** Dim 4: Deployment & Ops
- **Location:** `package.json (no `engines` key)`
- **Verification:** not-required

**Description.** package.json has no `"engines"` field constraining the Node.js/npm version. Combined with the total absence of CI, there is nothing that normalizes the build environment across contributors' machines or a future hosting provider's build image, risking "works on my machine" build breakage (this matters more here given the stack pulls in Vite 8 / Vitest 4 / TS 6, all very recent majors with real minimum-Node requirements).

**Suggested fix.** Add `"engines": { "node": ">=20" }` (or whatever the team standardizes on) to package.json, and use the same version in CI.

---

## Dim 5: Architecture Integrity — 16/100

> Architecture Integrity is not production-ready. The most severe issue: the app runs two incompatible worksheet-to-phase taxonomies simultaneously (legacy ALL_WORKSHEETS driving routing/nav, PHASE_WORKSHEETS_MAP/WK_WORKSHEETS_MAP driving all gating/promotion logic) that disagree about which phase a worksheet belongs to — this produces a real, reproducible core-flow defect where the Phase 1->2->3 access gate is both unsatisfiable through its own intended route tree and trivially bypassable through the parallel /week-N route tree. There is no service/data-access layer (17 files issue raw supabase.from() calls, many duplicating the identical query), worksheet display metadata is hand-duplicated across 5+ files with already-observed drift (numbering gaps, a worksheet appearing twice with contradictory titles), and 'config-driven worksheets' is only a partial truth — worksheetConfigData.ts centralizes IDs/routing/reviewer metadata but not form fields or most display copy, which live hardcoded and re-duplicated across ~40 page files and 5 card-list files. This is strong evidence of an incompletely executed 'Phase/Week merge' (confirmed by git log) that was UI-polished but never architecturally reconciled.

#### 1. [CRITICAL] Two incompatible worksheet-to-phase taxonomies drive routing vs. gating, and disagree on which phase a worksheet belongs to

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

#### 2. [CRITICAL] Phase-access gate is both undeliverable (circular dependency) and trivially bypassable via the parallel /week-N route tree

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

#### 3. [HIGH] No service/data-access layer — 17 files issue raw Supabase queries directly, mostly duplicating the same query

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

#### 4. [MEDIUM] Auto-promotion celebration message hardcodes stale worksheet count, proving the gating expansion was never reconciled with user-facing copy

- **Dimension:** Dim 5: Architecture Integrity
- **Location:** `src/hooks/useAutoPromote.ts:41-44,83,98`
- **Verification:** CONFIRMED — Confirmed: useAutoPromote.ts lines 41-44 builds allWsIds from PHASE_WORKSHEETS_MAP[1]+[2]+[3] (verified against worksheetConfigData.ts:555-570, phase1 alone has 35 entries, phase2 has 5, phase3 has 6 → ~46 total, not 20), while lines 83 and 98 hardcode "All 20 worksheets..." in the promotion notification text sent to the user and managers. The promotion logic itself is unaffected (allApproved check uses allWsIds.length correctly), so this is a stale user-facing copy bug rather than a functional defect — downgraded from HIGH to MEDIUM since it doesn't break gating/promotion, only produces an inaccurate celebratory message.
- **Effort:** S

**Description.** checkAndPromote sums PHASE_WORKSHEETS_MAP[1]+[2]+[3] (34+5+6 = 45 worksheets) to decide promotion eligibility (lines 41-44), but the success messages sent via triggerNotification hardcode 'All 20 worksheets across all 3 phases have been approved' (line 83) and 'All 20 worksheets approved!' (line 98). 20 exactly matches the OLD ALL_WORKSHEETS total (9+5+6=20) from before PHASE_WORKSHEETS_MAP was expanded to include the FTP week curriculum.

**Root cause.** Copy-pasted/hardcoded string not updated when the underlying data model (PHASE_WORKSHEETS_MAP) was expanded.

**Impact / failure scenario.** New hires and managers receive a promotion notification that is factually wrong about how many worksheets were required (45, not 20), undermining trust in the system's own numbers and confirming this code path was not exercised/updated end-to-end after the phase/week merge.

**Steps to reproduce.** Read useAutoPromote.ts lines 41-44 (computes 45-item array) against lines 83/98 (hardcoded string '20').

**Suggested fix.** Compute the count dynamically from allWsIds.length instead of hardcoding '20'.

---

#### 5. [MEDIUM] Worksheet display metadata (title/icon/description/path) is hand-duplicated across 5+ files with observed drift

- **Dimension:** Dim 5: Architecture Integrity
- **Location:** `src/pages/Phase1.tsx:37-94; src/pages/Week1.tsx:16-23; src/pages/Week2.tsx:16-25; src/pages/Week3.tsx:16-25; src/pages/Week4.tsx:27-33; src/config/worksheetConfigData.ts (FTP_WEEK_SESSIONS)`
- **Verification:** CONFIRMED — Verified directly: Phase1.tsx:37-85 hand-declares week1-4 worksheet arrays; Week1-4.tsx (92-115 lines each) independently redeclare per-week arrays with their own icon imports; WK_WORKSHEETS_MAP/FTP_WEEK_SESSIONS in worksheetConfigData.ts are a third copy (though grep confirms these two are actually dead code — never consumed outside their own file/re-export, so they aren't a live sync burden, weakening the "3 files" framing slightly). The concrete drift claims are all confirmed: Phase1.tsx's week2Worksheets (lines 49-58) is missing p1_w6/num4 entirely versus Week2.tsx's fuller 9-item array (so the reproduction claim of "byte-identical modulo formatting" is actually false — they differ in content, not just formatting); Phase1.tsx's week4Worksheets (77-84) likewise skips num:4. p3_w5 is confirmed duplicated with divergent titles: Phase1.tsx:67/Week3.tsx:19 list it as week-3 'Build Full Lecture Package' while Week4.tsx:29 lists the same id as week-4 'Lecture Package v2 — Final Approval' num:3, and WK_WORKSHEETS_MAP itself has p3_w5 in both week 3 and week 4 arrays (lines 402-403) — same worksheet_id, same statuses[id] lookup, so submitting it once will show complete on both pages as claimed.
- **Effort:** M

**Description.** Phase1.tsx independently redeclares the entire FTP week1-4 worksheet list (id/num/path/title/icon/desc) for ALL 4 weeks. The exact same per-week arrays are ALSO separately hand-copied into Week1.tsx, Week2.tsx, Week3.tsx, Week4.tsx (near-identical ~90-115-line files differing only in the array contents/weekNum/icon imports — confirmed via diff). A third copy of similar metadata lives in FTP_WEEK_SESSIONS in worksheetConfigData.ts. This lack of a single source has already caused visible drift: week2Worksheets in Phase1.tsx numbers items 1,2,3,5,6,7,8,9 (num:4 is missing, Phase1.tsx:50-58); week4Worksheets does the same (1,2,3,5,6,7 — Phase1.tsx:77-84). Worksheet p3_w5 appears in BOTH week3Worksheets (Phase1.tsx:67, titled 'Build Full Lecture Package') and week4Worksheets (Week4.tsx:29, titled 'Lecture Package v2 — Final Approval') even though it is the same worksheet_id / same DB row / same rendered component (Phase3Worksheet5) — the UI implies two distinct submissions (draft vs final) that the data model cannot actually represent.

**Root cause.** No shared data-derivation layer between config and page components; each page was authored by copy-pasting a sibling page and manually editing its content.

**Impact / failure scenario.** Any edit to a worksheet's title, icon, or description must be manually propagated to up to 3 files or it silently diverges (as already happened with the num gaps and the duplicate p3_w5 listing). Submitting p3_w5 once marks it 'complete' in both the Week 3 and Week 4 progress bars, which is presumably not the intended product behavior of a two-stage draft/final review.

**Steps to reproduce.** diff src/pages/Week1.tsx src/pages/Week2.tsx shows ~90% of each file is boilerplate identical to the other, differing only in the worksheets array and weekNum; the array in Phase1.tsx:49-59 is byte-identical to Week2.tsx's array modulo formatting.

**Suggested fix.** Generate all per-week and per-phase worksheet card lists from a single canonical config (e.g. FTP_WEEK_SESSIONS or a merged registry), with WeekN/PhaseN pages doing pure rendering rather than owning their own copies of the data.

---

#### 6. [MEDIUM] Ad hoc query cache adopted inconsistently (3 of 17 call sites) is not a real service layer

- **Dimension:** Dim 5: Architecture Integrity
- **Location:** `src/utils/queryCache.ts:1-82; used only by src/pages/AdminDashboard.tsx, BuddyDashboard.tsx, OnboardingLeadDashboard.tsx`
- **Verification:** not-required
- **Effort:** S

**Description.** queryCache.ts provides a generic TTL memoization wrapper (`fetchWithCache`) intended, per its own doc comment, to be 'used by dashboard components to avoid redundant Supabase queries.' Only 3 of the 17 files that call supabase.from directly actually use it; the rest (Phase1-3.tsx, Week1-3.tsx, Dashboard.tsx, PhaseReview.tsx, WorksheetReview.tsx, etc.) re-fetch on every mount with no caching, no dedup, and no shared invalidation strategy.

**Root cause.** Caching helper was added to fix a specific dashboard performance complaint rather than as a standard data-access pattern.

**Impact / failure scenario.** Inconsistent caching behavior across near-identical dashboard-like pages; some pages refetch expensive full-table joins on every navigation while others cache for 30s, with no documented rule for when to use which.

**Steps to reproduce.** grep -rl "queryCache" src returns only AdminDashboard.tsx, BuddyDashboard.tsx, OnboardingLeadDashboard.tsx, while grep -rl "supabase.from" returns 17 files total.

**Suggested fix.** Either standardize all list/status-fetching call sites on the same caching wrapper (or a real client like TanStack Query) or remove the partial abstraction in favor of one consistent pattern.

---

#### 7. [MEDIUM] 'Config-driven worksheets' is only a partial illusion — worksheetConfigData.ts is the source of truth for IDs/metadata, but page copy and form fields are 100% hardcoded per file

- **Dimension:** Dim 5: Architecture Integrity
- **Location:** `src/config/worksheetConfigData.ts (798 lines, canonical IDs/labels); src/pages/worksheets/*.tsx (17 files) and src/pages/worksheets/ftp/*.tsx (16 files) and src/pages/gate-controls/*.tsx (7 files) — 40 hardcoded page files`
- **Verification:** not-required
- **Effort:** L

**Description.** worksheetConfigData.ts centralizes worksheet IDs, reviewer routing, labels and phase/week membership. But none of the 40 worksheet/gate page files derive their field layout, titles, or descriptions from that config — each hardcodes its own JSX form (see Phase1Worksheet1.tsx:7-29 hardcoding title/subtitle/defaultData/requiredFields inline). Meanwhile the SAME title/description text is independently re-typed a second time in the Phase*.tsx/Week*.tsx card-list arrays (finding above) and a third time in FTP_WEEK_SESSIONS. So 'is worksheetConfigData.ts the source of truth' has no single answer: it's authoritative for routing/reviewer metadata, but not for form structure or most of the copy actually shown to users.

**Root cause.** worksheetConfigData.ts was built out for routing/reviewer/gating concerns; form authoring was never folded into the same config.

**Impact / failure scenario.** Adding or changing a worksheet requires touching a page file (form logic), a card-list entry (display copy), and worksheetConfigData.ts (routing/reviewer metadata) — three artifacts must all agree, with nothing enforcing consistency between them.

**Steps to reproduce.** Compare Phase1Worksheet1.tsx:11-12 title/subtitle strings against the corresponding entry's title in worksheetConfigData.ts ALL_WORKSHEETS ('Team Introduction & Stakeholder Mapping', worksheetConfigData.ts:513) — similar but independently authored text in two places.

**Suggested fix.** Either commit fully to config-driven forms (JSON schema per worksheet driving a generic renderer) or accept hardcoded pages as the norm and stop also duplicating their metadata into config and card lists — pick one model and derive the rest from it.

---

#### 8. [MEDIUM] Two incompatible routing strategies for the same domain concept (worksheet page)

- **Dimension:** Dim 5: Architecture Integrity
- **Location:** `src/App.tsx:81-100 (per-ID static route generation from ALL_WORKSHEETS) vs src/App.tsx:144-147 (single generic :worksheetId route, WeekWorksheetPage.tsx)`
- **Verification:** not-required
- **Effort:** M

**Description.** The legacy Phase model gets one statically-generated Route per worksheet ID (`/phase-N/worksheet-M`), each individually wrapped in PhaseAccessGuard when phaseNum>1 (App.tsx:93-95). The FTP week model instead uses a single generic parametrized route (`/week-N/worksheet/:worksheetId`) that resolves the component at render time via WORKSHEET_COMPONENTS lookup (WeekWorksheetPage.tsx:25) and carries NO PhaseAccessGuard at all. Two different architectural patterns solve the identical problem (route to a worksheet form) inconsistently within the same route table.

**Root cause.** Legacy Phase routes predate the FTP week feature; the week feature was bolted on with a different, simpler routing mechanism without unifying the two.

**Impact / failure scenario.** This split is the direct mechanical cause of the phase-gate bypass documented above, and increases cognitive load for anyone adding a new route — there is no single documented convention for 'how do I add a worksheet route.'

**Steps to reproduce.** Read App.tsx lines 81-100 and 144-147 side by side.

**Suggested fix.** Standardize on one routing pattern (recommend the generic :worksheetId pattern with gating applied uniformly via a route-level guard keyed off canonical phase/week membership) for all worksheet types.

---

#### 9. [MEDIUM] Route protection is inlined and repeated ~25 times in JSX instead of a role-based route table

- **Dimension:** Dim 5: Architecture Integrity
- **Location:** `src/App.tsx:111-157`
- **Verification:** not-required
- **Effort:** S

**Description.** Every route in App.tsx repeats `<ProtectedRoute requiredRoles={[...]}>` inline with the same role arrays copy-pasted verbatim many times (e.g. `['new_joinee', 'lab_instructor']` at lines 97, 134, 135, 136, 139, 140, 141, 142, 144, 145, 146, 147, 153; `['academic_head', 'onboarding_lead']` / `['lead_instructor', 'academic_head']` patterns at 116-129). There is no centralized route-to-role table.

**Root cause.** Routes were added incrementally without ever refactoring toward a data-driven route table.

**Impact / failure scenario.** Adding a new protected route requires remembering to copy the correct role array by hand; a typo or omission silently under- or over-protects a route, and there is no single place to audit 'which roles can reach which routes.'

**Steps to reproduce.** Read App.tsx lines 111-157 — count the number of near-identical `<ProtectedRoute requiredRoles={[...]}>` blocks.

**Suggested fix.** Extract a route config array (`{ path, roles, element }[]`) and render Routes from it in a loop, or wrap role-groups in a layout route with `<Route element={<ProtectedRoute requiredRoles={...}><Outlet/></ProtectedRoute>}>` to share the guard across nested routes.

---

#### 10. [LOW] Oversized 'god' components mixing rendering, business rules and status computation

- **Dimension:** Dim 5: Architecture Integrity
- **Location:** `src/components/ReviewContent.tsx (1043 lines); src/components/Navbar.tsx (429 lines)`
- **Verification:** not-required
- **Effort:** M

**Description.** ReviewContent.tsx at 1043 lines and Navbar.tsx at 429 lines each concentrate a large share of the review-status/role-routing business logic that is also duplicated (in smaller doses) across the Phase*/Week*/Dashboard pages documented above.

**Root cause.** Feature growth (buddy/manager/onboarding-lead review flows, gate controls) was accreted into one component over time without extraction.

**Impact / failure scenario.** Any change to review-status semantics (e.g. adding a new review_status value) requires touching this single very large file plus the many independent status-computation blocks scattered through pages — high risk of missing a spot.

**Steps to reproduce.** wc -l src/components/ReviewContent.tsx -> 1043 lines in one file.

**Suggested fix.** Extract pure status-derivation helpers (e.g. isWorksheetComplete(sub), phaseProgress(worksheets, statuses)) into a shared module used by both ReviewContent and the page-level progress calculations, and split ReviewContent by review-target type (worksheet vs gate vs phase-level).

---

#### 11. [LOW] Adding one new worksheet requires manually touching up to 7 disconnected locations, with no consistency check

- **Dimension:** Dim 5: Architecture Integrity
- **Location:** `src/config/worksheetConfigData.ts (FTP_WEEK_SESSIONS, ALL_WORKSHEETS/PHASE_WORKSHEETS_MAP/WK_WORKSHEETS_MAP, WORKSHEET_NAMES); src/config/worksheetConfig.tsx:38-105 (WORKSHEET_COMPONENTS); src/pages/worksheets/*.tsx (new page file); src/pages/Phase*.tsx / Week*.tsx (card-list array entry); src/App.tsx (route, only for legacy Phase model)`
- **Verification:** not-required
- **Effort:** M

**Description.** To register one new worksheet a developer must: (1) add it to FTP_WEEK_SESSIONS, (2) add it to ALL_WORKSHEETS and/or PHASE_WORKSHEETS_MAP/WK_WORKSHEETS_MAP, (3) add a WORKSHEET_NAMES entry, (4) import the new component and add it to WORKSHEET_COMPONENTS in worksheetConfig.tsx, (5) author the page file itself, (6) hand-add a duplicate title/icon/desc card entry into the relevant Phase*.tsx and/or WeekN.tsx array, and (7) possibly add a static route in App.tsx. Nothing enforces that these stay consistent — the num-gap and duplicate-p3_w5 findings above are direct evidence that this manual process already drifted in production data.

**Root cause.** No single registration point / no schema validation across the several hand-maintained lists.

**Impact / failure scenario.** Every future worksheet addition/removal carries a meaningful risk of repeating the same class of drift already observed (missing display slots, worksheets not appearing in the intended list, or a worksheet quietly satisfying two different gates).

**Steps to reproduce.** Cross-reference the 7 locations named above for any single existing worksheet ID (e.g. w2_e1) to see it duplicated across FTP_WEEK_SESSIONS, PHASE_WORKSHEETS_MAP[1], WK_WORKSHEETS_MAP[2], WORKSHEET_NAMES, WORKSHEET_COMPONENTS, Phase1.tsx week2Worksheets, and Week2.tsx worksheets.

**Suggested fix.** Consolidate to a single worksheet registry keyed by ID that drives routing, display metadata, and gating membership, with a unit test asserting every WORKSHEET_COMPONENTS key has exactly one phase/week membership and vice versa.

---

## Dim 6: Database Schema & Integrity — 14/100

> The database layer has a critical, repo-wide RLS design flaw: every "update own row" policy on user_profiles and worksheet_submissions omits WITH CHECK, so any authenticated new hire can self-elevate their role (bypassing every downstream role-based RLS gate) or directly set their own worksheet's review_status to 'approved', completely defeating the app's core review/approval workflow — and this is present identically in schema.sql, supabase_schema.sql, setup_correct.sql, and every RLS fix script. Compounding this, the schema itself is in a state of unmanaged drift: the documented "one true" schema.sql is missing the notifications table and due_date column that core features depend on in production, the repo's only migration-runner script points at files that don't exist, and internal docs (SYSTEM_ANALYSIS.md) still point engineers at a years-stale, incompatible schema file. Secondary issues include a spoofable notifications INSERT policy, a missing CHECK constraint that let a real status-badge display bug ship, a non-atomic duplicate-prevention pattern for final assessments, and no ON DELETE semantics anywhere, making user offboarding/erasure operationally blocked. This dimension is not production-ready and should block launch until the RLS WITH CHECK gaps are closed and the schema is consolidated into one verifiably-applied source of truth.</summary>


#### 1. [CRITICAL] RLS UPDATE policies missing WITH CHECK let users self-elevate role and self-approve their own worksheets

- **Dimension:** Dim 6: Database Schema & Integrity
- **Location:** `db/schema.sql:63-64 ("Update own profile"), db/schema.sql:184-187 ("Update own submissions") — identical pattern also in db/supabase_schema.sql:37-40/133-136, db/setup_correct.sql, db/__setup_supabase.sql:67-69/126-128, db/__fix_rls_recursion.sql, db/__fix_rls_jwt.sql`
- **Verification:** CONFIRMED — Verified byte-for-byte: db/schema.sql:63-64 and 184-187 (plus the same pattern in supabase_schema.sql, setup_correct.sql, __setup_supabase.sql, __fix_rls_recursion.sql, __fix_rls_jwt.sql) all define FOR UPDATE policies with USING only, no WITH CHECK; since id/user_id are immutable, Postgres reuses USING as the check and it trivially passes for any column change. Confirmed the app is a client-side SPA (src/api/supabase.ts) using the public anon key directly in the browser, making RLS the sole enforcement — so an authenticated new_joinee can indeed self-elevate role or self-approve worksheet review_status/reviewed_by via a direct supabase-js .update() call.

**Description.** Every UPDATE policy that governs a user's own row is defined as `FOR UPDATE USING (id = auth.uid())` / `FOR UPDATE USING (auth.uid() = user_id)` with NO `WITH CHECK` clause. Per Postgres RLS semantics, when WITH CHECK is omitted the USING expression is reused as the check for the *new* row — and since `id`/`user_id` never changes on an UPDATE, that check trivially passes. This means an authenticated user can update ANY column on their own row, not just the ones the UI exposes. Two concrete exploit paths: (1) `user_profiles`: a `new_joinee` can call `supabase.from('user_profiles').update({role:'academic_head'}).eq('id', myId)` directly from the browser (the anon key is committed in .env and always public in an SPA anyway) and immediately gain the 'Admin read/update all profiles' and 'Reviewers select/update submissions' RLS grants that key on `auth.jwt()->'user_metadata'->>'role'` — but even without touching the JWT, updating `user_profiles.role` alone satisfies every subquery-based policy variant present in supabase_schema.sql/__setup_supabase.sql (`auth.uid() IN (SELECT id FROM user_profiles WHERE role IN (...))`). (2) `worksheet_submissions`: a joinee can call `.update({review_status:'approved', reviewer_name:'Self', reviewed_at: now()}).eq('id', myRow)` on their own submission — self-approving their own onboarding worksheet and completely bypassing the buddy/manager review workflow that is this app's core function. No trigger, CHECK constraint, or WITH CHECK clause anywhere in db/*.sql guards `role`, `assigned_lead_id`, `assigned_buddy_id`, `review_status`, or `reviewed_by` against self-modification.

**Suggested fix.** Add explicit WITH CHECK clauses (or split into separate column-scoped policies) that pin immutable/privileged columns. E.g. for user_profiles: `WITH CHECK (id = auth.uid() AND role = (SELECT role FROM user_profiles WHERE id = auth.uid()))` is still racy — better: revoke UPDATE on `role`/`assigned_lead_id`/`assigned_buddy_id` from the authenticated role via column-level GRANTs, or use a BEFORE UPDATE trigger that raises an exception if `NEW.role IS DISTINCT FROM OLD.role` unless invoked by a service-role/definer function. Similarly for worksheet_submissions, add `WITH CHECK (auth.uid() = user_id AND review_status = OLD.review_status AND reviewed_by IS NOT DISTINCT FROM OLD.reviewed_by)` via a trigger (RLS USING/WITH CHECK cannot reference OLD directly, so this needs a BEFORE UPDATE trigger function), so joinees can only touch worksheet_data/status, never the reviewer fields.

---

#### 2. [CRITICAL] Canonical schema.sql is missing the notifications table and due_date column that are core, actively-used features

- **Dimension:** Dim 6: Database Schema & Integrity
- **Location:** `db/schema.sql (entire file — no `CREATE TABLE notifications`, no `due_date` column); compare db/__migration_notifications_dates.sql:6-51 and db/__due_date_notifications.sql`
- **Verification:** CONFIRMED — Verified directly: `grep -c notifications db/schema.sql` and `grep -c due_date db/schema.sql` both return 0, schema.sql's own header claims to incorporate 'all migrations' (listing 7 specific files, none of which is __migration_notifications_dates.sql), context.md:1614/1625/1882 instruct fresh setup to run only db/schema.sql, and useNotifications.ts/useDueDates.ts/useAutoSave.ts genuinely query/write the `notifications` table and `due_date` column on core, always-hit paths (bell polling, badge rendering, every autosave).

**Description.** db/schema.sql's header explicitly claims: "This is the ONE FILE you need to run. It incorporates all migrations" and context.md:139/1882 documents it as "the definitive schema (run this)" for fresh setup. But grepping schema.sql for 'notifications' or 'due_date' returns zero matches. The `notifications` table (with its own RLS policies) and the `worksheet_submissions.due_date` column are defined only in the separate, un-referenced file db/__migration_notifications_dates.sql. Meanwhile src/hooks/useNotifications.ts (lines 62,106,126,154) and src/hooks/useDueDates.ts (line 128) and src/hooks/useAutoSave.ts (line 120, `upsertPayload.due_date`) query/write these on every page load and every worksheet autosave. Any team member who follows the documented setup instructions (paste schema.sql into a fresh Supabase project for staging/DR/new-environment bring-up) will get a database that 500s/errors on the notification bell and due-date badges the moment a real user logs in — `relation "notifications" does not exist` and `column "due_date" of relation "worksheet_submissions" does not exist`.

**Suggested fix.** Fold the contents of db/__migration_notifications_dates.sql (and ideally __due_date_notifications.sql's function) into db/schema.sql so the file actually lives up to its 'ONE FILE, all migrations' claim, or restructure db/ into a numbered migrations/ directory with a migrations-tracking table and stop treating any single hand-maintained file as 'definitive'.

---

#### 3. [HIGH] Documentation still points engineers at an incompatible, stale schema file (supabase_schema.sql) as the source of truth for RLS

- **Dimension:** Dim 6: Database Schema & Integrity
- **Location:** `SYSTEM_ANALYSIS.md:52 ("All authorization is in supabase_schema.sql. If a feature is broken, check the Policy first.") vs. the actually-current db/schema.sql and db/__fix_rls_jwt.sql`
- **Verification:** CONFIRMED — Verified line-by-line: SYSTEM_ANALYSIS.md:52 is the only schema pointer in the doc and names supabase_schema.sql, never schema.sql. Confirmed supabase_schema.sql:11 role CHECK lacks 'new_joinee'/'onboarding_lead' (present in schema.sql:44, and AuthContext.tsx:103/169 defaults new signups to 'new_joinee'); supabase_schema.sql:100 review_status CHECK lacks 'buddy_approved' (present in schema.sql:151); supabase_schema.sql:13 assigned_lead_id references auth.users(id) vs schema.sql:46 referencing user_profiles(id); supabase_schema.sql:32/79/119/143 use recursive `IN (SELECT ... FROM user_profiles)` RLS subqueries that __fix_rls_jwt.sql explicitly replaces with auth.jwt()->'user_metadata'->>'role' checks, and schema.sql's own header states it is the 'DEFINITIVE DATABASE SCHEMA' superseding supabase_schema.sql. All cited facts check out exactly as described.

**Description.** db/supabase_schema.sql is the original, superseded schema. Its `user_profiles.role` CHECK constraint (line 11) is `CHECK (role IN ('lab_instructor', 'lead_instructor', 'academic_head', 'acad_ops'))` — it is missing both 'new_joinee' (the default role every signup gets per src/context/AuthContext.tsx:103) and 'onboarding_lead' (a whole role/dashboard in the app). Its `worksheet_submissions.review_status` CHECK (line 100) is missing 'buddy_approved', a status value the buddy-review workflow depends on and that seed/production data actively uses. Its `assigned_lead_id` FK targets `auth.users(id)` (line 13) instead of `user_profiles(id)` as in schema.sql. Its RLS policies use recursive subqueries on user_profiles (the exact pattern later fixed by __fix_rls_recursion.sql/__fix_rls_jwt.sql) and have none of the assigned_buddy_id-aware policies from supabase_reviewer_migration.sql. An engineer following SYSTEM_ANALYSIS.md's explicit pointer to this file to debug or reason about 'what the policies are' will reason about a completely wrong, years-stale authorization model, and if this file is ever accidentally (re-)run against a database it will violently conflict with the live schema (CHECK constraint rejecting valid inserts of 'new_joinee'/'onboarding_lead'/'buddy_approved').

**Suggested fix.** Delete or clearly rename supabase_schema.sql to something like supabase_schema.OLD.sql with a top-of-file banner ('SUPERSEDED — see schema.sql'), and fix SYSTEM_ANALYSIS.md's pointer. Better: delete all of the one-off __fix_*.sql / *_migration.sql files from db/ once folded into schema.sql, so there is exactly one file a reader can trust.

---

#### 4. [HIGH] notifications INSERT policy has no ownership check — any authenticated user can forge notifications as/to anyone

- **Dimension:** Dim 6: Database Schema & Integrity
- **Location:** `db/__migration_notifications_dates.sql:34-37`
- **Verification:** CONFIRMED — Verified db/__migration_notifications_dates.sql:34-37 verbatim: `CREATE POLICY \"Insert notifications\" ON notifications FOR INSERT TO authenticated WITH CHECK (true);` — no check ties user_id or from_user_id to auth.uid(); this is the only INSERT policy on the table (no later migration overrides it), so any authenticated user can indeed insert a notification with an arbitrary user_id/from_user_id, spoofing sender identity to any recipient.

**Description.** `CREATE POLICY "Insert notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (true);` places zero restriction on `user_id` (recipient) or `from_user_id` (claimed sender). Any logged-in new_joinee can call `supabase.from('notifications').insert({user_id: <any-uuid>, from_user_id: <any-uuid>, worksheet_id:'x', type:'approved', message:'You have been approved!'})` and inject an arbitrary, spoofed notification into any other user's notification feed (e.g. impersonating their manager telling them a worksheet was approved when it wasn't, or spamming/social-engineering another user). The app's own triggerNotification() helper always passes the correct fromUserId, but RLS is the actual security boundary and it enforces nothing here.

**Suggested fix.** Restrict the check to only allow inserting notifications the caller is either the recipient of, or an assigned reviewer relationship justifies, e.g. `WITH CHECK (from_user_id = auth.uid() OR auth.jwt()->'user_metadata'->>'role' IN ('lead_instructor','academic_head','onboarding_lead'))`, or move notification creation into a SECURITY DEFINER RPC function so clients never INSERT into notifications directly.

---

#### 5. [MEDIUM] Broken migration tooling: the only migration runner in the repo points at SQL files that don't exist

- **Dimension:** Dim 6: Database Schema & Integrity
- **Location:** `scripts/run_migration.cjs:35-42 (references scripts/setup/__migration_notifications_dates.sql and scripts/setup/__due_date_notifications.sql — that directory does not exist; the files actually live at db/__migration_notifications_dates.sql and db/__due_date_notifications.sql)`
- **Verification:** CONFIRMED — Verified: scripts/run_migration.cjs:35-42 hard-codes paths scripts/setup/__migration_notifications_dates.sql and scripts/setup/__due_date_notifications.sql, but ls -la shows these files actually exist under db/ (scripts/setup/ is empty of .sql files); running the script would throw ENOENT on fs.readFileSync, and it's the only migration script in scripts/.

**Description.** scripts/run_migration.cjs is the repo's only automated way to apply a migration (via the Supabase Management API). It hard-codes `MIGRATIONS = [{file: 'scripts/setup/__migration_notifications_dates.sql', ...}, {file: 'scripts/setup/__due_date_notifications.sql', ...}]`. `find scripts -iname '*.sql'` returns zero results — that path was never created, or was moved/renamed and the runner was never updated. Running this script today would immediately throw an ENOENT on `fs.readFileSync`. This confirms that in practice every schema change in this project's history was applied by hand-pasting SQL into the Supabase SQL Editor, with no tooling actually exercised, no record of what has been run against the live database, and no way to reproduce the live schema from source control with any confidence.

**Suggested fix.** Fix the path (point at db/), or better, replace this ad hoc script with a real migration framework (supabase CLI `supabase migration up`, or a numbered migrations table + a small runner that records applied filenames) so 'what's actually live' is knowable and reproducible.

---

#### 6. [MEDIUM] Missing CHECK constraint on worksheet_submissions.status let inconsistent free-text values ship, breaking the status badge in production

- **Dimension:** Dim 6: Database Schema & Integrity
- **Location:** `db/schema.sql:141 (`status TEXT DEFAULT 'Not Started'` — no CHECK, unlike review_status which has one) vs. writers/readers: src/hooks/useAutoSave.ts:112 (`status: (data.status as string) || 'In Progress'`), src/hooks/useWorksheet.ts:198 (`status: 'submitted'`), src/pages/gate-controls/GateControl2.tsx:25 (`status: 'In Progress'`), src/pages/Dashboard.tsx:74 (`if ((sub.status as string) === 'Submitted') ...`)`
- **Verification:** not-required

**Description.** Unlike `review_status`, the `status` column has no CHECK constraint/enum, so the database silently accepts whatever casing/spelling the frontend happens to write. In practice the frontend itself is inconsistent: useWorksheet.ts sets the in-memory `data.status` to the lowercase literal `'submitted'`, which useAutoSave.ts then persists verbatim into the `status` column, while Dashboard.tsx's badge logic checks for the capitalized literal `'Submitted'`. The comparison never matches, so the 'Submitted' status pill silently fails to render for freshly-submitted worksheets — a real, currently-shipping bug that a CHECK constraint (or generated column / enum type) would have caught at write time in dev/staging instead of failing silently in the UI.

**Suggested fix.** Add `CHECK (status IN ('Not Started','In Progress','Submitted','Approved'))` (or whatever the canonical set is) to worksheet_submissions.status, matching it against every literal actually written in src/, and fix the casing mismatch it will immediately surface.

---

#### 7. [MEDIUM] onboarding_submissions has no UNIQUE constraint; duplicate-prevention is done in application code with a non-atomic check-then-write

- **Dimension:** Dim 6: Database Schema & Integrity
- **Location:** `db/schema.sql:86-103 (no UNIQUE on user_id or email); src/pages/Assessment.tsx:53-63`
- **Verification:** not-required

**Description.** `onboarding_submissions` (the final assessment record) has no UNIQUE constraint on `user_id` or `email`. Assessment.tsx implements 'one submission per person' entirely in application code: `SELECT id FROM onboarding_submissions WHERE email = ...` then conditionally INSERT or UPDATE. This is a classic TOCTOU race — a double-click submit, a duplicate tab, or a retried request after a slow network response can run the SELECT twice before either INSERT completes, producing two `onboarding_submissions` rows for the same person with no database-level guard against it. Downstream code that does `.select(...).single()` or that reports 'has this person been assessed' would then behave unpredictably (which row wins is nondeterministic).

**Suggested fix.** Add `UNIQUE (user_id)` (or `UNIQUE(email)`, whichever is the real identity key here) to onboarding_submissions and replace the check-then-insert-or-update with a single `upsert(..., { onConflict: 'user_id' })` call, matching the pattern already correctly used for worksheet_submissions.

---

#### 8. [MEDIUM] No ON DELETE rule on any FK to auth.users/user_profiles — user deletion (offboarding, GDPR erasure) is blocked by raw FK violations

- **Dimension:** Dim 6: Database Schema & Integrity
- **Location:** `db/schema.sql:40 (user_profiles.id), :46 (assigned_lead_id), :47 (assigned_buddy_id), :88 (onboarding_submissions.user_id), :131 (worksheet_submissions.user_id), :158 (worksheet_submissions.reviewed_by); db/__migration_notifications_dates.sql:11-12 (notifications.user_id/from_user_id)`
- **Verification:** not-required

**Description.** Every foreign key referencing `auth.users(id)` or `user_profiles(id)` is declared with the Postgres default `ON DELETE NO ACTION` (i.e. RESTRICT). There is no automated or documented path to remove a user: deleting a row from `auth.users` (e.g. offboarding an employee, or honoring a data-erasure request) will fail with a foreign key violation the instant that user has any worksheet_submissions, notifications, or is referenced as someone else's assigned_lead_id/assigned_buddy_id. The only script in the repo that manages this (db/__cleanup_test_users.sql) has to manually DELETE from 4 tables in dependency order before it can delete from auth.users — and that script nukes ALL data (`DELETE FROM user_profiles;` with no WHERE clause) rather than being a per-user tool. There is no equivalent 'delete this one real user safely' procedure anywhere in db/.

**Suggested fix.** Decide the intended semantics per relationship and encode them: `ON DELETE CASCADE` for a user's own worksheet_submissions/notifications (their data goes with them), `ON DELETE SET NULL` for assigned_lead_id/assigned_buddy_id (don't destroy other people's rows when a buddy/manager leaves). Then provide a real 'offboard user' SQL function or admin action, not just the nuke-everything test script.

---

#### 9. [MEDIUM] RLS recursion fix history shows an intermediate broken version using the wrong JWT claim path, and nothing prevents that broken file from being re-applied

- **Dimension:** Dim 6: Database Schema & Integrity
- **Location:** `db/__fix_rls_recursion.sql:30,37,65,78 (`auth.jwt() ->> 'role'`) vs. the corrected db/__fix_rls_jwt.sql:28,35,61,74 and db/schema.sql:70,77,193,209 (`auth.jwt() -> 'user_metadata' ->> 'role'`)`
- **Verification:** not-required

**Description.** The original recursion bug (policies on user_profiles doing `auth.uid() IN (SELECT id FROM user_profiles WHERE role IN (...))`, i.e. querying the very table being protected, causing infinite recursion — visible in db/supabase_schema.sql:32, db/supabase_role_migration.sql:32, db/__setup_supabase.sql:74-77/132-137) is genuinely eliminated once JWT claims replace the self-referential subquery — that part of the fix is real, not a band-aid. But the intermediate file __fix_rls_recursion.sql fixed the recursion by reading `auth.jwt() ->> 'role'`, which is Postgres/Supabase's reserved top-level JWT claim that always holds the Postgres role ('authenticated' or 'anon'), never the application role — meaning under that version, the admin-bypass branch of every affected policy could never evaluate true, silently locking academic_head/lead_instructor/onboarding_lead out of reading/updating any profile or submission but their own. This was corrected one file later in __fix_rls_jwt.sql by reading the correct `user_metadata` path. Nothing in the repo enforces ordering between these files (filenames don't sort by application order: __fix_rls_recursion.sql sorts before __fix_rls_jwt.sql alphabetically, which happens to match intended order here, but there is no migrations table or version marker preventing an operator from re-running the wrong one, or running schema.sql against a DB that still has the broken intermediate policies cached in a stale SQL Editor tab).

**Suggested fix.** Delete the superseded __fix_rls_recursion.sql and __fix_rls_jwt.sql once their content is folded into schema.sql (per finding above), so there's no broken intermediate state left in the repo for someone to accidentally re-run.

---

#### 10. [LOW] Seed script leaves a permanent helper function (get_id) in the public schema with no cleanup

- **Dimension:** Dim 6: Database Schema & Integrity
- **Location:** `db/seed_worksheets.sql:7-9 (`CREATE OR REPLACE FUNCTION get_id(email TEXT) RETURNS UUID AS $$ SELECT id FROM user_profiles ...$$`)`
- **Verification:** not-required

**Description.** seed_worksheets.sql defines `get_id(text)` in the default (public) schema for its own convenience and never drops it afterward. If this seed script is run against what becomes the production database (plausible given the workflow observed — hand-run SQL files in the Supabase SQL Editor), a generically-named `get_id` function is left permanently in the schema, which risks colliding with a future real function of the same name/signature and adds unreviewed, undocumented surface to the schema.

**Suggested fix.** Wrap the function definition and its use in a single transaction/DO block and `DROP FUNCTION IF EXISTS get_id(TEXT);` at the end of the script, or use a CTE/LATERAL join instead of a standalone helper function.

---

#### 11. [LOW] review_status/reviewer_type CHECK constraints and indexes are duplicated with slight drift across multiple files instead of owned by one migration

- **Dimension:** Dim 6: Database Schema & Integrity
- **Location:** `db/schema.sql:151, db/supabase_schema.sql:100, db/__migration_notifications_dates.sql:49-51 (three separate definitions of the same review_status CHECK, each with a different allowed value set as the feature evolved)`
- **Verification:** not-required

**Description.** The review_status CHECK constraint has been redefined at least three times across three different files as the state machine grew ('' /pending_review/needs_revision/revision_submitted/approved → + buddy_approved), each redefinition done via `DROP CONSTRAINT IF EXISTS ... ADD CONSTRAINT ...` in a different file rather than a single evolving migration. There's no single place a reader can check 'what are the currently valid review_status values' without cross-referencing which of these files was applied most recently to the live DB.

**Suggested fix.** Consolidate into schema.sql only, remove the constraint-altering statements from the other files once merged.

---

## Dim 7: Failure Handling & Recovery — 27/100

> Failure handling in Newton Onboarding is largely cosmetic: most Supabase writes check `.error` and show a toast, but the two most consequential flows — worksheet submission and initial data hydration — actively hide failures from the user. useAutoSave's save() never rethrows/rejects, so useWorksheet/useGateControl's try/catch around `await flushSave()` is dead code; users see a 'Submitted successfully' toast and get locked into the SubmittedView even when the underlying upsert never persisted (after exhausting 2 retries). The one visible save-status indicator (SaveIndicator) is built but never wired into the header, so there is no persistent UI signal of a failed save at all. Several read paths (PhaseAccessGuard, BuddyGatePass, admin/buddy/lead dashboards' fetchWithCache calls, loadWorksheetData) drop the Supabase `error` field entirely, silently rendering wrong/empty state (locking a legitimate phase, hanging in an infinite loading skeleton, showing 0 instructors) instead of surfacing anything to the user. Partial-failure/notification flows are not atomic and not idempotent on retry.

#### 1. [CRITICAL] Worksheet/gate submission always shows success even when the save permanently fails — silent data loss

- **Dimension:** Dim 7: Failure Handling & Recovery
- **Location:** `src/hooks/useAutoSave.ts:164-180 (save catch block never rethrows) combined with src/hooks/useWorksheet.ts:190-216 (handleSubmit) and src/hooks/useGateControl.ts:155-189 (handleSubmit)`
- **Verification:** CONFIRMED — Verified directly: useAutoSave.ts save() catch block (164-180) only sets state/schedules retries, never rethrows or rejects; flushSave (197-201) just awaits save() so it always resolves; useWorksheet.ts handleSubmit (190-216) and useGateControl.ts handleSubmit (155-189) both call setData(submitData) synchronously then await flushSave, so their catch blocks are dead code for save failures; WorksheetPage.tsx:103-104 confirms isSubmitted (driven by data.status==='submitted', set before save resolves) renders SubmittedView unconditionally.

**Description.** `save()` in useAutoSave.ts wraps everything in try/catch; on failure it calls notifyError, sets saveStatus='error', schedules up to 2 retries — but never re-throws or returns a rejected promise. `flushSave` just `await save(data)`, so it too always resolves. In `useWorksheet.handleSubmit` and `useGateControl.handleSubmit`, `await flushSave(submitData)` therefore never throws, so the `catch` block that shows 'Submission failed. Please try again.' is unreachable for genuine Supabase failures (network error, RLS denial, constraint violation, timeout). Execution always falls through to `showToast(...'submitted for review', 'success')`. Additionally, `setData(submitData)` is called synchronously before the save is even attempted, so `data.status === 'submitted'` is true immediately, which flips `isSubmitted` to true in WorksheetPage.tsx (line 103) and renders the terminal `SubmittedView` — hiding the form entirely, before the save outcome is known.

**Impact / failure scenario.** User fills out a worksheet, hits Submit while offline or during an RLS/schema error, sees a green success toast and the 'Worksheet Submitted' screen, and navigates away confident their work is saved. The `worksheet_submissions` row was never upserted (or only partially, if retries all fail). Reviewers never see the submission; the joinee has no way to know their work is gone, and there's no durable indicator (see next finding) that would let them notice later.

**Suggested fix.** Make `save()` in useAutoSave.ts re-throw after exhausting retries (or return a boolean/result the caller can check), and have `flushSave` propagate that failure so `handleSubmit` in useWorksheet/useGateControl can genuinely catch it and (a) not show the success toast, (b) not transition local `data.status` to 'submitted' until the write is confirmed. Example: track a `finalFailure` promise/flag set only after the retry budget is exhausted, and have `flushSave` reject with it.

---

#### 2. [HIGH] SaveIndicator (auto-save status badge) is built but never rendered — save failures are invisible in the UI

- **Dimension:** Dim 7: Failure Handling & Recovery
- **Location:** `src/config/worksheetComponents.tsx:103 (WorksheetHeader destructures `{icon,title,subtitle,badge}`, not `saveStatus`) and src/components/WorksheetPage.tsx:128 (passes `saveStatus={saveStatus}` to WorksheetHeader, which silently drops it); `SaveIndicator` component defined at worksheetComponents.tsx:153 but has zero call sites in src/`
- **Verification:** CONFIRMED — Verified directly: worksheetComponents.tsx:103 destructures only {icon,title,subtitle,badge} (saveStatus is in the interface at line 22 but never read/rendered), WorksheetPage.tsx:128 passes saveStatus into it and it's silently dropped, and grep confirms SaveIndicator (defined at worksheetComponents.tsx:153) has zero call sites anywhere in src/ — dead component, save-failure state never surfaces persistently in the UI.

**Description.** `useWorksheet` returns `saveStatus` ('idle'|'saving'|'saved'|'error') and `WorksheetPage` passes it into `WorksheetHeader`, but `WorksheetHeader`'s prop destructuring never reads `saveStatus`, and the purpose-built `SaveIndicator` component that would render 'Failed' with an error icon is never imported/used anywhere in the codebase (confirmed via grep — only its definition and type exist).

**Impact / failure scenario.** Even in the case where auto-save (not explicit submit) fails during background editing, the only feedback is a transient toast from `notifyError` that vanishes after ~3.5s. If the user is not looking at the screen at that exact moment (e.g., they alt-tabbed, or the toast fired during typing), there is no persistent way to discover that their in-progress edits are not saved. Combined with the previous finding, there is no reliable UI surface for save failures anywhere in the app.

**Suggested fix.** Render `<SaveIndicator status={saveStatus} />` inside `WorksheetHeader` (fix the prop destructuring to include `saveStatus` and pass it through), so a failed save state persists visibly until the user dismisses/retries, not just a fading toast.

---

#### 3. [HIGH] loadWorksheetData ignores the Supabase `error` field — a transient read failure during page load can present a submitted worksheet as blank

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

#### 4. [HIGH] Auto-save notification failures are swallowed inside triggerNotification, so a successful save can silently fail to notify the reviewer

- **Dimension:** Dim 7: Failure Handling & Recovery
- **Location:** `src/hooks/useAutoSave.ts:131-156 (calls triggerNotification per reviewer) and src/hooks/useNotifications.ts:151-165 (triggerNotification's own try/catch swallows all errors)`
- **Verification:** CONFIRMED — Confirmed: useAutoSave.ts loops reviewerUserIds calling `await triggerNotification(...)` with no error handling/return check, and useNotifications.ts's triggerNotification catches insert errors and only console.error's them without rethrowing, so save() proceeds to setSaveStatus('saved') even when the notification insert fails.

**Description.** In `useAutoSave.save()`, after the worksheet upsert succeeds, the function loops over reviewer IDs and calls `await triggerNotification(...)` for each. `triggerNotification` itself wraps its insert in try/catch and only does `console.error(...)` on failure — it never throws. So if the `notifications` insert fails (RLS denial, malformed payload, DB constraint), `save()` proceeds straight to `setSaveStatus('saved')` as if everything succeeded. This is exactly the 'worksheet saved but notification insert failed' partial-failure scenario the audit brief calls out.

**Impact / failure scenario.** A joinee submits a worksheet; the submission is persisted and the UI shows 'Saved'/'Submitted', but the assigned buddy/manager never receives a notification (no toast, no DB row, no console visibility outside dev tools). The reviewer has no way to know a submission is waiting; the joinee believes the reviewer was notified. This directly stalls the review pipeline with no error trail for support/ops to find (only a `console.error` that nobody is watching in production).

**Suggested fix.** Distinguish notification failures from save failures explicitly: still mark the worksheet as saved (that's correct — the primary write succeeded), but surface a distinct, non-fatal warning ('Saved, but we couldn't notify your reviewer — they may not see this yet') and/or log to a monitored error channel (not just console.error) so undelivered notifications can be found and retried by an admin process. Consider a `notifications` outbox/retry table if 100% delivery matters.

---

#### 5. [MEDIUM] PhaseAccessGuard's Supabase query has no `.catch`, no error check — unhandled rejection can hang the guard forever, and RLS errors silently deny legitimate phase access

- **Dimension:** Dim 7: Failure Handling & Recovery
- **Location:** `src/components/PhaseAccessGuard.tsx:61-70`
- **Verification:** CONFIRMED — Confirmed at src/components/PhaseAccessGuard.tsx:61-70 — the Supabase query chain has no .catch and never destructures `error`; on promise rejection setChecking(false) never runs (permanent 'Loading…'), and on a resolved-with-error response allSubmissions stays [] causing canAccessPhase (worksheetConfigData.ts:699-708) to fail closed and show PhaseLockedView to legitimate users; no global unhandledrejection handler exists to mitigate. Downgraded to MEDIUM since this requires a transient network/RLS failure (not a common-path bug) and the failure mode is a wrong loading/locked UI rather than data corruption or security bypass — the fail-closed direction is actually the safer default for a security guard, though it does produce a misleading message.

**Description.** ```js
supabase.from('worksheet_submissions').select('worksheet_id, review_status, user_id').eq('user_id', user.id)
  .then(({ data }) => {
    if (data) setAllSubmissions(data as unknown as WorksheetSubmission[]);
    setChecking(false);
  });
```
There is no `.catch()` and `error` is never destructured/checked. Two distinct failure modes: (1) if the promise actually rejects (network abort, DNS failure), this is an unhandled promise rejection and `setChecking(false)` never runs, so `checking` stays `true` forever — the guard is stuck on 'Loading…' permanently, blocking the user from Phase 2/3 content indefinitely. (2) if the query resolves with a populated `error` (e.g., a transient RLS/policy failure), `data` is null/undefined, `allSubmissions` stays `[]`, and `canAccessPhase(...)` is evaluated against zero submissions — the guard fails closed and renders `PhaseLockedView`, telling a legitimate, fully-approved user their phase is locked, with no way to distinguish 'actually locked' from 'query failed'.

**Impact / failure scenario.** A transient network blip while navigating to /phase-2 or /phase-3 either wedges the user on a permanent loading screen, or falsely tells them Phase 2/3 is locked (wrong message, no retry affordance) even though they completed Phase 1.

**Suggested fix.** Add `.catch(err => { console.error(err); setChecking(false); setLoadError(true); })` and check `error` in the `.then`. On failure, render a distinct 'Couldn't verify phase access — retry' state rather than silently treating it as either infinite-loading or fail-closed-locked.

---

#### 6. [MEDIUM] Dashboard queries (Admin/Buddy/OnboardingLead) discard the Supabase `error` field via `.then(r => r.data)`, so query failures render as silently-empty dashboards

- **Dimension:** Dim 7: Failure Handling & Recovery
- **Location:** `src/pages/AdminDashboard.tsx:75-86, src/pages/BuddyDashboard.tsx:60-71, src/pages/OnboardingLeadDashboard.tsx:47-52 (all via src/utils/queryCache.ts:51-67 fetchWithCache)`
- **Verification:** CONFIRMED — Verified directly: queryCache.ts's fetchWithCache (lines 51-67) caches whatever the fetcher resolves to with zero error inspection, and all three dashboards (AdminDashboard.tsx, BuddyDashboard.tsx, OnboardingLeadDashboard.tsx) use `.then(r => r.data as ...)` on every Supabase call, discarding `r.error`; the surrounding try/catch only catches thrown exceptions, which a resolved `{data:null,error:{...}}` response never triggers. Repo also genuinely contains db/__fix_rls_recursion.sql and db/__fix_rls_jwt.sql, corroborating the RLS-fragility context cited in the finding. Line numbers are slightly imprecise (e.g. OnboardingLeadDashboard fetch block is 47-53 not 47-52) but point to the correct code.

**Description.** All three dashboards use the pattern `fetchWithCache(key, () => supabase.from(...).select(...).then(r => r.data as T))`. The `.then(r => r.data)` projection throws away `r.error` entirely — there is no branch that inspects it. If the query fails with a populated `error` (RLS misconfiguration, expired session, malformed filter), `r.data` is `null`/`undefined`, which is what `fetchWithCache` caches and returns. Callers do `if (instrData) setInstructors(instrData)` — since falsy, state just stays at its previous (often empty on first load) value. The `try/catch` around `Promise.all(...)` in each dashboard only catches thrown exceptions, never this silently-swallowed error field, so `console.error('Failed to load admin/buddy/lead data')` never fires either.

**Impact / failure scenario.** If RLS policies regress (a known fragile area per the seed `__fix_rls_recursion.sql`/`__fix_rls_jwt.sql` scripts in this repo) or a query genuinely errors for a subset of admins, the Admin/Buddy/OnboardingLead dashboards will render as 'zero instructors, zero worksheets' with a plausible-looking empty state, not an error — indistinguishable from 'nothing to review yet.' Worse, `fetchWithCache` caches this null result for 15-30s, so even a manual refresh within that window replays the same silent failure.

**Suggested fix.** In `fetchWithCache` fetchers, check `error` and throw (so it propagates to the outer try/catch and is not cached), e.g. `.then(r => { if (r.error) throw r.error; return r.data; })`. In the dashboards, distinguish 'no data' from 'load failed' in the rendered state (e.g. an `error` state with a retry button) instead of relying on an empty array.

---

#### 7. [MEDIUM] useAutoSave retry counter (retryCountRef) is never reset on success, permanently disabling retries after 3 lifetime failures

- **Dimension:** Dim 7: Failure Handling & Recovery
- **Location:** `src/hooks/useAutoSave.ts:54, 169, 171 (retryCountRef only incremented, never reset on the success path at line 158-163)`
- **Verification:** not-required

**Description.** `retryCountRef.current += 1` happens on every failure and gates retries via `if (retryCountRef.current <= 2)`. There is no corresponding reset of `retryCountRef.current = 0` on the success path (`setSaveStatus('saved')` block). The only place `mountedRef`/`initialSaveDoneRef` are reset is the `useEffect` keyed on `[worksheetId]` (lines 56-60), which does not touch `retryCountRef` or `errorShownRef` either.

**Impact / failure scenario.** If a user hits 3 transient save failures at any point while editing a single worksheet (e.g., flaky wifi during a long editing session), all subsequent auto-save failures for the remainder of that page's lifetime silently stop retrying — each failure still shows the one-shot 'Auto-save failed' toast, but the automatic recovery mechanism the retry logic exists for is permanently disabled for that session, with no way for the user to know retries have stopped.

**Suggested fix.** Reset `retryCountRef.current = 0` when a save succeeds (inside the `if (mountedRef.current) { setSaveStatus('saved'); ... }` block).

---

#### 8. [MEDIUM] Save retry re-runs the entire save() including notification dispatch, risking duplicate reviewer notifications on transient failures

- **Dimension:** Dim 7: Failure Handling & Recovery
- **Location:** `src/hooks/useAutoSave.ts:171-178 (retry calls `save(data)` recursively from the top) combined with 125-156 (notification block runs unconditionally inside the same try block as the upsert)`
- **Verification:** not-required

**Description.** When `save()` fails partway through (e.g., the upsert succeeds but a later step throws, or a genuinely-transient error occurs anywhere in the function body), the retry calls `save(data)` again from scratch with the original closure `data`. Because `isNewSubmission` is derived purely from the input `data` (not from any 'already notified' flag), a retry after a partial failure re-sends `triggerNotification` to every resolved reviewer ID a second (or third) time, inserting duplicate notification rows.

**Impact / failure scenario.** A reviewer can receive 2-3 duplicate 'ready for review' notifications for the same single submission after a transient blip, degrading trust in the notification system.

**Suggested fix.** Make the upsert and the notification dispatch independently idempotent/guarded — e.g., only attempt notification dispatch once per logical submission (track with a ref keyed by worksheetId+status transition, not re-derived from `data` on every retry), or split save() into 'persist' and 'notify' phases where only the failed phase is retried.

---

#### 9. [MEDIUM] signOut() clears local auth state before confirming the Supabase signOut call succeeded

- **Dimension:** Dim 7: Failure Handling & Recovery
- **Location:** `src/context/AuthContext.tsx:228-233`
- **Verification:** not-required

**Description.** ```js
async function signOut() {
  setUser(null);
  setProfile(null);
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
```
Local `user`/`profile` state is cleared synchronously before the network call to Supabase is even made. If `supabase.auth.signOut()` fails (network error), the function throws, but the app has already transitioned to a logged-out UI state (ProtectedRoute etc. will treat `user === null` as unauthenticated) while the actual Supabase session/token may still be valid and present in storage.

**Impact / failure scenario.** On a signOut network failure, the UI shows the user as logged out (redirect to Login) while their session technically persists; if they log back in immediately the app may behave inconsistently, and on a shared device the 'sign out' action gives false confidence that the session ended when the call actually failed.

**Suggested fix.** Await `supabase.auth.signOut()` first (or at minimum only clear local state after success, or on failure show an explicit 'Sign out failed, try again' message rather than silently leaving the desynced state).

---

#### 10. [MEDIUM] fetchProfile's fallback path can leave an authenticated user with profile permanently null after a transient error, with no retry UI

- **Dimension:** Dim 7: Failure Handling & Recovery
- **Location:** `src/context/AuthContext.tsx:36-69 and src/context/AuthContext.tsx:94-131 (createProfileFromAuth)`
- **Verification:** not-required

**Description.** On a non-recursion, non-PGRST116 error, `fetchProfile` calls `notifyError` (a toast) then falls through to `createProfileFromAuth(userId)` regardless — even though the real profile row likely exists and the error was just transient. `createProfileFromAuth` attempts an INSERT (which will typically fail with a duplicate-key error since the profile already exists), then does one retry SELECT; if that retry SELECT *also* fails (plausible if the original error was a broader outage/RLS issue, not literally a duplicate key), the function returns having set nothing, with no additional error call on that final inline branch (lines 116-124 handle the insert-error branch without calling notifyError again).

**Impact / failure scenario.** A transient network/RLS blip during initial profile load can leave a fully-authenticated user (`user` is set) with `profile === null` forever, with only a single toast (already faded) as the only trace. Any role-gated route/component depending on `profile` (ProtectedRoute, PhaseAccessGuard, dashboards) will treat this as 'no role', likely showing an Access Restricted screen to a legitimately provisioned user, with no visible retry affordance beyond a full page reload.

**Suggested fix.** Add an explicit 'couldn't load your profile — retry' state distinct from 'no profile exists yet', driven by whether the initial SELECT actually errored (vs. genuinely returned zero rows / PGRST116), and give the user a retry button rather than silently attempting an insert that's very likely to collide.

---

#### 11. [MEDIUM] Phase-approval bulk action doesn't reload state before allowing retry, causing duplicate approvals/notifications on partial-failure retry

- **Dimension:** Dim 7: Failure Handling & Recovery
- **Location:** `src/pages/PhaseReview.tsx:76-165 (handleApprovePhase)`
- **Verification:** not-required

**Description.** `handleApprovePhase` loops sequentially over `toApprove` (worksheets with `review_status === 'buddy_approved'`), updates each, and tracks `allSucceeded`. On partial failure it sets `actionMessage = '⚠️ Some worksheets could not be approved. Check console for details.'` (no reload of `submissions`, no per-item failure detail shown to the manager). The manager's only recourse is to click 'Approve Phase' again — but `toApprove` is still computed from the stale, un-reloaded `submissions` state, which still shows the worksheets that *did* succeed as `buddy_approved` (since state wasn't refreshed to `approved`). Retrying therefore re-updates and re-triggers `triggerNotification` for worksheets that already succeeded the first time, alongside the ones that actually failed.

**Impact / failure scenario.** After a partial failure (e.g. worksheet 3 of 5 fails due to a transient DB error), a manager retrying 'Approve Phase' generates duplicate 'approved' notifications to the joinee for the 4 worksheets that already succeeded, plus a duplicate `review_history` entry appended to each — polluting the audit trail with repeated identical approval events.

**Suggested fix.** On any per-item failure, call `loadData()` (or update local state to reflect confirmed successes) before allowing another 'Approve Phase' attempt, and only retry the specific worksheets that actually failed rather than recomputing `toApprove` from a stale status field.

---

#### 12. [LOW] Week1-4.tsx and Phase1-3.tsx status loaders have no error handling; failures silently render worksheets as 'not started'

- **Dimension:** Dim 7: Failure Handling & Recovery
- **Location:** `src/pages/Week1.tsx:31-38 (also Week2/3/4, similar pattern per grep), src/pages/Phase2.tsx / Phase3.tsx (single `.from(` call, 0 error mentions)`
- **Verification:** not-required

**Description.** `loadStatuses()` in Week1.tsx has no try/catch and doesn't check `error`; it's invoked from a `useEffect` without `.catch`, making it an unhandled rejection on failure. Unlike Phase1.tsx (which at least wraps the same call in try/catch/finally with a `loading` flag), Week1.tsx has no `loading` state at all, so a failed load just leaves `statuses = {}` permanently, silently marking every worksheet in that week as incomplete.

**Impact / failure scenario.** A joinee who has already completed some Week-1 worksheets sees them marked as not-done if the initial status fetch fails transiently, with zero error indication — purely cosmetic/progress-tracking impact (does not affect the underlying data), but confusing and untrustworthy.

**Suggested fix.** Standardize this pattern (ideally by extracting the shared 'load worksheet statuses for a set of IDs' logic used by Phase1-3/Week1-4 into one hook) with consistent try/catch, error-state, and retry.

---

#### 13. [LOW] errorShownRef in useAutoSave is set but never read — dead state, no functional effect

- **Dimension:** Dim 7: Failure Handling & Recovery
- **Location:** `src/hooks/useAutoSave.ts:53, 168`
- **Verification:** not-required

**Description.** `errorShownRef.current = true` is set inside the catch block but the ref is never read anywhere else in the file or by consumers. It appears intended to gate/deduplicate repeated error toasts across retries but has no effect.

**Impact / failure scenario.** None functionally beyond confirming that error-toast deduplication across auto-save retries doesn't actually happen (each retry failure fires its own `notifyError` toast independently, which combined with the retry backoff (3s, 6s) could produce a small burst of 2-3 near-identical 'Auto-save failed' toasts stacking in the corner).

**Suggested fix.** Either use `errorShownRef` to suppress repeat toasts within a retry cycle and only show one consolidated error, or remove the dead ref.

---

## Dim 8: E2E Data Flow & Contracts — 9/100

> This dimension fails outright: two independently-verified CRITICAL defects break core, non-recoverable end-to-end flows for every user in production. (1) A circular gating bug in PHASE_WORKSHEETS_MAP means Phase 2 and Phase 3 — surfaced, primary navigation — can never unlock, because the worksheets required to satisfy the Phase-1 gate are themselves only reachable behind the Phase-2 lock. (2) A case-sensitive status-string mismatch ('Submitted' vs 'submitted') between useGateControl.ts and useAutoSave.ts/useWorksheet.ts permanently strands every FTP week-gate submission (w1_g1..w4_g1) with review_status stuck at '', invisible to reviewers and unrescuable via the UI, with zero feedback to the submitting user. On top of these, db/schema.sql — documented as the single canonical setup file — omits the notifications table and due_date column the app depends on, breaking any fresh deployment. Reviewer approve/revision actions and the auto-promotion pipeline also lack optimistic-concurrency and re-entrancy guards, enabling stale-tab overwrites and duplicate notification spam. None of this was caught by tests (no useGateControl tests exist at all). This is not production-ready.</summary>


#### 1. [CRITICAL] Case-mismatched status string ('Submitted' vs 'submitted') permanently strands FTP Gate Artifact submissions with no reviewer visibility

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

#### 2. [HIGH] db/schema.sql — the file explicitly documented as 'the ONE FILE you need to run' — is missing the notifications table and due_date column the app requires

- **Dimension:** Dim 8: E2E Data Flow & Contracts
- **Location:** `db/schema.sql:1-17 (header claims completeness), whole file (no notifications table, no due_date column); db/__migration_notifications_dates.sql:6,9-26 (where these actually live); src/hooks/useNotifications.ts:61-66; src/hooks/useDueDates.ts:126-129; src/hooks/useAutoSave.ts:22,120 (UpsertPayload.due_date)`
- **Verification:** CONFIRMED — Verified: db/schema.sql (read in full) has no CREATE TABLE notifications and no due_date column anywhere, despite its header claiming to be 'the ONE FILE you need to run' incorporating all migrations; db/__migration_notifications_dates.sql independently defines ADD COLUMN due_date and CREATE TABLE notifications and is not referenced by schema.sql. Confirmed src/hooks/useNotifications.ts fetches/inserts .from('notifications') unconditionally, useDueDates.ts selects worksheet_submissions.due_date, and useAutoSave.ts's UpsertPayload includes due_date and is written on every save — so a fresh DB built strictly from schema.sql would break these paths with a missing-relation/column error.
- **Effort:** S

**Description.** db/schema.sql's header states it 'incorporates all migrations' and is 'the ONE FILE you need to run' to stand up the database. It defines user_profiles, onboarding_submissions, and worksheet_submissions, but never creates a `notifications` table and never adds the `due_date` column to worksheet_submissions — both of which are only present in the separate, unreferenced migration file db/__migration_notifications_dates.sql. Meanwhile useNotifications.ts selects/inserts against `notifications` and useAutoSave.ts/useDueDates.ts read/write `worksheet_submissions.due_date` unconditionally.

**Impact / failure scenario.** Any operator who follows schema.sql's own instructions to provision a fresh Supabase project (e.g. new environment, disaster recovery, staging) gets a database where every notification fetch/insert (NotificationBell, every submit/approve/revision action, admin assignment, signup) throws a Postgres 42P01 'relation notifications does not exist' error, and every auto-save upsert fails or silently drops due_date. The app is non-functional out of the box for anyone who trusts the documented setup path.

**Suggested fix.** Fold __migration_notifications_dates.sql (and __due_date_notifications.sql if still desired) into schema.sql so it is genuinely complete, or update schema.sql's header to explicitly list it as a required follow-up file and add a numbered '0-based' migrations directory that's actually run in order by a setup script.

---

#### 3. [HIGH] Reviewer approve/revision actions have no optimistic-concurrency guard — stale client state can clobber newer server state

- **Dimension:** Dim 8: E2E Data Flow & Contracts
- **Location:** `src/pages/WorksheetReview.tsx:74-104 (handleBuddyApprove), :145-195 (handleBuddyRevision); src/pages/PhaseReview.tsx:76-165 (handleApprovePhase)`
- **Verification:** CONFIRMED — Verified all three cited sites: WorksheetReview.tsx:100-104 (handleBuddyApprove) and :168-172 (handleBuddyRevision) update .eq('user_id',...).eq('worksheet_id',...) with no review_status guard despite checking submission?.review_status client-side at line 76; PhaseReview.tsx:99-111 (handleApprovePhase) loops over client-filtered toApprove (line 81, filtered from possibly-stale `submissions` state) and updates .eq('id', sub.id) with no status guard. Checked db/schema.sql and db/supabase_schema.sql: review_status only has a value-enum CHECK constraint, no transition-validity trigger or optimistic-concurrency mechanism exists server-side. Severity HIGH is reasonable given this is a real lost-update race with no server-side backstop, though likelihood is probably lower than described (requires concurrent access to the same submission, e.g. two open tabs or two reviewers) — MEDIUM-HIGH is arguably more precise than HIGH but HIGH is defensible.
- **Effort:** M

**Description.** handleBuddyApprove validates the action against `submission?.review_status`, a value that was fetched once when the page loaded (WorksheetReview.tsx:76-80), then issues an UPDATE keyed only on `.eq('user_id', userId).eq('worksheet_id', worksheetId)` — with no `.eq('review_status', currentStatus)` guard. The same pattern repeats in handleBuddyRevision and in PhaseReview.tsx's handleApprovePhase (which filters `submissions.filter(s => s.review_status === 'buddy_approved')` from client-cached state before looping unconditional `.update()` calls).

**Impact / failure scenario.** If a reviewer has the same review page open in two tabs (or two reviewers with the same access — e.g. a manager and an assigned buddy both able to see a submission), a stale tab's approve/revision click will overwrite whatever the server's current state is, because the UPDATE never checks that review_status still matches what was read. Concretely: Tab A loads with review_status='pending_review'; a second action elsewhere sets it to 'approved'; Tab A (still showing pending_review) is then used to click 'Request Revision' — the UPDATE unconditionally executes and downgrades an already-approved worksheet back to 'needs_revision', and fires a duplicate/contradictory notification to the joinee. There is no server-side check (e.g. a WHERE clause on the previous status, or a Postgres trigger enforcing valid state transitions) to prevent this lost-update race.

**Suggested fix.** Add `.eq('review_status', expectedPriorStatus)` to every reviewer UPDATE and check the returned row count; if zero rows updated, refetch and show a 'this worksheet was already reviewed/updated — reload' conflict message instead of silently succeeding. Longer-term, enforce valid review_status transitions with a Postgres trigger/CHECK so even out-of-band writes can't produce contradictory states.

---

#### 4. [MEDIUM] checkAndPromote has no re-entrancy guard — concurrent invocation duplicates promotion notifications and can fire on every subsequent trigger

- **Dimension:** Dim 8: E2E Data Flow & Contracts
- **Location:** `src/hooks/useAutoPromote.ts:23-104; src/pages/PhaseReview.tsx:150 (call site, no lock)`
- **Verification:** CONFIRMED — Verified in src/hooks/useAutoPromote.ts:23-104 — checkAndPromote never checks the user's existing role before updating it and firing triggerNotification calls to the joinee + every manager (getReviewerUserIds('manager')), and the test suite (src/hooks/__tests__/useAutoPromote.test.ts) has no coverage for an already-promoted user. The call site (PhaseReview.tsx:150) does disable the Approve button during actionLoading and only reaches checkAndPromote when toApprove.length>0 (buddy_approved items exist), which limits how often it re-fires in the same tab — but that's local component state only, so two browser tabs/sessions both approving before either reloads can each pass the toApprove.length>0 check and both reach checkAndPromote, producing duplicate 'Congratulations' + duplicate manager notifications, exactly as described. Impact is duplicate notifications, not data corruption (role update is idempotent), so HIGH is a bit inflated.
- **Effort:** S

**Description.** checkAndPromote(userId) re-fetches all worksheet_submissions, checks if every id in PHASE_WORKSHEETS_MAP is 'approved', and if so unconditionally updates user_profiles.role to 'lead_instructor' and sends a '🎉 Congratulations' notification to the user plus a notification to every manager (getReviewerUserIds('manager')). It never checks whether the user's role is already 'lead_instructor' before doing this.

**Impact / failure scenario.** Any concurrent or repeated invocation while the 'all worksheets approved' condition holds (e.g. a manager double-clicking 'Approve Phase 3', two browser tabs both approving the final phase, or a future caller invoking checkAndPromote again after promotion) will re-run the full promotion side effects: another role update (idempotent) plus a fresh duplicate 'Congratulations' notification to the joinee and a duplicate notification to every manager. There is no DB-level idempotency key on notifications, and no application-level guard (e.g. `if (profile.role === 'lead_instructor') return`) to prevent this.

**Suggested fix.** At the top of checkAndPromote, fetch the user's current role and short-circuit with `{promoted:false, message:'already promoted'}` if it's already 'lead_instructor'. For true concurrency safety, make the role UPDATE conditional (`.eq('role','new_joinee_or_whatever_prior_role')`) and only send notifications if the update actually affected a row.

---

#### 5. [MEDIUM] Regular worksheet submit (useWorksheet.handleSubmit) lacks the synchronous double-submit guard that useGateControl has, enabling duplicate notifications on rapid double-click

- **Dimension:** Dim 8: E2E Data Flow & Contracts
- **Location:** `src/hooks/useWorksheet.ts:190-216 (handleSubmit); src/hooks/useGateControl.ts:115-119,186 (submitGuardRef, for comparison); src/hooks/useAutoSave.ts:125-156 (unconditional notification insert on every save() call)`
- **Verification:** not-required
- **Effort:** S

**Description.** useGateControl.ts uses a synchronous ref (`submitGuardRef`) set at the very start of handleSubmit and explicitly documents it exists 'to prevent duplicate checks from React StrictMode double-invocation' / rapid re-clicks. useWorksheet.ts's handleSubmit — used by all ~25 Phase/Week worksheet pages — has no equivalent; it only relies on `setSubmitting(true)` and the ActionBar button's `disabled={submitting}` prop, which only takes effect after React re-renders. Two click events dispatched in quick succession (a fast double-click) can both invoke handleSubmit before the first render commits the disabled state.

**Impact / failure scenario.** A rapid double-click on 'Submit for Review' can call flushSave→save() twice with the same `data._savedReviewStatus`, both evaluating `isNewSubmission = true` (useAutoSave.ts:126-130) and each looping over the assigned reviewer(s) to call triggerNotification — since there is no DB uniqueness/dedupe constraint on the notifications table, this produces duplicate 'submitted' notifications to the buddy/manager for a single user action.

**Suggested fix.** Add the same synchronous ref-guard pattern used in useGateControl.ts to useWorksheet.ts's handleSubmit (check-and-set before any await, reset in finally). As defense in depth, consider a partial unique index or dedupe check in triggerNotification (e.g. skip insert if an identical unread notification for the same user_id/worksheet_id/type was created in the last N seconds).

---

#### 6. [MEDIUM] Auto-save 'conflict detection' between tabs/submit is decorative — always last-write-wins with no user-facing warning

- **Dimension:** Dim 8: E2E Data Flow & Contracts
- **Location:** `src/hooks/useAutoSave.ts:67-83`
- **Verification:** not-required
- **Effort:** M

**Description.** save() fetches the server's current `updated_at` and compares it to a locally-cached `_savedUpdatedAt`; on mismatch it only does `console.warn('...Saving anyway (last-write-wins).')` and proceeds to overwrite regardless. There is no toast/banner to the user, no merge, and no re-fetch before overwriting.

**Impact / failure scenario.** If the same worksheet is open in two tabs (or a joinee edits while a reviewer's action lands, or the debounced auto-save races an explicit submit from another device), the loser's edits are silently discarded with only a devtools console line — the user has no indication their concurrent changes were lost.

**Suggested fix.** On detected conflict, surface a visible toast ('This worksheet was updated elsewhere — your recent changes may be overwritten') and/or block the write and force a reload of server state before allowing further edits, rather than silently overwriting.

---

#### 7. [LOW] Auto-save retry counter never resets after a successful save, silently disabling retries for the rest of the session

- **Dimension:** Dim 8: E2E Data Flow & Contracts
- **Location:** `src/hooks/useAutoSave.ts:54,164-179`
- **Verification:** not-required
- **Effort:** S

**Description.** `retryCountRef` increments on every save failure and is used to cap retries at 2 (`if (retryCountRef.current <= 2)`), but it is never reset to 0 after a subsequent successful save. Once a user has hit 2 cumulative failures at any point while editing a worksheet, all later failures in that same page session stop retrying (the code silently falls through — only the 'error' saveStatus badge reflects it).

**Impact / failure scenario.** A user who had 2 transient network blips early in a long editing session (each auto-recovered) will get zero automatic retries for any later failure, relying entirely on them noticing a small status indicator and re-triggering save manually.

**Suggested fix.** Reset `retryCountRef.current = 0` on successful save (in the `setSaveStatus('saved')` branch).

---

## Dim 9: Security — 6/100

> Security is not production-ready and represents a launch-blocking risk. The two most severe findings are textbook Supabase RLS anti-patterns present in the schema explicitly labeled "DEFINITIVE": (1) role-based authorization is sourced from auth.jwt()->user_metadata, which any authenticated user can self-write via the standard supabase.auth.updateUser() client call, granting themselves academic_head/onboarding_lead/lead_instructor at the database layer, not just the UI; and (2) the user_profiles and worksheet_submissions self-update RLS policies have no WITH CHECK clauses, so any new hire can directly set their own profile role to admin or their own worksheets' review_status to 'approved' via a plain Supabase client call, fully bypassing the buddy/manager review workflow that is the product's core purpose. ProtectedRoute/PhaseAccessGuard/route requiredRoles (confirmed client-side-only) provide zero real protection against either vector, and there are no server-side RPCs/SECURITY DEFINER functions anywhere in the codebase enforcing role-scoped state transitions. Compounding this, multiple committed scripts (create-admin.cjs, fix-assignments.cjs, create_32_users.sql, seed scripts) hardcode a shared weak password across dozens of accounts including at least one named manager-role account, targeting the same production project URL already committed via .env. XSS surface is genuinely clean (no dangerouslySetInnerHTML/innerHTML anywhere in src, no markdown/HTML-rendering libraries), and there's no classic open-redirect or SQL/PostgREST filter injection found. But the authorization model itself is fundamentally broken at the data layer, not just missing UI polish — this must be fixed (app_metadata-based roles + WITH CHECK clauses + server-side transition RPCs) before any real user data touches this system.

#### 1. [CRITICAL] Complete privilege escalation: role-based RLS trusts user-editable auth.user_metadata, not a server-controlled claim

- **Dimension:** Dim 9: Security
- **Location:** `db/schema.sql:68-70,75-77,108-111,191-193,207-209 (also db/__fix_rls_jwt.sql:28-30,35-37,89-93,64-72,80-84); exploited via src/context/AuthContext.tsx (supabase.auth client) and any direct supabase-js/REST call`
- **Verification:** CONFIRMED — Verified in db/schema.sql:68-70,75-77,108-111,191-193,207-209 and db/__fix_rls_jwt.sql:28,35,61,74,88 — every admin/reviewer RLS policy gates on auth.jwt()->'user_metadata'->>'role', and no app_metadata/SECURITY DEFINER helper exists anywhere in db/ to gate role authoritatively; src/hooks/useAutoPromote.ts:69-71 confirms the app itself writes role via the plain client call supabase.auth.updateUser({data:{role:...}}), proving user_metadata is reachable/writable by any authenticated session (anon key), which any client could call with an arbitrary role value to self-escalate.

**Description.** Every 'admin/reviewer' RLS policy in the schema Newton actually ships (db/schema.sql, explicitly labeled 'DEFINITIVE DATABASE SCHEMA' incorporating the __fix_rls_jwt.sql fix) authorizes access with `auth.jwt() -> 'user_metadata' ->> 'role' IN ('academic_head','lead_instructor','onboarding_lead')`. In Supabase, `user_metadata` (raw_user_meta_data) is intentionally end-user-writable via the standard, always-available client call `supabase.auth.updateUser({ data: {...} })` — it is NOT the same as `app_metadata`, which requires the service_role key. Any authenticated 'new_joinee' can open devtools and run `await supabase.auth.updateUser({ data: { role: 'academic_head' } })`, wait for the session/JWT to refresh (or just call getSession again), and the next request's JWT will satisfy every 'admin'/'reviewer' RLS check in the app: read every user's PII in user_profiles, read/update every worksheet_submissions row org-wide (including approving/rejecting), and read all onboarding_submissions. This is a full server-side (not just UI) privilege escalation to the highest role in the system, reachable with two lines of supported SDK code and the public anon key that is already committed in .env.

**Impact / failure scenario.** Any signed-up account (including one created via the public /signup form as 'new_joinee') can grant itself 'academic_head' in its own JWT metadata and immediately gain read access to every other employee's PII (email, department, assignments) and read/approve/reject authority over every worksheet_submissions and onboarding_submissions row in the organization. No exploit tooling needed — this is the officially documented Supabase Auth client API.

**Suggested fix.** Never source authorization role from `user_metadata`. Store role in `app_metadata` (settable only via the Supabase Admin API / service_role, e.g. from a trusted server or Postgres trigger that copies `user_profiles.role` into `auth.users.raw_app_meta_data` using `auth.admin.updateUserById`), and change every RLS policy to check `auth.jwt() -> 'app_metadata' ->> 'role'` instead of `user_metadata`. Alternatively, drop metadata-based role checks entirely and use a `SECURITY DEFINER` helper function `is_reviewer(uid uuid)` that reads `user_profiles.role` for a table the user cannot self-write (see next finding) with RLS recursion avoided via `SECURITY DEFINER`.

---

#### 2. [CRITICAL] user_profiles 'Update own profile' policy has no WITH CHECK — any user can self-write their own role column to admin

- **Dimension:** Dim 9: Security
- **Location:** `db/schema.sql:62-64 (`CREATE POLICY "Update own profile" ON user_profiles FOR UPDATE USING (id = auth.uid());`) — identical in db/__fix_rls_jwt.sql:22-23 and db/__fix_rls_recursion.sql:22-24`
- **Verification:** CONFIRMED — Confirmed verbatim in db/schema.sql:63-64, db/__fix_rls_jwt.sql:22-23, db/__fix_rls_recursion.sql:23-24: `FOR UPDATE USING (id = auth.uid())` with no WITH CHECK. Per Postgres RLS semantics, when WITH CHECK is omitted the USING clause is reused to validate the new row, so the only constraint on the post-update row is `id = auth.uid()` — role is unconstrained and the CHECK(role IN (...)) column constraint still permits 'academic_head' etc., so a self-update to `role='academic_head'` on one's own row passes RLS (verified — same gap also independently exists in the co-located "Admin update profiles" policy at schema.sql:75-79, which likewise has `OR id = auth.uid()` with no WITH CHECK). Confirmed AuthContext.fetchProfile() (src/context/AuthContext.tsx:38-53) reads `role` straight from this table into `profile`, and ProtectedRoute (src/components/ProtectedRoute.tsx:35-37) gates routes on `profile?.role`, so this is a real, trivially exploitable client-side route/UI privilege escalation. One mitigating nuance not mentioned in the finding: the *other*, more consequential RLS policies (worksheet-review approve/reject, cross-user profile reads in schema.sql:66-79,193-213) gate on `auth.jwt()->'user_metadata'->>'role'` (JWT claims), not this table column, so self-elevating `user_profiles.role` alone does not by itself grant DB-level write/read access to other users' submissions/profiles — impact is confined to UI-gating bypass and profile-data integrity, not full backend admin takeover via this vector alone. The finding's stated impact (unlocking admin/buddy UI client-side) is accurately scoped and doesn't overclaim beyond that, so CRITICAL is defensible as a broken-access-control/privilege-escalation-class bug even with that caveat.

**Description.** The self-update policy for `user_profiles` only restricts *which row* can be updated (`id = auth.uid()`); it has no `WITH CHECK` clause limiting *which columns/values* may be written. Postgres RLS is row-level, not column-level, so a `new_joinee` can run `supabase.from('user_profiles').update({ role: 'academic_head' }).eq('id', myId)` and it will succeed — the row being updated is their own, satisfying `USING (id = auth.uid())`. This directly flips `user_profiles.role`, which is what `AuthContext.fetchProfile()` reads and what `ProtectedRoute`/`hasRole()`/`PhaseAccessGuard` use for all client-side route gating (src/components/ProtectedRoute.tsx:35-40), and — per src/hooks/useAutoPromote.ts:61-71 — is exactly the column the app's own legitimate promotion flow treats as the role source of truth.

**Impact / failure scenario.** A malicious new hire runs one Supabase update call from the browser console to set their own `user_profiles.role` to `academic_head`/`onboarding_lead`/`lead_instructor`. `ProtectedRoute`'s `requiredRoles` checks (src/App.tsx:116-129) now pass client-side, unlocking `/admin`, `/buddy`, `/onboarding-lead` and worksheet-review UI in their own browser — no exploit needed, this is a documented Supabase RLS anti-pattern (missing WITH CHECK).

**Suggested fix.** Add `WITH CHECK (id = auth.uid() AND role = (SELECT role FROM user_profiles WHERE id = auth.uid()))` to freeze self-editable columns, or split into a narrow self-update policy that excludes `role`/`assigned_lead_id`/`assigned_buddy_id` via a trigger (`BEFORE UPDATE` function that raises an exception if `NEW.role IS DISTINCT FROM OLD.role` unless the actor is verified admin through a SECURITY DEFINER check), and require role/assignment changes to go through a privileged RPC.

---

#### 3. [CRITICAL] worksheet_submissions self-approval: 'Update own submissions' / 'Insert own submissions' policies have no WITH CHECK on review_status/reviewed_by — a joinee can approve their own worksheets directly, bypassing the entire buddy/manager review workflow

- **Dimension:** Dim 9: Security
- **Location:** `db/schema.sql:176-187 (`Insert own submissions` WITH CHECK only restricts user_id; `Update own submissions` FOR UPDATE USING (auth.uid() = user_id) has no WITH CHECK at all); state-machine validation only exists client-side in src/pages/WorksheetReview.tsx:74-80`
- **Verification:** CONFIRMED — Verified: db/schema.sql:184-187 'Update own submissions' policy is FOR UPDATE USING (auth.uid() = user_id) with no WITH CHECK; per Postgres RLS semantics, an UPDATE policy with no WITH CHECK reuses the USING expression for the check, so any authenticated user can write arbitrary values (review_status='approved', reviewed_by=self, reviewer_name='Manager', etc.) to their own row as long as user_id is unchanged. Confirmed no trigger or SECURITY DEFINER function enforces state-machine transitions server-side (only BEFORE UPDATE trigger in schema.sql is update_updated_at_column), src/api/supabase.ts uses the anon/publishable key so RLS is the only gate, and WorksheetReview.tsx performs the approve transition via a plain supabase.from('worksheet_submissions').update() call gated only by client-side React state checks. Checked all other SQL variants (db/__fix_rls_jwt.sql, supabase_role_migration.sql, supabase_reviewer_migration.sql, setup_correct.sql) — same gap present in every version, no RPC calls exist anywhere in src/.

**Description.** Every state-machine transition (pending_review → buddy_approved → approved, or → needs_revision) is validated only in React (e.g. `if (currentStatus !== 'pending_review' && currentStatus !== 'revision_submitted') { ...bail... }` in WorksheetReview.tsx:76-80) before an ordinary `supabase.from('worksheet_submissions').update(...)` call. There is no RPC/SECURITY DEFINER function and no RLS WITH CHECK restricting which `review_status`/`reviewed_by`/`reviewer_name`/`review_history` values a row owner may write. Because the RLS policy that lets a joinee edit their own submission (`auth.uid() = user_id`, used legitimately for auto-save) has no WITH CHECK, the exact same policy lets that joinee write `{ review_status: 'approved', reviewed_by: <self>, reviewer_name: 'Manager' }` directly onto their own row from the browser console — completely bypassing buddy review and manager review.

**Impact / failure scenario.** Any new hire can self-approve all of their own worksheets across all 3 phases with a handful of `supabase.from('worksheet_submissions').update({review_status:'approved',...}).eq('id', myRowId)` calls, then (per useAutoPromote.ts logic, itself client-invoked and gated only by the equally-broken self-role-write in Finding #2) legitimately trigger — or directly replicate — the promotion to `lead_instructor` (buddy/reviewer status) without a single human review ever occurring. This defeats the core business purpose of the entire onboarding/review product.

**Suggested fix.** Add WITH CHECK clauses that pin non-owner-writable columns to their prior values for self-updates (e.g. `WITH CHECK (auth.uid() = user_id AND review_status = OLD... )` is not directly expressible in plain RLS — instead split into: (a) a narrow 'Joinee autosave' policy restricted via WITH CHECK to `review_status IN ('', 'pending_review')` and NULL reviewed_by/reviewer_name, and (b) move all approve/reject/revision transitions into `SECURITY DEFINER` RPC functions that verify caller role/assignment server-side and perform the state transition atomically, callable only by verified reviewers.

---

#### 4. [CRITICAL] Signup role is accepted as a caller-supplied parameter with no server-side allow-list — any direct API call can self-register as academic_head/onboarding_lead

- **Dimension:** Dim 9: Security
- **Location:** `src/context/AuthContext.tsx:169,174,188 (signUp(email, password, fullName, role) writes `role` straight into both auth user_metadata and the user_profiles insert); UI-side default is src/pages/Signup.tsx:31 (`signUp(email, password, fullName, 'new_joinee')`)`
- **Verification:** CONFIRMED — Confirmed: AuthContext.tsx signUp(email,password,fullName,role) forwards caller-supplied role into auth.signUp metadata and the user_profiles insert; db/schema.sql:59-60 'Insert own profile' RLS policy only checks id=auth.uid() with no role restriction, and the role CHECK constraint (line 44) permits academic_head/onboarding_lead; scripts/setup/create-admin.cjs demonstrates exactly this exploit via the public anon-key signup endpoint. Since this grants full admin privilege with zero authentication and zero existing account, CRITICAL (not just HIGH) is warranted over the reported severity.

**Description.** The `signUp()` function signature takes `role: UserRole` as a plain parameter and forwards it verbatim to `supabase.auth.signUp({ options: { data: { role } } })` and to the `user_profiles` insert. The shipped Signup.tsx page only ever calls it with `'new_joinee'`, so the UI itself is fine — but nothing server-side enforces that constraint. The only server-side guard is the CHECK constraint on `user_profiles.role` allowing any of `('new_joinee','lab_instructor','lead_instructor','academic_head','onboarding_lead','acad_ops')` — i.e. the database happily accepts a self-registered `academic_head` account. `scripts/setup/create-admin.cjs` is literally a working demonstration of this: it calls the public `/auth/v1/signup` REST endpoint with the anon key and `data: { role: 'onboarding_lead' }` and succeeds.

**Impact / failure scenario.** Anyone (no account required) can POST directly to the public Supabase auth signup endpoint (URL + anon key are both in the committed .env) with `data: { role: 'academic_head' }` to create a brand-new account that already holds the highest privilege role from the moment of signup, then insert a matching `user_profiles` row (also permitted, since 'Insert own profile' only checks `id = auth.uid()`, not role). No existing account or escalation step is even required.

**Suggested fix.** Never allow role to be client-supplied at signup. Always create new accounts with a hardcoded `new_joinee`/default role server-side (e.g. via a Postgres trigger on `auth.users` insert that sets `user_profiles.role = 'new_joinee'` unconditionally, ignoring any metadata), and require role escalation only through an authenticated admin action gated by Finding #1/#2's proper server-side role source.

---

#### 5. [HIGH] Zero server-side enforcement of role-scoped review actions — RLS lets any reviewer role set the final 'approved' status, bypassing the buddy→manager two-step approval the UI implies

- **Dimension:** Dim 9: Security
- **Location:** `db/schema.sql:203-216 ('Reviewers update submissions' policy — no WITH CHECK distinguishing which review_status values lead_instructor vs academic_head may write); comment on lines 204-206 documents the intended restriction but the policy body doesn't enforce it`
- **Verification:** CONFIRMED — Verified in db/schema.sql:207-216 — the 'Reviewers update submissions' policy has only a USING clause (role/assignment check) and no WITH CHECK constraining review_status values; no trigger or SECURITY DEFINER function elsewhere in schema.sql enforces per-role transitions either (only a value-enum CHECK at line 151). Confirmed in src/pages/WorksheetReview.tsx that 'canApprove = isBuddy' (line 50) is a UI-only gate for button rendering, not a server-side restriction, so a lead_instructor can directly set review_status='approved' via a raw update call, bypassing the intended buddy→manager two-step.

**Description.** The schema's own comment says 'lead_instructor (buddy) can update: approve to buddy_approved or request revision' and 'academic_head (manager) can update: approve phase ... or request revision', implying buddies should never be able to set the final `approved` status. But the actual `USING` clause is `auth.jwt()->user_metadata->>role IN ('lead_instructor','academic_head') OR ...`, with no WITH CHECK restricting which `review_status` value each role may write. A buddy (`lead_instructor`) can therefore issue an update setting `review_status = 'approved'` directly, skipping the manager step entirely — this is enforced only by which UI buttons WorksheetReview.tsx renders (`canApprove = isBuddy` sets only 'buddy_approved', src/pages/WorksheetReview.tsx:50,84-85), not by the database.

**Impact / failure scenario.** A compromised or careless buddy account (or the self-escalated account from Finding #1/#2, which now holds `lead_instructor` in its JWT) can grant final phase approval to any joinee's worksheet without manager sign-off, corrupting the audit trail the review workflow exists to produce.

**Suggested fix.** Add WITH CHECK constraints per role (e.g. lead_instructor may only set review_status IN ('buddy_approved','needs_revision'); academic_head may only transition FROM 'buddy_approved' TO 'approved'/'needs_revision'), or move approval actions into role-checked SECURITY DEFINER RPCs as in Finding #3's fix.

---

#### 6. [HIGH] Hardcoded plaintext credentials for privileged/test accounts committed to git, targeting the live production Supabase project

- **Dimension:** Dim 9: Security
- **Location:** `scripts/setup/create-admin.cjs:12-15; fix-assignments.cjs:11-13,31-33; db/create_32_users.sql:14,80,153; __seed_30_users.cjs:17-20; __seed_test_data.cjs:18,115,422`
- **Verification:** CONFIRMED — All cited files (fix-assignments.cjs, scripts/setup/create-admin.cjs, db/create_32_users.sql, __seed_30_users.cjs, __seed_test_data.cjs) are git-tracked (confirmed via git ls-files) and contain the hardcoded password Test123! and/or the real Supabase project URL fuoqoryqndtdooujslee.supabase.co; fix-assignments.cjs:11-13 hardcodes the URL/key as a fallback and lines 30-33 sign in as priya.qa@newton.edu/Test123! exactly as claimed. The tracked .env file (also in git since initial commit, not gitignored) confirms this is the live production project URL/anon key, corroborating the impact claim.

**Description.** Multiple committed scripts hardcode the shared weak password `Test123!` and, in several cases, the real production project URL/key: `fix-assignments.cjs:11` hardcodes `https://fuoqoryqndtdooujslee.supabase.co` (no env override) and lines 31-33 sign in as a named, real-looking account `priya.qa@newton.edu` / `Test123!` specifically because it holds `academic_head` privileges ('Authenticates as Priya (academic_head) to bypass RLS for assignment updates' — comment on line 4). `scripts/setup/create-admin.cjs` creates `admin_test@test.com` / `Test123!` with role `onboarding_lead` by POSTing straight to the public `/auth/v1/signup` endpoint with the anon key. `db/create_32_users.sql` bcrypt-inserts 32 accounts directly into `auth.users` all sharing `Test123!`. All of these are permanently in git history and reference the same Supabase project already confirmed live via the committed `.env`.

**Impact / failure scenario.** If any of these scripts were ever run against the real Supabase project (the URL/key match .env exactly), the production auth.users table now permanently contains a set of accounts — including at least one manager/academic_head-level account — with a trivially guessable, publicly-committed password. Anyone with read access to this repository (or its git history, even after later 'cleanup' commits) has working login credentials for a privileged production account.

**Suggested fix.** Rotate/delete any of these accounts that exist in the live project immediately. Purge these values from git history (BFG/filter-repo) — a later commit removing the file does not remove it from history. Never hardcode credentials or fall back to literal keys in committed scripts; require env vars with no literal fallback, and keep any seed/admin-creation script out of the deployable repo (separate private tooling repo or .gitignore'd local-only scripts).

---

#### 7. [MEDIUM] notifications table allows any authenticated user to forge notifications to/from any other user

- **Dimension:** Dim 9: Security
- **Location:** `db/__migration_notifications_dates.sql:34-37 (`CREATE POLICY "Insert notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (true);`)`
- **Verification:** not-required

**Description.** The INSERT policy on `notifications` is `WITH CHECK (true)` for any authenticated user, with no restriction that `from_user_id` must equal `auth.uid()` or that the target `user_id` be someone the actor has a legitimate relationship with. Any signed-in new hire can insert a row with an arbitrary `user_id` (any employee), arbitrary `from_user_id` (impersonating any other user, including a manager), and an arbitrary free-text `message`.

**Impact / failure scenario.** A malicious or compromised account can spam any user's notification feed, or craft a social-engineering message that appears to come from a manager/admin (e.g. 'Your worksheet was approved, please re-confirm your password at <phishing link>') since `from_user_id` is fully attacker-controlled and the UI presumably renders it as the sender's name.

**Suggested fix.** Add `WITH CHECK (from_user_id = auth.uid() OR from_user_id IS NULL)` at minimum, and ideally move all notification creation into SECURITY DEFINER RPCs invoked by the legitimate review/promotion flows rather than direct client inserts.

---

#### 8. [LOW] db/ contains ~10 overlapping, unversioned, manually-applied SQL files with no way to verify which RLS policies are actually live — one file contains a silently-broken role check

- **Dimension:** Dim 9: Security
- **Location:** `db/schema.sql, db/supabase_schema.sql, db/setup_correct.sql, db/__setup_supabase.sql, db/__fix_rls_jwt.sql, db/__fix_rls_recursion.sql, db/supabase_role_migration.sql, db/supabase_reviewer_migration.sql — all committed in the same commit (ca0326e) with no ordering/migration tooling`
- **Verification:** not-required

**Description.** There is no migrations framework (no supabase/migrations, no timestamped ordering, no 'applied' tracking) — just a pile of SQL files meant to be pasted into the Supabase SQL editor by hand, several of which redefine the same policies differently. `db/__fix_rls_recursion.sql:30,37,65,78,92` checks `auth.jwt() ->> 'role'` (the literal top-level Postgres role claim, which is always the string `'authenticated'` for any logged-in user) against app role names — this condition can never be true, so that file's 'fix' silently grants zero admin access if it were the one actually applied. `db/schema.sql` (self-described as 'the ONE FILE you need to run... DEFINITIVE') supersedes it with the `user_metadata` version, which is the one analyzed for the other findings above — but nothing in the repo confirms which version is actually deployed to the live project.

**Impact / failure scenario.** It is impossible for a reviewer (or the team) to be certain which RLS policy text is actually enforced in production without manually diffing the live Supabase dashboard against these files. This directly undermines confidence in every finding above being fixed once — the team could 'fix' schema.sql and still be running __fix_rls_recursion.sql's rules, or vice versa.

**Suggested fix.** Adopt the Supabase CLI migrations workflow (`supabase migration new`, `supabase db push`), delete the superseded __fix_*.sql / setup_correct.sql / supabase_schema.sql duplicates once consolidated, and treat db/schema.sql (or its migration-framework equivalent) as the single source of truth with CI diffing it against the live project schema.

---

## Dim 10: Observability — 18/100

> Observability is essentially absent. There is zero error-reporting/monitoring SDK anywhere in the dependency tree (grep for Sentry/Bugsnag/LogRocket/Datadog/PostHog/analytics returns nothing) — every error, including those caught by the app's single global ErrorBoundary, terminates at console.error and vanishes once the tab closes. Production builds explicitly disable sourcemaps (vite.config.js sourcemap: false, contradicting the code's own comment), so even a captured stack trace would be unreadable minified code. Logging is unstructured (raw console.error/warn scattered across ~18 files, two inconsistent error-handling paths), there's no audit/activity-log table in the schema so review/approval actions can't be reconstructed after the fact, and there's no build/version identifier or uptime monitoring. Engineering currently has no way to detect, diagnose, or even learn about a production incident short of a user describing it in words — this is a hard blocker for launch.

#### 1. [HIGH] No error reporting/monitoring service integrated anywhere in the app

- **Dimension:** Dim 10: Observability
- **Location:** `package.json:1-25 (no Sentry/Bugsnag/LogRocket/Rollbar/Datadog dependency); src/components/ErrorBoundary.tsx:27; src/utils/errorHandling.ts:31`
- **Verification:** CONFIRMED — Verified: package.json deps are only @supabase/supabase-js, dotenv, lucide-react, react, react-dom, react-router-dom, tslib, ws — no Sentry/Bugsnag/etc; grep for error/analytics SDKs across src and package.json returns zero hits; ErrorBoundary.tsx:27 componentDidCatch does only console.error; errorHandling.ts:31 notifyError does only console.error + a toast; found 24 console.error call sites (claim said ~25). Severity is arguably borderline CRITICAL vs HIGH — it's a real observability gap but the app still functions and shows a user-facing fallback UI, so I'd downgrade to HIGH rather than CRITICAL (no crash/data-loss/security breach, just lack of remote visibility).

**Description.** Grep across src and package.json for Sentry, LogRocket, Datadog, Bugsnag, Rollbar, PostHog, Mixpanel, Amplitude, gtag, or any analytics/error-tracking SDK returns zero hits. The only dependencies are @supabase/supabase-js, react, react-dom, react-router-dom, dotenv, lucide-react, tslib, ws. Every error path in the app (ErrorBoundary.componentDidCatch, notifyError(), and ~25 individual console.error call sites) terminates at console.error and nothing else. Once a user closes or refreshes the tab, every trace of the error is gone forever. For a production onboarding tool used by real employees (auth, approvals, gate promotions), there is currently no way to know an error occurred unless the affected user personally reports it with enough detail to reproduce.

**Impact / failure scenario.** A new hire's worksheet submission silently throws (e.g. a Supabase RLS policy rejects an insert, or a null-pointer in ReviewContent.tsx rendering). The ErrorBoundary catches it, shows a generic 'Something went wrong' screen, logs to a console nobody is watching, and the incident is never surfaced to engineering. Repeat for auth failures, auto-promotion failures, auto-save failures — all invisible.

**Suggested fix.** Add a lightweight error-reporting SDK (Sentry's browser SDK is the standard choice for a Vite/React app) initialized in main.tsx, wire ErrorBoundary.componentDidCatch and notifyError() to report to it with user/role context (non-PII), and capture unhandled promise rejections via window.addEventListener('unhandledrejection', ...).

---

#### 2. [MEDIUM] Production build explicitly disables sourcemaps, making any captured stack trace undebuggable — and the config comment lies about it

- **Dimension:** Dim 10: Observability
- **Location:** `vite.config.js:14-21`
- **Verification:** CONFIRMED — Confirmed at vite.config.js:16-18: `sourcemap: false` sits directly beneath the comment "Generate sourcemaps for production debugging but not for end users," contradicting itself, and `minify: 'esbuild'` (line 20) means any prod stack trace would be unmappable to source; downgraded to MEDIUM since it's a debuggability/DX gap contingent on future error-reporting tooling, not a functional or security defect.

**Description.** The build config has `sourcemap: false` under a comment that reads "Generate sourcemaps for production debugging but not for end users" — the comment and the code contradict each other; the actual behavior is that NO sourcemaps are generated at all, ever, for prod. Combined with `minify: 'esbuild'`, any production stack trace (even if you did add error reporting) would point to minified/mangled line:column locations with no way to map back to source, e.g. `at t (index-a1b2c3.js:1:48213)`.

**Impact / failure scenario.** Even in the hypothetical case where console.error output was captured (e.g. by an ops engineer looking over a screen-share, or a future error-reporting SDK is added), the stack trace would be useless for pinpointing which component/hook threw, turning every prod bug into a guess-and-grep exercise across 25KB+ minified bundles.

**Suggested fix.** Set `sourcemap: 'hidden'` (or true) in vite.config.js build options, and if adding an error-reporting SDK, upload sourcemaps to it at deploy time so stack traces resolve to real file:line while the maps themselves are not shipped to end users.

---

#### 3. [MEDIUM] No structured logging — logging strategy is raw, ungoverned console.error/warn scattered across ~18 files

- **Dimension:** Dim 10: Observability
- **Location:** `src/utils/errorHandling.ts:30-36 (notifyError); 29 console.* call sites across src/hooks, src/pages, src/components, src/context/AuthContext.tsx`
- **Verification:** not-required

**Description.** There is no structured logger (no log levels beyond console.error/warn, no consistent shape, no correlation IDs, no eslint `no-console` rule enforcing a wrapper). Some call sites pass a plain string ('Failed to load Phase 1 statuses:', err) via console.error directly (src/pages/Phase1.tsx:139, src/pages/Dashboard.tsx:61, src/hooks/useNotifications.ts — 5 separate call sites at lines 73/114/132/163/182/210), while others route through the `notifyError` helper in src/utils/errorHandling.ts which additionally pops a user-facing toast. The two paths are inconsistent — some errors are silently console-only (no user feedback at all), others also toast. There's no single chokepoint to later swap in real log shipping.

**Impact / failure scenario.** Even if a monitoring tool were bolted on tomorrow, the lack of a single logging chokepoint means someone has to manually touch ~29 call sites individually. Today, an admin/lead approving a phase (src/pages/PhaseReview.tsx:114 `console.error('Failed to approve ${sub.worksheet_id}:', error)`) gets zero UI feedback that the approval partially failed — it's swallowed into `allSucceeded=false` with no toast at that specific line, only logged to a console the reviewer will never open.

**Suggested fix.** Introduce a single `logger.ts` module (thin wrapper around console.* in dev, forwarding to the error-reporting SDK in prod) and route all ~29 sites through it; ensure every failure path either logs+reports AND gives user feedback, or justify silent handling explicitly.

---

#### 4. [MEDIUM] ErrorBoundary and DB layer give zero audit trail for approval/review actions — cannot reconstruct what happened after the fact

- **Dimension:** Dim 10: Observability
- **Location:** `db/schema.sql (no audit_log/activity_log table exists — grep for CREATE TABLE only returns user_profiles, onboarding_submissions, worksheet_submissions); src/pages/PhaseReview.tsx:100-119`
- **Verification:** not-required

**Description.** There is no audit/activity log table anywhere in db/schema.sql, db/supabase_schema.sql, or any migration script. Approval/rejection actions (PhaseReview.tsx, WorksheetReview.tsx) only mutate `review_status`/`reviewed_by`/`reviewed_at` columns on the row itself — if a later action overwrites those fields, or if the update silently fails for one of several worksheets in a batch (as at PhaseReview.tsx:113-115, where `allSucceeded=false` is set per-worksheet but nothing is persisted about *which* one failed or why), there is no way after the fact to reconstruct the sequence of state transitions for a given user's onboarding record.

**Impact / failure scenario.** A new hire disputes 'my manager never approved my Phase 2 gate, but the system doesn't show it as approved' — with no audit trail and no error reporting, engineering has no way to determine whether the approval request never fired, failed server-side (e.g. RLS denial), or succeeded and was later overwritten. `review_history` (referenced as a JSON array on the submission row) is the only source of truth and is itself overwritable/mutable, not an append-only ledger.

**Suggested fix.** Add an append-only `audit_log` table (actor, action, entity, before/after, timestamp) written via a Postgres trigger or from the review-mutation call sites, independent of the mutable submission row.

---

#### 5. [LOW] No health check / uptime monitoring for the deployed app or Supabase dependency

- **Dimension:** Dim 10: Observability
- **Location:** `vite.config.js (static SPA, no server); repo root (no CI/CD, no Docker, no uptime config found)`
- **Verification:** not-required

**Description.** This is a pure static SPA with Supabase as the only backend, so there's no custom `/healthz` endpoint to build — that part is architecturally moot. However, there is also no evidence of any external uptime/synthetic monitoring configured for the deployed static site or for Supabase availability (no status-page config, no cron-based ping script, no Vercel/Netlify monitoring config found in repo).

**Impact / failure scenario.** If the Supabase project is paused (free/low tier auto-pause is common), hits its connection limit, or the static hosting goes down, the team's first signal is a user complaint rather than an alert — degraded UX for hours before anyone notices.

**Suggested fix.** Configure uptime monitoring (e.g. a simple external pinger hitting the deployed URL, plus Supabase's own project health dashboard/alerts) — outside the app's own codebase since there's no server to instrument.

---

#### 6. [LOW] notifyError toasts pass raw Supabase error objects into the 'details' parameter that gets console.error'd verbatim, including internal error codes/hints

- **Dimension:** Dim 10: Observability
- **Location:** `src/utils/errorHandling.ts:30-36; src/context/AuthContext.tsx:50,65,88,127,190`
- **Verification:** not-required

**Description.** `notifyError(message, details)` calls `console.error(message, details)` where `details` is frequently the raw Supabase `PostgrestError`/`AuthError` object (e.g. AuthContext.tsx:50 `notifyError('Error fetching profile:', error)`). These objects can include internal details like the exact table/column, constraint names, or RLS policy text in `error.details`/`error.hint`, which end up in the browser console of whatever machine is open at the time. Not user-facing (only visible via devtools) and not transmitted anywhere, so this is low severity, but it is inconsistent with treating console output as safe-by-default, especially since nothing scrubs these before any future log-shipping integration is added.

**Impact / failure scenario.** If an org later wires `console.error` output into a log drain (a natural next step once someone notices there's no error reporting), these raw DB error payloads would flow to a third-party log aggregator un-redacted.

**Suggested fix.** When adding structured logging/reporting, explicitly whitelist which fields of Supabase error objects get forwarded (message/code) rather than serializing the entire error object.

---

## Dim 11: Data Durability & Dangerous Scripts — 14/100

> This dimension fails outright. There is exactly one Supabase project in existence (fuoqoryqndtdooujslee, the same ref committed in .env and hardcoded as the fallback in nearly every 'test' script), so every destructive or fabricating script in the repo is a live-production hazard, not a safe local tool. db/__cleanup_test_users.sql is an unconditional, unguarded DELETE-everything script (including auth.users) with a misleading name and zero confirmation step, meant to be pasted into the SQL Editor where it bypasses RLS entirely. scripts/clean_setup.mjs contains an all-rows delete that is currently inert only by accident (no DELETE RLS policy exists yet) and will fire the moment one is added. fix_promotion_data.mjs and fix-assignments.cjs hardcode QA credentials and directly forge review/approval and assignment fields outside the app's own review workflow, poisoning the audit trail indistinguishably from real reviews. The documented 'Production Checklist' in context.md even instructs running a seed script (db/seed_worksheets.sql) that upserts fabricated review data over any real row sharing a (user_id, worksheet_id) key. Backup/restore strategy is a single aspirational sentence ('restore from Supabase backup') with no configured export, no verified retention tier, and no RPO/RTO defined. No soft-delete exists anywhere for user or worksheet lifecycle. This cannot be approved for launch without provisioning a real dev/prod split, deleting or hard-gating every destructive script behind a non-prod project check, and standing up a verified, independent backup process.

#### 1. [CRITICAL] Unconditional, unguarded full-database wipe script checked into repo, aimed at the only Supabase project

- **Dimension:** Dim 11: Data Durability & Dangerous Scripts
- **Location:** `db/__cleanup_test_users.sql:12-46`
- **Verification:** CONFIRMED — Confirmed by reading db/__cleanup_test_users.sql lines 1-53 directly: DELETE FROM user_profiles (line 27) and DELETE FROM auth.users (line 35) have no WHERE clause at all, and the notifications/worksheet_submissions/onboarding_submissions deletes are filtered only by 'user_id IN (SELECT id FROM user_profiles)' which is not a test-user filter (no email/flag pattern) so it matches all users; header comment itself admits 'This deletes ALL data in the database except the schema itself'; file is git-tracked (committed ca0326e, 2026-06-18) and its own comments direct pasting it into the Supabase SQL Editor which runs as service_role/superuser.

**Description.** This script (misleadingly named 'cleanup_test_users') issues `DELETE FROM notifications`, `DELETE FROM worksheet_submissions`, `DELETE FROM onboarding_submissions`, `DELETE FROM user_profiles`, and `DELETE FROM auth.users` with NO WHERE clause on any of them — it deletes every row in every table, not just test users. It has no environment check, no confirmation step, no dry-run mode, and its own header comment admits 'This deletes ALL data in the database except the schema itself.' It is designed to be pasted directly into the Supabase SQL Editor (which runs as postgres/service_role and bypasses all RLS policies).

**Impact / failure scenario.** Any operator who runs this file against the live project (the only project that exists — see finding on single-environment setup) permanently destroys every onboarding record, every user account, and every auth identity, with no confirmation prompt standing in the way. A single copy-paste mistake, or someone treating the filename literally ('cleanup test users, this is safe'), causes total data loss.

**Suggested fix.** Delete this script from a shared repo entirely, or at minimum: (1) require an explicit `WHERE email LIKE 'test_%'`-style filter matching a documented test-user naming convention, (2) print a row count and require a typed confirmation ('DELETE PRODUCTION') before executing against a project whose ref does not match a designated 'test' project ID, (3) never delete auth.users unconditionally, (4) keep this script out of the main branch / gate it behind a runbook with a required backup step first.

---

#### 2. [CRITICAL] No environment separation — every 'test' script's hardcoded fallback URL is the same project as the committed production config

- **Dimension:** Dim 11: Data Durability & Dangerous Scripts
- **Location:** `.env:1-2 (VITE_SUPABASE_URL=https://fuoqoryqndtdooujslee.supabase.co); scripts/clean_setup.mjs:16-18; scripts/fix_promotion_data.mjs:10-12; fix-assignments.cjs:11-13; scripts/setup/__create_15_users.cjs:12`
- **Verification:** CONFIRMED — Verified: .env is git-tracked (not in .gitignore) with the fuoqoryqndtdooujslee project; scripts/clean_setup.mjs:16, scripts/fix_promotion_data.mjs:10, fix-assignments.cjs:11, scripts/setup/__create_15_users.cjs:12 all hardcode the identical URL/key as fallback (fix-assignments.cjs isn't even conditional), and a repo-wide grep shows every other seed/setup script (__seed_30_users.cjs, __seed_test_data.cjs, __create_users.cjs, __full_setup.cjs, __test_reviewer_flow.cjs) does the same — no second project exists anywhere in tracked files; context.md:1577/1618 documents this as 'the' project.

**Description.** There is exactly one Supabase project (`fuoqoryqndtdooujslee`) in this entire codebase. Every destructive/seed script — clean_setup.mjs, fix_promotion_data.mjs, fix-assignments.cjs, scripts/setup/__create_15_users.cjs, and others — hardcodes this same URL/anon-key pair as its fallback if env vars aren't set, and it is the exact value committed in .env. context.md:1618 explicitly documents 'Supabase project (already configured: project ID `fuoqoryqndtdooujslee`)' as the production project. Scripts named 'clean_setup', 'fix_promotion_data', etc. that were written for local QA sessions therefore write and delete against the same database that will hold real onboarding data once this launches.

**Impact / failure scenario.** Any developer running `node scripts/clean_setup.mjs` or `node fix-assignments.cjs` without realizing their shell doesn't have VITE_SUPABASE_URL exported (e.g. a fresh terminal, CI runner, or a laptop that never sourced .env) silently connects to and mutates/deletes the production database, because the fallback IS production. There is no 'you are about to hit prod' guard anywhere.

**Suggested fix.** Provision a genuinely separate Supabase project for development/QA. Remove all hardcoded URL/key fallbacks from scripts — fail loudly if env vars are unset rather than silently defaulting to a real project. Add a runtime guard that refuses to run any script whose target project ref is not in an explicit allowlist of non-prod project refs.

---

#### 3. [HIGH] clean_setup.mjs deletes all worksheet_submissions unconditionally; only accidental absence of a DELETE RLS policy currently prevents it from working

- **Dimension:** Dim 11: Data Durability & Dangerous Scripts
- **Location:** `scripts/clean_setup.mjs:41-51; db/schema.sql:173-216 (no `FOR DELETE` policy defined on worksheet_submissions)`
- **Verification:** CONFIRMED — Confirmed: clean_setup.mjs:41-44 does `.delete().neq('user_id', all-zero-uuid)` with no scoping (verified in file), and schema.sql:173-216 plus db/supabase_schema.sql only define SELECT/INSERT/UPDATE RLS policies on worksheet_submissions -- no FOR DELETE policy exists anywhere in the repo's SQL files (grep for \"FOR DELETE\" across all .sql files returns zero matches), so the delete is currently blocked only by RLS default-deny, exactly as claimed.

**Description.** `clean_setup.mjs` calls `.from('worksheet_submissions').delete().neq('user_id', '00000000-0000-0000-0000-000000000000')` — a well-known Supabase idiom to delete every row (since no real user_id equals the all-zero UUID), with zero scoping to test users. Today this fails at runtime because schema.sql defines SELECT/INSERT/UPDATE policies for worksheet_submissions but no `FOR DELETE` policy, so Postgres RLS default-denies the delete for the anon/authenticated role the script uses — the script's own console output even says '(This is expected with RLS — we'll continue...)', showing the author is aware deletes are blocked and shipped the code anyway.

**Impact / failure scenario.** This is a landmine, not a safeguard: the moment anyone adds a legitimate `FOR DELETE` policy (e.g., to let admins delete a mis-submitted worksheet — a plausible future feature), this script silently starts succeeding and wipes every worksheet submission across all users in the live database the next time anyone runs it for 'a clean local setup.'

**Suggested fix.** Scope the delete to only test-user IDs (e.g., a documented email pattern), never to 'all rows via NOT-EQUAL-to-impossible-UUID'. Remove the script or gate it behind an explicit non-prod project check as described above.

---

#### 4. [HIGH] Production deployment checklist instructs running fabricated-data seed scripts against the live database

- **Dimension:** Dim 11: Data Durability & Dangerous Scripts
- **Location:** `context.md:1623-1633 ('Production Checklist' — '[ ] Run `db/seed_worksheets.sql` for test data (optional)'); db/seed_worksheets.sql:27-33 (INSERT ... ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status='buddy_approved', ...)`
- **Verification:** CONFIRMED — Confirmed verbatim: context.md:1626 lists "Run db/seed_worksheets.sql for test data (optional)" under the Production Checklist (context.md:1623-1633), and db/seed_worksheets.sql:27-183 does INSERT ... ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status='buddy_approved'/'pending_review'/'needs_revision' with hardcoded fake worksheet_data, reviewer names ('Neha Kapoor'), and comments for hardcoded emails (arjun.qa@newton.edu etc.). Critically, context.md documents only ONE Supabase project (ID fuoqoryqndtdooujslee) used both for local dev setup (line 1868-1869, "Optional: Run db/seed_worksheets.sql for realistic worksheet submissions" at line 1885) and explicitly listed as the configured project for "Required Services" in the Deployment section (line 1618) — i.e. there is no separate dev/staging vs. production database, so the ".qa@newton.edu" test accounts (documented with real passwords at 1889-1898) already exist in the same project referenced by the production checklist, making the ON CONFLICT clobber risk concrete rather than a remote hypothetical email collision.

**Description.** The documented production checklist tells the operator to optionally run `db/seed_worksheets.sql` on the production project. That file inserts hardcoded fake worksheet content and fabricated reviewer sign-offs (e.g., review_comment: 'Great stakeholder mapping. Approved as buddy.', reviewer_name: 'Neha Kapoor') for hardcoded emails like `arjun.qa@newton.edu`, and uses `ON CONFLICT (user_id, worksheet_id) DO UPDATE SET review_status = 'buddy_approved', reviewed_by = bid, reviewer_name = bname` — an upsert that will silently overwrite (clobber) any existing row for that user_id/worksheet_id pair, including genuine data, with the fake approval.

**Impact / failure scenario.** If a real employee is ever assigned a user_profiles.email matching one of the hardcoded QA addresses (or if this file is re-run after real users already have real submissions with the same worksheet_id — the UNIQUE(user_id, worksheet_id) constraint guarantees an ON CONFLICT hit), their genuine worksheet content and review history is silently replaced by fabricated placeholder text and a phony 'buddy approved' status, corrupting the audit trail that this app is supposed to produce.

**Suggested fix.** Remove seed_worksheets.sql from the production checklist entirely. Rename/relocate all seed scripts into a clearly separate 'dev-only, run only against DEV_PROJECT_REF' folder with a runtime project-ref check, and never advertise them as an optional production step.

---

#### 5. [HIGH] 'Fix data' scripts hardcode QA credentials and directly forge review/approval fields, bypassing the review workflow with no audit marker

- **Dimension:** Dim 11: Data Durability & Dangerous Scripts
- **Location:** `scripts/fix_promotion_data.mjs:10-12,27-30,43-52; fix-assignments.cjs:11-13,30-33`
- **Verification:** CONFIRMED — Verified against code: fix_promotion_data.mjs:27-30 signs in as arjun.qa@newton.edu/Test123! and lines 43-52 UPDATE review_status/reviewer_name/review_comment/reviewed_at to fabricate 'buddy_approved' with a canned comment, no source/audit flag; fix-assignments.cjs:11-13,30-33 hardcodes the URL/anon key and priya.qa@newton.edu/Test123!, then writes assigned_buddy_id/assigned_lead_id directly. All cited line numbers match. However this is a demo/QA-only project (db/create_32_users.sql documents 'Password for all users: Test123!' for 32 synthetic test accounts; context.md itself flags hardcoded test passwords as 'a security concern for production'), and the same anon key + Test123! password are already duplicated across ~5 other committed scripts (__seed_test_data.cjs, __seed_30_users.cjs, clean_setup.mjs, .env), so this isn't a novel exposure unique to these two files, and the Supabase key is a client-safe 'publishable' key rather than a service-role secret. Real behavior as described, but blast radius is limited to synthetic QA accounts in a single-environment demo app that is already saturated with the same exposure, so HIGH is overstated.

**Description.** fix_promotion_data.mjs signs in as a hardcoded account (`arjun.qa@newton.edu` / `Test123!`) and directly UPDATEs `worksheet_submissions.review_status`, `reviewer_name`, `review_comment`, `reviewed_at` to fabricate a 'buddy_approved' state with a canned comment ('Great work! Ready for manager review.') — bypassing the actual buddy-review UI/state machine entirely. fix-assignments.cjs similarly hardcodes `priya.qa@newton.edu` / `Test123!` and directly writes `assigned_buddy_id`/`assigned_lead_id` on user_profiles.

**Impact / failure scenario.** Both scripts write plausible-looking, indistinguishable-from-real review history and org-chart assignment data straight into the (single, production-equals-dev) database with real timestamps and a real reviewer_name, with no flag anywhere in the row indicating it was script-generated rather than a human review. If an admin ever audits worksheet_submissions.review_history to answer 'did the buddy actually review this,' these entries are false positives baked in by a maintenance script, not evidence of an actual review having happened. Plaintext QA passwords are also committed to the repo (`Test123!` for `arjun.qa@newton.edu`, `priya.qa@newton.edu`, `neha.qa@newton.edu`) which, combined with the committed anon key and prod URL, means anyone with repo access can sign in as these accounts against the live project.

**Suggested fix.** Never write fabricated review data outside of the normal review-state-machine code path used by the app (so it goes through the same validation and audit logging). If a fix-data script is genuinely required, tag the resulting rows (e.g., a `source: 'manual-fix-script'` field or an explicit review_history entry noting it was a scripted correction) and require it to target a specific user_id passed as an argument, not a hardcoded email. Rotate/remove the hardcoded test credentials, and do not commit real passwords even for QA accounts.

---

#### 6. [MEDIUM] No backup/restore mechanism configured or verified anywhere in the repo; documented 'rollback strategy' is aspirational only

- **Dimension:** Dim 11: Data Durability & Dangerous Scripts
- **Location:** `context.md:1636-1640 ('Rollback Strategy' section: 'Database rollback: restore from Supabase backup')`
- **Verification:** CONFIRMED — Confirmed: context.md:1636-1640 is the sole rollback/backup mention repo-wide (verified via grep for backup|restore|pitr|pg_dump across all non-node_modules files); no pg_dump/export scripts, restore drills, or RPO/RTO exist — but severity downgraded to MEDIUM since this is an infra/ops-process gap (documentation and operational readiness) rather than a code defect, and Supabase-managed Postgres backups exist by default on paid tiers regardless of repo tooling, so 'unrecoverable' framing in the finding is speculative without knowing the actual plan tier.

**Description.** A repo-wide search for backup/restore/PITR tooling found nothing beyond this single unverified line. There is no pg_dump script, no scheduled export, no documented backup retention/verification process, and no evidence the Supabase project's plan tier even has point-in-time recovery enabled (that's a paid-tier feature and nothing in the repo configures or checks it). RPO/RTO are undefined anywhere in the docs.

**Impact / failure scenario.** Given the destructive scripts cataloged above genuinely can (and in the SQL-editor case, definitely can) wipe the entire dataset, the stated recovery plan of 'restore from Supabase backup' is unverified and untested. If the project is on Supabase's free tier, there may be no backups at all, or only 24h/7-day retention with no PITR — meaning a wipe discovered even a day late is unrecoverable. There's no evidence a restore has ever been drilled.

**Suggested fix.** Before launch: (1) confirm and document the Supabase plan tier and its actual backup/PITR retention window, (2) add a scheduled, verified export (e.g., nightly pg_dump to separate storage) independent of Supabase's own backup system, (3) run and document a test restore, (4) define concrete RPO/RTO numbers and put them in the production checklist, not just an aspirational one-liner.

---

#### 7. [MEDIUM] No soft-delete anywhere — all user/worksheet removal is hard-delete with FK relationships that have no ON DELETE behavior specified

- **Dimension:** Dim 11: Data Durability & Dangerous Scripts
- **Location:** `db/schema.sql:39-50 (user_profiles.id references auth.users(id), no ON DELETE clause), db/schema.sql:129-171 (worksheet_submissions.user_id references auth.users(id), no ON DELETE clause)`
- **Verification:** not-required

**Description.** A repo-wide search for `deleted_at`, `is_deleted`, or archive tables found zero matches. Every foreign key in schema.sql (user_profiles.id → auth.users, worksheet_submissions.user_id → auth.users, onboarding_submissions.user_id → auth.users) is declared with no `ON DELETE` action, meaning the default `NO ACTION` applies: deleting an auth.users row while child rows exist will raise a foreign-key violation rather than cascading — which is actually the safer default here — but it also means there's no supported, application-level path to deactivate/offboard a user (e.g., someone who leaves before finishing onboarding) without either a manual multi-table delete (as __cleanup_test_users.sql/​__setup_supabase.sql do) or leaving orphaned-looking but still-live rows forever.

**Impact / failure scenario.** Offboarding a real employee (e.g., someone who quits mid-onboarding) has no designed path: an admin's only tools are the ad-hoc SQL scripts already flagged as dangerous, and those delete unconditionally rather than soft-deleting/archiving, which permanently destroys the onboarding history for that employee (useful for HR/compliance records) with no recovery.

**Suggested fix.** Add a `deleted_at`/`is_active` column to user_profiles (and possibly a status on worksheet_submissions) and build a proper, RLS-gated 'deactivate user' admin action in the app rather than relying on raw SQL deletes for lifecycle management.

---

#### 8. [MEDIUM] SQL RLS-reset script performs partial LIKE-pattern deletes plus a full policy drop/recreate directly against the live project, with a wide-open window

- **Dimension:** Dim 11: Data Durability & Dangerous Scripts
- **Location:** `db/__setup_supabase.sql:12-37 (pattern-based DELETE), db/__setup_supabase.sql:44-146 (DROP POLICY / CREATE POLICY sequence)`
- **Verification:** not-required

**Description.** This script is explicitly documented to be pasted into the Supabase SQL Editor for project `fuoqoryqndtdooujslee` (line 3) — the same project that is production per .env and context.md. Its email-pattern deletes (`email LIKE 'joinee_%@newton.edu'` etc.) are somewhat scoped, but a real hire could plausibly be issued an email matching one of these broad patterns (e.g., any address starting with 'manager_' or 'onboard_'), and the subsequent `DROP POLICY` / `CREATE POLICY` block removes all RLS protection on user_profiles and worksheet_submissions for the duration of the script, then rebuilds it — any request that lands in that gap sees an unprotected table.

**Impact / failure scenario.** If this script is re-run against the live project as part of a later 'RLS fix', it silently deletes any account whose email happens to match the LIKE patterns, and briefly removes access control from two core tables while running.

**Suggested fix.** Retire this script (its purpose — RLS/policy migration — is already captured in db/schema.sql per its own header comment) or move its logic into a proper transactional migration with narrower, ID-based (not pattern-based) targeting, run only against confirmed non-prod projects.

---

## Dim 12: Resource & Cost Control — 24/100

> Resource and cost control is essentially unaddressed in this codebase: there is zero pagination anywhere (confirmed by grep — no `.range()` usage at all), the two role-based admin dashboards run genuinely unbounded queries on user_profiles and a hard-capped-but-unordered `.limit(500)` on worksheet_submissions that will silently truncate data at the org's current realistic scale (~30 seeded users × ~20-25 worksheets/user already exceeds 500 rows), notification polling runs every 15s indefinitely per open tab with no visibility-based backoff (and can double when the mobile nav is open), and there is no application-level rate limiting anywhere combined with a git-committed anon key — meaning unbounded direct-API abuse against Supabase is one curl script away. The most serious finding is a completely open `notifications` INSERT RLS policy (`WITH CHECK (true)`) that lets any self-registered account write unlimited rows for any target user with no retention/cleanup job ever active, giving a trivial, low-effort storage/cost-DoS vector. None of this is exotic at-scale-in-5-years risk — the truncation and fan-out issues bite at the company's first cohort of ~25-30 employees.

#### 1. [HIGH] Notifications table has an unrestricted INSERT policy — any authenticated user can write unlimited rows for any user_id

- **Dimension:** Dim 12: Resource & Cost Control
- **Location:** `db/__migration_notifications_dates.sql:34-37 (CREATE POLICY "Insert notifications" ... WITH CHECK (true))`
- **Verification:** CONFIRMED — Confirmed at db/__migration_notifications_dates.sql:34-37 — the INSERT policy is exactly `TO authenticated WITH CHECK (true)` with no ownership check; src/hooks/useNotifications.ts:151-165 (triggerNotification) inserts arbitrary user_id/from_user_id client-side with no server-side validation, and grep finds zero rate-limit/throttle code anywhere in src/ or db/, so any authenticated user hitting the REST endpoint directly could flood notifications for any target user_id — HIGH severity is appropriate given the described DoS/spam vector.
- **Effort:** S

**Description.** The RLS INSERT policy on `notifications` is `TO authenticated WITH CHECK (true)` — there is no check that `from_user_id = auth.uid()` or any cap on volume. Combined with self-serve signup (any of the 4 roles is selectable at signup, per Login/Signup.tsx) and zero application-level rate limiting anywhere in the codebase (confirmed by grep — no throttle/rate-limit code exists), any registered account can hit the Supabase REST endpoint directly (bypassing the UI entirely, using only their own JWT) and insert an unbounded number of notification rows targeting any other user_id.

**Impact / failure scenario.** A single compromised or malicious account can flood the notifications table indefinitely (unbounded storage growth) and drown out real notifications for any target user (since useNotifications only shows the latest 50), at zero cost/barrier to the attacker — a textbook resource-exhaustion/cost-DoS vector against a Supabase project billed by storage/bandwidth.

**Suggested fix.** Add `WITH CHECK (from_user_id = auth.uid() OR from_user_id IS NULL)` plus a per-user rate limit (e.g. a Postgres function/trigger that rejects inserts once a user has >N notifications created in the last hour), or move notification creation server-side (Edge Function with service role) instead of allowing direct client inserts.

---

#### 2. [HIGH] Admin/Onboarding-Lead dashboards use a hardcoded .limit(500) with no ordering and no pagination on worksheet_submissions — will silently truncate at realistic scale

- **Dimension:** Dim 12: Resource & Cost Control
- **Location:** `src/pages/AdminDashboard.tsx:80, src/pages/OnboardingLeadDashboard.tsx:52`
- **Verification:** CONFIRMED — Verified exact lines: AdminDashboard.tsx:80 and OnboardingLeadDashboard.tsx:52 both do supabase.from('worksheet_submissions').select(...).limit(500) with no .order() and no pagination; the capped/unordered allWorksheets array directly drives phase-ready, pending/approved counts and per-user filters (grep shows 10 downstream usages in AdminDashboard.tsx) with no truncation warning anywhere. worksheetConfigData.ts has 23 worksheet ids (matches the '~20-25 per hire' claim), and __seed_30_users.cjs seeds worksheets for 30 users and even uses .limit(1000) elsewhere for its own cleanup query, showing the codebase's own scale is already near/over the 500 cap. Severity HIGH is justified given silent, undetectable data loss that affects review/promotion decisions, though effort to fully fix (real pagination) may be more than the report's 'M' suggests if done properly with cursor UI.
- **Effort:** M

**Description.** `supabase.from('worksheet_submissions').select(...).limit(500)` has no `.order()` clause and no follow-up pagination — it is a single, silently-truncating page. worksheetConfigData.ts defines ~20-25 worksheets per new hire (Phase 1-3 + FTP weeks + gate controls), and the repo's own seed script is named `__seed_30_users.cjs`. 30 users × ~20-25 worksheets = 600-750 rows, already exceeding the 500 cap. Because there's no `.order()`, which rows get dropped is undefined/arbitrary (PostgREST default ordering is unspecified), so some employees' worksheets simply vanish from the dashboard's review-status computations with zero error, zero indicator, and zero way for an admin to know data is missing.

**Impact / failure scenario.** Once the org has ~25-30 active employees (a very near-term milestone, not a hypothetical future scale problem), the Admin Dashboard's phase-ready/pending-review/approved counts become silently wrong — some new hires' review status is invisible to reviewers, potentially blocking their promotion or masking overdue reviews.

**Suggested fix.** Replace the hard cap with real pagination (`.range()` + cursor/offset UI, or fetch aggregated counts server-side via an RPC/view) instead of a single capped fetch. At minimum add `.order('updated_at', {ascending:false})` before `.limit()` so truncation is at least deterministic, and surface a warning banner when the returned row count equals the limit (indicating more data exists).

---

#### 3. [HIGH] Admin/Onboarding-Lead dashboards run fully unbounded user_profiles queries (no .limit at all) on every dashboard load

- **Dimension:** Dim 12: Resource & Cost Control
- **Location:** `src/pages/AdminDashboard.tsx:76 and :84, src/pages/OnboardingLeadDashboard.tsx:48`
- **Verification:** CONFIRMED — Verified: AdminDashboard.tsx:76 (.in('role',['new_joinee','lab_instructor'])) and :84 (.not('role','in',...)) and OnboardingLeadDashboard.tsx:48 all query user_profiles with no .limit()/.range(), while the sibling worksheet_submissions queries in the same files do have .limit(500) — a real, unaddressed asymmetry. Minor inaccuracy in the finding: promotion sets role to 'lead_instructor' (useAutoPromote.ts:63) which is a distinct role from 'lab_instructor' used in the dashboard filter, so promoted users move from the first unbounded query to the second unbounded query (line 84) rather than staying in the same one — but since both queries are unbounded, the overall unbounded-growth-with-headcount conclusion still holds. Severity of HIGH seems slightly generous for a query that only runs on admin/lead dashboard loads (low-traffic role, cached 30s) rather than a hot path, but the underlying defect (no cap, will scale with total headcount forever) is real.
- **Effort:** M

**Description.** `supabase.from('user_profiles').select(...).in('role', ['new_joinee','lab_instructor']).order(...)` (and the buddy/manager roster query at line 84) has no `.limit()` or `.range()` whatsoever. Since `new_joinee`/promoted `lead_instructor` roles are never archived (auto-promotion just flips the role in place, per useAutoPromote.ts:61-64), the full historical roster of every employee who has ever onboarded is fetched on every single dashboard load, forever.

**Impact / failure scenario.** Query cost and dashboard load time grow linearly and unboundedly with company headcount over the company's lifetime — a company running this for 3 years with continuous hiring will eventually be pulling thousands of rows on every admin page view, with no cap in sight.

**Suggested fix.** Paginate this query (`.range()`) or add an `is_active`/onboarding-cohort filter plus a hard cap, so the query cost is bounded by 'current cohort size' rather than 'all employees ever onboarded'.

---

#### 4. [HIGH] No application-level rate limiting anywhere, combined with a publicly committed anon key — unbounded direct-API abuse is trivial

- **Dimension:** Dim 12: Resource & Cost Control
- **Location:** `src/api/supabase.ts:19 (bare createClient, no interceptor/throttle); .env (tracked in git, contains VITE_SUPABASE_PUBLISHABLE_KEY)`
- **Verification:** CONFIRMED — Verified: no supabase/ Edge Functions dir, no rate-limit/throttle/debounce logic anywhere in src/, .env tracked since initial commit (7e5ca88) with a real URL+publishable key, and supabase.ts:19 is a bare createClient with no interceptor — architecture is fully exposed to unthrottled scripted access; only nuance is the committed key is Supabase's new sb_publishable_ format which is designed to be public/RLS-protected, so 'secret leak' framing is slightly overstated but the core no-rate-limiting claim is accurate.
- **Effort:** L

**Description.** The app has no server component at all — it is a static SPA talking directly to Supabase with the anon key. A grep across `src/` for rate-limit/throttle logic returns nothing, and there is no proxy/Edge Function/API gateway in front of Supabase to enforce per-IP or per-user request caps. Because `.env` is committed to git history (confirmed: tracked since the initial commit, `git log -- .env` shows it), the anon key is trivially recoverable by anyone with repo access, and nothing in the app or database prevents that key from being used to issue requests far outside normal UI-driven cadence (e.g. scripted polling every 100ms instead of the UI's 15s, or scripted bulk inserts as in finding #1).

**Impact / failure scenario.** Nothing in the current architecture prevents a scripted client (using the recoverable anon key) from generating sustained, unbounded read/write load against the Supabase project — a direct cost and availability risk with no code-level mitigation to point to.

**Suggested fix.** Put a rate-limiting layer in front of Supabase (Cloudflare Workers/Edge Function proxy with per-IP/per-JWT token buckets), rotate the anon key and stop committing `.env`, and tighten RLS write policies (see finding #1) so even an unthrottled client can't cause unbounded writes.

---

#### 5. [MEDIUM] Admin Dashboard renders the entire unbounded instructor list with no pagination or virtualization in the DOM

- **Dimension:** Dim 12: Resource & Cost Control
- **Location:** `src/pages/AdminDashboard.tsx:141-164 (filterInstructors) and :271 (filterInstructors().map(...))`
- **Verification:** not-required
- **Effort:** M

**Description.** The filtered/searched instructor list is rendered in full via `.map()` with no page size, `slice()`, or virtualized list — every row from the unbounded query (finding above) is mounted in the DOM simultaneously, each computing per-row stats via `.filter()` over the full `allWorksheets` array (also unbounded/capped-at-500) inside `getInstrStats`/`getPhaseProgress`/`getReadyPhases`, which are called per-row on every render (O(n·m) with no memoization).

**Impact / failure scenario.** As the roster and worksheet-submission table grow, page render time and interaction latency (typing in the search box re-triggers `filterInstructors()` and re-renders the full unbounded list) degrade linearly with company size, with no ceiling.

**Suggested fix.** Add pagination (page size ~25-50) to the rendered list and memoize the per-instructor stat computations (e.g. build a `Map<userId, stats>` once per `allWorksheets` change instead of re-filtering the full array per row per render).

---

#### 6. [MEDIUM] useNotifications polls every 15s indefinitely per mounted instance with no visibility/backoff, and two instances mount simultaneously in the mobile nav

- **Dimension:** Dim 12: Resource & Cost Control
- **Location:** `src/hooks/useNotifications.ts:49,93; src/components/Navbar.tsx:134,320`
- **Verification:** not-required
- **Effort:** M

**Description.** `useNotifications` defaults to a 15-second `setInterval` poll that runs for the entire time any component using it is mounted, with no `document.visibilitychange`/`document.hidden` check to pause polling for backgrounded/inactive tabs, and no backoff. `Navbar.tsx` renders `<NotificationBell/>` twice: once in the always-mounted desktop nav (line 134, hidden only via CSS media query on small screens, not conditionally rendered) and once inside the mobile drawer which mounts only when `mobileOpen` is true (line 320). While the mobile drawer is open, both instances are simultaneously polling, doubling notification-fetch traffic for that user during that window.

**Impact / failure scenario.** Every logged-in user, in every open tab, generates a `notifications` read every 15 seconds for the lifetime of the session (including idle/backgrounded tabs, e.g. left open overnight), with no reduction for inactivity; opening the mobile menu doubles this. At even modest concurrent-user counts this is constant, un-throttled background load with no functional need for such freshness on a form-review workflow.

**Suggested fix.** Lift notification polling to a single shared instance (context/provider) instead of one-hook-per-mounted-bell; pause the interval when `document.hidden` is true and resume/immediately refetch on visibility regain; consider increasing the interval or switching to Supabase Realtime (a channel subscription) instead of polling, which the codebase does not use anywhere despite being available.

---

#### 7. [MEDIUM] Auto-save conflict-detection read doubles query volume on every save with zero functional effect

- **Dimension:** Dim 12: Resource & Cost Control
- **Location:** `src/hooks/useAutoSave.ts:69-83`
- **Verification:** not-required
- **Effort:** S

**Description.** On every debounced autosave, the hook first does a separate `select('updated_at')` read to detect concurrent-edit conflicts, but the result is only used to `console.warn` — the code comment literally says "Saving anyway (last-write-wins)" and proceeds to overwrite regardless. This extra round-trip provides no actual conflict resolution, merge, or user-facing warning; it is pure added read cost.

**Impact / failure scenario.** Every worksheet autosave (1500ms after each pause in typing, effectively continuously during active form-filling across ~20-25 worksheets per user) costs 2 DB round trips instead of 1, for a check whose outcome is never acted upon — roughly doubling autosave-related Supabase traffic for no product value.

**Suggested fix.** Either remove the pre-read entirely (since it changes no behavior), or make it functional (block/merge/surface a conflict toast to the user) so the extra query cost buys something. If keeping it, at minimum only issue it when about to overwrite non-trivial changes, not on every single debounce cycle.

---

#### 8. [MEDIUM] Notifications table has no retention/archival job in production — grows forever

- **Dimension:** Dim 12: Resource & Cost Control
- **Location:** `db/__due_date_notifications.sql:114-134 (cron.schedule call is commented out — "Uncomment and run after enabling pg_cron"); no other cleanup path exists besides the manual, one-off db/__cleanup_test_users.sql`
- **Verification:** not-required
- **Effort:** S

**Description.** The only scheduled job touching the `notifications` table (`check_due_date_notifications`) is a per-row full-table-scan function whose `pg_cron` schedule is left commented out in the migration file, meaning even the due-date notifier itself is not confirmed active in production. More importantly, there is no cleanup/archival job for any notification type at all (submitted/approved/needs_revision/etc.) — rows accumulate permanently. The only DELETE against this table in the whole repo is `db/__cleanup_test_users.sql`, a manual dev-only script for wiping seeded test users.

**Impact / failure scenario.** Combined with the unrestricted insert policy (finding #1), the `notifications` table is a strictly-growing, never-pruned table for the lifetime of the deployment — increasing storage cost and degrading the polling read query's index performance over time with no bound.

**Suggested fix.** Add a scheduled job (pg_cron or an Edge Function on a cron trigger) that deletes/archives read notifications older than e.g. 90 days, and confirm/enable the due-date cron job if that feature is meant to be live in production.

---

#### 9. [LOW] Reviewer-notification fan-out uses an unbounded per-role query and serial (non-batched) inserts

- **Dimension:** Dim 12: Resource & Cost Control
- **Location:** `src/hooks/useNotifications.ts:171-185 (getReviewerUserIds, no .limit()); src/hooks/useAutoSave.ts:147-155 and src/hooks/useAutoPromote.ts:87-96 (sequential `for...await triggerNotification`)`
- **Verification:** not-required
- **Effort:** S

**Description.** `getReviewerUserIds` selects every `user_profiles` row matching a role with no cap, and every worksheet submission/promotion event then loops over that list awaiting `triggerNotification` one at a time (serial round trips, not batched via a single multi-row insert).

**Impact / failure scenario.** Low impact at current org sizes (reviewer roles are typically few), but the write cost of every submission event scales linearly with reviewer-role headcount and is serialized rather than parallel/batched, adding avoidable latency and round-trip count as the org grows its management layer.

**Suggested fix.** Batch the notification inserts into a single `supabase.from('notifications').insert([...])` call instead of looping with individual awaited inserts, and cap/paginate the reviewer-role query if role headcounts are expected to grow large.

---

#### 10. [LOW] review_history JSON array grows unbounded per worksheet and is included in the bulk admin dashboard query

- **Dimension:** Dim 12: Resource & Cost Control
- **Location:** `src/pages/WorksheetReview.tsx:98,112,166,180 (append-only, no cap/truncation); src/pages/AdminDashboard.tsx:80 (review_history included in the 500-row bulk select)`
- **Verification:** not-required
- **Effort:** S

**Description.** Every review action (`existingHistory` + new entry, no slicing/cap) appends indefinitely to the `review_history` JSON column with no maximum length. This same column is fetched in bulk for up to 500 rows at once by the Admin Dashboard's `worksheet_submissions` query, so a worksheet with many needs_revision/resubmit cycles inflates the payload size of every dashboard load, not just its own review page.

**Impact / failure scenario.** Minor at current scale, but a worksheet that bounces through revision cycles many times becomes an increasingly expensive row to include in every bulk dashboard fetch, for data the dashboard doesn't even render.

**Suggested fix.** Cap `review_history` length (e.g. keep last 20 entries) or exclude it from the bulk admin list select (it's not used for the dashboard's aggregate stats — only `review_status`/`status`/`updated_at` are needed there) and fetch it lazily only on the per-worksheet review page.

---

## Dim 13: Performance — 34/100

> The app has no code splitting anywhere (App.tsx statically imports every page, and worksheetConfig.tsx eagerly imports all 40 worksheet/gate-control components), so a first-time visitor to /login downloads the JS for every dashboard, every worksheet form across all phases/weeks, and the 35KB config data before anything role-relevant is needed — vite.config.js even shows the chunk-size warning threshold was raised rather than the bundle being split. Beyond bundle size, the admin/lead dashboards hard-cap worksheet queries at 500 rows with no ordering, which — given the project's own 30-user seed script and ~33 worksheets/user — will silently truncate and corrupt dashboard data at the documented target scale; the phase-approval action performs a genuine sequential-await waterfall (up to ~17 serialized round trips) that freezes the UI; and there is essentially zero memoization anywhere in the dashboard/admin code, so per-row stats are recomputed via full array scans on every render, including every keystroke in the unthrottled admin search box. These are concrete, scale-triggered defects rather than cosmetic nitpicks, which is why this dimension is not launch-ready as-is.

#### 1. [HIGH] Zero route-based code splitting — entire app (40+ worksheet pages, all dashboards, admin tools) bundled into one chunk loaded on every route including /login

- **Dimension:** Dim 13: Performance
- **Location:** `src/App.tsx:1-31 (static imports of every page), src/config/worksheetConfig.tsx:38-79 (40 static imports of worksheet/gate-control components), vite.config.js:12-21`
- **Verification:** CONFIRMED — Verified directly: `grep -rn \"lazy(\" src/` and `grep -rn \"import(\" src/` both return zero matches (no code-splitting anywhere); App.tsx:1-31 statically imports every page (Dashboard, Phase1-3, Week1-4, Admin/Buddy/OnboardingLeadDashboard, WorksheetReview, PhaseReview, BuddyGatePass) plus WORKSHEET_COMPONENTS from worksheetConfig.tsx, which itself has exactly 40 static imports of individual worksheet/gate-control page components (confirmed via `grep -c \"^import.*from '../pages\"`) solely to build a lookup map; vite.config.js:19 sets chunkSizeWarningLimit: 500 with no rollupOptions.manualChunks; Skeleton.tsx exists (src/components/Skeleton.tsx) supporting the proposed Suspense fallback fix. Severity HIGH is appropriate given this affects Time-to-Interactive for every user including the pre-auth /login screen.

**Description.** App.tsx statically imports every page component (Dashboard, Phase1-3, Week1-4, AdminDashboard, BuddyDashboard, OnboardingLeadDashboard, WorksheetReview, PhaseReview, BuddyGatePass, plus Login/Signup) with no React.lazy()/Suspense anywhere in the codebase (`grep -rn "lazy(" src/` returns zero matches). Worse, App.tsx imports `WORKSHEET_COMPONENTS` from `./config/worksheetConfig`, which eagerly imports 40 separate worksheet/gate-control page components (src/config/worksheetConfig.tsx:38-79) purely to build a route→component lookup table used only for the dynamic worksheet routes. This means a user who only ever visits `/login` downloads the JS for all 40 worksheet forms, all four dashboards (Admin/Buddy/OnboardingLead/Dashboard), ReviewContent.tsx (1043 lines), Navbar.tsx, and the 35KB worksheetConfigData.ts — none of which are needed until much later in the flow, if ever (most roles never see most of these pages). vite.config.js:19 (`chunkSizeWarningLimit: 500`) shows the warning threshold was raised rather than the bundle being split, suggesting this was noticed and suppressed rather than fixed.

**Impact / failure scenario.** First paint of the login screen for a brand-new visitor (before any auth, before knowing the user's role) requires downloading and parsing JS for admin dashboards, buddy review tools, and all 33 worksheet forms across all 3 phases + 4 FTP weeks. On a slow connection or low-end device this directly delays Time-to-Interactive for the very first screen every user sees, and it means role-irrelevant code (e.g., a new_joinee downloading AdminDashboard/PhasesReadyTab/AssignmentsTab) is always shipped to everyone.

**Suggested fix.** Convert route-level imports in App.tsx to `React.lazy(() => import('./pages/...'))` wrapped in `<Suspense>` with a fallback (Skeleton components already exist in src/components/Skeleton.tsx). For WORKSHEET_COMPONENTS, either lazy-load each entry (`w1_o1: lazy(() => import('../pages/worksheets/ftp/W1O1'))`) or split the map by phase/week so only the active phase's worksheets are fetched. This alone would let Vite emit per-route chunks and shrink the initial bundle to auth + shell only.

---

#### 2. [MEDIUM] Sequential await waterfall in phase-approval flow — blocks the UI for N×2 round trips instead of 1

- **Dimension:** Dim 13: Performance
- **Location:** `src/pages/PhaseReview.tsx:99-127 (handleApprovePhase), src/pages/PhaseReview.tsx:139-147, src/context/AuthContext.tsx:192-205 (signUp)`
- **Verification:** CONFIRMED — Verified against current source: PhaseReview.tsx:99-127 has a for-await loop doing update+triggerNotification sequentially per submission, followed by a second sequential for-await loop at 139-147 for buddy notifications, then an awaited checkAndPromote call, all while actionLoading gates the Approve button; AuthContext.tsx:192-205 sequentially awaits getReviewerUserIds('manager') then ('onboarding_lead') (independent calls) followed by a sequential for-await notification loop inside signUp(), which the caller awaits before proceeding — exactly as described. Severity of HIGH is arguably slightly generous since typical toApprove/recipient counts are small (a handful) and network requests to Supabase are usually fast, but the anti-pattern and blocking behavior are real and the fix (Promise.all) is correct and low-risk.

**Description.** `handleApprovePhase` iterates `toApprove` (all buddy_approved worksheets in a phase, typically 4-8) with `for (const sub of toApprove) { await supabase...update(...); ...; await triggerNotification(...); }` (PhaseReview.tsx:99-127) — each iteration performs two sequential network round trips, none parallelized, so approving a phase with 8 worksheets issues 16 sequential HTTP requests before the loop finishes. A second sequential loop follows immediately after (`for (const buddyId of buddyIds) { await triggerNotification(...) }`, line 139-147), then `await checkAndPromote(...)` (another full network round trip) — all while `actionLoading` keeps the Approve button disabled. The same anti-pattern appears in signup: `AuthContext.tsx:193-194` awaits `getReviewerUserIds('manager')` then `getReviewerUserIds('onboarding_lead')` sequentially even though neither depends on the other's result, followed by a sequential notification-insert loop (line 196-204) that blocks the `signUp()` promise (and therefore the signup UI) from resolving.

**Impact / failure scenario.** A manager approving an 8-worksheet phase experiences a multi-second frozen "Approve" button (network latency × ~17 sequential requests) instead of the ~1-2 round trips it could take with Promise.all/batching. New-hire signup is similarly delayed by 2 sequential lookup queries plus one notification insert per admin/onboarding-lead account before the signup call resolves and the user can proceed to onboarding.

**Suggested fix.** Replace `for...await` loops with `Promise.all(toApprove.map(sub => supabase.from(...).update(...)))` for the update pass, and a second `Promise.all` for notifications. Run independent queries (`getReviewerUserIds('manager')` / `getReviewerUserIds('onboarding_lead')`) via `Promise.all` instead of sequential awaits. Where row bodies differ (e.g. review_history per row), Promise.all still parallelizes the round trips even though each request body differs — only truly independent work should ever be serialized.

---

#### 3. [MEDIUM] Systemic absence of memoization — O(instructors × phases × worksheets) recomputed from scratch on every render, including every keystroke in the admin search box

- **Dimension:** Dim 13: Performance
- **Location:** `src/pages/AdminDashboard.tsx:115-177, 271-273, 297-298 (getInstrStats/getPhaseProgress/getReadyPhases/filterInstructors), src/pages/OnboardingLeadDashboard.tsx:77-113, src/components/admin/PhasesReadyTab.tsx:15-23, src/config/worksheetConfigData.ts:582-611 (getPhaseReviewStatus)`
- **Verification:** not-required

**Description.** None of AdminDashboard.tsx, OnboardingLeadDashboard.tsx, PhasesReadyTab.tsx, ReviewContent.tsx, or Navbar.tsx use `useMemo`/`useCallback`/`React.memo` anywhere (`grep -rlE "useMemo|useCallback|React\.memo" src` returns only 5 of ~100 source files, none of them pages/dashboards). In AdminDashboard, `getInstrStats`, `getPhaseProgress`, and `getReadyPhases` (lines 115-139) each call `allWorksheets.filter(...)` — a full linear scan of up to 500 rows — and `getPhaseReviewStatus`/`isPhaseApproved` (worksheetConfigData.ts:588,669) internally re-filter `submissions` by `user_id` again. These are called once per instructor inside `filterInstructors()` (called twice per render: line 265 in the empty-check and line 271 in `.map`), and then called again independently for each rendered row (line 272-273) and once per phase per row (line 298, 3× per instructor). None of this is wrapped in `useMemo`, so every render — including every keystroke into the `searchQuery` input (line 260-261, no debounce) — re-executes the full O(instructors × phases × worksheets) computation from scratch.

**Impact / failure scenario.** With the project's own seed scale of 30 users and up to 500 worksheet rows, typing a single character in the admin search box triggers roughly 30 instructors × 3 phases × (up to 500-row filters, called 2-3× redundantly) = tens of thousands of array iterations synchronously on the main thread per keystroke, causing visible input lag/jank on the admin dashboard for real target scale, and wasting CPU/battery repeatedly since none of the intermediate results are cached across renders.

**Suggested fix.** Wrap `filterInstructors()`, per-instructor stats, and phase progress in `useMemo` keyed on `[instructors, allWorksheets, statusFilter, searchQuery]`; debounce `searchQuery` (e.g. 200-300ms) before it participates in filtering; precompute a `Map<userId, WorksheetSubmission[]>` once per `allWorksheets` change instead of re-filtering the full array per instructor/phase call.

---

#### 4. [MEDIUM] Notification bell polls every 15s indefinitely for every signed-in session with no visibility/idle pause and no use of Supabase realtime

- **Dimension:** Dim 13: Performance
- **Location:** `src/hooks/useNotifications.ts:47-95`
- **Verification:** not-required

**Description.** `useNotifications` (mounted globally via Navbar, which sits outside `<Routes>` in App.tsx:107, so it's active on every authenticated page) sets up `setInterval(fetchNotifications, pollInterval)` with a default `pollInterval` of 15000ms (useNotifications.ts:47) and never pauses based on `document.visibilityState` or user activity — a backgrounded/inactive browser tab keeps firing a full Supabase query (`notifications` table, `.limit(50)`, line 60-65) every 15 seconds for as long as the tab stays open. The project already depends on `@supabase/supabase-js` which supports realtime subscriptions, but nowhere in the codebase (`grep -rn "channel(\|realtime" src` — checked, none found) is realtime used instead of polling.

**Impact / failure scenario.** Every concurrent authenticated session generates a constant background request every 15s forever (even when idle/backgrounded), which scales linearly with concurrent users and adds sustained load/cost to the Supabase project with no user-facing benefit while the tab is hidden; for the target org size this is a steady, unnecessary request stream that a realtime subscription (or at least a `visibilitychange`-gated pause) would eliminate.

**Suggested fix.** Pause the interval when `document.hidden` is true (resume + immediately refetch on visibility restore), and/or replace polling with a Supabase realtime channel subscription on the `notifications` table filtered by `user_id`, which pushes updates instead of polling.

---

#### 5. [LOW] Admin/OnboardingLead dashboards hard-cap worksheet queries at 500 rows with no ORDER BY — silently truncates data at the project's own documented seed scale

- **Dimension:** Dim 13: Performance
- **Location:** `src/pages/AdminDashboard.tsx:79-82, src/pages/OnboardingLeadDashboard.tsx:52`
- **Verification:** CONFIRMED — Code claim is literally true (AdminDashboard.tsx:80 and OnboardingLeadDashboard.tsx:52 both do `.limit(500)` with no `.order()`), but the "documented seed scale" impact math is wrong: the app's own code hardcodes 20 worksheets/joinee (AdminDashboard.tsx:121 `notStarted: 20 - userWs.length`), not ~33, and `__seed_30_users.cjs` only creates 18 actual submitters (15 new_joinee + 3 lab_instructor, not 30/32 — the rest are buddies/managers/leads who don't submit worksheets) with only 3 of them reaching full Phase 1+2+3 (9+5+6=20 rows), 3 reaching Phase1+2 (14 rows), and the remaining 12 getting only 9 Phase-1 rows each — totaling ~225 rows, well under 500. db/seed_ftp_worksheets.sql likewise only seeds ~20 FTP worksheets each for 3 named test joinees. So at the actual documented seed/test scale the 500 cap is never hit and no truncation occurs today; this is a latent scalability/robustness gap (missing ORDER BY makes any future truncation nondeterministic) rather than a currently-manifesting HIGH-severity data-loss bug.

**Description.** Both dashboards fetch `worksheet_submissions` with `.limit(500)` and no `.order()` clause: `supabase.from('worksheet_submissions').select('user_id, worksheet_id, review_status, status, updated_at, review_history').limit(500)`. The repo's own worksheetConfigData defines ~33 worksheet IDs per joinee (8 Phase1 + 4 Phase2 + 5 Phase3 + gate controls + 16 FTP week worksheets/gates), and the repo ships a seed script named `__seed_30_users.cjs` — implying the intended test/launch scale is around 30 joinees. 30 users × ~33 worksheets ≈ 990 rows, roughly double the 500-row cap. Once the row count exceeds 500, Postgres returns an arbitrary subset (no ORDER BY means the returned 500 rows are not even guaranteed to be the same 500 across repeated calls), so `getInstrStats`, `getPhaseProgress`, and `getReadyPhases` (AdminDashboard.tsx:115-139) will silently compute wrong pending/approved/ready counts for whichever users' rows got cut, with no error surfaced anywhere.

**Impact / failure scenario.** At the onboarding lead's/admin's own documented test scale (30 users), the dashboard silently shows incorrect worksheet counts and "phase ready" status for a subset of joinees — some instructors will appear to have fewer/no worksheets submitted than they actually do, and phase-approval buttons may not appear for users whose buddy_approved rows got excluded from the 500-row window, blocking the approval flow for those users without any visible error.

**Suggested fix.** Remove the fixed limit and paginate (range()) or, since this data feeds aggregate stats, page through all rows via `.range()` loops or a Postgres RPC that aggregates server-side. At minimum add `.order('updated_at', { ascending: false })` so truncation is deterministic, and raise the limit to a number that comfortably covers the real user count (e.g. `worksheets_per_user * max_joinees`), or move the per-user aggregation into a database view/RPC so the client never needs all raw rows.

---

#### 6. [LOW] Autosave issues an extra serialized round-trip (conflict check) before every worksheet save, doubling save latency

- **Dimension:** Dim 13: Performance
- **Location:** `src/hooks/useAutoSave.ts:65-77`
- **Verification:** not-required

**Description.** On every debounced autosave, `save()` first does `await supabase.from('worksheet_submissions').select('updated_at')...maybeSingle()` purely to log a console warning on conflict (no actual conflict resolution happens — comment at line 82 says "Saving anyway (last-write-wins)"), and only after that resolves does it proceed to build and send the actual `upsert` (line 122). This is a sequential (not parallel) extra round trip that exists solely to produce a `console.warn`, and it happens on every save, not just when a real conflict is likely.

**Impact / failure scenario.** Every worksheet autosave (fired 1.5s after the user stops typing, per worksheet field group) takes roughly 2× the network latency it needs to, since the conflict-check query gates the actual save request instead of running in parallel with it or being dropped since its result is never used to change save behavior.

**Suggested fix.** Either drop the conflict-check query entirely (since the result is never used to block/alter the write — it's log-only), or fire it with `Promise.all` alongside the upsert if the warning is still wanted, so the extra query no longer serializes in front of the actual save.

---

#### 7. [LOW] Render-blocking external Google Fonts request with 6 weight/style variants and no self-hosted fallback

- **Dimension:** Dim 13: Performance
- **Location:** `index.html:8-9`
- **Verification:** not-required

**Description.** `index.html` loads `https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,300;0,400;0,500;1,400&family=Inter:wght@300;400;500;600;700&display=swap` via a render-blocking `<link rel="stylesheet">` (with `preconnect` hints present, which helps, but the CSS response itself must still round-trip to fonts.googleapis.com, then each referenced woff2 to fonts.gstatic.com, before those families are available). 10 total weight/style combinations across two families are requested up front regardless of which are actually used above the fold.

**Impact / failure scenario.** Adds 2 extra critical-path round trips (stylesheet + font files) to first paint, and ships more font-weight variants than most pages likely need, on every page load for every user, before the app's own JS bundle even starts executing.

**Suggested fix.** Self-host the specific font files actually used (subset to used weights) and serve them from the app's own origin/CDN with long-lived cache headers, or at minimum trim the requested weight list to only what's used in practice.

---

## Dim 14: User Isolation — 4/100

> User isolation is comprehensively broken at every layer the app relies on. Every RLS policy that grants reviewer/admin access is anchored to auth.jwt()->user_metadata->>role, which is ordinary Supabase user_metadata that any authenticated client can rewrite via supabase.auth.updateUser() (a code path the app itself exercises in useAutoPromote.ts) — meaning any signed-up user can self-escalate to academic_head/lead_instructor/onboarding_lead and gain RLS-level read+write over every other employee's profile and worksheet data. Independently, the 'Update own profile' policy has no column restriction, so a user can also just UPDATE their own role/assigned_lead_id/assigned_buddy_id directly. On top of that, the reviewer RLS policies OR a bare role check with the assignment check instead of ANDing them, so even a legitimately-scoped buddy/manager account can read and approve any other buddy's/manager's assignees — confirmed independently at the route layer (ProtectedRoute only checks role, never :userId against assignment) and the component layer (WorksheetReview/PhaseReview/BuddyGatePass gate approve actions purely on profile.role). A buddy-mode write path (useWorksheet overrideUserId) even lets an unassigned buddy overwrite a joinee's raw worksheet content, not just its approval state. The one table that does isolation correctly (notifications SELECT/UPDATE) still allows forging arbitrary notifications on INSERT. This is not launch-ready under any reasonable interpretation — it requires a full RLS redesign (server-trusted role source, AND-based ownership checks) before this app can hold real employee data.

#### 1. [CRITICAL] RLS authorization trusts client-writable auth.jwt() user_metadata.role — full privilege escalation to admin/buddy/manager for any signed-up user

- **Dimension:** Dim 14: User Isolation
- **Location:** `db/schema.sql:68-72,108-112,191-216 (identical flaw repeated in db/setup_correct.sql:29-96, db/__fix_rls_jwt.sql:25-81, db/__fix_rls_recursion.sql:28-93); src/context/AuthContext.tsx:169-176 (signUp); src/hooks/useAutoPromote.ts:69-71 (updateUser)`
- **Verification:** CONFIRMED — Verified directly: db/schema.sql lines 68-72 and 108-112 gate 'Admin read/update profiles' on auth.jwt()->'user_metadata'->>'role', lines 191-216 gate reviewer select/update on the same; identical pattern confirmed in db/setup_correct.sql, db/__fix_rls_jwt.sql (same path) and db/__fix_rls_recursion.sql (auth.jwt()->>'role' top-level, same vulnerability class). AuthContext.tsx:169-176 signUp passes role into options.data (GoTrue user_metadata), and useAutoPromote.ts:69-71 genuinely calls supabase.auth.updateUser({data:{role:...}}), proving the metadata-role write path is live client-side code, not UI-only. .env is tracked in git (git ls-files) and not gitignored, corroborating the exposed-anon-key claim. Finding is accurate as described.

**Description.** Every RLS policy in the repo that grants elevated (reviewer/admin) access — on user_profiles ('Admin read all profiles', 'Admin update profiles'), worksheet_submissions ('Reviewers select/update submissions'), and onboarding_submissions — bases its authorization check on `auth.jwt() -> 'user_metadata' ->> 'role'`. Supabase's `user_metadata` (raw_user_meta_data) is standard, unrestricted, user-writable data: any authenticated client can call `supabase.auth.updateUser({ data: { role: 'academic_head' } })` for their own account and have it reflected in their next JWT. This is not a hypothetical misuse — the app itself does exactly this in useAutoPromote.ts:69-71 to legitimately promote a user, proving the code path is live and reachable from client JS. A malicious 'new_joinee' can sign up (public /signup, or call supabase.auth.signUp directly with options.data.role='academic_head' — Signup.tsx only hardcodes 'new_joinee' at the UI layer, the GoTrue API itself accepts any metadata), then either at signup or via updateUser(), set role to 'academic_head', 'lead_instructor', or 'onboarding_lead'. On next session refresh, RLS grants that user SELECT on every user_profiles row, SELECT+UPDATE on every worksheet_submissions row for every employee in the company, and SELECT on every onboarding_submissions row. Given .env (with the anon key) is committed to the repo, an attacker doesn't even need to load the app — they can hit the Supabase REST/GoTrue endpoints directly.

**Impact / failure scenario.** Any employee (or anyone who signs up) can read and modify every other employee's worksheet answers, review status, and reviewer/manager/buddy assignments across the entire company, and can approve/reject submissions company-wide, by running one line in the browser console. This is a complete breakdown of the entire user-isolation model — not a partial leak.

**Steps to reproduce.** 1. Sign up a normal account (role defaults to new_joinee). 2. In browser devtools console on the running app: `await window.__supabase_debug__ ?? null` — or simply, since the app imports supabase as a module, add one line temporarily / use any REST client: POST to `{VITE_SUPABASE_URL}/auth/v1/user` with the session's access token and body `{"data":{"role":"academic_head"}}` using the anon key from the committed .env. 3. Refresh session / re-login. 4. Query `worksheet_submissions` for any user_id — RLS now returns rows for all users; call PATCH to approve any worksheet.

**Suggested fix.** Never authorize on user_metadata. Use Supabase app_metadata (server-writable only, set via the Admin API / a trusted server function, e.g. a Postgres function called through a service-role Edge Function on role-change events) or — simpler and self-consistent with the existing schema — drop the JWT-metadata role checks entirely and rewrite every reviewer-facing RLS policy to look up the role from the `user_profiles` table (with a SECURITY DEFINER helper function to avoid the recursion the __fix_rls_recursion.sql migration was trying to avoid), e.g. `CREATE FUNCTION current_user_role() RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$ SELECT role FROM user_profiles WHERE id = auth.uid() $$;` and use `current_user_role() IN (...)` in policies — combined with fix #4 below so user_profiles.role itself can't be self-modified.

---

#### 2. [CRITICAL] Buddy A can view and approve Buddy B's assignees — no ownership enforcement at RLS, route, or component level

- **Dimension:** Dim 14: User Isolation
- **Location:** `db/schema.sql:191-216 (Reviewers select/update submissions policy); src/App.tsx:117,124,127-129 (routes); src/components/ProtectedRoute.tsx:35-40; src/pages/WorksheetReview.tsx:39-46 (canApprove = isBuddy); src/pages/PhaseReview.tsx:47-49 (canApprove = isManager && isAllBuddyApproved)`
- **Verification:** CONFIRMED — Verified directly: db/schema.sql:190-217 shows RLS SELECT/UPDATE policies on worksheet_submissions OR a bare role check (auth.jwt()->'user_metadata'->>'role' IN ('lead_instructor','academic_head'[,...])) with the assigned_lead_id/assigned_buddy_id subquery checks, so any user with that role bypasses assignment entirely; App.tsx:117,124,127-129 gate /buddy/review/:userId/:worksheetId, /buddy/gate-pass/:userId/:gateId, /admin/review-phase/:userId/:phaseNum etc. via ProtectedRoute requiredRoles only; ProtectedRoute.tsx:35-40 confirms it only checks profile.role membership, never :userId; WorksheetReview.tsx:42-50 sets canApprove = isBuddy (profile.role==='lead_instructor') with zero comparison to instructor.assigned_buddy_id, and handleBuddyApprove (lines 74-143) performs the UPDATE relying solely on this. PhaseReview.tsx:47-49 similarly derives isManager from role alone. Finding is accurate as described; severity CRITICAL is appropriate given it's a full horizontal-privilege-escalation/IDOR on the core review-approval workflow.</note>


**Description.** The task's core question — can a buddy approve another buddy's assignee — is answered yes at every layer. (1) RLS: 'Reviewers select submissions' / 'Reviewers update submissions' OR together a bare role check (`role IN ('lead_instructor','academic_head')`) with the assignment check (`auth.uid() IN (SELECT assigned_buddy_id ...)`); because it's an OR, ANY user whose role is lead_instructor can read/update ANY worksheet_submissions row regardless of assigned_buddy_id — the assignment subquery is entirely redundant/dead code for read access. (2) Routing: `/buddy/review/:userId/:worksheetId`, `/buddy/gate-pass/:userId/:gateId`, `/admin/review-phase/:userId/:phaseNum` etc. are gated in ProtectedRoute.tsx purely by `requiredRoles` (role membership), never by comparing `:userId`'s assigned_buddy_id/assigned_lead_id to the logged-in profile.id. (3) Component logic: WorksheetReview.tsx line 43 sets `canApprove = isBuddy` (`profile?.role === 'lead_instructor'`) with no comparison to `instructor.assigned_buddy_id`; PhaseReview.tsx line 49 similarly gates only on `isManager`. There is no ownership check anywhere in the review/approve code path.

**Impact / failure scenario.** Buddy A, knowing or guessing Joinee X's UUID (trivially harvestable — see next finding), can navigate to /buddy/review/{X}/{worksheetId} and click Approve or Request Revision even though X is assigned to Buddy B. Same for Manager A approving Manager B's assignee's phase. The 'assigned buddy/manager' concept that the product is built around (visible in AdminDashboard's 'Buddy Assigned'/'Manager Assigned' badges) provides zero actual access control — it is purely informational.

**Steps to reproduce.** 1. Log in as any lead_instructor (buddy) account. 2. Query `supabase.from('user_profiles').select('id').eq('role','new_joinee')` from devtools — RLS returns all joinees, including ones not assigned to this buddy (see 'Admin read all profiles' policy). 3. Navigate to /buddy/review/{any-other-joinee-id}/p1_w1. 4. Click 'Approve (Buddy)' — the UPDATE succeeds because RLS's role-based OR clause doesn't check assignment.

**Suggested fix.** Make the assignment check mandatory, not optional, in RLS: replace the OR-based policy with one where the role membership only unlocks the *category* of write and the assignment/ownership check is an AND, e.g. `(role_is_buddy() AND auth.uid() = (SELECT assigned_buddy_id FROM user_profiles WHERE id = worksheet_submissions.user_id)) OR (role_is_manager() AND auth.uid() = (SELECT assigned_lead_id ...))`. Additionally add an app-level guard in WorksheetReview.tsx/PhaseReview.tsx/BuddyGatePass.tsx that fetches the target instructor's assigned_buddy_id/assigned_lead_id and renders 'Access Restricted' (matching the existing !isReviewer branch) when it doesn't match profile.id, so the UI reflects the real security boundary instead of contradicting it.

---

#### 3. [HIGH] Buddy-mode worksheet write path lets an unassigned buddy overwrite a joinee's submitted answers, not just approve them

- **Dimension:** Dim 14: User Isolation
- **Location:** `src/hooks/useWorksheet.ts:89,104-113 (overrideUserId); src/hooks/useGateControl.ts:84-91 (targetUserId passed as overrideUserId); src/pages/BuddyGatePass.tsx:117-125 (targetUserId={userId} taken directly from route :userId with no ownership check); src/hooks/useAutoSave.ts upsert (onConflict: 'user_id,worksheet_id')`
- **Verification:** CONFIRMED — Verified end-to-end: BuddyGatePass.tsx:33,122 takes :userId from route with no assigned_buddy_id check, passes as targetUserId -> useGateControl.ts:90 overrideUserId -> useWorksheet.ts:104-113 builds a synthetic user with id=overrideUserId -> useAutoSave.ts:106-122 upserts worksheet_data (full content) with user_id=that id via onConflict 'user_id,worksheet_id'; RLS 'Reviewers update submissions' policy (checked in __fix_rls_jwt.sql, __fix_rls_recursion.sql, __setup_supabase.sql, supabase_reviewer_migration.sql) grants UPDATE to any role IN ('lead_instructor','academic_head','onboarding_lead') via OR, independent of assigned_buddy_id/assigned_lead_id match, so an unassigned buddy's write is not blocked server-side either.

**Description.** BuddyGatePass.tsx reads `:userId` straight from the URL and passes it as `targetUserId` into GateControl1/2/3, which flow into `useGateControl` -> `useWorksheet({ overrideUserId: targetUserId })`. useWorksheet then autosaves/upserts worksheet content with `user_id = overrideUserId` (the joinee's ID), not the acting buddy's own ID. Since the RLS 'Reviewers update submissions' policy grants UPDATE to any lead_instructor role for any row (finding above), this upsert's UPDATE branch succeeds even when the acting buddy is not the joinee's assigned buddy — meaning any buddy can silently modify the *content* (milestones, fields, review_status) of any joinee's gate-control worksheet, not merely change its approval status.

**Impact / failure scenario.** An unassigned or even malicious buddy account can tamper with another employee's submitted worksheet data before or after their real buddy reviews it, corrupting the audit trail (review_history is appended by whoever holds the session, and worksheet_data itself is directly overwritable).

**Steps to reproduce.** 1. Log in as buddy B who is not assigned to joinee X. 2. Navigate to /buddy/gate-pass/{X}/gc1. 3. Edit milestone fields and submit — GateControl1's handleSubmit calls flushSave which upserts to worksheet_submissions with user_id=X via RLS's role-only bypass; the write succeeds.

**Suggested fix.** Same root fix as the ownership finding: RLS UPDATE/INSERT policies for worksheet_submissions must AND the assignment check, and BuddyGatePass/GateControl components should verify `targetUserId`'s assigned_buddy_id === profile.id before rendering the form or calling handleSubmit.

---

#### 4. [HIGH] user_profiles self-update RLS policy has no column restriction — any user can set their own role, assigned_lead_id, or assigned_buddy_id directly

- **Dimension:** Dim 14: User Isolation
- **Location:** `db/schema.sql:62-64 ("Update own profile" ... USING (id = auth.uid())); identical in db/setup_correct.sql:26-27, db/__fix_rls_jwt.sql:21-23, db/__fix_rls_recursion.sql:22-24`
- **Verification:** CONFIRMED — Confirmed in db/schema.sql:63-64 (and identically in setup_correct.sql:26-27, __fix_rls_jwt.sql:22-23, __fix_rls_recursion.sql:23-24): `CREATE POLICY "Update own profile" ON user_profiles FOR UPDATE USING (id = auth.uid());` has no WITH CHECK, and role/assigned_lead_id/assigned_buddy_id are ordinary columns (schema.sql:39-50) with no column-level GRANT restriction, so a user can UPDATE their own row's role. AuthContext.tsx:40/119 selects role directly from user_profiles into `profile`, and profile.role gates ProtectedRoute.tsx:36-38 plus Navbar/AdminDashboard/BuddyDashboard/PhaseReview/WorksheetReview/OnboardingLeadDashboard client-side checks, confirming the UI-unlock impact as described.

**Description.** The 'Update own profile' policy only restricts *which row* a user may update (their own, by id) — it has no WITH CHECK clause restricting which *columns* may change. Since `role`, `assigned_lead_id`, and `assigned_buddy_id` are ordinary columns on the same row, any authenticated user can call `supabase.from('user_profiles').update({ role: 'academic_head' }).eq('id', myOwnId)` directly and it will pass RLS. AuthContext.tsx reads `profile.role` from this exact table to drive ProtectedRoute's client-side gating (ProtectedRoute.tsx:35-40), so this single UPDATE call is enough to unlock the /admin, /buddy, and /onboarding-lead UI shells and their review dashboards for anyone.

**Impact / failure scenario.** A brand-new new_joinee account can self-promote to academic_head/onboarding_lead/lead_instructor purely through the user_profiles table (independent of the auth.updateUser() escalation path in finding #1), unlocking every admin/reviewer UI surface and (once combined with the also-broken worksheet_submissions RLS or the JWT-metadata trick) full company-wide data access.

**Steps to reproduce.** 1. Log in as any user. 2. `await supabase.from('user_profiles').update({role:'academic_head'}).eq('id', (await supabase.auth.getUser()).data.user.id})`. 3. Reload — ProtectedRoute now treats this user as academic_head and routes to /admin succeed.

**Suggested fix.** Add a WITH CHECK / trigger that prevents self-service role and assignment changes, e.g. a BEFORE UPDATE trigger that raises an exception if `NEW.role IS DISTINCT FROM OLD.role` or `NEW.assigned_lead_id/assigned_buddy_id IS DISTINCT FROM OLD.*` unless the acting user is a genuine admin (checked via a SECURITY DEFINER role-lookup function, not JWT metadata). Role/assignment changes should go through a dedicated RPC restricted to admins.

---

#### 5. [MEDIUM] Notifications can be forged for any recipient/sender — INSERT policy is WITH CHECK (true)

- **Dimension:** Dim 14: User Isolation
- **Location:** `db/__migration_notifications_dates.sql:34-37 ("Insert notifications" ... WITH CHECK (true))`
- **Verification:** not-required

**Description.** While SELECT/UPDATE on notifications are correctly scoped to `auth.uid() = user_id` (this table is one of the few done right), the INSERT policy allows any authenticated user to insert a notification row with an arbitrary `user_id` (recipient) and `from_user_id` (claimed sender). The app's own triggerNotification() helper (src/hooks/useNotifications.ts:150-165) takes these as plain parameters with no validation that fromUserId equals the caller.

**Impact / failure scenario.** Any authenticated user (including a self-escalated new_joinee, see findings above) can plant fabricated notifications in any other employee's notification bell claiming to be from a manager/buddy (e.g. 'approved', spoofed review comments), which is both a social-engineering/phishing vector and a data-integrity problem for the notification audit trail.

**Steps to reproduce.** As any logged-in user: `supabase.from('notifications').insert({ user_id: <victim>, from_user_id: <impersonated-manager-id>, worksheet_id: 'p1_w1', type: 'approved', message: 'Fake approval' })` succeeds because WITH CHECK (true) imposes no restriction.

**Suggested fix.** Change WITH CHECK to `auth.uid() = from_user_id OR from_user_id IS NULL` (system-generated) and additionally validate server-side (via a trigger or RPC) that the inserting user is actually allowed to notify that particular recipient (e.g. is their assigned buddy/lead, or the recipient is themselves).

---

#### 6. [MEDIUM] Assignment-filtered dashboards create false confidence — client-side .eq() filtering is the only place assignment is enforced

- **Dimension:** Dim 14: User Isolation
- **Location:** `src/pages/BuddyDashboard.tsx:61-62 (.eq('assigned_lead_id', user.id) / .eq('assigned_buddy_id', user.id))`
- **Verification:** not-required

**Description.** BuddyDashboard.tsx correctly queries only the joinees assigned to the logged-in buddy/manager for the dashboard list — this is good UX, but because it is unaccompanied by any RLS or route-level enforcement (see the CRITICAL findings above), it is security theater: the dashboard hides other buddies' assignees from the list, but the exact same account can reach every other joinee's worksheet through the /buddy/review/:userId/:worksheetId URL directly, or by querying user_profiles unfiltered from the console.

**Impact / failure scenario.** Engineers/reviewers of this code could reasonably believe assignment scoping is enforced because the dashboard 'looks' scoped; QA testing only through the UI would not catch the underlying isolation failure, delaying detection of the CRITICAL findings above.

**Steps to reproduce.** N/A — this is a design-consistency observation tied to the CRITICAL findings; verify by comparing BuddyDashboard.tsx's filtered query against the unfiltered access available via WorksheetReview.tsx's loadData (`.eq('user_id', userId)` with userId taken from the route, no assignment check).

**Suggested fix.** Once RLS and route/component ownership checks are fixed (per the CRITICAL findings), this client-side filter becomes a legitimate UX optimization rather than the sole control. Keep it, but do not treat it as a security boundary in code review.

---

## Dim 15: Privacy & Compliance — 10/100

> Privacy posture is not production-ready: every authorization check that gates access to employee PII (names, emails, department, buddy/manager assignments, assessment answers, and manager review feedback) relies on a JSON field the client itself writes and can freely rewrite, so any signed-up user can trivially grant themselves company-wide read access to everyone's personnel data. On top of that there is no right-to-erasure mechanism, no data-export/portability feature, and no consent notice or privacy policy anywhere in the signup flow — the only 'deletion' tooling is a blunt SQL script that wipes the entire database rather than a single user's record. Seed scripts also commit a shared weak password and default to the live Supabase project URL, so if ever run against prod they plant persistent low-effort backdoor accounts.

#### 1. [CRITICAL] RLS trusts client-writable user_metadata.role, letting any employee self-escalate to read all colleagues' PII

- **Dimension:** Dim 15: Privacy & Compliance
- **Location:** `db/supabase_schema.sql:68-72,119,143 (and equivalent policies in db/schema.sql); src/context/AuthContext.tsx:167-176 (signUp writes role into user_metadata); src/hooks/useAutoPromote.ts:69-73 (client calls supabase.auth.updateUser({data:{role}}))`
- **Verification:** CONFIRMED — Core claim confirmed, though the finding cites the wrong file as primary: db/supabase_schema.sql:68-72,119,143 actually use safe `(SELECT id FROM user_profiles WHERE role IN (...))` subqueries, not user_metadata. The real vulnerable policies are in db/schema.sql:70,77,111,193,209 (`auth.jwt() -> 'user_metadata' ->> 'role' IN (...)`), and per context.md and the file's own header, db/schema.sql is the "DEFINITIVE" schema actually run against the live project (URL in its comment matches VITE_SUPABASE_URL in .env: fuoqoryqndtdooujslee). Client-writability is confirmed: AuthContext.tsx:170-176 (`supabase.auth.signUp({options:{data:{full_name,role}}})`) and useAutoPromote.ts:69-71 (`supabase.auth.updateUser({data:{role:'lead_instructor'}})`) both write into user_metadata, which is documented in Supabase as user-writable (unlike app_metadata). context.md itself documents this design (lines 754, 875, 1188, 1927-1933) as intentional "to avoid RLS recursion." Any authenticated user can call `supabase.auth.updateUser({data:{role:'academic_head'}})` from the console to self-escalate and gain read/write access to all colleagues' profiles and submissions — company-wide PII exposure, trivially exploitable, matches the severity described.

**Description.** Every 'admin/lead can read all X' RLS policy in the schema checks `auth.jwt() -> 'user_metadata' ->> 'role'`. `user_metadata` on a Supabase auth user is writable by the authenticated user themselves via `supabase.auth.signUp({options:{data:{role}}})` (used at signup, AuthContext.tsx:170-176) or `supabase.auth.updateUser({data:{role}})` (already called client-side elsewhere in the app, useAutoPromote.ts:69). No database trigger, check constraint, or server-side function restricts what value a user can put in their own `user_metadata.role`. There is no server/service-role boundary here — the anon key committed in .env is all that's needed.

**Impact / failure scenario.** A logged-in new_joinee (or anyone who signs up, since email confirmation is the only gate) runs `await supabase.auth.updateUser({ data: { role: 'academic_head' } })` from the browser console, refreshes their session, and the RLS policies at db/supabase_schema.sql:68-72 and :143 now treat them as an academic_head/onboarding_lead. They can then SELECT every row of `user_profiles` (all employees' full names, emails, departments, buddy/manager assignments) and every row of `worksheet_submissions` and `onboarding_submissions` (every colleague's assessment answers, self-reported competency data, and manager review_comment/review_history feedback) company-wide. This is a complete company-wide PII breach reachable with zero exploitation skill, just a documented Supabase API call.

**Suggested fix.** Never author authorization decisions from `user_metadata` (user-writable). Store role in `app_metadata` (only settable via service-role/Admin API) or, better, keep `role` solely in `user_profiles` and have RLS policies subquery that table (already partially done in db/supabase_schema.sql lines that reference `SELECT id FROM user_profiles WHERE role IN (...)`) — use only that pattern, remove all `auth.jwt() -> 'user_metadata'` role checks, and add a trigger/RLS rule that only privileged roles (via service key) can update `user_profiles.role`. Audit whether this bug has already been exploited against the live Supabase project referenced in the committed .env before launch.

---

#### 2. [HIGH] No right-to-erasure: zero DELETE policies exist, only a full-database wipe script

- **Dimension:** Dim 15: Privacy & Compliance
- **Location:** `db/*.sql (grep for 'FOR DELETE' across all schema files returns nothing); db/__cleanup_test_users.sql:1-53`
- **Verification:** CONFIRMED — Verified: grep across all db/*.sql shows every CREATE POLICY is FOR SELECT/INSERT/UPDATE only, zero DELETE policies exist; db/__cleanup_test_users.sql:1-52 confirmed as an unconditional full-table wipe (DELETE FROM user_profiles with no WHERE, DELETE FROM auth.users) explicitly documented as a pre-launch 'clean slate' script; and src/ has no delete-user code path (only unrelated Map.delete() calls in queryCache.ts/errorHandling.ts) or admin UI for per-person erasure.

**Description.** None of the RLS-enabled tables (`user_profiles`, `worksheet_submissions`, `onboarding_submissions`, `notifications`) has a DELETE policy defined anywhere in the schema files. The only script that performs deletes, db/__cleanup_test_users.sql, unconditionally deletes ALL rows from all four tables plus `auth.users` with no WHERE clause targeting a specific person — it's explicitly a 'clean slate before going live' script, not an erasure tool, and requires direct Supabase SQL console / service_role access to run.

**Impact / failure scenario.** A departing employee (or a GDPR/CCPA data-subject-erasure request) cannot have their name, email, assessment answers, or manager feedback deleted through the app, and there is no admin UI or SQL runbook to delete just one user's data without wiping the entire company's onboarding history.

**Suggested fix.** Add a DELETE RLS policy scoped to `auth.uid() = user_id` (or service-role-only) for each PII table, and build an admin-triggered 'delete this employee's data' flow (cascade across user_profiles, worksheet_submissions, onboarding_submissions, notifications, and the auth.users record itself) that can be invoked per-person, plus a documented SLA for responding to erasure requests.

---

#### 3. [MEDIUM] No data export / portability feature for employees to obtain their own data

- **Dimension:** Dim 15: Privacy & Compliance
- **Location:** `src/ (repo-wide search for csv/download/blob/export-data patterns found none); no export endpoint exists anywhere in src/pages or src/api`
- **Verification:** CONFIRMED — Verified via grep across src/pages, src/components, src/api for download/csv/blob/createObjectURL/export-data patterns — only false-positive matches are JS `export` keywords (e.g. src/components/ReviewContent.tsx:798, src/types/worksheet.ts); src/api/ contains only a Supabase client re-export (src/api/index.ts, src/api/supabase.ts), no export endpoint; Dashboard.tsx has no Download/Export button. Downgraded from HIGH to MEDIUM: this is a real feature gap but is a product/compliance nice-to-have (DSAR self-service) rather than a security vulnerability or functional defect — data remains fully retrievable manually by an admin via Supabase, so it's not a hard blocker, though it could become a legal requirement depending on jurisdiction.

**Description.** There is no button, page, or API call anywhere in the codebase that lets a new hire or reviewer download/export their own onboarding submissions, assessment answers, or review feedback. The only 'export' matches in the codebase are unrelated JS `export` keywords.

**Impact / failure scenario.** An employee who wants a copy of their onboarding record (a standard data-subject-access-request expectation, and often a hard legal requirement) has no self-service way to get it; someone would have to hand-query Supabase for them.

**Suggested fix.** Add a 'Download my data' feature (JSON or PDF) on the Dashboard that pulls the current user's own `user_profiles`, `worksheet_submissions`, and `onboarding_submissions` rows via the already-permitted 'select own' RLS policies.

---

#### 4. [MEDIUM] No privacy policy, consent notice, or data-use disclosure anywhere in signup/login

- **Dimension:** Dim 15: Privacy & Compliance
- **Location:** `src/pages/Signup.tsx:1-131 (full file read — form collects fullName, email, password with no consent UI); repo-wide search for privacy/consent/GDPR terms in src/ and *.md returned zero matches`
- **Verification:** CONFIRMED — Confirmed by direct read of Signup.tsx (also checked Login.tsx exists, and repo-wide grep for privacy|consent|gdpr|terms of service|data protection|ccpa returns zero hits in src/ and *.md); the finding's claim of "zero matches" is slightly imprecise (there are unrelated hits for the word 'policy' — academic/exam/RLS policies — which the finding's grep description glossed over), but the substantive claim holds: no privacy policy, consent checkbox, or ToS link exists anywhere in the signup/login flow or docs for this real internal HR onboarding app storing PII (name/email) plus later assessment data. Severity is arguably overstated as HIGH since this is a compliance/product-completeness gap rather than an exploitable technical vulnerability.

**Description.** Signup.tsx collects full name and email with a plain form and a Google OAuth option; there is no checkbox, link, or notice referencing a privacy policy, terms of service, or how the collected PII (and later, assessment/review data) will be used, retained, or shared with buddies/managers/admins.

**Impact / failure scenario.** New hires are enrolled and their assessment/performance-adjacent data is shared with managers and admins with no disclosed consent basis or policy reference — a compliance gap for any jurisdiction requiring notice-at-collection (GDPR Art. 13, CCPA notice at collection, etc.).

**Suggested fix.** Add a privacy-policy/terms link and explicit consent acknowledgment to the signup form, and publish an actual privacy policy describing what PII is collected, who can see it (buddy, manager, onboarding lead, admin), and retention/deletion terms.

---

#### 5. [MEDIUM] Seed scripts hardcode the real Supabase project as a fallback and create 32 accounts with one shared, weak, committed password

- **Dimension:** Dim 15: Privacy & Compliance
- **Location:** `__seed_30_users.cjs:17-20 (PASSWORD='Test123!', SUPABASE_URL/KEY default to the live project fuoqoryqndtdooujslee.supabase.co and the anon key from .env), :588; __seed_test_data.cjs:17,115,422 (same pattern)`
- **Verification:** not-required

**Description.** `SUPABASE_URL`/`SUPABASE_KEY` in both root seed scripts default to the exact same project URL and publishable key committed in .env, so running these scripts without any env override targets the live/production Supabase project. Both scripts hardcode a single trivial password ('Test123!') for every one of the ~32 seeded accounts, printed in a console.log and committed in plaintext to the repo.

**Impact / failure scenario.** If either script is ever executed against the real deployment (easy to do by accident since it 'just works' with no env file), it plants 32 real authenticated accounts with a shared, publicly-known password directly into the live user base — a standing credential-stuffing/backdoor risk, compounded by finding #1 since any of those accounts can self-escalate to read all company PII.

**Suggested fix.** Remove hardcoded production fallbacks from seed scripts (fail loudly if env vars aren't set to a non-prod project), generate random per-user passwords, and never print/commit credentials. Ideally seed scripts should refuse to run unless pointed at a project explicitly flagged as non-production.

---

#### 6. [MEDIUM] .env with live Supabase URL + anon key committed to git provides a working credential to the real backend to anyone with repo access

- **Dimension:** Dim 15: Privacy & Compliance
- **Location:** `.env:1-2 (committed since 'Initial commit' 7e5ca88, confirmed via git log --oneline -- .env); .gitignore:1-16 (no .env exclusion present)`
- **Verification:** not-required

**Description.** .gitignore never excludes .env, and git log confirms it has been tracked since the very first commit. It contains the real project's VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (anon key).

**Impact / failure scenario.** Anyone who can clone this repository (any current/former contributor, or the public if the repo is ever made public/forked/leaked) obtains a working, unrevoked credential to the actual Supabase auth/PII backend — no separate secret-hunting needed. Combined with finding #1's RLS bypass, that's a direct path to reading every employee's PII.

**Suggested fix.** Remove .env from git tracking (`git rm --cached .env`), add it to .gitignore, rotate the anon key in the Supabase dashboard, and require each environment to supply its own .env from .env.example.

---

#### 7. [MEDIUM] No PII/data retention policy or purge job anywhere in the schema or docs

- **Dimension:** Dim 15: Privacy & Compliance
- **Location:** `db/__due_date_notifications.sql:115-133 (only cron reference in the repo, and it's for creating due-date notifications, not purging old data); repo-wide search of context.md, ARCHITECTURE_PLAN.md, SYSTEM_ANALYSIS.md, Newton_Onboarding_Engineering_Review.txt for retention/PII/GDPR/erasure terms returned nothing`
- **Verification:** not-required

**Description.** There is no documented or implemented retention window for `notifications`, `worksheet_submissions`, `onboarding_submissions`, or `user_profiles`. Rows (including free-text `notifications.message` containing full names, e.g. AuthContext.tsx ~200-206's 'New Joinee joined: {fullName}') accumulate forever with no TTL, archival, or scheduled purge — the only cron example in the repo is for generating new due-date notifications, not cleaning up old PII.

**Impact / failure scenario.** Assessment answers and manager feedback about employees who left years ago remain queryable indefinitely with no policy basis, increasing breach blast radius and making any future erasure/retention audit start from zero.

**Suggested fix.** Define and document a retention policy (e.g., purge worksheet/assessment data N months after an employee's offboarding), and implement it as a scheduled job (pg_cron, since the project already uses it elsewhere) rather than leaving cleanup to the ad-hoc __cleanup_test_users.sql wipe script.

---

#### 8. [LOW] Auth session (with full_name/role) persisted to localStorage indefinitely with no explicit session-lifetime hardening

- **Dimension:** Dim 15: Privacy & Compliance
- **Location:** `src/api/supabase.ts:19 (createClient with default persistSession config — no explicit auth options passed)`
- **Verification:** not-required

**Description.** `createClient(supabaseUrl, supabaseKey)` is called with no `auth` options, so the Supabase JS client uses its default `persistSession: true` behavior, storing the access/refresh token (and thus `user_metadata.full_name`/role) in browser localStorage with no configured shorter session lifetime or storage isolation.

**Impact / failure scenario.** On a shared or kiosk-style computer, a logged-in session (and the PII embedded in its JWT/user_metadata) remains accessible to the next person to use the browser until the token is explicitly revoked or expires per Supabase project defaults, which are often long-lived.

**Suggested fix.** Consider explicit `auth: { persistSession: true, storage: sessionStorage }` for shared-device deployments, or ensure the Supabase project's JWT/refresh-token expiry is tuned deliberately rather than left at defaults, and add a visible sign-out-everywhere control.

---

## Dim 16: Supply Chain & Dependencies — 47/100

> Lockfile integrity is genuinely solid (325/325 packages have integrity hashes, all resolved from registry.npmjs.org, no rogue git/tarball deps, no typosquats), and the "lucide-react is ancient 1.x" hypothesis in the brief is disproven -- lucide-react ^1.21.0 is only 3 minor versions behind the real latest (1.24.0), not a legacy 0.x package. However, the project has zero dependency-update process: every one of 27 deps uses an unpinned ^ range, there is no CI/CD anywhere in the repo to gate installs/builds/audits, no `engines` field despite Vite 8 requiring a narrow Node range, and npm audit surfaces a real unpatched HIGH-severity undici vulnerability chain (dev-only via jsdom/vitest, but sitting unaddressed with a trivial fix available). Dependency classification is sloppy: `ws` and `dotenv` are declared as production dependencies but are used exclusively by one-off Node seed/admin scripts never touched by the shipped src/ app, and `tslib` is a dead top-level entry already satisfied transitively. None of this blocks the app's core runtime today (it's a Supabase-only frontend with no server dependency chain shipping to users), but the complete absence of any automated dependency hygiene process is a real production-readiness gap for an app that has already made several bleeding-edge major-version bets (React 19, Vite 8/Rolldown, Tailwind 4).

#### 1. [MEDIUM] Unpatched HIGH-severity undici vulnerability chain reported by npm audit (dev/test dependency)

- **Dimension:** Dim 16: Supply Chain & Dependencies
- **Location:** `package.json:34 (vitest ^4.1.9) / package-lock.json:4146-4149 (undici 7.27.2, resolved via jsdom -> vitest)`
- **Verification:** CONFIRMED — Reproduced with npm audit --json: identical HIGH-severity undici advisory chain, range 7.0.0-7.27.2, fixAvailable true; verified package-lock.json lines 4146-4149 (undici 7.27.2, dev:true) resolved via jsdom 29.1.1 (lines 3132-3153, dev:true, undici ^7.25.0), and package.json confirms jsdom/vitest are devDependencies only -- downgraded to MEDIUM since it's confined to test tooling, not the shipped Vite bundle.

**Description.** `npm audit --json` reports one HIGH-severity vulnerability advisory chain for `undici` covering multiple GHSA advisories: GHSA-vmh5-mc38-953g (TLS cert validation bypass via SOCKS5 ProxyAgent, CVSS 7.4), GHSA-vxpw-j846-p89q (WebSocket DoS via fragment count bypass, CVSS 7.5), GHSA-hm92-r4w5-c3mj (cross-origin request routing via SOCKS5 proxy pool reuse, CVSS 7.5), plus moderate/low advisories for Set-Cookie header injection and cache poisoning. The lockfile-resolved version is undici@7.27.2 (package-lock.json:4147), which falls inside every vulnerable range (e.g. `>=7.23.0 <7.28.0`). Traced the dependency chain: undici is required by jsdom (package-lock.json:3153, `"undici": "^7.25.0"`), and jsdom is `dev: true` (package-lock.json:3128), pulled in only for vitest's DOM environment (package.json:34). It is not part of the Vite production bundle. npm audit reports `"fixAvailable": true`.

**Suggested fix.** Run `npm audit fix` (or bump jsdom to a version that resolves undici >=7.28.0) and commit the updated lockfile. Given it's dev-only, this is not a shipped-app risk, but it does run in CI/local `npm test` and should not sit unpatched with a trivial fix available -- leaving known-vulnerable deps unaddressed for no reason signals no dependency-update process exists at all.

---

#### 2. [MEDIUM] Zero dependency pinning, no CI/CD, and no engines field -- no guaranteed reproducible build

- **Dimension:** Dim 16: Supply Chain & Dependencies
- **Location:** `package.json:9-35 (all 27 dependencies/devDependencies use ^ ranges); repo root (no .github/workflows, vercel.json, or netlify.toml found)`
- **Verification:** not-required

**Description.** Every single one of the 27 declared dependencies uses a caret (`^`) range -- verified by grepping package.json (27/27 matches). There is no `engines` field in package.json despite the toolchain requiring narrow Node ranges (Vite 8 requires `node "^20.19.0 || >=22.12.0"`, package-lock.json:4209-4211; esbuild requires `node ">=18"`, package-lock.json:2645-2647), and no `.nvmrc`/`.node-version` file. No CI/CD config exists anywhere in the repo root (checked for .github/, vercel.json, netlify.toml -- none found). With lockfile present but nothing in-repo enforcing `npm ci` over `npm install` on deploy, and no automated dependency-drift/audit gate, every dependency can silently float to a new minor/patch version on any fresh install with zero verification, and a contributor on a mismatched Node version gets silent, hard-to-diagnose install/build failures.

**Suggested fix.** Add an `engines` field pinning the Node range this app is actually built/tested against, add a `.nvmrc`, and add a minimal CI workflow that runs `npm ci` (not `npm install`) + `npm run build` + `npm test` + `npm audit --audit-level=high` on every PR so dependency drift and new vulnerabilities are caught before merge, not discovered ad hoc.

---

#### 3. [MEDIUM] ws and dotenv declared as production dependencies but used only by one-off admin/seed CLI scripts, never by the shipped app

- **Dimension:** Dim 16: Supply Chain & Dependencies
- **Location:** `package.json:16 ("ws": "^8.21.0"), package.json:12 ("dotenv": "^17.4.2")`
- **Verification:** not-required

**Description.** Grepped all of src/, scripts/, and root *.cjs/*.mjs files for imports of `ws` and `dotenv`. Zero occurrences anywhere under src/ (the code that actually ships in the Vite bundle). `ws` is imported only in Node-side operational scripts: scripts/fix_promotion_data.mjs:8, scripts/clean_setup.mjs:13, scripts/setup/__create_users.cjs:2, scripts/setup/__full_setup.cjs:2, scripts/setup/__test_reviewer_flow.cjs:2, scripts/setup/__create_15_users.cjs:10, __seed_30_users.cjs:15, __seed_test_data.cjs:14, fix-assignments.cjs:9 (all pass `ws`'s WebSocket as the realtime transport for @supabase/supabase-js under Node). `dotenv` is imported only in scripts/setup/create-admin.cjs:1. Declaring these as top-level `dependencies` misrepresents the app's real production runtime surface -- any supply-chain scanner, SBOM, or `npm ls --omit=dev` audit of "what does the deployed frontend actually depend on" will incorrectly count these as shipped-app dependencies, and it signals these operational/admin scripts were never separated from the actual application's dependency graph.

**Suggested fix.** Move `ws` and `dotenv` to devDependencies (or better, move the admin/seed scripts into a separate `scripts/` package.json with its own dependency list), so `dependencies` in the root package.json accurately reflects only what src/ needs at runtime (@supabase/supabase-js, lucide-react, react, react-dom, react-router-dom).

---

#### 4. [LOW] tslib declared as a direct dependency with zero direct usage -- dead top-level entry

- **Dimension:** Dim 16: Supply Chain & Dependencies
- **Location:** `package.json:23 ("tslib": "^2.8.1")`
- **Verification:** not-required

**Description.** Grepped all of src/, scripts/, and the whole repo for `tslib` usage -- the only match is the package.json declaration itself. tsconfig.json has no `importHelpers: true` (grepped, 0 matches), so TypeScript is not configured to emit tslib helper imports either. Cross-checked the lockfile: tslib is already pulled in transitively at pinned `2.8.1` by @supabase/auth-js, @supabase/functions-js, @supabase/postgrest-js, @supabase/realtime-js, and @supabase/storage-js, plus tailwindcss's oxide wasm packages -- so it was already going to be installed regardless. The explicit direct dependency adds nothing functionally, it's just one more line someone has to reason about during every future dependency audit, and its presence suggests the dependency list has never been pruned of copy-pasted/legacy entries.

**Suggested fix.** Remove `tslib` from package.json dependencies; it will continue to be resolved transitively via @supabase/* packages with no behavior change.

---

#### 5. [LOW] TypeScript pinned a full major version behind latest, despite the rest of the stack chasing bleeding-edge majors

- **Dimension:** Dim 16: Supply Chain & Dependencies
- **Location:** `package.json:29 ("typescript": "^6.0.3")`
- **Verification:** not-required

**Description.** Verified via `npm view typescript version` that the current published latest is 7.0.2, a full major version ahead of the ^6.0.3 floor pinned here (and the lockfile-resolved 6.0.3, package-lock.json entry for node_modules/typescript). This is notable specifically because every other tool in this project was adopted at or near its own bleeding edge (React 19.2, Vite 8 with Rolldown, Tailwind 4.3, ESLint 10, vitest 4) -- the inconsistency (aggressive elsewhere, a full major behind on TypeScript) indicates version upgrades are happening ad hoc/opportunistically rather than via any tracked update policy (no Renovate/Dependabot config found in the repo).

**Suggested fix.** Either adopt a dependency-update bot (Renovate/Dependabot) with a defined cadence, or explicitly document why TypeScript 7 is being deferred (e.g. breaking changes in strict-mode checks) so the gap is a decision, not an oversight.

---

#### 6. [LOW] Vite 8's Rolldown-based bundler is a materially larger architecture change than a routine version bump, with no validation evidence in-repo

- **Dimension:** Dim 16: Supply Chain & Dependencies
- **Location:** `package.json:33 ("vite": "^8.0.12"); package-lock.json:4194-4204 (resolved vite@8.0.16 depends on "rolldown": "1.0.3")`
- **Verification:** not-required

**Description.** Vite 8 replaces the long-established esbuild+Rollup production bundling pipeline with Rolldown, a comparatively young Rust-based bundler (pinned exact at 1.0.3 as a sub-dependency, not independently controllable via package.json). This is a bigger supply-chain/compatibility risk surface than a typical patch/minor bump: both @tailwindcss/vite and @vitejs/plugin-react (also devDependencies here) must independently track Rolldown compatibility, and there is no CI (see separate finding) or committed build-diff evidence in the repo that the actual `vite build` production output has been validated against the prior Rollup-based pipeline's output for this specific app.

**Suggested fix.** At minimum, add a CI build step that runs `npm run build` and smoke-tests the produced `dist/` bundle before this is called production-ready, given the bundler underneath changed architecture, not just version.

---

## Dim 17: Operational Readiness — 8/100

> Operational readiness is effectively absent. The repo has no CI/CD, no error/observability tooling, no runbook/on-call/incident doc, and no schema-migration framework (16 loose, unordered SQL files with no version tracking). The one migration-runner script is provably broken (references nonexistent file paths and would corrupt its own migration via naive semicolon-splitting of a dollar-quoted function body even if the paths were fixed). Production Supabase credentials are hardcoded as fallback defaults across at least 9 separate scripts, one of which (clean_setup.mjs) unconditionally deletes all worksheet_submissions with no confirmation and defaults to hitting production if env vars aren't set. None of the three named support scenarios (stuck needs_revision, buddy departure, wrong phase promotion) have any admin-facing recovery path in the UI — all require undocumented, unaudited manual SQL against production. This is not launch-ready for a real company; it would fail on day one of its first support ticket.

#### 1. [CRITICAL] run_migration.cjs is non-functional — references SQL files that don't exist at the stated paths

- **Dimension:** Dim 17: Operational Readiness
- **Location:** `scripts/run_migration.cjs:36-41 (MIGRATIONS array pointing at scripts/setup/__migration_notifications_dates.sql and scripts/setup/__due_date_notifications.sql)`
- **Verification:** CONFIRMED — Confirmed via find/ls: scripts/run_migration.cjs:36,40 reference scripts/setup/__migration_notifications_dates.sql and scripts/setup/__due_date_notifications.sql, but scripts/setup/ contains only .cjs setup scripts — the actual SQL files live at db/__migration_notifications_dates.sql and db/__due_date_notifications.sql, so fs.readFileSync on line 52 would throw ENOENT on the first migration.

**Description.** The MIGRATIONS array in the repo's only migration-runner tool points at scripts/setup/__migration_notifications_dates.sql and scripts/setup/__due_date_notifications.sql. Verified with find: neither file exists under scripts/setup/. The actual files live at db/__migration_notifications_dates.sql and db/__due_date_notifications.sql. Running the script as committed throws fs.readFileSync ENOENT on the very first migration and exits before touching the database.

**Suggested fix.** Fix the hardcoded paths to point at db/, then actually run the script once end-to-end against a staging project. Better: adopt the Supabase CLI's supabase/migrations directory + `supabase db push`, which tracks applied migrations in a schema_migrations table instead of a bespoke script with hand-typed file lists.

---

#### 2. [CRITICAL] Production Supabase URL and anon key are hardcoded as literal fallback defaults in 9+ scripts, with no single source of truth for rotation

- **Dimension:** Dim 17: Operational Readiness
- **Location:** `scripts/clean_setup.mjs:16-18; scripts/fix_promotion_data.mjs:10-12; fix-assignments.cjs:11-13; __seed_30_users.cjs:18-20; __seed_test_data.cjs:18-20; scripts/setup/__create_15_users.cjs:12; scripts/setup/__create_users.cjs:4; scripts/setup/__full_setup.cjs:5; scripts/setup/__test_reviewer_flow.cjs:5; scripts/run_migration.cjs:16`
- **Verification:** CONFIRMED — Grep confirms hardcoded fallback literals for both the prod Supabase URL (fuoqoryqndtdooujslee) and the publishable/anon key (sb_publishable_1JTwEK8...) across 10 files (15 hits total; finding said 9/13 — close), with no shared config module, so the DRY/rotation-friction claim is accurate. However severity is overstated: src/api/supabase.ts shows this exact URL+publishable key pair is already the client-side key shipped in every browser bundle via VITE_-prefixed env vars, i.e. it is Supabase's intentionally-public anon key protected by RLS, not a secret — and grep found zero hardcoded service_role keys or PATs anywhere in the repo. This is a real maintainability/rotation-hygiene defect, not a critical secret-exposure vulnerability.

**Description.** Grep for the literal production project ref (fuoqoryqndtdooujslee) and the anon key (matching .env) across the repo returns 13 hits in 9 separate files, each hardcoding `process.env.VITE_SUPABASE_URL || 'https://fuoqoryqndtdooujslee.supabase.co'` (or an unconditional literal in fix-assignments.cjs:11). There is no shared config module — every script re-embeds its own copy of the prod credentials as a fallback.

**Suggested fix.** Delete all hardcoded fallbacks; require env vars and fail loudly if absent. Centralize Supabase client construction in one module all scripts import. Document a key-rotation runbook — currently impossible to execute safely since nobody can enumerate every place the key lives without a repo-wide grep.

---

#### 3. [HIGH] No admin override exists for a worksheet stuck in needs_revision — not even the assigned buddy, manager, or admin can act on it

- **Dimension:** Dim 17: Operational Readiness
- **Location:** `src/pages/WorksheetReview.tsx:50-51,259 (`canApprove = isBuddy`; `isReadOnly = isOnboardingLead || (isManager && submission?.review_status !== 'buddy_approved')`; `canBuddyAct = canApprove && isPending`, and isPending excludes needs_revision)`
- **Verification:** CONFIRMED — Verified in src/pages/WorksheetReview.tsx: isPending (line 256) covers only pending_review|revision_submitted, so canBuddyAct (259) and the buddy action block (371-404) are hidden once status is needs_revision; managers are read-only unless already buddy_approved (51) and PhaseReview.tsx's canApprove (173) requires isAllBuddyApproved, so a needs_revision item blocks phase approval too; AdminDashboard.tsx only reads/aggregates review_status, never updates it; the only two .update() calls on worksheet_submissions in the whole src tree are WorksheetReview.tsx:102/170 (buddy approve/revision), and useAutoSave.ts shows the joinee's own resubmission is what flips needs_revision->revision_submitted. db/schema.sql:207-216 shows academic_head *does* have RLS UPDATE rights on worksheet_submissions, confirming a DB-level override is possible but no UI path exists for it — so this is a real product gap, not a misread.

**Description.** Once review_status is 'needs_revision', isPending (pending_review | revision_submitted) is false, so canBuddyAct is false and the entire 'Buddy Review Decision' action block is hidden (lines 371-404 only render if canBuddyAct). Managers are read-only unless already buddy_approved; onboarding_lead is always read-only. The only actor who can move a needs_revision item forward is the joinee resubmitting. If the joinee is unresponsive or the requesting buddy has left, the item is permanently stuck with zero UI path for any reviewer/admin to force it back to pending or approve it directly — the only recourse is an undocumented manual SQL UPDATE against production.

**Suggested fix.** Add an explicit admin/manager override action gated to academic_head/admin that can transition a needs_revision item back to pending_review or to approved, writing a review_history entry recording it as an administrative override (who/when/why).

---

#### 4. [HIGH] No mechanism to deactivate/offboard a user whose buddy or manager has left the company

- **Dimension:** Dim 17: Operational Readiness
- **Location:** `src/pages/AdminDashboard.tsx; src/components/admin/AssignmentsTab.tsx — grep for deactivate/suspend/disable/is_active/archived across src returns zero matches`
- **Verification:** CONFIRMED — Verified: AssignmentsTab.tsx (full file read) confirms buddyCandidates at line 30 filters only by i.id !== selectedInstructor with no active/status check, and the assign-manager/assign-buddy handlers (lines 73-102) only write assigned_lead_id/assigned_buddy_id; grep across all db/*.sql schema files shows no is_active/status/deactivate/archived column on user_profiles anywhere, so a departed buddy/manager remains selectable and retains full access with no offboarding path — HIGH severity is appropriate given it's a real security/data-integrity gap, though 'reviewer permissions indefinitely' framing slightly overstates since actual login revocation is a Supabase auth-layer concern outside this app's control, not something this app broke.

**Description.** AssignmentsTab.tsx only lets an admin reassign assigned_buddy_id/assigned_lead_id to a different active user going forward (lines 73-102). There is no UI, hook, or DB column anywhere in src to mark a departed employee's account inactive, revoke their login, or exclude them from buddy/manager selection dropdowns (buddyCandidates at line 30 filters only by `i.id !== selectedInstructor`, not by any active flag). A buddy who has left the company keeps a fully functional login and reviewer permissions indefinitely, and can still be mistakenly selected as a buddy for a new joinee.

**Suggested fix.** Add an is_active/status column to user_profiles, an admin action to deactivate a user (blocking their session/role checks and filtering them from assignment dropdowns), and a documented offboarding runbook step.

---

#### 5. [HIGH] No schema migration framework — db/ is 16 loose, unordered SQL files with no version tracking, and no supabase/migrations project exists

- **Dimension:** Dim 17: Operational Readiness
- **Location:** `db/ (schema.sql, supabase_schema.sql, setup_correct.sql, supabase_role_migration.sql, supabase_reviewer_migration.sql, __fix_rls_jwt.sql, __fix_rls_recursion.sql, __fix_review_columns.sql, __migration_notifications_dates.sql, __due_date_notifications.sql, __setup_supabase.sql, __cleanup_test_users.sql, __setup_test_data.sql, create_32_users.sql, seed_worksheets.sql, seed_ftp_worksheets.sql); confirmed absence of supabase/config.toml or supabase/migrations via find`
- **Verification:** CONFIRMED — Verified: db/ contains exactly the 16 files listed, no supabase/config.toml or supabase/migrations/ exist anywhere (confirmed via find), and db/schema.sql lines 5-16 literally claim to be the 'ONE FILE... incorporates all migrations' listing the other files by name with no enforcement mechanism; additionally there's an unmentioned 17th loose file at repo root (supabase_migration_add_buddy_approved.sql), so the finding if anything understates the sprawl.

**Description.** There is no Supabase CLI project, no migrations table, no numbered/timestamped migration files, and no up/down pairing. db/schema.sql claims at lines 5-8 to be 'the ONE FILE you need to run. It incorporates all migrations,' but that claim is unverifiable — nothing enforces that schema.sql is actually a superset of the loose __fix_*.sql files sitting alongside it, which read as one-off hotfixes applied by hand with no record of when or against which environment. There is no way to determine, looking at this repo today, which of the 16 SQL files have actually been run against the live production database.

**Suggested fix.** Migrate to the Supabase CLI migrations workflow (`supabase migration new`, `supabase db push`), which timestamps and tracks applied migrations. Retire or clearly archive the ad hoc __fix_*.sql/setup_*.sql files once folded into tracked migrations.

---

#### 6. [HIGH] No CI/CD pipeline exists at all — nothing gates deploys on tests passing, and the documented rollback strategy depends on a pipeline that doesn't exist

- **Dimension:** Dim 17: Operational Readiness
- **Location:** `repo root — no .github/workflows directory (confirmed via ls, No such file or directory) and no .yml/.yaml files anywhere; scripts/pre-commit.sh:41-74 (always exits 0, never runs tests/build); context.md:1636-1640 ('Rollback Strategy: Deploy previous build from CI/CD pipeline')`
- **Verification:** CONFIRMED — Verified directly: no .github directory, zero .yml/.yaml files repo-wide; scripts/pre-commit.sh (read in full) never invokes npm test/build/lint and exits 0 on every branch including the CLI-missing, token-expired, and fallback-error paths; context.md:1636-1640 verbatim states 'Deploy previous build from CI/CD pipeline' as the rollback strategy despite no pipeline existing. All cited evidence matches exactly.

**Description.** There is no CI configuration anywhere in the repo. The only pre-commit gate, scripts/pre-commit.sh, is not installed by default (must be manually copied into .git/hooks/pre-commit), removes itself if the external 'CodeRabbit' CLI isn't installed or its token expires (lines 22-27, 49-55), and on every other error path 'proceeds with commit' (line 73-74) — it never runs npm test, npm run build, or lint. context.md's own documented rollback strategy says 'Deploy previous build from CI/CD pipeline,' which is not achievable because no such pipeline exists.

**Suggested fix.** Add a CI workflow that runs npm test and npm run build on every PR and blocks merge on failure, plus a deploy workflow that can redeploy a prior build/commit to fulfil the documented rollback strategy.

---

#### 7. [MEDIUM] Migration runner naively splits SQL on `;\n`, which will shred any dollar-quoted PL/pgSQL function body — including the one migration it ships

- **Dimension:** Dim 17: Operational Readiness
- **Location:** `scripts/run_migration.cjs:54-58 (`sql.split(/;\s*\n/)`); db/__due_date_notifications.sql:16-112 (CREATE FUNCTION ... $$ ... $$ containing many internal `;` lines)`
- **Verification:** CONFIRMED — The splitting bug itself is real: run_migration.cjs (lines 54-58) splits on /;\s*\n/ and db/__due_date_notifications.sql:16-112 has a $$-quoted plpgsql body with ~15 internal ';\n' lines that would indeed be shredded. BUT the finding overstates severity/impact: (a) the script's MIGRATIONS array (lines 36-42) still points at 'scripts/setup/__due_date_notifications.sql' and 'scripts/setup/__migration_notifications_dates.sql', paths that no longer exist — commit ca0326e moved these SQL files to db/ without updating run_migration.cjs. As currently wired, `node scripts/run_migration.cjs` throws ENOENT on fs.readFileSync and dies at the top-level catch (line 132-135) before ever reaching the split/POST logic, so the described 'silent partial corruption' scenario is not currently reachable. (b) Even if paths were fixed, the malformed fragments (unmatched $$, incomplete statements) would almost certainly return Postgres syntax errors on each POST — logged loudly as failures (lines 88-89, 101-104) rather than silently succeeding — so 'half-applied CREATE FUNCTION left inconsistent with zero rollback' is speculative, not demonstrated. (c) This is a manually-invoked dev/admin script (requires SUPABASE_PAT env var, not part of CI/build), not a runtime code path. Downgrading from CRITICAL to MEDIUM: real logic defect worth fixing, but not an active, currently-triggerable data-corruption risk.

**Description.** run_migration.cjs splits each migration file into 'statements' using a bare regex on semicolon+newline, with no awareness of $$ dollar-quoting. db/__due_date_notifications.sql defines check_due_date_notifications() as a single CREATE OR REPLACE FUNCTION whose plpgsql body contains ~15 internal semicolon-terminated lines. Splitting on every `;\n` turns this one CREATE FUNCTION statement into a dozen syntactically invalid fragments, each POSTed individually to the Supabase Management API. The script has no transaction wrapping and explicitly 'continues with next migration' on partial failure (line 104), so a half-applied CREATE FUNCTION could leave the database inconsistent with zero rollback.

**Suggested fix.** Never hand-split SQL files with a semicolon regex; send the whole file body as one query, or use a migration runner (psql / Supabase CLI) that understands dollar-quoting and wraps each migration in a transaction.

---

#### 8. [MEDIUM] clean_setup.mjs unconditionally deletes ALL worksheet_submissions, with no confirmation, dry-run, or environment guard, and defaults to the production database

- **Dimension:** Dim 17: Operational Readiness
- **Location:** `scripts/clean_setup.mjs:16-18 (prod fallback URL/key), 41-44 (`.delete().neq('user_id', '00000000-0000-0000-0000-000000000000')` — deletes all rows)`
- **Verification:** CONFIRMED — Confirmed verbatim: lines 16-18 fallback to hardcoded URL/publishable key when env vars are unset, and lines 41-44 do `.delete().neq('user_id', '00000000-...')` with an explicit `// delete all` comment, and the file has zero confirmation prompt, --yes flag, dry-run, or env guard (checked all 132 lines). However the CRITICAL framing overstates real impact: this script uses only the VITE_SUPABASE_PUBLISHABLE_KEY (anon key), never a service-role key, and every schema file in db/ (schema.sql:173, supabase_schema.sql:111, plus __fix_rls_jwt.sql/__fix_rls_recursion.sql) enables RLS on worksheet_submissions with only SELECT/INSERT/UPDATE policies — no `FOR DELETE` policy exists anywhere in the repo. With RLS enabled and no DELETE policy, Postgres denies the delete for the anon key by default (0 rows affected), which is exactly what the script's own comment anticipates ('This is expected with RLS — we'll continue with creating users'). So as currently configured this cannot silently wipe every real user's production rows; it's a fragile latent risk (would become truly critical if a permissive delete policy were ever added, or if someone swapped in a service-role key) rather than an active data-loss bug today. Downgrading from CRITICAL to MEDIUM — the missing guardrails/hardcoded-credential-fallback code smells are real and worth fixing, but the 'silently wipes all worksheet submissions for every real user in production' claim is not supported by the current RLS configuration.

**Description.** clean_setup.mjs performs a delete filtered by `neq('user_id', <placeholder-uuid-that-never-exists>)`, which matches and deletes every row in worksheet_submissions. It requires no confirmation prompt, no --yes flag, no dry-run mode, and no environment check. Because SUPABASE_URL/KEY default to the hardcoded production values when env vars aren't exported (see prior finding), any engineer who runs `node scripts/clean_setup.mjs` without first sourcing a local .env silently wipes all worksheet submissions for every real user in production, with no backup taken by the tool.

**Suggested fix.** Require an explicit --env=prod flag plus typed confirmation before any destructive operation; never fall back to real credentials by default; add a dry-run mode that only counts/prints what would be deleted.

---

#### 9. [MEDIUM] No admin path to revert an incorrect auto-promotion (role change) — the only code that ever sets role='lead_instructor' has no undo

- **Dimension:** Dim 17: Operational Readiness
- **Location:** `src/hooks/useAutoPromote.ts:61-64 (sole place `role` is ever mutated); grep of src for `update({ role` returns only this one hit`
- **Verification:** CONFIRMED — grep confirms `update({ role` occurs only once in src (useAutoPromote.ts:63), promoting to lead_instructor; AdminDashboard/AssignmentsTab only read/filter by role for assignment dropdowns, never mutate it, so there is genuinely no code path to revert an auto-promotion.

**Description.** checkAndPromote() unconditionally promotes a user_profiles row to role: 'lead_instructor' once all 20 worksheets read as 'approved', and also updates Supabase auth user metadata. No other code path ever writes to the role column — there is no admin UI to demote/revert a role. If checkAndPromote fires incorrectly (e.g. a race between two managers approving phases and independently calling checkAndPromote), the only way to reverse a wrong promotion is an unaudited manual UPDATE against production, with no equivalent fix path for the already-changed auth metadata.

**Suggested fix.** Add an admin-only 'Change role' control in AdminDashboard with confirmation and audit logging, and guard checkAndPromote against concurrent double-invocation so promotions can't misfire.

---

#### 10. [MEDIUM] Zero error/observability tooling — production errors are invisible to operators

- **Dimension:** Dim 17: Operational Readiness
- **Location:** `package.json:16-46 (no Sentry/LogRocket/Datadog/any error-reporting dependency); src/components/ErrorBoundary.tsx:26-28 (`componentDidCatch` only does console.error)`
- **Verification:** CONFIRMED — Verified: package.json (dependencies/devDependencies) has no Sentry/LogRocket/Datadog/APM package, and ErrorBoundary.tsx:26-28 componentDidCatch only does console.error(error, errorInfo) with no reporting call; grep for monitoring/alerting/healthcheck/uptime only hits UI copy — finding is accurate. However this is a small internal onboarding/training tool (~32 seeded test users per db/create_32_users.sql, context.md), not a high-traffic production SaaS, so the 'no on-call/paging' framing is overstated for its actual scale — downgrading from HIGH to MEDIUM; adding a lightweight client error reporter (e.g. Sentry free tier) is still a reasonable, low-cost improvement.

**Description.** package.json's full dependency list contains no error-tracking or APM library. The app's ErrorBoundary — the only structured place that catches render-time exceptions — does nothing but console.error(error, errorInfo), visible only if a user personally opens devtools and reports it. There is no health-check endpoint, no uptime monitor, no alerting configuration anywhere (grep for Sentry/LogRocket/Datadog/monitoring/alerting/healthcheck/uptime returns only UI copy false-positives like 'Read-only monitoring view'). There is effectively no on-call/incident-response capability: nobody is paged, nothing is dashboarded, and the only detection mechanism is a user complaint.

**Suggested fix.** Wire in a client-side error reporting SDK in ErrorBoundary.componentDidCatch and Supabase client error paths, add a synthetic uptime check against the deployed URL, and define an on-call/paging story.

---

#### 11. [MEDIUM] Existing 'admin fix' scripts are one-off hacks hardcoded to specific named QA fixture accounts, not reusable recovery tooling

- **Dimension:** Dim 17: Operational Readiness
- **Location:** `fix-assignments.cjs:54-58,73 (hardcoded emails arjun.qa@newton.edu, neha.qa@newton.edu, priya.qa@newton.edu, sneha.qa@newton.edu, vikram.qa@newton.edu); scripts/fix_promotion_data.mjs:18,29-30 (hardcoded PHASE1_IDS and login `email: 'arjun.qa@newton.edu', password: 'Test123!'`)`
- **Verification:** not-required

**Description.** Both scripts that superficially look like admin recovery tools are one-off scripts written to fix one specific test dataset: fix-assignments.cjs hardcodes five specific QA email addresses; fix_promotion_data.mjs hardcodes a specific user's email/plaintext password and a fixed worksheet-ID list to bulk-approve. Neither takes a user id/email as a parameter, so reusing either for a real incident requires hand-editing source under time pressure — high risk of touching the wrong row, with no confirmation step.

**Suggested fix.** Turn these into parametrized CLI tools (e.g. --joinee=<id> --buddy=<id>) with confirmation prompts and audit logging, or build the equivalent actions into the AdminDashboard UI as documented, auditable actions.

---

#### 12. [MEDIUM] run_migration.cjs requires a broadly-scoped Supabase Personal Access Token with no lifecycle guidance

- **Dimension:** Dim 17: Operational Readiness
- **Location:** `scripts/run_migration.cjs:8-14 ('Usage: SUPABASE_PAT=<token> node scripts/run_migration.cjs ... The token needs scope: "Database" or "All"')`
- **Verification:** not-required

**Description.** The migration runner requires an account-level Supabase Personal Access Token scoped to 'Database' or 'All' — far more powerful than the per-project anon key, capable of running arbitrary SQL against any project the token owner can access via the Management API. The usage comment instructs passing it inline on the command line, which lands the token in shell history by default. There is no guidance on token expiry, storage, or revocation.

**Suggested fix.** Document short-lived, minimally-scoped PATs, discourage inline env-var-on-command-line usage, and note that the PAT should be revoked immediately after each migration run.

---

#### 13. [LOW] No runbook, on-call doc, incident-response doc, or documented SLOs anywhere in the repo

- **Dimension:** Dim 17: Operational Readiness
- **Location:** `repo root/docs — README.md is the unmodified Vite template (verified: only discusses @vitejs/plugin-react and generic ESLint config, zero project content); grep for runbook/on-call/incident/SLO/escalat/rollback/rotate across all *.md and context.md returns only context.md:1639 ('Database rollback: restore from Supabase backup')`
- **Verification:** CONFIRMED — Verified: README.md is unmodified Vite boilerplate, no RUNBOOK/ON-CALL/INCIDENT files exist anywhere in repo, and grep confirms the only rollback content is context.md:1636-1639 ('Deploy previous build from CI/CD... Database rollback: restore from Supabase backup... Feature flag toggles: not implemented') with no RPO/RTO/PITR/authorization detail — claim is factually accurate. However this is a small internal school onboarding portal (single Vite/React/Supabase app, solo-dev-scale project per package.json and context.md), not a paged production service with formal SLOs/on-call rotations, so treating absence of a RUNBOOK.md as HIGH severity is overrated; it's a legitimate but low-stakes documentation gap, especially since context.md already contains a Deployment/Rollback/Known-Issues section covering most of the same ground informally.

**Description.** There is no RUNBOOK.md, ON-CALL.md, or INCIDENT.md describing incident response, who is on-call, SLOs/SLAs, or how to execute the one rollback line that exists ('restore from Supabase backup' — no instructions on invoking PITR, expected RPO/RTO, or who is authorized). The closest thing to operational documentation is context.md, a 100KB unindexed dump mixing architecture notes and a candid 'Known Issues' list, not written for or discoverable by a support engineer resolving a live issue.

**Suggested fix.** Write a short RUNBOOK.md covering the recurring support scenarios (stuck needs_revision, buddy departure, wrong promotion, key rotation), how to invoke a Supabase backup restore with expected RPO/RTO, and an on-call escalation path. Link it from README.md.

---

#### 14. [LOW] pg_cron-based due-date notification job has no automated verification that it's still scheduled/running

- **Dimension:** Dim 17: Operational Readiness
- **Location:** `db/__due_date_notifications.sql:114-137 (cron.schedule call is commented out, meant to be manually run once; verification is a doc comment `SELECT * FROM cron.job`, not automated)`
- **Verification:** not-required

**Description.** The due_soon/overdue notification pipeline depends on manually enabling pg_cron and manually running the commented-out cron.schedule(...) call once via the SQL editor. There is no automated check anywhere that confirms the cron job still exists and is firing (e.g. after a database restore or project migration) — the verification steps are just comment text for a human to run manually if they think to.

**Suggested fix.** Add a lightweight scheduled health indicator (e.g. an admin-dashboard 'last notification run' timestamp) that surfaces when the cron job has silently stopped firing.

---

## Dim 18: UI/UX & Accessibility — 42/100

> The app has real visual polish (a coherent theme-token system in theme.js/index.css, consistent focus-visible outlines, prefers-reduced-motion support, loading skeletons, a sign-out confirmation step, and a couple of correctly keyboard-accessible custom controls that prove the team knows the right pattern). But underneath that polish are several systemic, high-volume defects: ~151 of 158 worksheet form fields have visually-present but programmatically unassociated labels; the toast/status system has zero ARIA live-region support so assistive-tech users get no feedback on any action; four gate-artifact checklist pages are entirely keyboard-inoperable in a phase-blocking flow; and nearly every core dashboard's data-fetch error handling silently degrades to a misleading empty/zero state instead of surfacing an error. Combined with a hard color-contrast failure on the brand gold accent (used as text in 40+ places), no dark-mode support, and a couple of responsive/overflow and silent-redirect gaps, this is not production-ready for a company-wide launch without an accessibility and error-handling remediation pass.</summary>
</StructuredOutput>



#### 1. [HIGH] Toast/status system has no ARIA live region — screen readers never announce success, error, or save-status messages

- **Dimension:** Dim 18: UI/UX & Accessibility
- **Location:** `src/components/Toast.tsx:104-136 (toast container div), src/config/worksheetComponents.tsx:153-177 (SaveIndicator)`
- **Verification:** CONFIRMED — Verified both citations: Toast.tsx:104 container div has no role/aria-live attribute, and worksheetComponents.tsx:166-167 SaveIndicator span also lacks it; repo-wide grep for aria-live/role=status/role=alert returns zero matches, confirming no live region exists anywhere to compensate.

**Description.** The ToastProvider renders its toast list in a plain `<div>` with no `role="status"`/`role="alert"` and no `aria-live` attribute anywhere in the component. Every user-facing confirmation in the app (worksheet approved, revision requested, buddy/manager assignment saved, auto-save failed, phase promoted) is delivered exclusively through this visual toast. The autosave `SaveIndicator` (worksheetComponents.tsx:153) that shows 'Saving…/Saved/Failed' is also a plain `<span>` with no live-region semantics.

**Impact / failure scenario.** A screen-reader user gets zero feedback that their action succeeded, failed, or that unsaved work just failed to save — for a workflow whose entire point is submitting worksheets for review, this is a critical usability gap for assistive-tech users and fails WCAG 2.1 SC 4.1.3 (Status Messages).

**Steps to reproduce.** Navigate any worksheet with a screen reader (VoiceOver/NVDA) enabled, submit a form or trigger an auto-save failure (e.g. go offline mid-edit). Toast appears visually but nothing is announced.

**Suggested fix.** Add `role="status" aria-live="polite"` (and `aria-live="assertive"` for error-type toasts) to the toast container in Toast.tsx:104, and `aria-live="polite"` to the SaveIndicator wrapper in worksheetComponents.tsx:166.

---

#### 2. [HIGH] 151 of 158 worksheet form fields render a visible label that is not programmatically associated with its input

- **Dimension:** Dim 18: UI/UX & Accessibility
- **Location:** `src/config/worksheetComponents.tsx:131-141 (FieldGroup) — reproduced across ~25 files in src/pages/worksheets/, e.g. src/pages/worksheets/ftp/W1O1.tsx:33-35, W3E1.tsx:18-19, W2D2.tsx:23-24, W4D2.tsx:19,27`
- **Verification:** CONFIRMED — Verified directly: FieldGroup (src/config/worksheetComponents.tsx:131-141) renders label htmlFor={id||undefined} but never clones/injects id onto children; FieldGroupProps.id is optional and grep confirms only 7/158 <FieldGroup label=...> call sites pass id (and those 7, e.g. Phase1Worksheet1.tsx:34-35, require the developer to manually duplicate the same id onto the child <input> for it to work). Cited example W1O1.tsx:33-34 confirmed to have no id on FieldGroup or the input, so label and input are not programmatically associated.

**Description.** `FieldGroup` renders `<label htmlFor={id || undefined}>{label}</label>{children}`, but does not clone/inject the `id` onto its child `<input>`. Grepping the codebase: `<FieldGroup label=` appears 158 times across worksheet pages, but only 7 of those call sites also pass an `id` prop (verified via grep). In every other case (`<FieldGroup label="Your Name" required><input className="lux-input" .../></FieldGroup>`), the rendered `<label>` has `htmlFor={undefined}` and the `<input>` has no `id`, so there is no programmatic label/control relationship.

**Impact / failure scenario.** Screen-reader users hear only 'edit text' with no field name for the vast majority of worksheet inputs across the app's core data-entry surface; sighted mouse users lose the standard 'click label to focus field' affordance. This is a WCAG 1.3.1 / 3.3.2 failure at scale, not an isolated bug.

**Steps to reproduce.** Open any FTP worksheet (e.g. /week-1/worksheet/w1_o1) with a screen reader and Tab to the 'Your Name' field, or click directly on the label text — focus does not move to the input and the label is not announced with the field.

**Suggested fix.** Generate a stable id in `FieldGroup` (e.g. from a slugified `label` or a required `id` prop) and use `React.cloneElement` to inject `id`/`aria-labelledby` onto the single child input, or require every call site to pass an explicit id (enforce via TypeScript by making `id` required).

---

#### 3. [HIGH] Gate-artifact checklist toggles are keyboard-inaccessible, blocking phase-gate completion for keyboard-only users

- **Dimension:** Dim 18: UI/UX & Accessibility
- **Location:** `src/pages/gate-controls/GateArtifact1.tsx:71, GateArtifact2.tsx:71, GateArtifact3.tsx:50, GateArtifact4.tsx:53`
- **Verification:** CONFIRMED — Verified directly: GateArtifact1.tsx:71, GateArtifact2.tsx:71, GateArtifact3.tsx:50, GateArtifact4.tsx:53 are all bare div onClick toggles with no role/tabIndex/onKeyDown, while GateControl1-3.tsx and PhaseWorksheetList.tsx (cited comparisons) correctly implement role=button, tabIndex={0}, onKeyDown, and aria-label at the exact lines claimed; W1O1.tsx correctly uses a native checkbox as claimed for the fix suggestion. Since allRequiredMet (used to gate the Submit button) depends on these unreachable controls, keyboard-only users genuinely cannot complete the gate.

**Description.** The 'Required Artifacts' checklist items are `<div key={i} onClick={...}>` with no `role="button"`/`role="checkbox"`, no `tabIndex`, and no `onKeyDown` handler. This is the exact same interaction pattern implemented correctly (role, tabIndex, onKeyDown, aria-label) in the sibling files GateControl1.tsx:118-122, GateControl2.tsx:122-126, GateControl3.tsx:147-151/174-178, and in PhaseWorksheetList.tsx:44-47 — confirming the team knows the correct pattern but didn't apply it consistently to GateArtifact1-4.

**Impact / failure scenario.** A keyboard-only or switch-device user cannot confirm required gate artifacts, meaning they cannot complete a gate that blocks progression to the next onboarding phase — a core, phase-blocking flow becomes literally impossible to complete without a mouse.

**Steps to reproduce.** Tab through a Gate Artifact worksheet (e.g. the artifact-confirmation page for Phase 1 gate) using only the keyboard. Focus never lands on the artifact checklist rows — they are unreachable and cannot be toggled.

**Suggested fix.** Apply the same `role="button" tabIndex={0} onKeyDown={e => { if (e.key==='Enter'||e.key===' ') {...} }}` pattern already used in GateControl1-3.tsx to the four GateArtifact*.tsx files, or better, replace the custom div with a native `<label><input type="checkbox" .../></label>` as already correctly done in the FTP worksheet checkboxes (e.g. W1O1.tsx:44-49).

---

#### 4. [MEDIUM] Data-fetch failures are silently swallowed on every core dashboard page, producing a misleading '0 progress / empty' state instead of an error

- **Dimension:** Dim 18: UI/UX & Accessibility
- **Location:** `src/pages/Dashboard.tsx:52-65, src/pages/AdminDashboard.tsx:70-101, src/pages/OnboardingLeadDashboard.tsx:58-61, src/pages/BuddyDashboard.tsx:74-77, src/pages/PhaseReview.tsx:69-72, src/pages/Phase1.tsx:138-141`
- **Verification:** CONFIRMED — Verified all six cited files (Dashboard.tsx:52-65, AdminDashboard.tsx:70-101, OnboardingLeadDashboard.tsx:45-62, BuddyDashboard.tsx:60-79, PhaseReview.tsx:60-74, Phase1.tsx:126-143) — each catch block does only console.error, never notifyError or an error state, then falls through to the normal empty/zero-progress UI; confirmed notifyError is an established, actually-used pattern elsewhere (AuthContext.tsx, useAutoSave.ts:165) that these loaders inexplicably skip. Downgraded from HIGH to MEDIUM: this requires a genuine backend/network failure (not a routine user path) to manifest, and console.error still surfaces the failure to anyone checking devtools/logs, so it's a real UX/observability gap rather than a correctness-breaking or data-loss bug.

**Description.** Every one of these `loadX()` functions wraps its Supabase call in `try { ... } catch (err) { console.error(...) } finally { setLoading(false) }` with no `setError(...)`/no call to the app's own toast system (`notifyError` from src/utils/errorHandling.ts, which IS used elsewhere e.g. useAutoSave.ts:165). When the fetch throws (network blip, RLS misconfiguration, timeout), state arrays stay at their initial empty value and `loading` flips to false, so the UI renders the normal empty/zero-progress view — which is visually identical to a genuinely new user with no submissions.

**Impact / failure scenario.** A new hire or manager who hits a transient network/RLS error will believe their submitted work has disappeared or that a colleague has done nothing, when the real problem is an unreported fetch failure. This is especially dangerous on Dashboard.tsx, the page every user lands on after login.

**Steps to reproduce.** Simulate a network failure or Supabase error while loading Dashboard.tsx (e.g. throttle network to fail the request). The page silently renders '0%' progress / 'Not Started' on every phase with no error banner, indistinguishable from a brand-new account.

**Suggested fix.** Add an `error` state to each of these loaders, call the existing `notifyError()` helper (already wired to the global toast) in the catch block, and render a distinct 'Failed to load — Retry' state instead of falling through to the empty-state UI.

---

#### 5. [MEDIUM] PhaseAccessGuard has no error handling on its access-check query — a failed request hangs the page on 'Loading…' forever

- **Dimension:** Dim 18: UI/UX & Accessibility
- **Location:** `src/components/PhaseAccessGuard.tsx:60-70`
- **Verification:** not-required

**Description.** `setChecking(true)` is followed by `supabase.from(...).select(...).then(({ data }) => { ...; setChecking(false); })` with no `.catch()`. `setChecking(false)` only runs inside the `.then` success callback. If the underlying fetch/promise rejects (offline, network error), `checking` never becomes false.

**Impact / failure scenario.** A transient network hiccup permanently strands the user on a blank loading screen for Phase 2/3 content with no way forward except guessing to hard-refresh — a dead end in a core, phase-gated flow.

**Steps to reproduce.** Go offline (or throttle to failure) right as you navigate to a Phase 2/3 route or any Phase-2+ worksheet route (these are wrapped in `<PhaseAccessGuard>` per App.tsx:93-95). The page is stuck showing 'Loading…' (PhaseAccessGuard.tsx:76-84) indefinitely with no retry affordance.

**Suggested fix.** Add `.catch(err => { console.error(err); setChecking(false); setLoadError(true); })` and render an explicit error/retry state distinct from both 'loading' and 'locked'.

---

#### 6. [MEDIUM] Gold accent color used as text fails WCAG AA contrast; warning-orange text also fails normal-text AA

- **Dimension:** Dim 18: UI/UX & Accessibility
- **Location:** `src/styles/index.css:13 (--color-gold: #D4AF37) and src/config/theme.js:10 (t.gd); 40 call sites across 22 files using `color: t.gd`, e.g. src/pages/Dashboard.tsx:187,246,335 and src/pages/AdminDashboard.tsx:334; warning color src/styles/index.css:17 (--color-warning: #E65100) used as toast text color in src/components/Toast.tsx:50`
- **Verification:** not-required

**Description.** Computed per WCAG relative-luminance formula: gold `#D4AF37` on the app's `--color-alabaster` background (`#F9F8F6`) yields a contrast ratio of ≈1.98:1 — far below the 4.5:1 minimum for normal text and even below the 3:1 minimum for large text (used both in small nav/badge text at 0.55-0.8rem AND in large italic headline spans at Dashboard.tsx:187/246). Warning orange `#E65100` on the same background yields ≈3.57:1, which fails the 4.5:1 requirement for the normal-size toast text it is used for in Toast.tsx:50.

**Impact / failure scenario.** Low-vision users and anyone in bright ambient light will struggle to read gold-colored headings, badges, and nav highlights, and warning toasts — a widespread, systemic contrast failure rather than an isolated instance (40 call sites).

**Steps to reproduce.** Run any contrast checker (e.g. axe DevTools) on the Dashboard hero 'Onboarding'/'Roadmap' gold-italic text, or the 'Pending' status text/badges that use `t.gd`, or a warning-type toast.

**Suggested fix.** Darken the gold token for text usage (e.g. a ~#8A6D1F variant that still reads as 'gold' but hits ≥4.5:1) and keep #D4AF37 only for borders/backgrounds/icons where contrast rules don't apply; similarly darken the warning token or restrict it to bold/large text only.

---

#### 7. [MEDIUM] No dark mode support anywhere in the app

- **Dimension:** Dim 18: UI/UX & Accessibility
- **Location:** `src/styles/index.css (entire file — single `@theme` block with hardcoded light-palette hex values, no `@media (prefers-color-scheme: dark)` block anywhere)`
- **Verification:** not-required

**Description.** Grepping the stylesheet confirms all colors (`--color-alabaster: #F9F8F6`, `--color-charcoal: #1A1A1A`, etc.) are hardcoded once with no dark-mode override block. `body` background/color are fixed to the light palette (index.css:51-60).

**Impact / failure scenario.** Users who rely on dark mode for light sensitivity, OLED battery life, or simple preference get no accommodation; for a 2026-era production app this is a noticeable, commonly-expected gap, though not a functional blocker.

**Steps to reproduce.** Enable OS-level dark mode and load the app — it renders identically (bright cream/white background) regardless of system preference.

**Suggested fix.** Add a `@media (prefers-color-scheme: dark)` override block (or a `data-theme` toggle) remapping the `--color-*` custom properties to a dark palette, reusing the existing token architecture.

---

#### 8. [MEDIUM] Notification dropdown has a fixed 360px width with no mobile clamp, overflowing small viewports

- **Dimension:** Dim 18: UI/UX & Accessibility
- **Location:** `src/components/NotificationBell.tsx:141-153 (dropdown panel, `width: '360px'`, `position: 'absolute', right: 0`); also rendered inside the mobile nav drawer at src/components/Navbar.tsx:318-321`
- **Verification:** not-required

**Description.** The notification dropdown panel is absolutely positioned with a hardcoded `width: '360px'` and no `maxWidth: '100vw'`/media-query clamp. It is rendered both in the desktop nav (≥850px, fine) and inside the mobile hamburger drawer (Navbar.tsx:318-321), where the surrounding drawer is only viewport-width minus 24px padding on each side.

**Impact / failure scenario.** Users on small phones cannot fully read or interact with notifications; content is clipped or requires horizontal scrolling, which the rest of the app (see 640px `phase-ws-row` media query in index.css:577-586) otherwise takes care to avoid.

**Steps to reproduce.** On a 320-375px-wide phone (iPhone SE/mini class devices), open the mobile menu and tap the bell icon — the 360px panel does not fit within the drawer and overflows the right/left edge of the screen.

**Suggested fix.** Use `width: min(360px, calc(100vw - 32px))` or a dedicated mobile layout (full-width sheet) for the dropdown when rendered inside the mobile drawer.

---

#### 9. [MEDIUM] Role-mismatched route access silently redirects to '/' with zero explanation

- **Dimension:** Dim 18: UI/UX & Accessibility
- **Location:** `src/components/ProtectedRoute.tsx:35-39`
- **Verification:** not-required

**Description.** When `requiredRoles` is set and the current user's role isn't included, the component returns `<Navigate to="/" replace />` with no toast, no query param, no message of any kind. Several pages (WorksheetReview.tsx:199-209, AdminDashboard.tsx:103-113) do render an 'Access Restricted' message for their own internal role checks, but those are effectively unreachable for most routes because `App.tsx` already wraps them in `<ProtectedRoute requiredRoles={...}>` (e.g. App.tsx:116-129), which redirects before the page's own message can ever render.

**Impact / failure scenario.** Users following a stale/misdirected link (common when links are shared across roles, e.g. a buddy forwards a `/buddy/review/...` link to the wrong person) get no explanation for why they landed back on the dashboard, and will assume the link/feature is broken.

**Steps to reproduce.** As a `new_joinee`, manually navigate to `/admin` or `/buddy`. The app silently bounces you to the dashboard with no message — indistinguishable from a broken link.

**Suggested fix.** Pass a reason via `Navigate` state (e.g. `state={{ deniedFrom: location.pathname }}`) and surface a toast ('You don't have access to that page') from a listener on the Dashboard, or render a shared 'Access Restricted' component instead of redirecting silently.

---

#### 10. [LOW] No Escape-key handling or focus management for the user-menu and notification dropdowns

- **Dimension:** Dim 18: UI/UX & Accessibility
- **Location:** `src/components/Navbar.tsx:49-58 (user menu — only a `mousedown` outside-click listener), src/components/NotificationBell.tsx (same pattern, no keydown listener anywhere in the file)`
- **Verification:** not-required

**Description.** Both dropdowns close only via an outside `mousedown` listener; neither listens for the `Escape` key, and neither returns focus to the triggering button on close.

**Impact / failure scenario.** Minor but real keyboard-navigation friction; violates the common expectation (and ARIA Authoring Practices guidance) that Escape dismisses transient menus/popovers.

**Steps to reproduce.** Open the user menu or notification bell with keyboard (Enter on the trigger), then press Escape — nothing happens; the menu stays open and there is no keyboard-only way to dismiss it short of Tabbing through/away.

**Suggested fix.** Add a `keydown` listener for `Escape` alongside the existing outside-click listener in both components, and move focus back to the trigger button on close.

---

#### 11. [LOW] Document title never updates per route; no skip-to-content link

- **Dimension:** Dim 18: UI/UX & Accessibility
- **Location:** `index.html:7 (static `<title>Faculty Onboarding · Newton School of Technology</title>`), src/App.tsx (no skip link before <Navbar/>)`
- **Verification:** not-required

**Description.** There is no `document.title` management anywhere in the codebase (grep for `document.title` returns 0 hits) — all ~40 routes share one static browser-tab title. There is also no 'skip to main content' link, so keyboard users must tab through the full nav (logo, notification bell, all nav links, user menu, mobile toggle) on every single page before reaching page content.

**Impact / failure scenario.** Screen-reader and multi-tab users lose a key orientation cue (tab title); keyboard users face repetitive navigation overhead on every route change. Low severity for a small internal tool but still a real, uncorrected gap.

**Steps to reproduce.** Navigate between Dashboard, Admin, and a worksheet review page — the browser tab title never changes. Tab from page load on any route — focus starts at the logo link and must pass through the entire nav before reaching page content.

**Suggested fix.** Add a small `useDocumentTitle(title)` hook called per page, and a visually-hidden 'Skip to content' link as the first focusable element in App.tsx pointing to the `<main>` element.

---

#### 12. [LOW] AssignmentsTab list rows lack flex-wrap, unlike the rest of the app's row patterns

- **Dimension:** Dim 18: UI/UX & Accessibility
- **Location:** `src/components/admin/AssignmentsTab.tsx:118 and :137 (row divs with `display: 'flex', alignItems: 'center', gap: '12px'` and no `flexWrap`)`
- **Verification:** not-required

**Description.** Nearly every other list-row pattern in the codebase (e.g. PhaseWorksheetList.tsx, AdminDashboard.tsx:279 instructor rows, Navbar mobile items) explicitly sets `flexWrap: 'wrap'` for narrow-viewport safety. The 'Current Assignments' and 'Unassigned' rows in AssignmentsTab.tsx do not, and combine a name pill (`minWidth: '120px'`) with two more badge spans on one un-wrapping flex line.

**Impact / failure scenario.** On mobile/narrow admin usage, assignment rows can overflow horizontally instead of stacking, inconsistent with the rest of the app's careful `flexWrap` usage elsewhere.

**Steps to reproduce.** Open the Admin Dashboard → Assignments tab on a narrow viewport (or with long instructor names/emails) — the row content can exceed the container width without wrapping.

**Suggested fix.** Add `flexWrap: 'wrap'` to the row style objects at AssignmentsTab.tsx:118 and :137, matching the pattern used elsewhere in the codebase.

---

## Dim 19: Auth Flow Deep-Dive — 12/100

> The auth flow has a working happy path (email/password + Google OAuth, session persistence via supabase-js defaults, loading-gated ProtectedRoute) but the authorization model underneath it is fundamentally broken: every RLS policy that decides who is an admin/reviewer trusts auth.jwt() -> user_metadata ->> role, and user_metadata is fully client-writable via supabase.auth.signUp()/updateUser() — meaning any signed-up user can grant themselves academic_head/onboarding_lead/lead_instructor privileges with one JS call, no exploit chain required. Combined with a completely absent password-reset flow, a role-sync bug in auto-promotion, an optimistic/unsafe logout, and a fragile OAuth callback race, this is not launchable for a real company's employee data.

#### 1. [CRITICAL] Client-controlled JWT user_metadata.role is trusted by all RLS authorization checks — trivial admin privilege escalation

- **Dimension:** Dim 19: Auth Flow Deep-Dive
- **Location:** `src/context/AuthContext.tsx:169-176,188 (signUp writes role into auth options.data and into user_profiles.insert); src/hooks/useAutoPromote.ts:69-71 (updateUser writes role into own metadata); db/schema.sql:68-80,111,193-216; db/setup_correct.sql:29-95; db/__fix_rls_jwt.sql:25-89 (RLS policies all gate on auth.jwt() -> 'user_metadata' ->> 'role')`
- **Verification:** CONFIRMED — Verified directly: src/api/supabase.ts uses the public anon key client-side; AuthContext.tsx:174 passes client-supplied role into signUp's options.data (user_metadata), AuthContext.tsx:188 inserts that same client role into user_profiles with no WITH CHECK on role (schema.sql:59-60 only checks id=auth.uid()); useAutoPromote.ts:69-71 calls auth.updateUser({data:{role}}) which anyone can call arbitrarily from the browser; and every privileged RLS policy (schema.sql:68-80,111,193,209; setup_correct.sql:32,39,65,81,95) gates on auth.jwt()->'user_metadata'->>'role', which Supabase populates from client-writable user_metadata. This is a genuine, trivially exploitable full authZ bypass (browser console: supabase.auth.updateUser({data:{role:'academic_head'}})) — severity CRITICAL is appropriate, not overrated.

**Description.** Supabase's user_metadata (as opposed to app_metadata) is fully writable by the authenticated client itself, via supabase.auth.signUp({options:{data:{role}}}) or supabase.auth.updateUser({data:{role}}) — both of which this app calls directly with a client-supplied role (AuthContext.tsx:169-176, useAutoPromote.ts:69-71). Every RLS policy that implements 'admin'/'reviewer' access across user_profiles, worksheet_submissions, and onboarding_submissions checks auth.jwt() -> 'user_metadata' ->> 'role' against values like 'academic_head', 'onboarding_lead', 'lead_instructor' (confirmed identically in db/schema.sql, db/setup_correct.sql, and db/__fix_rls_jwt.sql). This means any authenticated user — including a brand-new 'new_joinee' signup — can open devtools and run `await supabase.auth.updateUser({data:{role:'academic_head'}})`, which immediately refreshes their session with the new claim, after which every RLS check in the schema treats them as a full admin. Additionally, the 'Insert own profile' RLS policy (schema.sql:59-60, `id = auth.uid()`) places no constraint on the role column value beyond the enum CHECK — so a user can also directly insert a user_profiles row with role='academic_head' for their own id, bypassing Signup.tsx's UI-level hardcoding of 'new_joinee' entirely.

**Impact / failure scenario.** Any employee (or anyone who signs up, since there is no invite-only gating observed) can self-promote to academic_head via one browser console command and gain read/write access to all employees' PII, review data, and the ability to approve/reject their own or peers' onboarding worksheets. This is a full authZ bypass of the entire application, not an edge case.

**Suggested fix.** Never source authorization role from user_metadata. Store the authoritative role only in user_profiles.role (already done) and switch every RLS policy to a SECURITY DEFINER function that looks up the role from user_profiles by auth.uid() (guarding against RLS recursion inside the function, not via JWT trust), or use Supabase's server-only app_metadata (settable only via service-role/Edge Function) for RLS role checks. Also add a WITH CHECK (role = 'new_joinee') to the 'Insert own profile' policy so self-signup can never insert a privileged role directly.

---

#### 2. [HIGH] No password reset / forgot-password flow exists anywhere in the app

- **Dimension:** Dim 19: Auth Flow Deep-Dive
- **Location:** `src/pages/Login.tsx (entire file — no forgot-password link/route); src/App.tsx:110-113 (only /login, /signup, /auth/callback routes registered); no resetPasswordForEmail call found anywhere in src/`
- **Verification:** CONFIRMED — Verified: Login.tsx (src/pages/Login.tsx) has no forgot-password link; App.tsx registers only /login, /signup, /auth/callback as auth routes with no reset-password route; grep across src/ finds zero calls to resetPasswordForEmail (only unrelated auth.updateUser calls in useAutoPromote.ts for role metadata) — self-service password recovery is genuinely absent.

**Description.** There is no 'Forgot password?' link on the Login page, no reset-password route registered in App.tsx, no call to supabase.auth.resetPasswordForEmail() anywhere in the codebase, and no admin-side tool to reset another user's password. The only account-recovery path available to a user who forgets their password is signing in with Google (if that identity happens to be linked) — for anyone who signed up with email/password, there is zero self-service recovery.

**Impact / failure scenario.** A new hire who mistypes or forgets their password during onboarding — a near-certainty at company scale — is permanently locked out with no in-app recourse, generating support tickets that require someone with direct Supabase dashboard/service-role access to intervene manually.

**Suggested fix.** Add a 'Forgot password?' link on Login.tsx that calls supabase.auth.resetPasswordForEmail(email, {redirectTo: origin + '/auth/reset-password'}), plus a new /auth/reset-password route/page that calls supabase.auth.updateUser({password}) after the recovery session is established, mirroring the existing AuthCallback pattern.

---

#### 3. [HIGH] Auto-promotion updates the reviewer's own session role instead of the promoted user's, and never syncs the promoted user's JWT

- **Dimension:** Dim 19: Auth Flow Deep-Dive
- **Location:** `src/hooks/useAutoPromote.ts:60-75, invoked from src/pages/PhaseReview.tsx (reviewer-only route)`
- **Verification:** CONFIRMED — Verified in useAutoPromote.ts:61-71 — profile update correctly targets .eq('id', userId), but auth.updateUser() takes no userId and per Supabase semantics always mutates the caller's own session metadata; checkAndPromote is only invoked from PhaseReview.tsx:150, a route gated to academic_head/onboarding_lead in App.tsx:120-121, confirming the caller is always the reviewer, not the joinee being promoted.

**Description.** checkAndPromote(userId) correctly updates the target new joinee's user_profiles.role row (.eq('id', userId), lines 61-64), but the very next call, supabase.auth.updateUser({data:{role:'lead_instructor'}}) (lines 69-71), takes no userId parameter — Supabase's updateUser always mutates the CURRENTLY AUTHENTICATED CLIENT's own session, never an arbitrary user. Since this function is only invoked from PhaseReview.tsx, a reviewer-only route (academic_head/onboarding_lead), it is the reviewer's OWN browser session whose user_metadata.role silently gets overwritten to 'lead_instructor' every time they approve a joinee's final phase. Combined with the CRITICAL RLS-trust finding above, the reviewer's own admin privileges can degrade mid-session after a routine approval action, while the actually-promoted new joinee's JWT still reflects their old role until they separately log out and back in.

**Impact / failure scenario.** An academic_head approving a final worksheet unexpectedly loses admin-level RLS access mid-session (their own JWT now says 'lead_instructor'), while the intended beneficiary of the promotion doesn't get their new reviewer privileges recognized by JWT-based RLS policies until they manually re-login — a confusing, silent state-desync bug directly caused by misusing auth.updateUser().

**Suggested fix.** Remove the supabase.auth.updateUser() call from useAutoPromote entirely (role authorization should never live in user_metadata per the CRITICAL fix above); if immediate JWT-role sync for the promoted user is still needed under some interim design, it must be done via a service-role Edge Function targeting the specific userId, never via the caller's own auth.updateUser().

---

#### 4. [MEDIUM] AuthCallback uses a fixed 1-second setTimeout race instead of confirming the OAuth session exchange completed

- **Dimension:** Dim 19: Auth Flow Deep-Dive
- **Location:** `src/pages/AuthCallback.tsx:19-28`
- **Verification:** not-required

**Description.** After a Google OAuth redirect, the component waits a hardcoded setTimeout(..., 1000) and only then calls supabase.auth.getSession() to decide success/failure, instead of reacting to actual session-exchange completion (e.g. via onAuthStateChange). On a slow network/device, supabase-js may not have finished exchanging the OAuth code for a session within that arbitrary 1000ms window, so a genuinely successful Google sign-in gets misreported as 'Sign in failed. Redirecting…' (line 24) and the user is bounced back to /login even though they were actually authenticated a moment later.

**Impact / failure scenario.** Users on slower connections attempting Google sign-in intermittently get thrown back to the login page despite successfully authenticating with Google, forcing a confusing retry loop.

**Suggested fix.** Replace the fixed timeout with a short-lived onAuthStateChange listener (or poll getSession() with backoff up to a reasonable max, e.g. 5s) that resolves as soon as a session appears, only falling back to the failure path once genuinely exhausted.

---

#### 5. [MEDIUM] Signup's profile-row insert races email confirmation and reliably fails (self-heals silently, but surfaces a confusing error toast right after 'Account Created')

- **Dimension:** Dim 19: Auth Flow Deep-Dive
- **Location:** `src/context/AuthContext.tsx:169-190 (signUp); Login.tsx:34 and Signup.tsx:47 confirm email-confirmation is enabled for this project; AuthContext.tsx:96-130 (createProfileFromAuth self-heal fallback)`
- **Verification:** not-required

**Description.** The app's own copy ('Check your email to confirm your account. You can sign in once confirmed.', Signup.tsx:47) and Login.tsx's explicit 'Email not confirmed yet' handling (Login.tsx:34) confirm Supabase email confirmation is enabled. In that configuration, supabase.auth.signUp() returns a populated data.user but establishes NO active session pre-confirmation. AuthContext.signUp() nonetheless immediately attempts supabase.from('user_profiles').insert(...) (line 184) using the unauthenticated anon-key client — the 'Insert own profile' RLS policy (id = auth.uid()) rejects this because auth.uid() is null pre-confirmation, so the insert fails on effectively every signup. The failure is surfaced via notifyError('Profile creation error:', profileError) (line 190), which dispatches a visible error toast (utils/errorHandling.ts:30-35) — every new user sees an alarming error toast immediately after the reassuring 'Account Created' success screen. The system self-heals via createProfileFromAuth (lines 96-130) on first real login, but this is an undocumented, load-bearing safety net rather than intentional design.

**Impact / failure scenario.** Every signup under the project's actual (email-confirmation-enabled) configuration produces a spurious 'Profile creation error' toast immediately after a successful signup, eroding trust in the first-run flow; the only reason accounts aren't permanently orphaned is a fallback code path compensating for this design flaw.

**Suggested fix.** Skip the profile insert during signUp() when email confirmation is pending (data.session is null), relying solely on createProfileFromAuth's self-heal at first login — or better, move profile creation server-side into a Postgres trigger on auth.users insert (the standard Supabase pattern), which works regardless of confirmation timing and removes the client-side race entirely.

---

#### 6. [MEDIUM] signOut() clears local auth state before confirming the server-side sign-out succeeded

- **Dimension:** Dim 19: Auth Flow Deep-Dive
- **Location:** `src/context/AuthContext.tsx:228-233`
- **Verification:** not-required

**Description.** signOut() calls setUser(null); setProfile(null) (lines 229-230) synchronously, then awaits supabase.auth.signOut() (line 231) and only afterward throws if it errored. If the network call fails or throws, the UI has already optimistically transitioned to a logged-out state (ProtectedRoute redirects to /login) while the actual Supabase session/refresh token persisted in localStorage is never revoked/cleared.

**Impact / failure scenario.** On a failed/offline sign-out attempt, the user sees the login page and believes they've logged out, but the underlying session token remains valid; a page reload or any subsequent getSession() call (e.g. another tab) silently restores the 'logged out' session — a real concern on shared/kiosk machines where a user explicitly wants to end their session before walking away.

**Suggested fix.** Await supabase.auth.signOut() first and only clear local user/profile state after confirming success (or clear local state in a finally combined with prominently surfacing the error rather than silently swallowing it via a background throw).

---

#### 7. [LOW] Logout does not clear the global, unnamespaced onboarding_progress localStorage key — stale progress bleeds across accounts on shared browsers

- **Dimension:** Dim 19: Auth Flow Deep-Dive
- **Location:** `src/App.tsx:64-78; src/context/AuthContext.tsx:228-233 (signOut has no localStorage cleanup)`
- **Verification:** not-required

**Description.** App.tsx persists onboarding progress under a single global localStorage key onboarding_progress (not scoped by user id), updated on a progressUpdate window event. signOut() never clears this or any other localStorage state.

**Impact / failure scenario.** On a shared or kiosk browser, after User A signs out and User B signs in, the Navbar progress indicator renders User A's last-known progress percentage until a progressUpdate event happens to fire with User B's real data — a minor but real stale cross-account data leak.

**Suggested fix.** Namespace the localStorage key by user id (e.g. onboarding_progress:${user.id}), or explicitly clear it inside signOut().

---

#### 8. [LOW] No timeout or error recovery if the initial session check hangs or rejects — infinite loading spinner on every protected route

- **Dimension:** Dim 19: Auth Flow Deep-Dive
- **Location:** `src/context/AuthContext.tsx:137-145 (no .catch on supabase.auth.getSession().then); src/components/ProtectedRoute.tsx:14-29 (unconditional spinner while loading, no escape hatch)`
- **Verification:** not-required

**Description.** supabase.auth.getSession().then(...) at mount has no .catch() handler; if the promise rejects (network/DNS failure, Supabase outage) rather than resolving with session: null, setLoading(false) is never called and loading stays true forever. ProtectedRoute renders an unconditional spinner (lines 14-29) whenever loading is true, with no timeout, retry button, or fallback link to /login.

**Impact / failure scenario.** During any transient network failure at app load, every protected page shows an infinite 'Loading…' spinner with no way for the user to recover short of a manual hard refresh (which hits the same failure again if connectivity issues persist), and no error message explaining what's wrong.

**Suggested fix.** Add .catch(() => setLoading(false)) around the initial getSession() call, and add a timeout in ProtectedRoute that, after a few seconds of loading, shows a retry/error state instead of an indefinite spinner.

---

## Dim 20: Testing & Input Validation — 22/100

> Testing is narrow and shallow relative to the app's risk surface: 6 test files / 70 assertions cover pure config-derived functions and fully-mocked hook seams (useAutoSave, useDueDates, useNotifications, useAutoPromote, and worksheetConfigData helpers) reasonably well, including good edge-case coverage of status transitions and error paths. But there is zero coverage of authentication (Login/Signup/AuthContext/AuthCallback), zero coverage of RLS/authorization boundaries, zero coverage of the admin/buddy/lead dashboards and the actual review approve/reject UI (only its data-shape helpers are tested), zero component-rendering tests despite @testing-library/react being installed and unused, and zero tests for useGateControl — which contains an undocumented fail-open bug (gate check defaults to "complete" on query error). There is no CI running the suite and no coverage tooling, so this gap has no visibility and can silently worsen. Input validation client-side is essentially only "non-empty after trim" everywhere (useWorksheet.ts:178-185); there is no maxLength anywhere in the app and no email format check beyond native HTML5. React's default JSX escaping does mitigate the HTML/script-injection-rendered-back risk (no dangerouslySetInnerHTML or markdown rendering found), which is the one bright spot on the validation side.

#### 1. [HIGH] Zero test coverage for authentication flows (Login, Signup, AuthContext, AuthCallback)

- **Dimension:** Dim 20: Testing & Input Validation
- **Location:** `src/context/AuthContext.tsx, src/pages/Login.tsx, src/pages/Signup.tsx, src/pages/AuthCallback.tsx`
- **Verification:** CONFIRMED — Verified: `find . -iname '*.test.*' -not -path node_modules` returns only ReviewContent, reviewFlow, useAutoPromote, useAutoSave, useDueDates, useNotifications tests — no file references Login, Signup, AuthCallback, or AuthContext/useAuth. Read AuthContext.tsx (260 lines) and confirmed signUp/signIn/signInWithGoogle/signOut/hasRole/fetchProfile/createProfileFromAuth/buildProfileFromMetadata all exist with the RLS-recursion fallback (line 44-49, 60-63) and metadata-based role fallback (`meta.role` at line 80, matches cited 79-80) exactly as described, all untested.

**Description.** grep across the repo for test files referencing Login, Signup, AuthCallback, or AuthContext returns zero results (`find . -iname '*login*test*'` etc. all empty). The entire signUp/signIn/signInWithGoogle/signOut/hasRole/fetchProfile/createProfileFromAuth/buildProfileFromMetadata logic in AuthContext.tsx (261 lines, includes RLS-recursion fallback logic and auto profile creation) has no automated test coverage at all. This is the single most security-sensitive code path in the app (who gets an account, what role they get, what happens when profile fetch fails) and it is completely unverified by tests.

**Impact / failure scenario.** A regression in signUp/fetchProfile/hasRole (e.g. a role check inversion, or the RLS-recursion fallback silently defaulting a user to the wrong role — buildProfileFromMetadata defaults role to 'new_joinee' via meta.role, which is user-supplied signup metadata) would ship undetected. Example: AuthContext.tsx:79-80 falls back to `meta.role` read straight from auth user_metadata when RLS recursion is hit — if that fallback path is ever exercised for an admin-check UI decision, a user who signed up with crafted metadata could see incorrect role-gated UI, and no test would catch it.

**Suggested fix.** Add unit tests for signUp/signIn error paths (duplicate email, weak password rejection by Supabase, network failure) and for fetchProfile's three branches (success, PGRST116 not-found -> auto-create, RLS-recursion -> metadata fallback), mocking supabase.auth and supabase.from as already done in the hook tests (same vi.mock pattern used in useAutoSave.test.ts is directly reusable here).

---

#### 2. [HIGH] Zero component-rendering tests despite @testing-library/react and jsdom being installed

- **Dimension:** Dim 20: Testing & Input Validation
- **Location:** `package.json:23,32 (devDependencies), all files under src/pages/**, src/components/**`
- **Verification:** CONFIRMED — Verified via package.json (both @testing-library/react ^16.3.2 and jsdom ^29.1.1 are devDependencies), `grep -rl \"@testing-library/react\" src/` and `grep -rln \"render(\" src/ --include=*.test.*` both return zero matches, and the 6 existing test files (934 lines, 73 it() blocks) under src/components/__tests__ and src/hooks/__tests__ only test ReviewContent logic/hooks with mocked deps — no component mounting. ProtectedRoute.tsx and PhaseAccessGuard.tsx exist under src/components/ and have no corresponding test files at all, confirming the two critical access-gating components are entirely untested at any level.

**Description.** `@testing-library/react` and `jsdom` are devDependencies but `grep -rl "@testing-library/react" src/` and `grep -rl "render(" src/ --include=*.test.*` both return zero matches. All 6 existing test files (934 lines total, 70 `it()` blocks) test pure functions or hooks with every dependency mocked at the module boundary — none of them mount a single React component. This means every page (Login, Signup, all ~25 worksheet pages, AdminDashboard, BuddyDashboard, OnboardingLeadDashboard, WorksheetReview, PhaseReview, ReviewContent's actual render output, Navbar, ProtectedRoute, PhaseAccessGuard) has zero verification that it renders without throwing, that form validation messages actually appear in the DOM, or that button clicks trigger the right handlers.

**Impact / failure scenario.** A typo in JSX, a missing null-check on `profile` before `.role` access, or a broken conditional render (e.g. showing the approve button to the wrong role) ships with green tests. Nothing currently exercises ProtectedRoute or PhaseAccessGuard — the two components that gate access to protected content — even at the render level.

**Suggested fix.** Add smoke-render tests for at least ProtectedRoute, PhaseAccessGuard, Login, Signup, and WorksheetReview using @testing-library/react's `render`/`screen`/`fireEvent`, since the tooling is already a dependency but entirely unused.

---

#### 3. [HIGH] useGateControl has zero tests and contains a fail-open bug in the gate-completion check

- **Dimension:** Dim 20: Testing & Input Validation
- **Location:** `src/hooks/useGateControl.ts:50-53 (checkPhaseWorksheetsComplete), no corresponding __tests__ file exists`
- **Verification:** CONFIRMED — Verified src/hooks/useGateControl.ts:50-53 contains exactly the described fail-open path (`return { complete: true, missing: [] }; // Allow submit on error`) reached from handleSubmit's gate check (line 133-153), and src/hooks/__tests__/ has tests for useAutoPromote, useDueDates, useNotifications, useAutoSave but none for useGateControl — finding is accurate as described.

**Description.** `find src -iname "*gatecontrol*" -path "*test*"` returns nothing — the gate control hook, which governs whether a joinee can submit a phase gate-pass (the mechanism that blocks phase promotion until prerequisite worksheets are approved), has no test file at all, unlike its sibling hooks (useAutoSave, useDueDates, useNotifications, useAutoPromote) which are all tested. Reading the implementation: on a Supabase query error, `checkPhaseWorksheetsComplete` returns `{ complete: true, missing: [] }` with the comment `// Allow submit on error` (line 52), i.e. any transient network/DB error during the completion check causes the gate to silently open rather than block.

**Impact / failure scenario.** If the `worksheet_submissions` select query errors for any reason (RLS misconfiguration, timeout, connection drop — plausible given the repo has multiple RLS-recursion fix scripts in db/, e.g. __fix_rls_recursion.sql), a joinee can submit a gate-pass worksheet without any of the prerequisite worksheets being buddy/manager approved, bypassing the entire review gate for that phase. No test exists to document or catch this fail-open behavior; a reviewer reading the tested surface of the codebase would not know this edge case exists.

**Suggested fix.** Write tests for useGateControl/checkPhaseWorksheetsComplete covering: all worksheets approved (allow), some missing (block), and the query-error path — and reconsider whether fail-open is the intended behavior for a review gate (fail-closed is safer for an approval gate).

---

#### 4. [HIGH] No tests for admin/lead/buddy dashboard flows or the actual approve/reject review UI

- **Dimension:** Dim 20: Testing & Input Validation
- **Location:** `src/pages/AdminDashboard.tsx, src/pages/BuddyDashboard.tsx, src/pages/OnboardingLeadDashboard.tsx, src/pages/WorksheetReview.tsx, src/pages/PhaseReview.tsx, src/components/admin/AssignmentsTab.tsx, src/components/admin/PhasesReadyTab.tsx`
- **Verification:** CONFIRMED — Verified: `find` for admin-test files returns nothing; the only 'review' test (src/hooks/__tests__/reviewFlow.test.ts) imports solely from config/worksheetConfigData.ts (pure helpers), never WorksheetReview.tsx or PhaseReview.tsx; WorksheetReview.tsx:146 exactly matches `if (!comment.trim())` inside handleBuddyRevision, which calls supabase.update() directly with hand-written review_status strings — none of this handler logic is exercised by any test in the repo.

**Description.** `find . -iname "*admin*test*"` returns nothing. `reviewFlow.test.ts` (the only 'review' test) exclusively tests pure helper functions from worksheetConfigData.ts (getPhaseReviewStatus, getBuddyApprovedSheets, getPhaseWorksheetsByStatus) — it never touches WorksheetReview.tsx or PhaseReview.tsx, which are the actual pages containing the approve/reject/needs_revision button handlers and the required-comment validation (`if (!comment.trim())` at WorksheetReview.tsx:146). The state machine transition code itself (submitted -> pending_review -> buddy_approved/needs_revision -> approved, and the auto-promotion trigger) is only tested via its data-shape helpers, not via the actual click handlers that write to the DB.

**Impact / failure scenario.** A bug in the actual approve/reject button wiring (e.g. wrong review_status string passed to supabase.update, or the revision-comment requirement being bypassable via a different code path than the one at line 146) would not be caught by the existing suite, since it never invokes WorksheetReview's handlers.

**Suggested fix.** Add tests that mock supabase and exercise WorksheetReview's approve/reject/needs-revision handlers directly (extract them to testable functions the way useAutoPromote/useNotifications already are, or test via component render + fireEvent).

---

#### 5. [HIGH] No tests for RLS/authorization boundaries anywhere in the suite

- **Dimension:** Dim 20: Testing & Input Validation
- **Location:** `db/schema.sql, db/*fix_rls*.sql, src/components/ProtectedRoute.tsx, src/components/PhaseAccessGuard.tsx — no test file references any of these`
- **Verification:** CONFIRMED — Verified: only 6 test files exist (all in src/components|hooks/__tests__), none reference ProtectedRoute, PhaseAccessGuard, Navigate, requiredRoles, or useAuth (grep found zero matches); ProtectedRoute.tsx and PhaseAccessGuard.tsx both contain real role/access-gating logic (Navigate to /login or / on unauthorized role, canAccessPhase check) that goes untested; db/schema.sql has 13 CREATE POLICY statements and db/__fix_rls_jwt.sql + db/__fix_rls_recursion.sql exist confirming prior RLS breakage; package.json has no e2e/pgTAP test runner, only vitest.

**Description.** There is no test (unit, integration, or otherwise) that asserts a new_joinee cannot read another user's worksheet_submissions, that a buddy can only see their assigned joinees, or that role-gated routes actually redirect unauthorized roles. The repo's own RLS fix scripts (__fix_rls_jwt.sql, __fix_rls_recursion.sql) indicate RLS has been broken/patched multiple times in this project's history, yet nothing regression-tests the policies or the client-side role gates that depend on them.

**Impact / failure scenario.** Since Supabase RLS is the *only* authorization boundary in this architecture (no custom server), an untested RLS policy regression directly means unauthorized data access in production, and the test suite provides no safety net for that class of bug.

**Suggested fix.** At minimum, add client-side tests asserting ProtectedRoute/PhaseAccessGuard redirect logic for each role against each guarded route. RLS policies themselves ideally need a pgTAP or integration-level test against a real/local Supabase instance, which is entirely absent here.

---

#### 6. [MEDIUM] No automated CI runs the test suite — tests can rot silently

- **Dimension:** Dim 20: Testing & Input Validation
- **Location:** `repo root (no .github/workflows or other CI config found), scripts/pre-commit.sh`
- **Verification:** not-required

**Description.** `find . -iname "*.yml" -o -iname "*.yaml"` (excluding node_modules) returns nothing — there is no CI configuration in this repository. The only git hook present (scripts/pre-commit.sh) runs `cr review --agent` (an AI code review CLI) and explicitly does not run `npm test`. There is no evidence anywhere (package.json scripts, hooks, docs) that `vitest run` is executed automatically on push/PR.

**Impact / failure scenario.** The existing 70 tests can begin failing and no signal reaches the team; a broken test suite becomes silently useless. Combined with the fact this audit's sandbox has no node_modules installed and no lockfile-verified reproducible install path was exercised, there is no evidence the suite currently passes at all outside a developer's local machine.

**Suggested fix.** Add a GitHub Actions workflow (or equivalent) that runs `npm ci && npm test` on every push/PR and blocks merge on failure.

---

#### 7. [MEDIUM] No coverage tooling configured — true test coverage is unmeasured and unenforced

- **Dimension:** Dim 20: Testing & Input Validation
- **Location:** `package.json (no @vitest/coverage-v8 / @vitest/coverage-istanbul devDependency, no `coverage` script), vite.config.js (no `test` block)`
- **Verification:** not-required

**Description.** vite.config.js has no `test:` configuration block at all (relying entirely on vitest defaults), and package.json has no coverage-related dependency or script. Manually counting: 6 test files cover 5 of the app's ~7 custom hooks (useGateControl and effectively useWorksheet's handleSubmit/validate logic are untested) and 1 of ~50+ page/component files, and 0% of routing/guard components.

**Impact / failure scenario.** Without coverage tooling there is no objective signal (in CI or locally) of how much of the codebase is actually exercised, so coverage gaps like the ones in this report can persist indefinitely without visibility.

**Suggested fix.** Add @vitest/coverage-v8, a `test:coverage` script, and a minimum coverage threshold in vitest config; wire into CI once CI exists.

---

#### 8. [MEDIUM] No client-side max-length validation on any input in the entire application

- **Dimension:** Dim 20: Testing & Input Validation
- **Location:** `src/pages/Signup.tsx (fullName/email inputs), src/pages/Login.tsx, all src/pages/worksheets/*.tsx text inputs, src/pages/WorksheetReview.tsx:381 (review-comment textarea), src/hooks/useWorksheet.ts:178-185 (validate())`
- **Verification:** not-required

**Description.** `grep -rn "maxLength" src/ --include=*.tsx --include=*.ts` returns zero matches across the whole codebase. `useWorksheet`'s `validate()` (useWorksheet.ts:178-185) only checks that required fields are non-empty after `.trim()` — there is no length cap, and no such cap exists in any JSX input/textarea either. Matching this, the DB schema stores worksheet_data as unconstrained JSONB and review_comment as unconstrained TEXT (db/schema.sql:135,160), so client and DB are at least consistent with each other, but consistently unbounded rather than consistently limited.

**Impact / failure scenario.** A user can paste megabytes of text into any worksheet field or the review-comment textarea; combined with useAutoSave's per-keystroke (debounced) save to Supabase, this allows unbounded per-row storage growth and larger-than-necessary payloads on every save/read of that row, with no defense-in-depth against accidental or malicious oversized input.

**Suggested fix.** Add `maxLength` attributes to all free-text inputs/textareas (e.g. 500-2000 chars depending on field) and enforce the same cap in `validate()`/useGateControl's inline validation so client behavior is intentional rather than merely 'whatever Postgres will accept'.

---

#### 9. [MEDIUM] Existing tests are solid in isolation but narrow: only pure functions and fully-mocked hook seams are covered

- **Dimension:** Dim 20: Testing & Input Validation
- **Location:** `src/hooks/__tests__/*.ts, src/components/__tests__/ReviewContent.test.ts`
- **Verification:** not-required

**Description.** The 6 existing test files are genuinely well-written for what they cover — they test null/empty inputs, error paths (DB errors, auth errors), and multiple status-transition edge cases (e.g. reviewFlow.test.ts:99-107,123-130 correctly distinguish needs_revision/revision_submitted from buddy_approved). However every one of them either tests pure config-derived functions (worksheetConfigData helpers, FIELD_SECTIONS structure) or hooks with 100% of I/O (supabase.from, supabase.auth) mocked via `vi.mock`/`vi.hoisted`. None exercise real Supabase query-builder chaining behavior, real React rendering, or integration between two or more of these units.

**Impact / failure scenario.** This is 'mocked-to-death' in the sense that the tests validate the hooks' internal logic assuming the mock's shape matches Supabase's real client contract; if the real `.from().select().eq().maybeSingle()` chain behaves differently than the hand-rolled mock chain (e.g. a real Postgrest error shape, or a chain method added/removed), the tests would not detect the drift.

**Suggested fix.** Not blocking by itself, but should be paired with at least a handful of integration tests against a real (test) Supabase project/local instance to validate the mocked contract stays accurate, especially for the review/approval and gate-control flows called out above.

---

#### 10. [LOW] No email format validation beyond native HTML5 type="email", bypassable and unmatched by any application-level check

- **Dimension:** Dim 20: Testing & Input Validation
- **Location:** `src/pages/Login.tsx:79-81, src/pages/Signup.tsx:80-81, src/context/AuthContext.tsx:169-176,211-215 (signUp/signIn)`
- **Verification:** not-required

**Description.** Login.tsx and Signup.tsx rely solely on the browser's native `type="email"` constraint validation for email format; `grep -rn "validateEmail\|email.*regex" src/` finds no application-level email format check anywhere, and AuthContext.signUp/signIn pass the raw `email` string straight through to `supabase.auth.signUp`/`signInWithPassword` with no pre-validation or trimming (unlike password/fullName, `email` is never `.trim()`d before being sent, only checked for truthiness in the form).

**Impact / failure scenario.** Native HTML5 validation can be bypassed (JS-set value, form submitted via non-standard means, or the `required`/`type` attributes stripped), and leading/trailing whitespace in email is sent as-is to Supabase auth rather than being normalized client-side, which can produce confusing 'invalid credentials' errors if a user's email has accidental whitespace from copy-paste. This is low severity because Supabase's auth backend independently validates email format server-side, so it is not an authz gap, just weak defense-in-depth and a UX rough edge for a scenario no test covers.

**Suggested fix.** Trim email before sending, and optionally add a lightweight client regex check with a clear error message rather than relying only on native browser validation.

---

## Dim 21: Documentation & Onboarding — 18/100

> Documentation is a liability, not an asset, for this codebase. README.md is unmodified Vite boilerplate with zero project content. There is no single authoritative source for DB setup: 16 SQL files exist across db/ and repo root, schema.sql claims to be "the ONE FILE you need to run" but demonstrably omits at least 3-4 migrations (notifications, due dates, buddy_approved) that QA_REPORT.md and a stray root-level migration file say are also required. Ten overlapping root-level markdown/txt docs (3279 LOC) plus a 100KB context.md compete with no index or cross-linking, several are internally contradictory, and at least one (TYPESCRIPT_MIGRATION_EXECUTION.md) actively lies about project state — it shows a TS migration as not-started via unchecked checklist items when the codebase is in fact ~99% migrated (100 .ts/.tsx files vs 1 .js file). Multiple docs reference file paths/extensions (AuthContext.jsx, Navbar.jsx, GateControl1.jsx) that no longer exist post-migration. Deployment instructions exist only 1588 lines into context.md, unreachable from any entry point, and hardcode a live Supabase project ID rather than documenting generic multi-environment setup. An entire feature area (src/pages/ftp/, with its own 28.5KB seed file) has zero documentation anywhere. A new developer has no reliable way to get the app running against a correctly-configured database without reverse-engineering SQL files and grepping stale docs against source.

#### 1. [HIGH] README.md is 100% stock Vite boilerplate — zero project-specific setup instructions

- **Dimension:** Dim 21: Documentation & Onboarding
- **Location:** `README.md:1-17`
- **Verification:** CONFIRMED — Verified README.md (17 lines) is verbatim stock Vite/React boilerplate with no project-specific content; confirmed 8 other root markdown/txt docs (ARCHITECTURE_PLAN.md, QA_REPORT.md, REVIEW_FLOW.md, SYSTEM_ANALYSIS.md, TYPESCRIPT_MIGRATION_*.md, UI_IMPROVEMENTS.md, context.md) exist unlinked from README.

**Description.** The entire README is the default `npm create vite@latest` template text ("This template provides a minimal setup to get React working in Vite with HMR...", links to @vitejs/plugin-react docs). It contains no mention of Newton, Supabase, onboarding domain, env vars, DB setup, roles, or how to run the app against a real backend. A new developer cloning the repo gets no entry point at all — the real onboarding material is scattered across 8 other root-level markdown/txt files and a 100KB context.md that README does not even link to.

**Suggested fix.** Replace README.md with a real project README: what the app is, prerequisites, `cp .env.example .env` + Supabase project setup, which single SQL file to run (see DB ordering finding), `npm install && npm run dev`, `npm run test`, `npm run build`, and links to the other docs (marking which are current vs historical).

---

#### 2. [HIGH] TYPESCRIPT_MIGRATION_EXECUTION.md is actively false — describes a migration as not-started when it is ~99% complete

- **Dimension:** Dim 21: Documentation & Onboarding
- **Location:** `TYPESCRIPT_MIGRATION_EXECUTION.md:1-40 (checklist items 8.1-10.10, all unchecked)`
- **Verification:** CONFIRMED — Verified: doc shows all 10 phases at 0/10 with every checkbox unchecked, but `find src -name '*.jsx' -o -name '*.js'` (excl. tests) returns only src/config/theme.js out of 107 source files; cited targets like Phase1.jsx, GateControl1/2/3.jsx, and Phase1Worksheet1-8.jsx already exist as .tsx under src/pages/, src/pages/gate-controls/, src/pages/worksheets/ — doc is stale/misleading as claimed.

**Description.** The doc's checklist items (e.g. "8.1 Convert src/pages/Phase1.jsx → .tsx", "9.1 Convert Phase1Worksheet1.jsx → .tsx", listing GateControl1/2/3.jsx, all Phase2/3 worksheets) are all unchecked, implying the codebase is still largely JSX. In reality `find src -name '*.jsx' -o -name '*.js'` (excluding tests) returns exactly ONE file (src/config/theme.js) out of 101 source files — the migration is done. The referenced files don't even exist anymore under those names (e.g. src/pages/gate-controls/GateControl1.tsx already exists as .tsx, not .jsx, and lives in a subdirectory the doc doesn't mention). A new developer trusting this doc would believe there's a large pending TS migration effort and could waste time "finishing" work already finished, or distrust the type safety of the app.

**Suggested fix.** Delete TYPESCRIPT_MIGRATION_EXECUTION.md and TYPESCRIPT_MIGRATION_PLAN.md, or mark them clearly as historical/completed at the top with a completion date, since they no longer reflect reality.

---

#### 3. [MEDIUM] No authoritative, discoverable instructions for which of 16 SQL files to run, in what order

- **Dimension:** Dim 21: Documentation & Onboarding
- **Location:** `db/schema.sql:1-16 (vs db/*.sql, root supabase_migration_add_buddy_approved.sql, scripts/setup/*.cjs)`
- **Verification:** CONFIRMED — Verified: db/schema.sql:1-17 literally claims to be "the ONE FILE you need to run" and lists 7 superseded legacy files, but does not create the `notifications` table or `worksheet_submissions.due_date` column (grep confirms absent from schema.sql); those only exist in db/__migration_notifications_dates.sql, which QA_REPORT.md:99 says must be run separately — a direct contradiction, and notifications is a live feature (src/hooks/useNotifications.ts queries the table). context.md:1879-1885 has a "Database Setup" section giving schema.sql + 3 optional files, but it also falsely claims schema.sql "includes all migrations" and likewise omits __migration_notifications_dates.sql, __due_date_notifications.sql, seed_ftp_worksheets.sql, __cleanup_test_users.sql, __setup_test_data.sql and the root supabase_migration_add_buddy_approved.sql (which turns out to already be superseded/folded into schema.sql, so that specific file isn't actually a live ambiguity, but the rest are). Count of 16 SQL files (15 in db/ + 1 root) is accurate. No db/README.md exists. Severity downgraded from CRITICAL to MEDIUM: this is a real documentation/onboarding gap for a live feature, but the app runs against one already-provisioned shared Supabase project (URL hardcoded in context.md), so it's not blocking existing functionality/production — it would only bite someone provisioning a fresh DB from scratch, and a partial (if flawed) setup doc already exists in context.md.

**Description.** db/ contains 15 SQL files plus one more at repo root (supabase_migration_add_buddy_approved.sql) = 16 total. schema.sql claims at the top to be "the ONE FILE you need to run" and lists 6 legacy files it supersedes (supabase_schema.sql, supabase_role_migration.sql, supabase_reviewer_migration.sql, __setup_supabase.sql, __fix_review_columns.sql, __fix_rls_recursion.sql, __fix_rls_jwt.sql). But it does NOT mention or supersede: db/__due_date_notifications.sql, db/__migration_notifications_dates.sql, db/create_32_users.sql, db/seed_worksheets.sql, db/seed_ftp_worksheets.sql, db/__cleanup_test_users.sql, db/__setup_test_data.sql, or the root-level supabase_migration_add_buddy_approved.sql. QA_REPORT.md (line 96-99) separately says you must ALSO run __migration_notifications_dates.sql for notifications/due dates to work, contradicting schema.sql's "ONE FILE" claim. A new developer has no way to know: is buddy_approved a real DB column (per the root migration file name, it sounds like it was added after schema.sql was written)? Do notifications/due dates work out of the box or not? There is zero single source of truth for DB setup ordering.

**Suggested fix.** Consolidate to one current schema.sql that is actually complete (fold in __migration_notifications_dates.sql, __due_date_notifications.sql, and the buddy_approved migration, or explicitly document the additional file(s) required), then delete/archive the rest into a `db/archive/` folder with a comment they are historical migrations already merged. Add a `db/README.md` stating the exact run order for a brand-new Supabase project.

---

#### 4. [MEDIUM] SYSTEM_ANALYSIS.md and other docs reference stale file paths/extensions that no longer exist

- **Dimension:** Dim 21: Documentation & Onboarding
- **Location:** `SYSTEM_ANALYSIS.md:18-23,52-54; UI_IMPROVEMENTS.md:9,13; ARCHITECTURE_PLAN.md:208-217`
- **Verification:** not-required

**Description.** SYSTEM_ANALYSIS.md's "Granular API/Database Mapping" table cites `AuthContext.jsx` (actual: src/context/AuthContext.tsx) and `GateControl*.jsx` (actual: src/pages/gate-controls/GateControl1.tsx etc., in a subdirectory that didn't exist in the doc's mental model). UI_IMPROVEMENTS.md cites `src/components/Navbar.jsx` and `src/App.jsx` (both are .tsx). ARCHITECTURE_PLAN.md's "Files to Modify" list cites `App.jsx`, `Navbar.jsx`, `useWorksheet.js`, `useAutoSave.js`, `Phase1.jsx/Phase2.jsx/Phase3.jsx`, `GateControl1.jsx/GC2.jsx/GC3.jsx` — none of which exist under those names/extensions today. Grepping any of these paths from the docs against the repo returns nothing, so a developer following the doc's file references will hit dead ends.

**Suggested fix.** Either regenerate these docs against current file paths or add a prominent banner at the top of each stating the date it was written and that file paths may be stale post-TS-migration.

---

#### 5. [MEDIUM] Doc sprawl at repo root: 9 overlapping markdown/txt files (3279 LOC) plus a 100KB context.md, none linked from a central index

- **Dimension:** Dim 21: Documentation & Onboarding
- **Location:** `/ (repo root): README.md, ARCHITECTURE_PLAN.md, REVIEW_FLOW.md, QA_REPORT.md, SYSTEM_ANALYSIS.md, UI_IMPROVEMENTS.md, TYPESCRIPT_MIGRATION_PLAN.md, TYPESCRIPT_MIGRATION_EXECUTION.md, Newton_Onboarding_Engineering_Review.txt, context.md`
- **Verification:** not-required

**Description.** Ten separate documentation artifacts exist at the repo root, several clearly AI-generated audit dumps produced during different sessions in June 2026 with overlapping scope and inconsistent terminology (SYSTEM_ANALYSIS.md and context.md call the product a "Faculty Onboarding Portal" for "Lab Instructors"; QA_REPORT.md test users are labeled "Lab Instructor", "Manager (AH)"/academic_head — matching real code role enums but never explained anywhere as a coherent glossary). No document says which of these 10 files is current/authoritative, none cross-link each other, and none is referenced from README.md. context.md alone is 100KB and even hardcodes the original author's local machine path (`Project Root: /Users/priyanshuverma/Desktop/untitled folder 3`), confirming it was generated elsewhere on a different machine and dropped in wholesale, not maintained as living documentation.

**Suggested fix.** Pick one authoritative source (e.g. a doc/ folder with ARCHITECTURE.md, SETUP.md, DEPLOY.md) and archive/delete the rest, or clearly mark superseded docs with a header pointing to the current source of truth. Move onboarding.pdf and deep-dive docs like context.md out of repo root into a docs/archive/ folder so they don't compete with day-one setup instructions.

---

#### 6. [MEDIUM] Deployment instructions exist only 1588 lines deep inside context.md, unreachable from README, and embed a live production Supabase project ID

- **Dimension:** Dim 21: Documentation & Onboarding
- **Location:** `context.md:1588-1628; db/schema.sql:14`
- **Verification:** not-required

**Description.** The only deployment guide in the repo (build process, hosting options, production checklist including "Run db/schema.sql in Supabase SQL Editor") is buried at line 1588 of a 100KB catch-all document with no table-of-contents link surfaced anywhere else, and no top-level DEPLOY.md exists. It also states "Supabase project (already configured: project ID `fuoqoryqndtdooujslee`)" — treating a specific live project as a shared assumption rather than documenting how a new environment/deployment creates its own Supabase project. This matches the same project ID hardcoded in db/schema.sql's header comment, meaning the docs assume there is exactly one shared backend rather than documenting per-environment setup.

**Suggested fix.** Extract a dedicated DEPLOY.md with generic (non-project-specific) steps: create your own Supabase project, run schema, set env vars, configure OAuth redirect URLs, deploy dist/ to your host of choice. Do not hardcode a specific project ref ID in setup docs.

---

#### 7. [MEDIUM] Whole FTP feature area (src/pages/ftp/) is completely undocumented

- **Dimension:** Dim 21: Documentation & Onboarding
- **Location:** `src/pages/ftp/; db/seed_ftp_worksheets.sql (28.5KB); no reference in any *.md file`
- **Verification:** not-required

**Description.** A grep for "FTP"/"ftp" across all root markdown docs (README.md, ARCHITECTURE_PLAN.md, REVIEW_FLOW.md, SYSTEM_ANALYSIS.md, QA_REPORT.md, UI_IMPROVEMENTS.md, context.md) returns zero matches. The db/seed_ftp_worksheets.sql file (28.5KB — the largest seed file in the repo) and an entire src/pages/ftp/ route tree exist with no explanation anywhere of what "FTP" means in this domain, what its data model is, or how it relates to the already-documented Phase/Week worksheet flow. A new developer has to reverse-engineer this feature from code alone.

**Suggested fix.** Add a section to whatever becomes the authoritative architecture doc explaining the FTP feature, its relationship to the phase/gate-control worksheet flow, and its seed data.

---

#### 8. [MEDIUM] src/types/supabase.ts is hand-maintained with no documented process to keep it in sync with the actual DB schema

- **Dimension:** Dim 21: Documentation & Onboarding
- **Location:** `src/types/supabase.ts:1-15`
- **Verification:** not-required

**Description.** The Supabase TypeScript types (UserRole, ReviewStatus, WorksheetId, etc.) are manually written, not generated via `supabase gen types typescript` (no such invocation exists anywhere in package.json scripts or docs). Given that db/schema.sql, the 6 legacy migrations it claims to supersede, plus at least 3 more undocumented migration files (due dates, notifications, buddy_approved) all touch schema, there is no documented mechanism ensuring these hand-written types stay accurate — the ReviewStatus/UserRole unions could silently drift from what Postgres actually accepts, and nothing in the repo would catch it (no CI, no generation script).

**Suggested fix.** Document (and ideally script) a `supabase gen types typescript --project-id ... > src/types/supabase.generated.ts` step as part of the DB migration workflow, or add an explicit comment in the schema files stating types must be manually kept in sync and where.

---

#### 9. [MEDIUM] No documentation of the ~17 root/scripts one-off Node scripts — unclear which are safe, current, or destructive

- **Dimension:** Dim 21: Documentation & Onboarding
- **Location:** `scripts/setup/ (__create_15_users.cjs, __create_users.cjs, __full_setup.cjs, __test_reviewer_flow.cjs, create-admin.cjs, fix-fg-all.cjs, fix-fg.cjs, fix-fg.js, fix-fg.mjs); root (__seed_30_users.cjs, __seed_test_data.cjs, fix-assignments.cjs, serve-app.mjs); scripts/ (clean_setup.mjs, run_migration.cjs, fix_promotion_data.mjs)`
- **Verification:** not-required

**Description.** There are at least 17 standalone Node scripts across root, scripts/, and scripts/setup/ for seeding/fixing data — including two different "create users" scripts (__create_15_users.cjs and __create_users.cjs) and four separate "fix-fg" variants (.cjs, .js, .mjs, and fix-fg-all.cjs) coexisting with no README explaining which is current. None of package.json's `scripts` block references any of them (no `npm run seed`, no `npm run setup-db`), so there's no discoverable, documented entry point; a developer has to guess by filename or diff the four fix-fg variants against each other to figure out which one is safe/current to run against a real database.

**Suggested fix.** Delete superseded script variants, keep one canonical version per task, wire the survivors into package.json scripts (`npm run db:seed`, `npm run db:fix-assignments`, etc.), and document each script's purpose/danger level (read-only vs mutating production data) in db/README.md or scripts/README.md.

---

#### 10. [LOW] ARCHITECTURE_PLAN.md documents a design that was subsequently superseded, with no marker indicating it's historical

- **Dimension:** Dim 21: Documentation & Onboarding
- **Location:** `ARCHITECTURE_PLAN.md:1-46 vs REVIEW_FLOW.md:1-138 and src/pages/AdminDashboard.tsx:117-120, src/pages/BuddyDashboard.tsx:83-90`
- **Verification:** not-required

**Description.** ARCHITECTURE_PLAN.md's "Proposed" state machine (section 1) has only 5 states (In Progress → pending_review → approved/needs_revision → revision_submitted → pending_review) and describes `worksheet_due_dates` as a proposed new table (section 2) that was never actually created (grep of src confirms no `worksheet_config`/`worksheet_due_dates` table reference anywhere in frontend code — due dates are computed client-side per worksheetConfigData.ts, not DB-driven). REVIEW_FLOW.md and the actual code both use a richer 6-state model including `buddy_approved` as a distinct phase-level gate, which ARCHITECTURE_PLAN.md's diagram does not show at all. Since the two docs coexist with no cross-reference, a reader has no way to know ARCHITECTURE_PLAN.md's state diagram is stale/superseded by REVIEW_FLOW.md.

**Suggested fix.** Add a banner to ARCHITECTURE_PLAN.md marking it as the original planning doc (historical), and point readers to REVIEW_FLOW.md as the current implemented state machine.

---

#### 11. [LOW] .env.example implies standard secret hygiene but no doc discloses that .env itself is already committed to git

- **Dimension:** Dim 21: Documentation & Onboarding
- **Location:** `.env.example:6-7 vs .env (tracked in git)`
- **Verification:** not-required

**Description.** `.env.example` (the only env-setup guidance in the repo) tells developers to get keys from the Supabase dashboard and correctly notes the service_role key should never be exposed — implying normal env-var hygiene is expected. But no documentation anywhere flags that the actual `.env` file is already committed to git history with a real anon key, so a new developer following .env.example's implicit convention (never commit secrets) has no reason to check `git status`/`.gitignore` and could assume standard secret-handling practices are being followed when they are not. (Noted for documentation-accuracy purposes only, not re-litigating the underlying tracked-secret issue itself, which is scoped to another dimension.)

**Suggested fix.** If the committed .env is intentional/unavoidable given the current setup, document it explicitly (e.g. a NOTE in .env.example or README) so new devs aren't misled about the repo's secret-handling posture.

---
