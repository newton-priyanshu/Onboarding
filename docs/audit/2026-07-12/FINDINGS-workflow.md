# AARAMBH — Production Readiness Audit: Detailed Findings (Multi-Agent Workflow)

**Audit date:** 2026-07-12  
**Method:** 15 parallel dimension-auditor agents (one per audit dimension) reading the real source tree, followed by adversarial verification of every CRITICAL/HIGH finding by an independent skeptic agent instructed to *refute* it. Findings below carry a **Verified** verdict where that second pass ran.  
**Scope:** commit `9b27db8` on `main`.

> Severity reflects the **verifier-adjusted** level where an adversarial check ran. Two findings originally rated HIGH were refuted/downgraded to LOW and are marked accordingly.

## Dimension scorecard

| Dimension | Score /100 | Findings |
|---|---:|---:|
| API Contract & Data Flow | 40 | 15 |
| User Journeys End-to-End | 46 | 19 |
| Authentication & Session Handling | 52 | 13 |
| Authorization, Roles & RLS | 52 | 7 |
| React Correctness & State Management | 52 | 17 |
| Database Schema & Integrity | 56 | 14 |
| Input Validation & Error Handling | 58 | 17 |
| Performance & Scalability | 60 | 12 |
| Testing Audit | 60 | 10 |
| UI/UX & Accessibility | 64 | 19 |
| Deployment, Ops & Observability | 64 | 10 |
| Architecture & Spec Compliance | 68 | 14 |
| Documentation & Onboarding | 68 | 9 |
| Security Vulnerabilities | 70 | 6 |
| Dependencies & Supply Chain | 85 | 7 |

## Dimension assessments

### Architecture & Spec Compliance — 68/100
The post-remediation architecture is genuinely decent: clean layering (api/hooks/config/pages/components), ordered idempotent Supabase migrations, a server-authoritative review state machine, code-split worksheet routes, and config-integrity tests. However, the implementation diverges from what the docs promise in several load-bearing places: CHANGELOG claims "server-authoritative" week/phase gating and PWA/service-worker support that do not exist; the dual phase/week taxonomy leaves the same worksheet reachable under two different gating policies (weakest wins); and the gate-prerequisite check silently no-ops for all four FTP gates due to a magic-string protocol. There is also a notable amount of dead scaffolding (4 unused barrel files, 4 unused type files, unused ProjectInfo/assets, a dead progress-event pipeline that can render stale data), several stale/false doc statements, and manually-synced parallel worksheet registries (client TS maps vs a server table) with no drift guard. One concrete guard bug (PhaseAccessGuard missing the promise rejection handler that was explicitly fixed in its sibling WeekAccessGuard) survives on main.

*Prior-audit (Jul 10) cross-check:* Mostly fixed with remnants. Prior architecture asks verified done: Week1-4 page dedup (merged into WeekPage.tsx), lazy-loading/code-splitting of 40+ worksheets (worksheetConfig.tsx), ordered migrations + db/README (db/ and supabase/migrations/ exist as documented), beforeunload guard present. NOT done: ReviewContent.tsx dedup (still a 1047-line monolith, explicitly called out in the prior scorecard); the "Week 2 loading bug" rejection-handler fix was applied to WeekAccessGuard but never swept to the identical pattern in PhaseAccessGuard; README's own text still references root-level supabase_migration_*.sql files that were moved to db/legacy/ during remediation.

### Authentication & Session Handling — 52/100
The auth foundations are largely well-hardened: signup role is server-forced to new_joinee via the handle_new_user trigger, RLS resolves role exclusively from JWT app_metadata, and the client never writes roles. However, the remediation sweep introduced a production-blocking regression: role promotion is now only possible via a SECURITY DEFINER RPC that acts on auth.uid(), yet the only call site runs in the reviewer's session — so joinees can never actually be promoted, and the reviewer is shown a false "User promoted" success because the RPC's JSON result is discarded. There is also a real post-login race where role-gated routes bounce users to "/" because ProtectedRoute treats "profile not yet fetched" as "wrong role", a privilege-escalation defense gap in the profile INSERT policy (role not constrained, and the sync trigger would bless an attacker-chosen role into JWT app_metadata), and several session-lifecycle gaps (sign-out failure leaves the session live, session expiry mid-edit silently discards work, cross-user localStorage identity bleed on shared machines).

*Prior-audit (Jul 10) cross-check:* The server-side auth hardening claimed by the prior audit is genuinely on main: get_user_role() reads app_metadata only (20260710000002:14-22), signup role is server-forced (handle_new_user, :62-89), the role→app_metadata sync trigger exists, and clients nowhere write role. S1 (leaked .env): the real Supabase URL and publishable key are still recoverable from git history (commit 7e5ca88 adds .env; removed in 9979b3d) — key rotation cannot be verified from the repo, so treat as open until rotation is confirmed. S2 (no CAPTCHA/brute-force protection) and S3 (session invalidation on password change) remain unaddressed in code, relying on Supabase defaults. Crucially, the remediation itself introduced a new CRITICAL regression: making promote_user_if_eligible() caller-only without moving its invocation into the joinee's session broke auto-promotion entirely.

### Authorization, Roles & RLS — 52/100
The security model is thoughtfully built — role of record lives in app_metadata (never user_metadata), get_user_role() is SECURITY DEFINER with an empty search_path, every SECURITY DEFINER RPC acts on auth.uid(), and a BEFORE UPDATE state-machine trigger backs RLS on worksheet reviews. Prior-audit fixes (H12/H14/H15/H24 etc.) are genuinely present. However, several real authorization gaps survive on current main. The most serious: promotion_required_worksheets has RLS never enabled (any authenticated client can read/write/delete it via PostgREST); upsert_gate_submission() never whitelists p_worksheet_id, so an assigned buddy can forge/overwrite ANY of their joinee's worksheet rows (and set review_status='approved' on a fresh insert, bypassing the manager tier and the review trigger); and the "Admin update profiles" RLS policy grants lead_instructor (buddy) UPDATE on every user_profiles row, letting any buddy self-assign to any joinee and then approve their work. Separately, the manager "request revision" feature (H28) is dead on arrival — both the RLS WITH CHECK and the review trigger reject academic_head → needs_revision, so managers can never send a worksheet back. These are exploitable via the untrusted client and must be closed before go-live.

*Prior-audit (Jul 10) cross-check:* Most prior-audit authz items are truly fixed on main: role resolves from app_metadata only (get_user_role, migration 2), signup is server-forced to new_joinee (handle_new_user), reviewer-identity columns are trigger-protected against owner writes (validate_review_transition, H15), notifications INSERT is locked to self (H22/contract item 5), promotion is a SECURITY DEFINER RPC scoped to auth.uid() (H24), and legacy permissive policies are dropped wholesale (C05/C07). But the report's own claims that "RLS everywhere" (line 218) and upsert_gate_submission "checks assigned buddy ✅" (line 503) are overstated: promotion_required_worksheets has no RLS at all, and the gate RPC's authorization does not constrain which worksheet it writes. The H28 "manager can request revision" flow the remediation added to the client was never reconciled with the DB enforcement layer, so it is a newly-introduced broken flow.

### Database Schema & Integrity — 56/100
The core schema (migrations 1-6) is genuinely solid: explicit ON DELETE rules on every FK, CHECK constraints on every enum-like text column, a UNIQUE(user_id, worksheet_id) that makes worksheet upserts idempotent, a BEFORE UPDATE trigger enforcing the review state machine, and optimistic .eq('review_status', loadedStatus) guards on all reviewer updates. However, the newest migration (20260710000007 upsert_gate_submission) opens a critical hole: it accepts an unvalidated worksheet_id and status, and its INSERT path bypasses both RLS and the state-machine trigger, letting a buddy directly create 'approved' rows for any worksheet and thereby satisfy the promotion RPC without any manager involvement. The notifications design is also internally inconsistent: the hardened RLS INSERT policy makes the app's remaining client-side notification writes (assignment notifications) silently fail, and no server trigger covers review-outcome notifications (needs_revision/approved), so joinees are never told their work was rejected or approved. Several integrity gaps remain around client-writable due_date, forgeable review_history on first INSERT, missing UNIQUE on onboarding_submissions, and schema-vs-TypeScript drift. Prior-audit DB findings (C02/C04/C05/H08/H09/H11-H15/H22-H24) are genuinely fixed on current main; the critical finding here is new, introduced by the post-audit gate RPC.

*Prior-audit (Jul 10) cross-check:* DB-relevant prior findings verified fixed on main: role CHECK + app_metadata sync (migration 2), review state-machine trigger with owner lockout (migration 3), unified notifications table + type CHECK (migrations 1/4), explicit FK ON DELETE rules (migration 1 §3), RLS legacy-policy sweep + hardened set (migration 6), promotion via SECURITY DEFINER RPC only (migration 5). No recycled issues reported; the CRITICAL finding below is in migration 7, which was added after that audit's remediation sweep.

### Security Vulnerabilities — 70/100
The app has a genuinely solid security posture on the common surfaces: no dangerouslySetInnerHTML / innerHTML / eval anywhere, all user data rendered as escaped React text, all Supabase queries parameterized (no .or()/.filter() string interpolation, only two RPCs both parameterized), no hardcoded secrets in source (scripts read keys from env), only the VITE_-prefixed anon key reaches the client bundle, redirect URLs are pinned to window.location.origin (no open-redirect), npm audit is clean (0 vulnerabilities), and vercel.json ships a reasonable CSP plus X-Frame-Options/X-Content-Type-Options/Referrer-Policy/Permissions-Policy. However, two real authorization gaps exist in the RLS/RPC layer — the true security boundary — that were NOT caught by the prior audit: the gate-submission RPC accepts an arbitrary review_status on its INSERT path (no BEFORE INSERT state-machine validation), and the "Admin update profiles" RLS policy over-grants profile UPDATE to buddy/onboarding_lead roles. Both let a buddy escalate control over the review/promotion workflow. Lesser issues: .env with the anon key was committed to git history, missing HSTS header, and verbose error logging. Prior-audit security findings (S1-S5) that were relevant remain accurate but shallow; the inline-style CSP note (S5) is still true and low-impact.

*Prior-audit (Jul 10) cross-check:* Prior audit (Step 6) rated Security largely green and only logged low/medium items: S5 (inline styles defeat style-src CSP) — still TRUE on current main (style-src 'unsafe-inline' in vercel.json), low impact since React escapes content; secret-exposure "safe" claim — the committed .env in git history holds only the public anon key so still low, but the file WAS tracked historically. The prior audit's "SQL Injection ✅ / IDOR ✅ / RLS prevents cross-user access" sign-offs are INCOMPLETE: it did not detect the upsert_gate_submission INSERT status-bypass or the lead_instructor/onboarding_lead over-grant in "Admin update profiles". Those two are new findings against current main, not recycled.

### React Correctness & State Management — 52/100
The hooks layer (useAutoSave/useWorksheet/useGateControl) is heavily annotated with fixes from the July 10 audit, and those specific items (autosave-on-hydration H29, double-save H30, false submit success H06/H17, reviewer-column bleed H15, unmounted setState) are genuinely fixed and tested on current main. However, the remediation left serious new defects: the auto-promotion flow is fully broken (the SECURITY DEFINER RPC promotes auth.uid() but is only ever called from the manager's session, and the client ignores the RPC's returned payload, so the manager sees a false "promoted" success toast while the joinee is never promoted); buddy-mode background autosave performs an upsert that RLS's insert policy is guaranteed to reject, spamming buddies with retrying "Auto-save failed" toasts; the debounce timer is discarded without flushing on unmount so in-app navigation silently loses up to 1.5s of edits (the beforeunload guard only covers tab close); and useWorksheet never resets loaded/dirty/data when the target user changes under a non-keyed component, enabling cross-user data bleed in the buddy gate-pass route. Several smaller races (markClean wiping dirty edits made during an in-flight submit, uncancelled loads in WorksheetReview/PhaseReview, PhaseAccessGuard's first-paint "Locked" flash) round out the picture. Not shippable until the CRITICAL and HIGH items are fixed.

*Prior-audit (Jul 10) cross-check:* Prior-audit items relevant to this dimension are genuinely fixed on main: autosave no longer fires on hydration/prefill (dirty flag, useWorksheet.ts:121-131), background saves no longer transition review_status (useAutoSave.ts:161-165,190-191), failed writes no longer report success (retry loop rethrows, useAutoSave.ts:234-238), reviewer columns are gated behind isBuddyMode (useAutoSave.ts:196-200), unmounted setState is guarded (mountedRef), due dates read the real start_date (useAutoSave.ts:99-123), and the beforeunload guard (commit cf2b0a2) exists. But the sweep introduced/left new defects in the same code paths: the promotion RPC contract mismatch, the buddy-mode autosave-vs-RLS conflict, the markClean race, and an incomplete due-date "never overwrite" guarantee (per-mount ref only).

### User Journeys End-to-End — 46/100
The core joinee loop (signup -> worksheet fill -> autosave -> submit -> buddy review -> resubmit after rejection) is solidly built with fail-closed guards, optimistic-concurrency checks, and a shared review state machine. However, the journey's terminal step — promotion to lead_instructor — is completely broken: the SECURITY DEFINER RPC promotes only auth.uid(), but the sole caller is the manager's session, and the client ignores the RPC's returned payload, so no joinee can ever be promoted while the manager sees a false success toast. The manager rejection path (H28) is implemented in two pages but is rejected by both the DB trigger and RLS, meaning a buddy-approved worksheet can never be sent back by anyone through the UI. Joinees receive zero notifications for approve/reject outcomes (the server triggers only notify reviewers, and RLS blocks all cross-user client inserts, silently killing assignment notifications too). Several dead ends exist: FTP gate-pass buttons route to an "Invalid Gate Pass" page, all 40+ worksheet pages hang on an infinite spinner if the initial load fails, and assigning an onboarding_lead as buddy deadlocks that joinee permanently. Prior-audit remediations are partially regressed: H28 was never functional server-side, and H07/H23 (real start dates) still uses a fictional "30 days ago" date in every worksheet list row.

*Prior-audit (Jul 10) cross-check:* Mixed. Genuinely fixed and verified on current main: fail-closed access guards (PhaseAccessGuard/WeekAccessGuard), autosave hardening (H29/H30, dirty-tracking, retry+rethrow), beforeunload guard, Week 2 loading fix, server-side review_history, role never client-writable. NOT actually fixed: H28 (manager rejection) exists only client-side — the validate_review_transition trigger and the "Manager update submissions" RLS WITH CHECK both forbid buddy_approved->needs_revision for academic_head, so it always errors; H07/H23 (due dates from real start_date) fixed in useAutoSave/useDueDates but PhaseWorksheetList still calls getDueDateInfo() with the rolling "30 days ago" default; contract item 3 (promotion RPC) introduced a regression — the RPC acts on the caller but is only ever called by the manager, and checkAndPromote ignores the RPC's promoted:false result.

### Input Validation & Error Handling — 58/100
The core persistence layer is genuinely hardened: loads fail closed before autosave can clobber data, saves retry 3x with backoff and rethrow to submitters, supabase errors are checked on nearly every call, and review transitions are validated client- and server-side. However, the error-surfacing layer on top of it is badly wired: every worksheet page optimistically flips to the "Submitted/Approved" success view before the save resolves (so a failed submit shows a success page), the hook's loadError/retryLoad affordance is rendered by zero callers (transient load failure = infinite skeleton), the SaveIndicator component is dead code so autosave failures are invisible except via a 3x toast storm, and buddy-mode background autosave is structurally guaranteed to violate RLS on every keystroke. Two reviewer flows are outright broken: the four FTP artifact-gate buttons dead-end on "Invalid Gate Pass", and assignment notifications are silently rejected by the tightened notifications RLS policy. Input validation itself is thin (required-field presence only, no length caps) but the React rendering model and server-side state machine contain injection and forgery risks well.

*Prior-audit (Jul 10) cross-check:* Mostly genuinely fixed on current main: fail-closed worksheet loads (C06/C09/C10), dirty-gated autosave (H29/H30), retry+rethrow on submit (H06/H17/H32), unwrap() error propagation (H18), fail-closed access guards, server-side review state machine and notification triggers, and beforeunload guard are all verifiably present in code. But the remediation left seams: the loadError/retryLoad API added for C06 was never wired into any worksheet UI, the SaveIndicator built for save-status visibility is never mounted, the tightened notifications INSERT policy (fixing the phishing vector) silently broke AssignmentsTab's assignment notifications, and the gate-submission RPC fixed explicit buddy submits but not buddy-mode background autosave.

### API Contract & Data Flow — 40/100
The client and the Postgres layer (trigger state machine + RLS + RPCs) have drifted apart in several places where the client ships features the database categorically rejects, or relies on server behavior that does not exist. The worst offenders: auto-promotion can never fire (the only call site runs under the manager's session while the RPC promotes auth.uid(), and the RPC's jsonb result is discarded so the UI fabricates success); the manager "request revision" path is forbidden by both the review-transition trigger and the manager RLS WITH CHECK; buddy-mode autosave structurally violates the worksheet INSERT policy on every keystroke; cross-user client notification inserts are silently swallowed by RLS; and the BuddyDashboard links FTP gates to a route that only supports gc1–gc3. Read paths, 0-row handling, fail-closed guards, and optimistic-concurrency checks are generally well done, but the mutation-side contract mismatches break multiple core flows outright.

*Prior-audit (Jul 10) cross-check:* Most prior-audit items relevant to this dimension are genuinely fixed on main (unwrap() error propagation H18, fail-closed access guards, H15/H29/H30 autosave hardening, H16 zero-row-affected detection, server-side submission notifications H22, scoped dashboard queries H34/H36). However, two remediations introduced regressions the sweep did not catch: (1) the tightened notifications INSERT policy (user_id = auth.uid()) silently broke the surviving cross-user triggerNotification call sites in AssignmentsTab, and (2) the hardened review trigger + manager RLS WITH CHECK (review_status = 'approved' only) contradict the manager rejection path (H28) that the client still ships in WorksheetReview/PhaseReview/reviewStateMachine. The promotion RPC contract (acts only on auth.uid()) was never reconciled with its sole caller, which runs as the manager.

### Performance & Scalability — 60/100
Joinee-facing flows are in good shape: worksheet components are properly code-split (40+ lazy chunks, initial payload ~121 KB gzip JS + 5 KB CSS), queries are scoped per-user, and indexes exist for every filter column used. The weak spot is the reviewer/admin side at the stated scale (500 joinees, 3 years of data): all three dashboards fetch flat row lists with hard caps (2000/200 rows) ordered by updated_at desc, so history silently truncates — stats go wrong and, worse, the "Phases Ready"/gate-pass logic (which requires seeing every worksheet) stops surfacing joinees who are actually ready, quietly stalling the approval pipeline. On top of that, AdminDashboard recomputes O(instructors × worksheets) aggregations twice per render with zero memoization (visible lag per search keystroke at scale), a 500-UUID .in() filter is jammed into a GET query string, ~2.3 MB of uncompressed TTF fonts ship without cache headers, every logged-in client polls notifications every 15 s even when hidden, and each autosave does a pointless conflict-check SELECT before the upsert. Nothing here breaks a small pilot, but the dashboards will degrade both in correctness and responsiveness well before 500 joinees.

*Prior-audit (Jul 10) cross-check:* Prior perf findings are mostly genuinely fixed: P1 (no code-splitting) is fixed and verified in the build output (per-worksheet chunks, main bundle 323 KB/87 KB gzip vs the old ~768 KB); P2 (Week1-4 page duplication) is fixed via a single parameterized WeekPage; fonts were self-hosted as claimed (but as unoptimized TTFs — new finding). P5 (15 s notification polling) is NOT fixed — same interval, no visibility pause, no Realtime. The load-testing recommendation "add pagination/limit to worksheet queries" was implemented as bare .limit() caps with no pagination, which replaced the unbounded-select problem with a new silent-truncation problem at scale (this audit's top finding). The recommended caching was added (queryCache) but has an invalidation gap after assignment mutations.

### UI/UX & Accessibility — 64/100
The app has a coherent design system with genuinely good foundations: focus-visible outlines, prefers-reduced-motion support, labeled form fields (including sr-only labels for matrix inputs), horizontal-scroll wrappers for wide worksheet grids, skeleton loaders on Dashboard/Phase1/Admin pages, error+retry views on most dashboards, and a sign-out confirmation. However, there is one high-impact dead-end: every worksheet page (all ~40) ignores the load-error state exposed by useWorksheet, so any transient fetch failure leaves the joinee on an infinite "Loading…" screen with no retry. Beyond that, the primary joinee dashboard ships a broken quick link (/assessment bounces joinees silently), the autosave "Saving/Saved" indicator was built but is never rendered, review pages show validation errors in green success styling, WCAG contrast fails on gold/small-text status labels, toasts and menus lack ARIA live/expanded semantics, and irreversible bulk phase approval has no confirmation step. The prior audit's "no responsive breakpoints" finding is substantially fixed (navbar breakpoints, ws-stack-sm/ws-scroll-x utilities, phase-ws-row wrapping), with residual fixed 2-column grids in gate controls and Assessment.

*Prior-audit (Jul 10) cross-check:* The prior finding about missing responsive/Tailwind breakpoints is mostly remediated: Navbar has 850px breakpoints, index.css has 640/768/1024px media queries, worksheet forms got .ws-scroll-x/.ws-stack-sm/.ws-sr-only utilities, and .phase-ws-row wraps on small screens. Residual non-responsive fixed grids remain in GateControl1/2/3, Assessment, Stakeholders, Phase1Worksheet5, and Phase2Worksheet4. Loading/error/empty states were clearly added since the prior audit (skeletons, retry views, fail-closed guards), but new gaps remain (WorksheetPage load error, WeekPage/Phase2/Phase3 loading flash).

### Deployment, Ops & Observability — 64/100
The deployment baseline is genuinely decent for a static SPA: CI gates typecheck/lint/test/build on every push and PR, vercel.json ships a real CSP plus security headers and immutable caching for hashed assets, .env.example matches actual code usage exactly, no service-role secrets are committed anywhere, and the migration mess flagged in the prior audit has been reorganized into 7 ordered supabase/migrations files with a documented apply order. However, observability is effectively zero — no Sentry or any error tracker, no global error/unhandledrejection handler, ErrorBoundary only console.errors, and sourcemaps are disabled with a comment claiming the opposite — so production errors from real users will be invisible and undebuggable; this exact finding (M69) from the July 10 audit was NOT remediated. Database migration deployment remains fully manual with no drift detection, no CI application, dual hand-synced sources of truth, and no rollback story; frontend deploys (Vercel git integration, ungated by CI in-repo) are decoupled from migration application, creating ordering hazards for RPC-dependent code. The compromised anon key in git history has a documented rotation runbook but nothing in-repo proves rotation happened, and the prod project ref is still hardcoded in two broken-by-design migration scripts.

*Prior-audit (Jul 10) cross-check:* Mixed. FIXED: vercel.json security/caching headers (were absent, now comprehensive); .env removed from tracking and .gitignored; ESLint CI gate repaired; migration fragmentation largely resolved (supabase/migrations/ + db/legacy/ quarantine + db/README.md apply order); stale public/404.html and public/_redirects removed. NOT FIXED: M69 — no production error monitoring and the contradictory sourcemap comment in vite.config.js:17-18 are byte-for-byte unchanged; no Sentry/tracker was added. OUTSTANDING BY DESIGN: anon key rotation and git-history purge are documented in README.md's "Security handoff runbook" as external dashboard actions — no evidence in-repo they were performed; scripts/e2e-full-flow.mjs is documented (REMEDIATION.md item 4) as broken under the new RLS contract and remains unfixed.

### Testing Audit — 60/100
The suite (17 files, 281 tests, all passing in ~23s via `npm test`; CI runs typecheck→lint→test→build on every push/PR to main) is genuinely strong where it exists: the review state machine has an exhaustive 72-edge role×status×action matrix, access guards are tested fail-closed, WorksheetReview's buddy approve/revision paths are rendered-component tested with optimistic-concurrency assertions, and config integrity is validated. However, coverage is inverted relative to risk: the entire server-side enforcement layer (RLS policies, the validate_review_transition trigger, promote_user_if_eligible and upsert_gate_submission RPCs) has zero automated tests; PhaseReview.tsx — the only code path that produces 'approved' status and triggers promotion — is completely untested; the useGateControl suite is tautological (it tests a locally-defined array, not the hook); and all auth pages plus AuthContext's signIn/signOut/onAuthStateChange are untested. There is no coverage tooling, no thresholds, and the one E2E script requires a live Supabase and is not wired into CI. The suite would catch regressions in pure logic but would stay green through a total breakage of gate submission, phase approval, promotion, or login.

*Prior-audit (Jul 10) cross-check:* Partially addressed. The July 10 report recorded 281 passing tests — the count is unchanged on current main, so no tests were lost, and the strongest suites (reviewStateMachine matrix, guard fail-closed tests, useWorksheet data-loss regression) predate or survived the remediation sweep. But the report's own "Edge Cases NOT Tested" list (double-submit race on worksheets, logout flow, admin login flow, forgot-password delivery) remains untested on current main, and its untested-journey checkboxes (🔲 items in Step 2/3) were never converted into automated tests. The remediation sweep fixed code, not test coverage.

### Dependencies & Supply Chain — 85/100
The dependency posture is unusually clean for a bleeding-edge stack: npm audit reports 0 vulnerabilities across 355 lockfile packages, package-lock.json (lockfileVersion 3) is committed, in sync with package.json, has integrity hashes on every entry, resolves 100% from registry.npmjs.org, and `npm audit signatures` verifies all 274 installed packages (116 with attestations). All declared dependencies were verified as actually used (including the suspicious-looking ws/sharp/esbuild devDeps: ws powers Node-side Supabase scripts, sharp powers scripts/generate-icons.mjs, and esbuild is Vite 8's optional peer activated by `minify: 'esbuild'` in vite.config.js). Peer ranges across React 19 / Vite 8 / ESLint 10 / Tailwind 4 / typescript-eslint 8 are all currently satisfied and the production build succeeds in 1.7s. The real problems are forward-looking landmines: the Dependabot config's ignore rule `>=19.0.0` silently disables ALL react/react-dom updates including security patches, typescript `^6.0.3` sits one patch-line below typescript-eslint's hard peer ceiling of `<6.1.0` (with `ignoreDeprecations: "6.0"` masking deprecated tsconfig options), and an "automerge" label is applied to all dependency PRs with no workflow defining what it does. npm outdated shows only minor/patch drift (supabase-js 2.108.2→2.110.2, vite 8.0.16→8.1.4, eslint 10.5.0→10.7.0, typescript 6.0.3 vs latest 7.0.2).

*Prior-audit (Jul 10) cross-check:* The prior audit (PRODUCTION_AUDIT_REPORT.md) contained almost no dependency findings — only a table row noting sharp as a build-time icon dep and remediation item #18 recommending Dependabot. Dependabot IS now configured (.github/dependabot.yml exists with weekly npm + github-actions ecosystems and sensible grouping), so that item is genuinely fixed — but the implementation introduced a new defect (the >=19.0.0 react ignore rule, reported below).

### Documentation & Onboarding — 68/100
The core setup documentation is genuinely good: README.md accurately documents the two required env vars (matching src/api/supabase.ts exactly), .env.example is complete, db/README.md gives a clear, honest apply-order story for schema.sql vs supabase/migrations, and the security-handoff runbook is explicit about the leaked anon key. However, the repo's living status documents have drifted badly in the last four commits: ALL_ISSUES.md still lists a "REMAINING Critical Bug" (B1) and seven other items that were all fixed on current main, directly contradicting CHANGELOG.md in the same tree; the README's database-bootstrap section references repo-root migration files that no longer exist and hedges about whether db/README.md exists (it does); db/README's migration-order table omits the 7th migration (gate_submission_rpc) that its own header says is documented there; and two conflicting audit reports (docs/audit/2026-07-10 "cannot deploy 31/100" vs root PRODUCTION_AUDIT_REPORT.md "production-ready 7.3/10") coexist with the README labeling the older, scarier one "current" and never mentioning the newer one. CHANGELOG also claims a service worker that does not exist anywhere in the tree and describes a review state machine with states ("pending", "reviewing") that don't match src/constants/status.ts. A new developer can get the app running from these docs, but anyone triaging status, applying the schema by table, or assessing production-readiness will be actively misled.

*Prior-audit (Jul 10) cross-check:* The July-10 audit's Documentation findings (Tier 2 item 22: default Vite README, stale audit dumps at root, no setup/DB/deploy docs) are genuinely fixed: README.md is real and thorough, db/README.md exists and is excellent, historical docs are quarantined in docs/archive/ with a clear disclaimer README, context.md moved out of root, and a deployment/CI section exists. The regressions reported here are NEW drift introduced by the post-audit fix commits (0cfbb7a..9b27db8), which fixed code without updating ALL_ISSUES.md, the README bootstrap section, or db/README's migration table.

## CRITICAL findings (5)

#### [CRITICAL] Auto-promotion is unreachable: promotion RPC only promotes the caller, but is only ever invoked from the reviewer's session — and the RPC's refusal is reported as success  
`Authentication & Session Handling` · ✅ verified

- **Location:** src/hooks/useAutoPromote.ts:66, src/pages/PhaseReview.tsx:163, supabase/migrations/20260710000005_promotion_rpc_and_due_dates.sql:37-52
- **Description:** promote_user_if_eligible() deliberately acts only on auth.uid() and refuses unless the caller's role is 'new_joinee' (migration :44-52). The sole call site is checkAndPromote(userId) inside PhaseReview.tsx — a page reachable only by academic_head/onboarding_lead (App.tsx:130-131). When a manager approves the final phase, the RPC runs as the manager, returns {promoted:false, message:'Only new joinees are eligible...'}, and does nothing. Worse, useAutoPromote.ts:66 destructures only `error` from the rpc() call and discards the returned jsonb, then unconditionally returns {promoted:true, message:'...User promoted to Buddy/Mentor...'} at line 76 — so PhaseReview.tsx:164-167 shows the manager a celebratory false-success toast. Nothing in the joinee's own session ever calls the RPC (grep confirms the single call site), and no other path can change role: 'Admin update profiles' WITH CHECK freezes role (20260710000006:85-91) and 'Update own profile' only lets academic_head change their own role (:65-74). Promotion — the culminating flow of the entire onboarding domain — is therefore impossible through the app.
- **Root cause:** The remediation moved promotion into a caller-scoped SECURITY DEFINER RPC (correct for security) but left the invocation in the reviewer-side PhaseReview flow, and checkAndPromote ignores the RPC's returned payload (`const { error: rpcError } = await supabase.rpc(...)` — data discarded).
- **Impact:** Every joinee who completes all worksheets stays new_joinee forever; managers are told promotion succeeded, so nobody investigates. The role escalation to lead_instructor (full access / buddy duties) never happens, and there is no manual fallback in the UI or RLS. This silently breaks the product's core contract in production.
- **Reproduce:** As academic_head, approve the last buddy_approved worksheet of a joinee's final phase on /admin/review-phase/:userId/3. Observe the '🎉 ... promoted to Buddy/Mentor' toast; then SELECT role FROM user_profiles for the joinee — still 'new_joinee'.
- **Expected:** Promotion fires in the joinee's session when their last worksheet becomes approved (e.g., checkAndPromote invoked from the joinee's Dashboard/notification handler on load), or the RPC accepts a target user id with server-side eligibility + caller-authorization checks; and checkAndPromote must read the RPC's returned jsonb and propagate its actual promoted/message values.
- **Current:** checkAndPromote(userId) runs in the reviewer's session; RPC no-ops for non-joinee callers; client fabricates promoted:true from its own local worksheet check.
- **Suggested fix:** Two-part fix: (1) In useAutoPromote.ts, use `const { data, error } = await supabase.rpc('promote_user_if_eligible'); if (error) throw error; return data as PromoteResult;`. (2) Trigger it from the joinee's own session — e.g., in Dashboard.tsx after loading submissions, if all required worksheets are approved and profile.role === 'new_joinee', call checkAndPromote(user.id) and then supabase.auth.refreshSession() + refreshProfile() on success. Alternatively (cleaner), do the promotion entirely server-side in the validate_review_transition/approval trigger when the last required worksheet flips to 'approved', removing the client from the loop.
- **Verifier note:** Verified end-to-end: promote_user_if_eligible() acts only on auth.uid() and refuses unless the caller is 'new_joinee' (20260710000005_promotion_rpc_and_due_dates.sql:37,50-52), yet its sole production call site is checkAndPromote() in PhaseReview.tsx:163, a route restricted to academic_head/onboarding_lead (App.tsx:130-131), so the RPC always runs as the reviewer and always refuses. useAutoPromote.ts:66 discards the returned jsonb (destructures only `error`) and unconditionally returns promoted:true at line 76, producing a false celebratory toast (PhaseReview.tsx:164-167). No mitigation exists: RLS freezes role on both self-update (20260710000006:65-74) and admin-update (:85-91) paths, no DB trigger promotes on approval, and the joinee's session never invokes the RPC — so promotion is impossible through the app while managers are told it succeeded.

#### [CRITICAL] Auto-promotion to lead_instructor can never occur; client fabricates a success message  
`API Contract & Data Flow` · ✅ verified

- **Location:** src/hooks/useAutoPromote.ts:66-76, src/pages/PhaseReview.tsx:163-167, supabase/migrations/20260710000005_promotion_rpc_and_due_dates.sql:37-51
- **Description:** promote_user_if_eligible() is SECURITY DEFINER and acts only on auth.uid() (the caller), returning jsonb {promoted, message}. The ONLY call site is checkAndPromote(userId) invoked from PhaseReview by the academic_head after phase approval. The RPC therefore evaluates the MANAGER: existing_role='academic_head' ≠ 'new_joinee' → returns {promoted:false,...}. checkAndPromote ignores the RPC's returned data entirely (only checks rpcError, which is null) and returns a hardcoded {promoted:true, message:'…User promoted to Buddy/Mentor…'}. No joinee-session code path ever calls the RPC.
- **Root cause:** RPC contract (acts on auth.uid(), returns jsonb result) not honored by its only consumer: wrong session context and discarded return value.
- **Impact:** The core end-of-onboarding flow is dead: no joinee is ever promoted to lead_instructor, while the manager sees a success toast claiming the promotion happened. The promoted/manager-broadcast notifications in the RPC also never fire. Data (user_profiles.role, app_metadata.role) silently diverges from what the UI reports.
- **Reproduce:** As academic_head, approve the final phase for a joinee whose every required worksheet is approved. Observe the '🎉 …promoted…' toast. Query user_profiles for the joinee: role is still 'new_joinee'.
- **Expected:** RPC executed for/as the joinee; client reflects the server's actual {promoted,message} result
- **Current:** supabase.rpc('promote_user_if_eligible') called from the manager session; data discarded; hardcoded promoted:true returned
- **Suggested fix:** Either (a) call the RPC from the joinee's session (e.g. in Dashboard on load when all worksheets show approved), or (b) change the RPC to accept a p_user_id and authorize academic_head callers. In all cases consume the returned jsonb: const { data, error } = await supabase.rpc('promote_user_if_eligible'); if (error) …; return data as {promoted:boolean; message:string};
- **Verifier note:** Confirmed exactly as claimed. The RPC (migration 20260710000005 lines 37-52) promotes only auth.uid() and bails with {promoted:false} unless caller role = 'new_joinee'; its sole invocation is checkAndPromote (useAutoPromote.ts:66), whose only caller is PhaseReview.tsx:163 behind canApprove = isManager (role 'academic_head', PhaseReview.tsx:63,230), so the RPC always runs as the manager and never promotes. checkAndPromote destructures only `error` from the rpc call, ignores the returned jsonb, and returns hardcoded {promoted:true, 'User promoted to Buddy/Mentor'} (line 76), which PhaseReview surfaces as a success toast (lines 164-167). Grep confirms no joinee-session call site, no DB trigger, and no other client role-write path exists, so promotion to lead_instructor is unreachable in production while the UI reports it succeeded — the tests (useAutoPromote.test.ts) even encode the fabricated success.

#### [CRITICAL] upsert_gate_submission RPC lets a buddy insert fully-'approved' rows for ANY worksheet, bypassing the state machine and manager approval — unlocks promotion  
`Database Schema & Integrity` · ✅ verified

- **Location:** supabase/migrations/20260710000007_gate_submission_rpc.sql:25-77 (esp. lines 29, 57-77)
- **Description:** The RPC never validates p_worksheet_id (comment says gate ids are 'fixed (gc1/gc2/gc3)' but the CASE at lines 57-62 silently maps anything else to 'phase1' and proceeds) and never validates p_status beyond the column CHECK, which includes 'approved'. Because it is SECURITY DEFINER, RLS is bypassed; and because validate_review_transition is a BEFORE UPDATE trigger only (20260710000003:108-110), the INSERT branch of the upsert has NO state-machine enforcement at all. An assigned buddy (or academic_head for any joinee, since the caller_role='academic_head' branch skips the assignment check) can call supabase.rpc('upsert_gate_submission', {p_user_id, p_worksheet_id:'p3_w1', p_data:{...}, p_status:'approved'}) for every worksheet the joinee has not yet started, creating terminal 'approved' rows. promote_user_if_eligible (20260710000005:56-61) counts exactly review_status='approved' rows joined to promotion_required_worksheets, so this directly satisfies promotion. Additionally, on the ON CONFLICT UPDATE path, passing p_status equal to the row's current status makes status_changed=false in the trigger, so worksheet_data is silently overwritten with p_data — a buddy can rewrite a joinee's submitted content for any existing worksheet without leaving a review_history entry.
- **Root cause:** SECURITY DEFINER RPC written for the narrow gc1/gc2/gc3 buddy-authoring case but parameterized generically, with no allowlist on p_worksheet_id, no allowlist on p_status, and reliance on a state-machine trigger that only fires on UPDATE.
- **Impact:** Manager (academic_head) approval — the entire second half of the review pipeline — can be skipped by any lead_instructor for their joinees, and worksheet content can be silently rewritten. Promotion to lead_instructor (a role grant) becomes obtainable via a single reviewer role, defeating the two-stage approval design the rest of the schema goes to great lengths to enforce.
- **Reproduce:** As a user with role lead_instructor assigned as buddy to joinee J: for each id in promotion_required_worksheets that J lacks a row for, call supabase.rpc('upsert_gate_submission', {p_user_id: J, p_worksheet_id: id, p_data: {}, p_status: 'approved'}). Then have J call promote_user_if_eligible() — it promotes.
- **Expected:** RPC hard-restricted to gate worksheets and buddy-legal statuses, with 'approved' unreachable except via the academic_head UPDATE path guarded by the trigger.
- **Current:** p_worksheet_id: CASE ... ELSE 'phase1' (accepts anything); p_status text DEFAULT 'buddy_approved' passed straight into review_status; INSERT path unguarded.
- **Suggested fix:** In the RPC: (1) RAISE EXCEPTION unless p_worksheet_id IN ('gc1','gc2','gc3'); (2) RAISE EXCEPTION unless p_status IN ('buddy_approved','needs_revision') (a buddy's legal outputs); (3) on the conflict path, refuse if the existing row is already 'approved'; (4) append a review_history entry inside the RPC (the INSERT path currently produces no audit trail). Optionally also make validate_review_transition a BEFORE INSERT OR UPDATE trigger with an INSERT branch that forbids reviewer-only statuses when auth.uid() = NEW.user_id and forbids 'approved' entirely on INSERT.
- **Verifier note:** The claim holds under direct code inspection. upsert_gate_submission (migration 7) is SECURITY DEFINER so RLS is bypassed; it authorizes only that the caller is the joinee's assigned buddy or academic_head, never validates p_worksheet_id (the CASE at lines 57-62 maps any unknown id to 'phase1' and proceeds), and passes p_status straight into review_status, which the column CHECK (initial_schema:253) allows to be 'approved'. The state-machine trigger validate_review_transition is BEFORE UPDATE only (migration 3:108-110) and no BEFORE INSERT trigger exists on worksheet_submissions, so the INSERT branch of the upsert writes review_status='approved' with zero enforcement for any worksheet the joinee has not yet started. promote_user_if_eligible (migration 5:56-70) counts exactly those approved rows against promotion_required_worksheets and grants lead_instructor, so a single buddy can fabricate a full approved set and bypass the entire academic_head (manager) approval stage. The secondary silent-overwrite claim also holds: on the ON CONFLICT UPDATE path with unchanged status the trigger early-returns (lines 50-52) while worksheet_data=p_data still applies, leaving no review_history entry. The client hook only ever sends p_status='buddy_approved', but an attacker crafts the rpc call directly, so this is reachable at CRITICAL severity.

#### [CRITICAL] Promotion flow can never promote a joinee — RPC promotes the caller, but the only caller is the manager, and the client reports false success  
`User Journeys End-to-End` · ✅ verified

- **Location:** src/hooks/useAutoPromote.ts:66-76, src/pages/PhaseReview.tsx:163, supabase/migrations/20260710000005_promotion_rpc_and_due_dates.sql:30-52
- **Description:** promote_user_if_eligible() is SECURITY DEFINER and acts ONLY on auth.uid(). The only call site is checkAndPromote(userId) inside PhaseReview.handleApprovePhase — which runs in the MANAGER's (academic_head) session. The RPC therefore checks the manager's own role, returns jsonb {promoted:false, message:'Only new joinees are eligible for auto-promotion'} — and checkAndPromote only inspects rpcError (null), ignores the returned jsonb entirely, and returns {promoted:true, message:'…User promoted to Buddy/Mentor…'}. There is no joinee-side invocation anywhere in the app.
- **Root cause:** RPC was hardened to act only on auth.uid() (per security contract), but the client call site was never moved to the joinee's session, and checkAndPromote checks only the transport error, not the RPC's jsonb result.
- **Impact:** The entire program's end goal is unreachable: a joinee who gets all 23 required worksheets approved is never promoted to lead_instructor. Worse, the manager sees a celebratory '🎉 User promoted to Buddy/Mentor' toast and message, so nobody notices the failure until the joinee complains. The user_profiles.role and app_metadata never change; the promoted-user and manager notifications from the RPC are never created.
- **Reproduce:** As manager, approve Phase 3 for a joinee whose 23 required worksheets are all buddy_approved/approved. Observe the success toast claiming promotion. Query user_profiles: role is still 'new_joinee'.
- **Expected:** Joinee is promoted when eligible; UI reports the RPC's actual result.
- **Current:** supabase.rpc('promote_user_if_eligible') called from manager session; only rpcError checked; hardcoded promoted:true on non-error.
- **Suggested fix:** Either (a) add a joinee-side call: on Dashboard load (or on viewing an all-approved state), the joinee's session calls supabase.rpc('promote_user_if_eligible') and refreshes profile; or (b) add a manager-callable variant promote_user_if_eligible(target uuid) that verifies auth.uid() is academic_head. In all cases parse the result: const { data, error } = await supabase.rpc(...); return { promoted: data?.promoted === true, message: data?.message }.
- **Verifier note:** Confirmed on every point. The RPC (migration 20260710000005 lines 37-52) acts solely on auth.uid() and returns jsonb {promoted:false, message:'Only new joinees are eligible...'} — without raising an error — when the caller's role is not 'new_joinee'. The only production call site is PhaseReview.tsx:163 inside handleApprovePhase, and the PhaseReview routes are guarded to requiredRoles ['academic_head'/'onboarding_lead'] (App.tsx:130-131), so the RPC always executes in a reviewer's session and always declines. useAutoPromote.ts:66 destructures only {error} and ignores the returned jsonb, so it falls through to line 76 and returns {promoted:true, message:'...User promoted to Buddy/Mentor...'}, which PhaseReview.tsx:164-166 renders as a celebratory success toast. Grep confirms no other code path (no trigger, no joinee-side call) ever sets role='lead_instructor', so promotion is unreachable in production and the failure is masked by a false success message.

#### [CRITICAL] Auto-promotion is completely broken: promotion RPC promotes auth.uid() but is only ever invoked from the manager's session, and the client ignores the RPC's returned result  
`React Correctness & State Management` · ✅ verified

- **Location:** src/hooks/useAutoPromote.ts:66-76, src/pages/PhaseReview.tsx:163, supabase/migrations/20260710000005_promotion_rpc_and_due_dates.sql:37-52
- **Description:** promote_user_if_eligible() takes no arguments and acts on auth.uid() (the caller), rejecting anyone whose role is not 'new_joinee' (migration line 50-52). The ONLY call site of checkAndPromote() is PhaseReview.handleApprovePhase — which runs in the MANAGER's (academic_head) session. So the RPC always returns {promoted:false,'Only new joinees are eligible'} for the manager. Worse, checkAndPromote destructures only rpcError from supabase.rpc() and never reads the returned jsonb payload — since the RPC returns its refusal as data (not an error), the client falls through to `return { promoted: true, ... }` (useAutoPromote.ts:76). There is no joinee-side call to checkAndPromote/the RPC anywhere in src, and no DB trigger auto-promotes on approval.
- **Root cause:** Contract mismatch between client and RPC: the client passes a target userId to checkAndPromote() and assumes the RPC acts on that user, but the RPC deliberately acts only on the calling session; and the client treats 'no transport error' as 'promoted'.
- **Impact:** The core promised flow — 'an RPC promotes users to full access once required worksheets are approved' — never happens. No joinee is ever promoted to lead_instructor. Simultaneously the manager sees a false success toast ('All N worksheets approved! User promoted to Buddy/Mentor') and a false in-page message, so nobody notices the failure until joinees complain they still have joinee access.
- **Reproduce:** As manager, approve the final phase for a joinee whose other phases are all approved. Observe the '🎉 promoted' toast. Query user_profiles: the joinee's role is still 'new_joinee'. The RPC's jsonb response (promoted:false) was discarded at useAutoPromote.ts:66.
- **Expected:** Promotion must actually run in the eligible joinee's own session (or the RPC must accept a target user with server-side authorization), and the client must read the RPC's returned jsonb {promoted,message} instead of fabricating success.
- **Current:** const { error: rpcError } = await supabase.rpc('promote_user_if_eligible'); if (rpcError) throw rpcError; ... return { promoted: true, message: ... }
- **Suggested fix:** Two changes: (1) read the result — `const { data, error } = await supabase.rpc('promote_user_if_eligible'); if (error) throw error; return data as PromoteResult;` — and surface data.message honestly in PhaseReview. (2) Trigger promotion from the joinee's session: e.g. call checkAndPromote(user.id) from Dashboard/useAuth when the joinee loads the app and all worksheets are approved, or add a DB AFTER UPDATE trigger on worksheet_submissions that promotes when the last required worksheet flips to 'approved' (server-side, no client involvement). Keep the manager-side call only as a status probe, never as the promotion path.
- **Verifier note:** Verified end-to-end: promote_user_if_eligible() acts only on auth.uid() and refuses any caller whose role is not 'new_joinee' (migration lines 37, 50-52), yet its sole production invocation is PhaseReview.tsx:163, a route restricted to academic_head/onboarding_lead (App.tsx:130-131), so the RPC always returns a refusal. The refusal comes back as jsonb data, and useAutoPromote.ts:66 destructures only the error and unconditionally returns {promoted:true} at line 76, giving the manager a false success toast. There is no joinee-side call, no DB trigger promotes on approval, and the user_profiles RLS policies pin role to its current value even for admin updates, so no joinee can ever be promoted through the app and no in-app manual workaround exists.

## HIGH findings (29)

#### [HIGH] CHANGELOG claims 'server-authoritative' week/phase gating, but gating is client-only  
`Architecture & Spec Compliance` · ✅ verified

- **Location:** CHANGELOG.md:18; supabase/migrations/20260710000006_row_level_security.sql:117-139; src/components/WeekAccessGuard.tsx:82; src/components/PhaseAccessGuard.tsx:75; src/hooks/useGateControl.ts:139-161
- **Description:** CHANGELOG 1.0.0-beta states: 'Week/Phase Gating: Server-authoritative access control — Phase 2/3 locked until prior phase completion; Week 2–4 locked until prior week completion.' In reality only the review-status STATE MACHINE (validate_review_transition trigger) is server-side. The RLS 'Insert own submissions' policy (migration 6, line 117) allows a joinee to insert a row for ANY worksheet_id at any time (it only checks auth.uid() = user_id, review_status in ('', 'pending_review'), reviewed_by IS NULL) — no check that the prior week/phase is complete, and worksheet_id is unconstrained TEXT. Week gating (WeekAccessGuard), phase gating (PhaseAccessGuard), and the gate-prerequisite check (useGateControl.checkPhaseWorksheetsComplete) are all React components/hooks running in the browser.
- **Root cause:** Sequencing rules were implemented in route guards only; RLS/trigger layer enforces reviewer transitions but not curriculum order. CHANGELOG generalized 'server-authoritative' from the review state machine to gating.
- **Impact:** Any joinee using the anon key against PostgREST directly (or just crafting a fetch in devtools) can submit Week 4 / Phase 3 worksheets on day 1, bypassing the curriculum sequencing that is the product's core domain rule. Reviewers then see out-of-order submissions the process assumes cannot exist. The doc claim also misleads operators into believing this is enforced.
- **Reproduce:** As an authenticated new_joinee, POST to /rest/v1/worksheet_submissions with worksheet_id='w4_g1', review_status='pending_review' before completing any Week 1 worksheet — the insert succeeds and the gate appears in the buddy's review queue.
- **Suggested fix:** Either (a) enforce ordering server-side: extend validate/insert path (BEFORE INSERT trigger) to check prior week/phase completion against WK_WORKSHEETS_MAP/PHASE_WORKSHEETS_MAP mirrors in the DB, and constrain worksheet_id to a canonical worksheet registry table; or (b) correct the CHANGELOG/README to say gating is a client-side UX affordance and only review transitions are server-enforced, and record the gap as an accepted risk.
- **Verifier note:** CHANGELOG.md:18 literally claims "Week/Phase Gating: Server-authoritative access control," but no server-side sequencing exists anywhere: the RLS "Insert own submissions" policy (20260710000006_row_level_security.sql:117-123) checks only auth.uid()=user_id, review_status IN ('','pending_review'), reviewed_by IS NULL — worksheet_id is unconstrained TEXT (initial_schema.sql:115, no CHECK) with no prior-week/phase precondition; the validate_review_transition trigger (migration 3) governs only review_status transitions on UPDATE; and upsert_gate_submission (migration 7) checks buddy assignment but never that the phase's worksheets are complete. All ordering enforcement lives in browser code (WeekAccessGuard.tsx, PhaseAccessGuard.tsx, useGateControl.ts), so an authenticated joinee can insert a Week 4/Phase 3 submission as 'pending_review' on day 1 via a direct PostgREST call. Partial mitigation exists — promotion still requires human buddy/manager approvals enforced by RLS+trigger, so the bypass cannot self-promote — but nothing server-side prevents reviewers from approving out-of-order work, and the documented security property is factually false, so HIGH stands for spec compliance.

#### [HIGH] PhaseAccessGuard lacks the promise rejection handler that was added to WeekAccessGuard — network failure leaves users stuck on 'Loading…' forever  
`Architecture & Spec Compliance` · ⚠️ refuted by verifier (claimed HIGH, adjusted to LOW)

- **Location:** src/components/PhaseAccessGuard.tsx:90-105
- **Description:** CHANGELOG 1.0.0-beta documents fixing exactly this bug in WeekAccessGuard ('missing .then() rejection handler caused perpetual loading state'), and WeekAccessGuard.tsx:119-157 now passes a second rejection callback to .then(). PhaseAccessGuard runs the identical pattern — supabase.from('worksheet_submissions')...then(({ data, error }) => {...}) with only a fulfillment handler. supabase-js query builders reject on fetch/network failures rather than resolving with { error }, so a network drop while opening /phase-2/worksheet-N leaves checking=true permanently (the 'Loading…' screen), with an unhandled promise rejection in the console. The fix was not swept to the sibling guard.
- **Root cause:** Gating logic is duplicated across PhaseAccessGuard, WeekAccessGuard, Phase2.tsx and Phase3.tsx instead of shared; the H-fix was applied to only one copy.
- **Impact:** Joinees on flaky connections opening any Phase 2/3 worksheet route get an unrecoverable infinite spinner with no retry UI (the error view exists but is unreachable for this failure mode). Same bug class the team already shipped a fix for — regression risk sign that fixes aren't swept across pattern clones.
- **Reproduce:** Log in as a joinee with Phase 1 approved, go offline (devtools Network → Offline), navigate to /phase-2/worksheet-1. The guard's query rejects; the component stays on 'Loading…' indefinitely.
- **Suggested fix:** Add the same rejection callback used in WeekAccessGuard.tsx:150-156: `.then(onFulfilled, (err) => { if (cancelled) return; console.error(...); setLoadError(true); setChecking(false); })` — or better, extract a single useAccessCheck hook shared by both guards so the pattern can't diverge again.
- **Verifier note:** The claim's premise is wrong for the installed library version: postgrest-js 2.108.2 (dist/index.mjs:326-368) catches fetch/network/abort errors when shouldThrowOnError is false (the default; PhaseAccessGuard never calls .throwOnError()) and resolves with { data: null, error: {...}, status: 0 } instead of rejecting. PhaseAccessGuard.tsx:96-101 handles that resolved error — it sets loadError, clears checking, and renders PhaseAccessErrorView with a Retry button (lines 127-129), so a network drop shows the retry UI, not an infinite spinner. WeekAccessGuard's rejection callback is defensive symmetry, and adding the same to PhaseAccessGuard would only be hardening against a hypothetical throw in the fulfillment handler or future library behavior change — a LOW consistency nit, not a HIGH user-facing bug.

#### [HIGH] promotion_required_worksheets has RLS never enabled — any authenticated user can read, delete, or tamper with the promotion criteria table  
`Authorization, Roles & RLS` · ✅ verified

- **Location:** supabase/migrations/20260710000005_promotion_rpc_and_due_dates.sql:19-28; supabase/migrations/20260710000006_row_level_security.sql:13-16 (table omitted); db/schema.sql:598-611
- **Description:** The table public.promotion_required_worksheets is created in migration 5 and lists the 23 worksheet ids required for auto-promotion. Migration 6 enables ROW LEVEL SECURITY only on user_profiles, onboarding_submissions, worksheet_submissions, and notifications — this table is never included, and no CREATE POLICY exists for it anywhere. In Supabase the public schema is exposed via PostgREST and the anon/authenticated roles hold default table privileges, so a table with RLS disabled is fully readable AND writable by any logged-in client.
- **Root cause:** The ENABLE ROW LEVEL SECURITY block in the RLS migration enumerates tables explicitly and this table, added in the same migration wave, was left out; there is no test asserting every public table has RLS.
- **Impact:** Any authenticated user can DELETE rows from the table via supabase.from('promotion_required_worksheets').delete(). This is a trivial denial-of-service on the entire promotion pipeline (promote_user_if_eligible returns 'not complete' once rows are missing). Worse, it is a privilege-escalation lever: a partially-approved joinee can delete every required-worksheet row except the ones they already have review_status='approved', making total_required == approved_count, then call promote_user_if_eligible() to self-promote to lead_instructor. Attackers can also INSERT bogus rows to permanently block everyone's promotion.
- **Reproduce:** 1. Sign in as any user. 2. In the browser console run: await supabase.from('promotion_required_worksheets').delete().neq('worksheet_id',''). 3. Observe rows removed (no RLS to block it). 4. Promotion for all users is now broken; or delete selectively to satisfy the count for a partially-approved account and call supabase.rpc('promote_user_if_eligible').
- **Expected:** Every table in the exposed public schema has RLS enabled with an explicit policy set (default-deny writes).
- **Current:** Table created with no RLS; migration 6 does not reference it.
- **Suggested fix:** Enable RLS and add a read-only-for-authenticated / no-write policy. In migration 6 add: ALTER TABLE public.promotion_required_worksheets ENABLE ROW LEVEL SECURITY; then CREATE POLICY "read promotion requirements" ON public.promotion_required_worksheets FOR SELECT USING (auth.role() = 'authenticated'); and grant no INSERT/UPDATE/DELETE policy (default deny). Since promote_user_if_eligible() is SECURITY DEFINER it will still read the table fine. Also consider REVOKE INSERT,UPDATE,DELETE ON public.promotion_required_worksheets FROM authenticated, anon.
- **Verifier note:** Verified: migration 6 (lines 13-16) enables RLS only on user_profiles, onboarding_submissions, worksheet_submissions, notifications; public.promotion_required_worksheets (migration 5 lines 19-28, schema.sql 598-611) never gets ENABLE ROW LEVEL SECURITY and has no policy. A repo-wide grep found no REVOKE/restrictive GRANT on it, so under Supabase's default ALTER DEFAULT PRIVILEGES the table is PostgREST-exposed and fully read/write to any authenticated role. The promote_user_if_eligible RPC (lines 30-89) computes total_required as count(*) of this table and promotes when caller's approved_count >= total_required > 0, so a new_joinee with one approved worksheet can delete all other required rows to self-promote to lead_instructor (a reviewer role), and anyone can DELETE/INSERT to DoS or permanently block the promotion pipeline. Real and correctly rated HIGH.

#### [HIGH] upsert_gate_submission() does not whitelist p_worksheet_id — an assigned buddy can forge or overwrite ANY of their joinee's worksheets and set review_status='approved', bypassing the manager tier  
`Authorization, Roles & RLS` · ✅ verified

- **Location:** supabase/migrations/20260710000007_gate_submission_rpc.sql:25-81 (esp. 51-72); db/schema.sql:690-747
- **Description:** The RPC is SECURITY DEFINER (bypasses RLS and, on INSERT, the BEFORE-UPDATE review trigger). It authorizes the caller as the joinee's assigned buddy OR academic_head, but then trusts two caller-supplied values it never validates: p_worksheet_id (the CASE at lines 57-62 falls through to ELSE 'phase1' for any id, so it is not restricted to gc1/gc2/gc3) and p_status (defaults 'buddy_approved' but the caller may pass any string, including 'approved'). The INSERT at lines 64-77 writes worksheet_data=p_data and review_status=p_status directly. Because validate_review_transition is a BEFORE UPDATE trigger only, a fresh INSERT (no existing row) performs no state-machine validation at all.
- **Root cause:** The RPC authorizes WHO calls it but not WHAT they may write; p_worksheet_id and p_status are unbounded and the review trigger doesn't cover INSERT.
- **Impact:** A malicious/compromised buddy can call supabase.rpc('upsert_gate_submission', {p_user_id: <joinee>, p_worksheet_id: 'p2_w3', p_data: {...}, p_status: 'approved'}) to (a) overwrite the content of any regular worksheet owned by their joinee, and (b) stamp it review_status='approved' on first insert — skipping the manager approval tier entirely. Since gc1/gc2/gc3 AND regular worksheets all count toward promote_user_if_eligible()'s approved_count, this lets a buddy fast-track a joinee's approvals (or corrupt their submissions) far beyond the intended 'file a gate pass' scope. The design comment claims the RPC is only for buddy-authored gate passes, but nothing enforces that.
- **Reproduce:** 1. Sign in as a lead_instructor who is assigned_buddy_id for joinee J (or self-assign via the profile-update gap below). 2. Run supabase.rpc('upsert_gate_submission', { p_user_id: J, p_worksheet_id: 'p1_w1', p_data: { forged: true }, p_status: 'approved' }). 3. J's p1_w1 row is inserted/overwritten with review_status='approved', no manager involved.
- **Expected:** RPC accepts only gc1/gc2/gc3 and only buddy-tier statuses, matching its documented purpose.
- **Current:** No whitelist on p_worksheet_id; p_status accepts 'approved'; INSERT path unguarded by the state machine.
- **Suggested fix:** Validate inputs at the top of the function: IF p_worksheet_id NOT IN ('gc1','gc2','gc3') THEN RAISE EXCEPTION 'upsert_gate_submission only accepts gate-control worksheets'; END IF; and IF p_status NOT IN ('buddy_approved','needs_revision') THEN RAISE EXCEPTION 'invalid status'; END IF; (never allow 'approved' from a buddy path). Derive v_phase from the validated id with no permissive ELSE.
- **Verifier note:** Confirmed. upsert_gate_submission (migration 20260710000007, lines 25-81) is SECURITY DEFINER (bypasses RLS), authorizes only "assigned buddy OR academic_head", and never whitelists p_worksheet_id (CASE at 57-62 falls to ELSE 'phase1' for any id) or bounds p_status (any CHECK-legal value including 'approved' at line 253 is accepted). The review state machine is a BEFORE UPDATE trigger only (20260710000003 line 109); grep confirms no BEFORE INSERT trigger exists. Therefore a fresh INSERT for a worksheet the joinee has not started (e.g. p2_w3) writes review_status='approved' with no state-machine validation, skipping the academic_head/manager tier that is normally the only role allowed to set 'approved' (line 84). Because p2_w3 and gc1/2/3 are in promotion_required_worksheets (20260710000005 lines 23-27) and promote_user_if_eligible counts review_status='approved' rows (lines 56-61), a malicious/assigned buddy can fast-track their joinee's promotion. On the ON CONFLICT UPDATE path the trigger fires and blocks a status change to 'approved', but a matching-status upsert still overwrites worksheet_data=p_data, so content tampering of existing rows is also possible. HIGH severity holds.

#### [HIGH] "Admin update profiles" RLS grants lead_instructor (buddy) UPDATE on every user_profiles row — any buddy can self-assign to any joinee and gain review authority over them  
`Authorization, Roles & RLS` · ✅ verified

- **Location:** supabase/migrations/20260710000006_row_level_security.sql:85-91; combined with buddy update policy lines 154-172
- **Description:** The USING clause of "Admin update profiles" is get_user_role() IN ('academic_head','lead_instructor','onboarding_lead'). lead_instructor is a buddy/mentor, not an admin. The WITH CHECK correctly freezes the role column, but every other column — including assigned_buddy_id and assigned_lead_id — is freely writable. So any buddy can UPDATE any joinee's profile and set assigned_buddy_id = their own uid. The "Buddy update submissions" policy (lines 154-172) then permits that buddy to buddy_approve / needs_revision that joinee's worksheets. The admin Assignments UI is route-gated to academic_head/onboarding_lead, but RLS — the real boundary for the untrusted client — allows lead_instructor directly.
- **Root cause:** lead_instructor was bundled into the admin-update role set intended for academic_head/onboarding_lead only.
- **Impact:** Broken access control: a single malicious or compromised buddy account can reassign onboarding relationships for the entire cohort (steal or drop mentees, redirect notification routing which keys off assigned_buddy_id/assigned_lead_id) and grant themselves review authority over any joinee's worksheets. It also lets a buddy blank another manager's assignments. Buddies are the largest privileged population (30+ accounts), so blast radius is high.
- **Reproduce:** 1. Sign in as a lead_instructor. 2. Run supabase.from('user_profiles').update({ assigned_buddy_id: '<my-uid>' }).eq('id', '<any-joinee>'). 3. Update succeeds (RLS allows lead_instructor). 4. Open /buddy/review/<joinee>/<worksheet> and approve — now permitted because you are the assigned buddy.
- **Expected:** Only academic_head/onboarding_lead may update other users' profiles; buddies have no write on user_profiles.
- **Current:** USING includes lead_instructor, granting buddies write access to all profile rows (assignments included).
- **Suggested fix:** Restrict the admin-update USING/WITH CHECK to genuine admins: get_user_role() IN ('academic_head','onboarding_lead'). If buddies legitimately need to write anything on user_profiles, scope it to specific columns via a dedicated policy/RPC rather than a blanket row UPDATE.
- **Verifier note:** The "Admin update profiles" policy (20260710000006_row_level_security.sql:85-91) uses get_user_role() IN ('academic_head','lead_instructor','onboarding_lead') for both USING and WITH CHECK, and lead_instructor is confirmed in app code to be the buddy/mentor role (App.tsx:84, AssignmentsTab.tsx:66, BuddyDashboard.tsx:56). The WITH CHECK freezes only the role column via a self-correlated subquery; assigned_buddy_id and assigned_lead_id remain freely writable. There are no column-level GRANT/REVOKEs, no RESTRICTIVE policies, and no BEFORE-UPDATE trigger guarding the assignment columns, so a buddy can UPDATE any user_profiles row and set assigned_buddy_id to their own uid, then the "Buddy update submissions" policy (lines 154-172) grants them buddy_approve/needs_revision authority over that joinee. This is a real broken-access-control flaw exploitable directly from the untrusted client (the AssignmentsTab route gate does not bind RLS), affecting cohort-wide assignments and review routing; HIGH severity is warranted.

#### [HIGH] Manager "request revision" flow is rejected by both RLS and the review trigger — academic_head can never send a worksheet back for revision  
`Authorization, Roles & RLS` · ✅ verified

- **Location:** Trigger: supabase/migrations/20260710000003_review_state_machine.sql:83-86; RLS: 20260710000006_row_level_security.sql:186-194; Client (dead paths): src/pages/WorksheetReview.tsx:244-293 (handleManagerRevision), src/pages/PhaseReview.tsx:179-222 (handleRequestRevision); client SM says it's allowed: src/utils/reviewStateMachine.ts (academic_head request_revision from buddy_approved -> needs_revision)
- **Description:** The client explicitly ships an H28 'manager requests revision' feature: computeReviewTransition() returns allowed for academic_head + request_revision from buddy_approved, and both WorksheetReview.handleManagerRevision and PhaseReview.handleRequestRevision issue update({ review_status: 'needs_revision' }). But the server rejects it two ways: (1) the "Manager update submissions" RLS WITH CHECK requires review_status = 'approved' (line 188), and (2) validate_review_transition for actor_role='academic_head' only permits OLD='buddy_approved' AND NEW='approved' (lines 84-86), raising 'Illegal review_status transition buddy_approved -> needs_revision for a manager reviewer' otherwise.
- **Root cause:** The H28 remediation added the feature to the client and the shared client state machine but never updated the DB trigger or the Manager RLS WITH CHECK to permit the buddy_approved -> needs_revision transition for academic_head.
- **Impact:** A core reviewer workflow is completely broken. A manager reviewing a buddy-approved worksheet that is actually deficient has no way to reject it — every attempt returns a raw Postgres exception surfaced as 'Error: Illegal review_status transition…'. The only manager action that works is approve, so managers are forced to either approve bad work or leave it stuck forever. This is a production-blocking functional defect in the approval pipeline (not a security hole — the server is over-restrictive relative to the intended feature).
- **Reproduce:** 1. Sign in as academic_head. 2. Open a worksheet in buddy_approved state (/admin/review/:userId/:worksheetId or the PhaseReview list). 3. Enter a comment and click Request Revision. 4. Observe 'Error: Illegal review_status transition buddy_approved -> needs_revision for a manager reviewer' (or an RLS violation) — the status never changes.
- **Expected:** The client state machine, RLS WITH CHECK, and the review trigger agree on the set of legal manager transitions.
- **Current:** Trigger and RLS allow academic_head only buddy_approved -> approved; client offers a Request Revision action that always fails.
- **Suggested fix:** Decide the intended policy and make all three layers agree. To enable manager revision: in validate_review_transition add for academic_head a branch allowing OLD IN ('buddy_approved') AND NEW='needs_revision'; and widen the "Manager update submissions" RLS WITH CHECK to review_status IN ('approved','needs_revision'). Alternatively, if managers should NOT reject, remove the handleManagerRevision/handleRequestRevision UI and the academic_head request_revision branch in reviewStateMachine.ts.
- **Verifier note:** Confirmed at all cited locations. The client ships the H28 manager-revision feature (reviewStateMachine.ts:126-130 allows academic_head request_revision from buddy_approved; WorksheetReview.tsx:261-273 and PhaseReview.tsx:194 issue direct updates to needs_revision), but the server rejects it twice: the BEFORE UPDATE trigger (20260710000003:83-86) only permits academic_head buddy_approved->approved and raises an exception otherwise, and the "Manager update submissions" RLS WITH CHECK (20260710000006:188) requires review_status='approved'. No RPC or later migration provides an alternate path (gate_submission_rpc is unrelated; db/schema.sql matches), so every manager revision attempt fails with a raw Postgres error surfaced in the UI — a completely broken shipped workflow, fail-closed so not a security hole, but HIGH as a functional go-live blocker.

#### [HIGH] Manager 'Request Revision' (H28) is rejected by both the DB trigger and manager RLS WITH CHECK  
`API Contract & Data Flow` · ✅ verified

- **Location:** src/pages/WorksheetReview.tsx:244-293, src/pages/PhaseReview.tsx:179-222, src/utils/reviewStateMachine.ts:119-131 vs supabase/migrations/20260710000003_review_state_machine.sql:83-86 and 20260710000006_row_level_security.sql:176-194
- **Description:** Client-side computeReviewTransition allows academic_head to move buddy_approved → needs_revision, and both WorksheetReview.handleManagerRevision and PhaseReview.handleRequestRevision ship UI for it. But the 'Manager update submissions' RLS policy WITH CHECK requires review_status = 'approved' (only value a manager may write), and validate_review_transition() additionally allows academic_head only buddy_approved → approved. Any manager revision request fails at the database.
- **Root cause:** RLS/trigger hardening restricted academic_head to 'approved' only, but the client transition table and two UI paths were never updated (or the DB rule was over-tightened).
- **Impact:** A documented production feature (manager rejection path) always errors. Managers cannot send a buddy-approved worksheet back; the only visible outcome is 'Error: new row violates row-level security policy for table "worksheet_submissions"'. Client state machine (the claimed single source of truth) and DB state machine are contradictory.
- **Reproduce:** As academic_head, open a buddy_approved worksheet in WorksheetReview, enter a comment, click 'Request Revision'. The update returns a 42501 RLS violation.
- **Expected:** Client and DB agree on the manager transition set
- **Current:** Client allows academic_head request_revision; DB forbids it in two independent layers
- **Suggested fix:** Pick one contract. If managers should be able to reject: extend the trigger branch to `(OLD.review_status = 'buddy_approved' AND NEW.review_status IN ('approved','needs_revision'))` and the RLS WITH CHECK to `review_status IN ('approved','needs_revision')` (both in migrations and db/schema.sql). If not: delete handleManagerRevision/handleRequestRevision UI and make computeReviewTransition disallow it.
- **Verifier note:** Both manager revision handlers (WorksheetReview.tsx:244-293, PhaseReview.tsx:179-222) issue direct table updates setting review_status='needs_revision', which the 'Manager update submissions' RLS WITH CHECK (20260710000006:186-194, requires review_status='approved') rejects with a 42501 RLS violation, and which validate_review_transition() (20260710000003, academic_head branch: only buddy_approved→approved) would independently reject. The client state machine (reviewStateMachine.ts:126-131) explicitly permits the transition, so the UI offers a button that always errors; no RPC or later migration provides an alternative path. The documented H28 manager-rejection feature is completely non-functional in production, though it is a functional break rather than a security exposure.

#### [HIGH] Buddy-mode autosave always violates worksheet_submissions RLS — repeated failed saves and error toasts while filling gate passes  
`API Contract & Data Flow` · ✅ verified

- **Location:** src/hooks/useWorksheet.ts:134-141, src/hooks/useAutoSave.ts:181-239 vs supabase/migrations/20260710000006_row_level_security.sql:117-139,154-172
- **Description:** In buddy mode useWorksheet fabricates autoSaveUser with id = joinee's id, so useAutoSave upserts {user_id: joineeId,…} under the BUDDY's session. Postgres evaluates the INSERT policy WITH CHECK (auth.uid() = user_id) on every row proposed by INSERT … ON CONFLICT, which is false for the buddy — the upsert 403s whether or not the row exists (and even on the pure-UPDATE path, the buddy WITH CHECK requires review_status IN ('buddy_approved','needs_revision'), which an in-progress payload without review_status won't satisfy). Every buddy edit (checking artifacts, typing notes) sets dirty → debounce fires → save() fails, retries 3× with notifyError toasts each attempt, then sets saveStatus='error'. Only the final Submit works because it routes through the upsert_gate_submission RPC.
- **Root cause:** The client-side upsert autosave path was never adapted for the reviewer-writes-joinee-row case after RLS was locked to owner-only INSERT.
- **Impact:** Every buddy filling a gate pass (gc1–gc3 via /buddy/gate-pass) sees repeated 'Auto-save failed' error toasts and a stuck error save indicator throughout the flow; buddy draft edits are never persisted (closing the tab loses them). Erodes trust that the eventual submit worked.
- **Reproduce:** As an assigned buddy, open /buddy/gate-pass/<joineeId>/gc1, toggle any milestone. Wait 1.5s: RLS 42501 on the upsert, 3 error toasts over ~9s.
- **Expected:** Buddy-mode edits either don't autosave or persist via the SECURITY DEFINER RPC
- **Current:** Buddy edits trigger owner-keyed upserts that RLS structurally rejects
- **Suggested fix:** Disable background autosave entirely in buddy mode (skip the debounced save when isBuddyMode, keeping only the RPC submit), or route buddy-mode saves through upsert_gate_submission with a draft p_status.
- **Verifier note:** Verified end-to-end: buddy gate-pass flow (App.tsx:134 → BuddyGatePass.tsx:155 → useGateControl.ts:86-93) makes useWorksheet fabricate autoSaveUser with the joinee's id (useWorksheet.ts:135-141), and every buddy edit sets dirty so the debounced autosave (useAutoSave.ts:241-259) issues a direct upsert of {user_id: joineeId} under the buddy's session (useAutoSave.ts:181-208). The sole INSERT policy WITH CHECK (auth.uid() = user_id) (RLS migration :117-123) is evaluated on the proposed row before ON CONFLICT arbitration, so the upsert 403s whether or not the row exists (and the pure-UPDATE path would also fail the buddy WITH CHECK review_status constraint, :164-172); each failed cycle fires 3 'Auto-save failed' toasts via notifyError with no dedupe, sets saveStatus='error', and buddy drafts are never persisted — only the final submit works because useGateControl.ts:194-200 routes it through the upsert_gate_submission RPC (its own comment at :182-190 admits the direct path is rejected for buddies but only fixed the submit). Minor overstatements only: gate-control pages render no saveStatus indicator, and the beforeunload guard does warn before draft loss; neither changes the substance — every buddy and manager on a required review flow hits repeated error toasts and non-persisting drafts.

#### [HIGH] BuddyDashboard links FTP gates (w1_g1–w4_g1) to /buddy/gate-pass, which only supports gc1–gc3 — dead-end 'Invalid Gate Pass'  
`API Contract & Data Flow` · ✅ verified

- **Location:** src/pages/BuddyDashboard.tsx:24-33,397 vs src/pages/BuddyGatePass.tsx:25-29
- **Description:** GATE_INFO entries 4–7 declare FTP artifact gates (w1_g1, w2_g1, w3_g1, w4_g1) and the dashboard renders 'Fill Gate N' buttons navigating to /buddy/gate-pass/<uid>/<gateId>. BuddyGatePass's GATE_COMPONENTS map contains only gc1/gc2/gc3, so every FTP gate button lands on the 'Invalid Gate Pass — No gate component found for "w1_g1"' screen.
- **Root cause:** GATE_COMPONENTS in BuddyGatePass was never extended when GateArtifact1–4 components and GATE_INFO entries 4–7 were added.
- **Impact:** The primary buddy action for the entire FTP (4-week) track is broken from the dashboard. Buddies cannot file w?_g1 gate passes at all through the advertised flow; the only path left is the joinee self-submitting the gate and the buddy approving it in WorksheetReview, which contradicts the buddy-authored-gate design.
- **Reproduce:** As a buddy whose joinee has buddy-approved all Week-1 prerequisite sheets, click 'Fill Gate 1 — Anchor Artifacts' on /buddy → Invalid Gate Pass error page.
- **Expected:** Every gateId the dashboard links to resolves to a component
- **Current:** GATE_COMPONENTS = { gc1, gc2, gc3 } while dashboard links 7 gate ids
- **Suggested fix:** Add w1_g1: GateArtifact1, w2_g1: GateArtifact2, w3_g1: GateArtifact3, w4_g1: GateArtifact4 to GATE_COMPONENTS in BuddyGatePass.tsx (they already accept targetUserId).
- **Verifier note:** Confirmed end-to-end: BuddyDashboard.tsx:29-32 declares FTP gates w1_g1–w4_g1 and line 397 navigates to /buddy/gate-pass/:userId/:gateId (route exists in App.tsx:134), but BuddyGatePass.tsx:25-29 maps only gc1–gc3, so line 67 renders the 'Invalid Gate Pass' dead-end for every FTP gate button. The intended components exist (src/pages/gate-controls/GateArtifact1-4.tsx, each accepting targetUserId exactly for this buddy route) but were never registered in GATE_COMPONENTS — so the buddy-authored flow is 100% broken, not partially. The only mitigation is joinee self-submission via /week-N/worksheet/wN_g1 (WeekWorksheetPage renders GateArtifactN with no targetUserId), which contradicts the design (worksheetConfigData.ts:450-472 marks wN_g1 owner as 'buddy', and the gate form has the joinee attest their own artifacts and fill 'Buddy / Course Lead Notes'), so HIGH stands: a primary reviewer action for the entire 4-week FTP track dead-ends, and the workaround corrupts the attestation semantics rather than preserving them.

#### [HIGH] Joinees never receive review-outcome notifications (approved / needs_revision / buddy_approved / phase_approved)  
`API Contract & Data Flow` · ✅ verified

- **Location:** supabase/migrations/20260710000004_server_side_notifications.sql:27-33 (only pending_review/revision_submitted covered), src/constants/status.ts:37-43, supabase/migrations/20260710000001_initial_schema.sql:261-267
- **Description:** The only submission-related notification trigger, notify_reviewer_on_submission, fires solely on transitions INTO pending_review/revision_submitted and notifies REVIEWERS. The client-side inserts that used to notify the JOINEE on approval/revision were removed (per the comment in useNotifications.ts:164-170), and no DB trigger replaced them. The notifications CHECK constraint and NOTIFICATION_TYPE constants still enumerate 'approved', 'buddy_approved', 'needs_revision', 'phase_approved' — values nothing ever writes.
- **Root cause:** Remediation moved submission notifications server-side but only implemented the reviewer-facing half; the joinee-facing outcome half was dropped without replacement.
- **Impact:** A joinee gets no signal when their worksheet is approved, buddy-approved, or sent back for revision — the most important notifications in the workflow. They discover 'needs revision' only by manually revisiting each worksheet, stalling the review loop the whole product is built around.
- **Reproduce:** As a buddy, request revision on a joinee's worksheet. Log in as the joinee: notification bell shows nothing new; notifications table has no row of type 'needs_revision'.
- **Expected:** Server-side trigger notifies the submission owner on every reviewer transition
- **Current:** No writer exists for outcome-type notifications; joinee-facing pipeline is empty
- **Suggested fix:** Extend the AFTER UPDATE OF review_status trigger (or add a sibling) to insert a notification to NEW.user_id when review_status transitions into approved/buddy_approved/needs_revision, using NEW.reviewed_by as from_user_id.
- **Verifier note:** Confirmed. The only submission trigger, notify_reviewer_on_submission (20260710000004_server_side_notifications.sql:27-33,56-64), returns early unless review_status is pending_review/revision_submitted and notifies only reviewers; the other server-side writers are signup (same file:76-104), 'promoted' (20260710000005:73-82), and unscheduled due_soon/overdue (20260710000005:130-157). The reviewer actions that set buddy_approved/approved/needs_revision are plain client .update() calls in src/pages/WorksheetReview.tsx (~lines 160-272) and src/pages/PhaseReview.tsx (~lines 124-201) with no notification insert and no RPC, and the only remaining triggerNotification callers are buddy/manager assignment messages in src/components/admin/AssignmentsTab.tsx:80-96 — so the types 'approved', 'buddy_approved', 'needs_revision', 'phase_approved' enumerated in the CHECK constraint (20260710000001_initial_schema.sql:261-267) and NOTIFICATION_TYPE (src/constants/status.ts:37-43) are never written for review outcomes anywhere (no edge functions exist; db/schema.sql matches). Joinees can still see statuses by visiting their dashboard/worksheet pages, so it is a missing-push-signal defect rather than data loss, but the product's own notification bell silently covers none of the review-outcome events the workflow centers on — HIGH stands.

#### [HIGH] Manager 'Request Revision' on buddy-approved worksheets always fails — DB trigger and RLS both forbid the transition the client offers  
`User Journeys End-to-End` · ✅ verified

- **Location:** src/pages/WorksheetReview.tsx:244-293, src/pages/PhaseReview.tsx:179-222, src/utils/reviewStateMachine.ts:126-131 vs supabase/migrations/20260710000003_review_state_machine.sql:83-86 and 20260710000006_row_level_security.sql:176-196
- **Description:** Client-side computeReviewTransition allows academic_head: buddy_approved -> needs_revision, and both WorksheetReview (Manager Review Decision panel) and PhaseReview (per-worksheet Request Revision box) expose the button. But validate_review_transition() only permits academic_head buddy_approved -> approved (raises 'Illegal review_status transition' otherwise), and the 'Manager update submissions' RLS WITH CHECK requires review_status = 'approved'. Every manager revision request errors. Additionally the buddy has no UI path from buddy_approved -> needs_revision (client REVIEWABLE_FROM_PENDING excludes buddy_approved, though the trigger would allow it), so once a worksheet is buddy_approved NO ONE can send it back through the UI.
- **Root cause:** Client state machine was extended for H28 but the server-side trigger and RLS WITH CHECK were never updated to match.
- **Impact:** The advertised manager rejection path (H28, present in two pages with full comment UI) is dead: manager types a comment, clicks Request Revision, gets 'Error: Illegal review_status transition…' (or an RLS violation). A bad worksheet that a buddy approved can only be fully approved or left in limbo forever — the review loop has no backward edge after buddy approval.
- **Reproduce:** As academic_head, open /admin/review/<joinee>/<ws> for a buddy_approved worksheet, enter a comment, click 'Request Revision'. The update is rejected by the BEFORE UPDATE trigger / RLS; actionMessage shows the error.
- **Expected:** Manager can send a buddy-approved worksheet back for revision as the UI promises.
- **Current:** Server allows manager only buddy_approved->approved; client offers needs_revision and always errors.
- **Suggested fix:** In validate_review_transition(), allow academic_head: (OLD IN ('buddy_approved') AND NEW IN ('approved','needs_revision')); in 'Manager update submissions' WITH CHECK, allow review_status IN ('approved','needs_revision'). Optionally also surface buddy_approved -> needs_revision for buddies in reviewStateMachine to match the trigger.
- **Verifier note:** Confirmed end-to-end: computeReviewTransition (reviewStateMachine.ts:126-131) permits academic_head buddy_approved->needs_revision and both WorksheetReview.tsx (lines 390, 549, 244-293) and PhaseReview.tsx (lines 371, 179-222) expose the button with a direct table update, but the DB trigger (20260710000003 lines 83-86, identical in db/schema.sql:456-462) only allows academic_head buddy_approved->approved and raises an exception otherwise, while manager RLS WITH CHECK (20260710000006 lines 186-194) independently requires review_status='approved'. There is no RPC or alternate path, and the buddy UI cannot act from buddy_approved either (REVIEWABLE_FROM_PENDING excludes it; canBuddyAct requires isPending), so every manager revision request errors and a buddy-approved worksheet has no backward edge through the UI. HIGH stands: a shipped core workflow is fully dead, though it fails closed with no data-integrity or security impact.

#### [HIGH] Assigning an onboarding_lead as a buddy permanently deadlocks the joinee's review pipeline  
`User Journeys End-to-End` · ✅ verified

- **Location:** src/components/admin/AssignmentsTab.tsx:65, src/pages/WorksheetReview.tsx:84,98, supabase/migrations/20260710000006_row_level_security.sql:154-173 (Buddy update submissions)
- **Description:** AssignmentsTab offers onboarding_lead users as buddy candidates ('Buddy / Mentor' dropdown includes role onboarding_lead). But onboarding_lead is read-only everywhere: WorksheetReview forces isReadOnly, /buddy route excludes the role, and RLS grants UPDATE only to get_user_role() = 'lead_instructor' whose assigned_buddy_id matches (or is NULL). Once assigned_buddy_id points to an onboarding_lead, that person cannot approve (no RLS policy, client read-only) AND every other lead_instructor is excluded by the assigned-buddy check (client denies when assigned !== profile.id; RLS denies when assigned_buddy_id IS NOT NULL and != them).
- **Root cause:** UI-level buddy candidate list disagrees with the role capabilities enforced by RLS/trigger/review pages.
- **Impact:** Every submission from that joinee sits at pending_review forever. The manager cannot help (managers may only move buddy_approved -> approved). The only escape is an admin re-assigning the buddy — with no error or hint anywhere that this configuration is broken.
- **Reproduce:** Admin: assign an onboarding_lead as Buddy for joinee J. J submits any worksheet. The onboarding_lead sees a read-only banner at /onboarding-lead/review/...; any lead_instructor opening the sheet gets 'assigned to another buddy' denial; the worksheet never leaves pending_review.
- **Expected:** Only roles that can actually approve are assignable as buddy.
- **Current:** onboarding_lead selectable as buddy; backend forbids them from ever acting.
- **Suggested fix:** Remove onboarding_lead from buddy candidates in AssignmentsTab (filter to role === 'lead_instructor', optionally academic_head), or grant onboarding_lead buddy-equivalent update rights when they are the assigned buddy (RLS + trigger + WorksheetReview canApprove).
- **Verifier note:** Verified at all layers: AssignmentsTab.tsx:65 deliberately offers onboarding_lead as buddy candidates (worksheetConfigData.ts:28 documents this as intended), yet onboarding_lead is read-only everywhere — client (WorksheetReview.tsx:98, reviewStateMachine.ts:116), RLS (no UPDATE policy on worksheet_submissions, explicit NOTE at migration 20260710000006:196-197), and the validate_review_transition trigger (raises for any role but lead_instructor/academic_head). Once assigned, other buddies are RLS-excluded (assigned_buddy_id must equal auth.uid() or be NULL, lines 154-172) and the manager can only do buddy_approved->approved, so the joinee's submissions stall at pending_review with zero error surfaced (the assign handler reports success). Only softening is that it is recoverable by an admin re-assigning the buddy via the same tab, which the finding already concedes; the silent, UI-invited stall of the core review pipeline justifies HIGH.

#### [HIGH] Joinees receive no notification for buddy approval, manager approval, or needs-revision — the 'reject -> notify -> resubmit' leg does not exist  
`User Journeys End-to-End` · ✅ verified

- **Location:** supabase/migrations/20260710000004_server_side_notifications.sql (only reviewer-facing triggers), src/pages/WorksheetReview.tsx:139-293, src/pages/PhaseReview.tsx:105-222, supabase/migrations/20260710000006_row_level_security.sql:210-212
- **Description:** Server-side triggers create notifications only TO reviewers on pending_review/revision_submitted transitions and on signup; the promotion RPC notifies on promotion (which never fires — see CRITICAL finding). No trigger fires on buddy_approved/approved/needs_revision to notify the worksheet OWNER, and none of the client review handlers call triggerNotification. Even if they did, the notifications INSERT RLS policy ('user_id = auth.uid()') forbids inserting a row for another user. NotificationBell even has icons for needs_revision/approved/buddy_approved types that can no longer be produced.
- **Root cause:** The notification-hardening migration removed client-side inserts and locked RLS to self-inserts, but only re-implemented the reviewer-direction notifications server-side; owner-direction notifications were dropped.
- **Impact:** A joinee whose worksheet was rejected has no signal at all — no bell item, no email — and will only discover the 'Needs Revision' state by re-opening the worksheet or dashboard. Review turnaround stalls; the documented flow step 5 ('joinee sees comment, edits, resubmits') depends on the joinee polling pages manually.
- **Reproduce:** As buddy, request revision on a joinee's worksheet. Log in as the joinee: notification bell shows nothing new.
- **Expected:** Joinee is notified on approve/buddy-approve/needs-revision.
- **Current:** Owner-direction workflow notifications are never created anywhere.
- **Suggested fix:** Add a SECURITY DEFINER trigger on worksheet_submissions AFTER UPDATE OF review_status: when NEW.review_status IN ('buddy_approved','approved','needs_revision') and it changed, INSERT a notification for NEW.user_id with the matching type and the review_comment.
- **Verifier note:** The only notification trigger on worksheet_submissions (20260710000004:27-29) exits unless the new status is pending_review/revision_submitted and only inserts rows for reviewers; no trigger or RPC notifies the worksheet owner on approved/buddy_approved/needs_revision. WorksheetReview.tsx and PhaseReview.tsx review handlers perform bare review_status updates with no triggerNotification calls (grep confirms the only callers are AssignmentsTab.tsx), and the notifications INSERT RLS policy (20260710000006:211-212, WITH CHECK user_id = auth.uid()) would block a reviewer client from inserting for the joinee anyway. NotificationBell.tsx:25-27 still styles approved/buddy_approved/needs_revision types that no server-side path can produce for joinees, so the reject-notify-resubmit leg genuinely does not exist and is unmitigated.

#### [HIGH] Every worksheet page hangs on an infinite 'Loading…' spinner if the initial load fails — loadError/retryLoad are never wired into any UI  
`User Journeys End-to-End` · ✅ verified

- **Location:** src/components/WorksheetPage.tsx:82,106, src/hooks/useWorksheet.ts:145-199, src/pages/gate-controls/GateControl1.tsx:79, src/pages/gate-controls/GateArtifact1.tsx:41
- **Description:** useWorksheet deliberately never sets loaded=true on a load error (to protect against autosave clobbering) and exposes loadError + retryLoad, with a doc comment saying 'Callers should surface this with a retry affordance'. No caller does: WorksheetPage destructures neither loadError nor retryLoad and renders <LoadingView/> whenever !loaded; all GateControl/GateArtifact pages do the same (useGateControl passes loadError through but no gate page renders it). grep confirms zero usages of retryLoad in any component.
- **Root cause:** Fail-closed load semantics added to the hook without updating the shared page shells to consume the new error state.
- **Impact:** Any transient network error, RLS hiccup, or refresh mid-flow on a flaky connection leaves the user on a permanent spinner with no message and no retry across all ~40 worksheet routes. The only escape is a full page reload, which the user has no reason to think will help.
- **Reproduce:** Open any worksheet (e.g. /week-1/worksheet/w1_o1) with the network offline for the first fetch, then restore the network. The page stays on 'Loading…' forever.
- **Expected:** Load failure shows an error with a Retry button (pattern already exists in Dashboard/Phase pages).
- **Current:** if (!loaded) return <LoadingView/> with no error branch.
- **Suggested fix:** In WorksheetPage (and gate pages): const { loadError, retryLoad } = ws; if (loadError) return <ErrorView message={loadError} onRetry={retryLoad}/> before the !loaded check.
- **Verifier note:** Confirmed exactly as described: useWorksheet.ts:145-199 deliberately keeps loaded=false on load failure and exposes loadError/retryLoad with a doc comment requiring callers to render a retry affordance, but WorksheetPage.tsx:82 destructures neither and line 106 renders a bare static "Loading…" (worksheetComponents.tsx:277-285, no timeout/error state); gate pages (GateControl1.tsx:79, GateArtifact1.tsx:41) follow the same pattern, and a full-src grep shows zero components consuming useWorksheet's loadError/retryLoad (other pages' loadError hits are unrelated local state). loadWorksheetData (useAutoSave.ts:274-289) has no retry, and handleSubmit is explicitly blocked while loadError is set (useWorksheet.ts:243), so any transient load failure leaves the user permanently stuck with no message or recovery across all ~41 worksheet/gate routes; HIGH is warranted since this dead-ends the core joinee journey on any network/RLS hiccup.

#### [HIGH] Buddy dashboard 'Fill Gate 1-4 — Artifacts' buttons dead-end at 'Invalid Gate Pass'  
`User Journeys End-to-End` · ✅ verified

- **Location:** src/pages/BuddyDashboard.tsx:29-32,392-413, src/pages/BuddyGatePass.tsx:25-29,67-80
- **Description:** GATE_INFO entries 4-7 (w1_g1..w4_g1, the FTP artifact gates) generate 'Fill Gate N — … Artifacts' buttons on the My Instructors tab once the week's regular sheets are buddy-approved. The buttons navigate to /buddy/gate-pass/:userId/w1_g1 etc., but BuddyGatePass's GATE_COMPONENTS maps only gc1/gc2/gc3, so the page renders 'Invalid Gate Pass — No gate component found for "w1_g1"'.
- **Root cause:** GATE_INFO extended for FTP gates without extending BuddyGatePass's component map (GateArtifact1-4 exist and accept targetUserId).
- **Impact:** The exact moment the system prompts a buddy to act on an FTP gate, the offered action is a dead end. Buddies must discover on their own that FTP gates are joinee-submitted and reviewed through /buddy/review instead. Reads as a broken product to every buddy who reaches week-gate readiness.
- **Reproduce:** As buddy, approve all of a joinee's Week-1 sheets (p1_w5, p1_w3, w1_o1, w1_e1, w1_o2). On /buddy -> My Instructors, click 'Fill Gate 1 — Anchor Artifacts'. Invalid Gate Pass page appears.
- **Expected:** Button opens the corresponding GateArtifact form in buddy mode.
- **Current:** Button navigates to a route whose component map lacks the gate id.
- **Suggested fix:** Add w1_g1: GateArtifact1 … w4_g1: GateArtifact4 to GATE_COMPONENTS in BuddyGatePass.tsx (they already support targetUserId and route buddy submissions through upsert_gate_submission RPC), or remove FTP gate entries from the buddy 'gate pass needed' prompts.
- **Verifier note:** Verified on current main: BuddyDashboard.tsx:29-32,392-413 renders "Fill Gate 1-4" buttons navigating to /buddy/gate-pass/:userId/w{1-4}_g1 once a week's sheets are buddy-approved, but BuddyGatePass.tsx:25-29 maps only gc1/gc2/gc3, so line 67's guard renders the "Invalid Gate Pass" dead-end for all four FTP gates. This is a missing mapping, not design: GateArtifact1-4 exist, accept targetUserId (GateArtifact1.tsx:9,22,27), and worksheetConfigData.ts:450 marks these gates buddy-filled — BuddyGatePass just never wires them in. No route-level or server-side mitigation exists; the dead-end screen's only action returns the buddy to the same broken button, so HIGH stands for a user-journey break on the happy path of every FTP week.

#### [HIGH] Due-date badges computed from a fictional '30 days ago' start date — new joinees see 'Overdue by 27d' on day one  
`User Journeys End-to-End` · ✅ verified

- **Location:** src/components/PhaseWorksheetList.tsx:75, src/hooks/useDueDates.ts:52-57,73-81
- **Description:** PhaseWorksheetList calls getDueDateInfo(ws.id) with no startDate for every Not Started / In Progress row. calculateDueDate then falls back to getDefaultStartDate(), which is literally 'for demo/simulation … 30 days ago' (or a stale localStorage value). Worksheets with small offsets (w1_o1 offset 3, w1_e1 offset 5, gc1 offset 30…) therefore render as overdue immediately for a user who signed up today. This list component is used by Phase1, Phase2, Phase3 and all four Week pages.
- **Root cause:** Display path never fetches the profile's start_date/created_at; falls into the demo fallback.
- **Impact:** Every new joinee's very first screen shows red 'Overdue by Nd' warnings on most worksheets, destroying trust in all due-date signals and contradicting the DB-persisted due_date (which useAutoSave correctly derives from the real start_date). The prior audit's H07/H23 fix was applied to the save path but not to this display path.
- **Reproduce:** Fresh account, clear localStorage, open /phase-1 or /week-1: w1_o1 shows 'Overdue by ~27d'.
- **Expected:** Due labels derived from the joinee's actual start_date or the persisted due_date, else hidden.
- **Current:** getDueDateInfo(ws.id) with implicit now-30d start.
- **Suggested fix:** Use the existing useDueDates(userId, ids) hook (which reads real start_date and persisted due_date) in Phase/Week pages and pass resolved dates into PhaseWorksheetList; or hide the badge entirely when no persisted due_date/start date is available.
- **Verifier note:** PhaseWorksheetList.tsx:75 calls getDueDateInfo(ws.id) with no startDate for every Not Started/In Progress row; calculateDueDate then falls back to getDefaultStartDate() (useDueDates.ts:52-57), which reads a localStorage key that no code ever writes and otherwise returns Date.now() minus 30 days. With offsets like w1_o1=3 and p1_w1=7, a joinee who signed up today sees red 'Overdue by 27d/23d' badges on Phase1, Phase2, Phase3 and all WeekPage routes on day one. The fixed useDueDates hook (real start_date) is consumed by no page, and useAutoSave persists a correct due_date, so the displayed badge contradicts the DB — the H07/H23 fix indeed never reached this display path. Display-only but systematically wrong on every new user's primary screen, so HIGH stands.

#### [HIGH] BuddyDashboard caps worksheet fetch at 200 rows — review queue and gate-pass buttons break for buddies with accumulated joinees  
`Performance & Scalability` · ✅ verified

- **Location:** src/pages/BuddyDashboard.tsx:77-86 (limit), 322-337 (isPhaseReadyForGate/isGateFilled), 352-361 (gatePassNeeded)
- **Description:** The buddy dashboard fetches worksheet_submissions for ALL its assigned joinees with .order('updated_at', desc).limit(200). One joinee produces up to ~40 rows, so a buddy who has accumulated 5-6 joinees (buddy assignments persist over 3 years; graduates are promoted, not unassigned) exceeds the cap. isPhaseReadyForGate() uses .every() over the truncated array and isGateFilled() uses .find(), so missing old rows make ready gates disappear and can make already-filled gates look unfilled.
- **Root cause:** Flat capped fetch feeding completeness-sensitive .every() logic.
- **Impact:** Pending items older than the 200 most-recent rows vanish from the review queue (a stale submission awaiting review for weeks is precisely the one that gets truncated); 'Fill Gate Pass' buttons never appear for joinees whose regular worksheets were approved months ago, blocking gc1/gc2/gc3 and w*_g1 gate filing — a required step in the promotion flow. Stats tiles (pending/buddy-approved/approved) are undercounted.
- **Reproduce:** Assign 6 joinees to one buddy, have each complete all 40 worksheets over time, then touch newer rows so an older joinee's approvals fall out of the top-200 by updated_at. That joinee's gate button disappears despite being ready.
- **Expected:** Complete per-joinee data (or server-side readiness) for any logic that requires seeing every worksheet
- **Current:** .in('user_id', ids).order('updated_at',{ascending:false}).limit(200)
- **Suggested fix:** Same server-side aggregation as the admin dashboard, or raise the query to fetch per-joinee scoped by the specific worksheet IDs the dashboard actually reasons about (.in('worksheet_id', [...all 40 ids]) per joinee is bounded at 40 × n_joinees — paginate or loop in batches), and compute gate readiness from a guaranteed-complete per-joinee set.
- **Verifier note:** BuddyDashboard.tsx:83 fetches all assigned joinees' submissions with .limit(200) ordered by updated_at desc; worksheetConfigData.ts defines 41 unique worksheet ids per joinee, so ~5 accumulated joinees exceed the cap — and accumulation is real because the joinee query (lines 68-69) has no role filter and the promotion RPC never clears assigned_buddy_id/assigned_lead_id. isPhaseReadyForGate's .every over the truncated array (lines 323-331) silently suppresses the only UI path to filing gc1-gc3/w*_g1 gate passes required for promotion, and pending-queue/stats filters (lines 99-114) silently drop items older than the 200 most-recent updates. No pagination, count check, truncation warning, or alternative gate-pass entry point exists.

#### [HIGH] Buddy-mode background autosave performs an upsert that RLS is guaranteed to reject — buddies filling gate passes get repeating 'Auto-save failed' error toasts and nothing is saved until submit  
`React Correctness & State Management` · ✅ verified

- **Location:** src/hooks/useAutoSave.ts:206-208 and 226, src/hooks/useGateControl.ts:180-200, supabase/migrations/20260710000006_row_level_security.sql:117-123
- **Description:** useGateControl routes the explicit SUBMIT through the upsert_gate_submission() SECURITY DEFINER RPC precisely because (per its own comment, useGateControl.ts:182-191) the direct client upsert cannot pass the 'Insert own submissions' policy (WITH CHECK auth.uid() = user_id) when a buddy writes a joinee-owned row. But the background debounced autosave path was left enabled in buddy mode: as soon as the buddy edits any field (toggleMilestone/updateField → setData → dirty=true), useAutoSave fires 1.5s later and calls supabase.from('worksheet_submissions').upsert(...) as the buddy with user_id = joinee. Postgres enforces the INSERT policy's WITH CHECK on rows proposed for insertion even on the ON CONFLICT DO UPDATE path, so the upsert fails with an RLS violation every time. The retry loop then runs 3 attempts with notifyError() on each attempt (useAutoSave.ts:226), and notifyError dispatches a visible error toast (src/utils/errorHandling.ts:30-36).
- **Root cause:** The H29 remediation reasoned that autosave is 'naturally disabled' in buddy mode 'unless the buddy actually edits something' (useAutoSave.ts:72-77) — but editing before submitting is exactly what buddies do; the dirty flag guarantees autosave fires on the path RLS forbids.
- **Impact:** Every buddy filling out a gate pass (BuddyGatePass → GateControl1/2/3, GateArtifact1-4) sees up to 3 'Auto-save failed:' toasts per pause in typing, saveStatus stuck on 'error', and none of their in-progress work is persisted — closing the tab before Submit loses everything, while the UI has been crying wolf the whole session. This is a broken core reviewer flow in production.
- **Reproduce:** Log in as a lead_instructor, open /buddy/gate-pass/<joineeId>/gc1, type into 'Buddy Notes', wait 1.5s. Network tab shows a 403 upsert (RLS: new row violates row-level security policy); three error toasts appear over ~9s (3s/6s backoff).
- **Expected:** Buddy-mode saves must never use the direct upsert. Either suppress background autosave entirely when isBuddyMode (accepting draft loss, with UI messaging), or route buddy-mode saves through the upsert_gate_submission RPC with a draft status.
- **Current:** useAutoSave runs the debounced upsert whenever dirty && loaded, regardless of isBuddyMode; only the submit path uses the RPC.
- **Suggested fix:** In useAutoSave's debounce effect (line 241-259) add `if (isBuddyMode) return;` (and set a distinct saveStatus like 'manual' so the header doesn't show 'saving'), or in save() branch to the RPC when isBuddyMode: `await supabase.rpc('upsert_gate_submission', { p_user_id: user.id, p_worksheet_id: worksheetId, p_data: data, p_status: <current review_status> })` — extending the RPC to accept non-transitioning draft saves.
- **Verifier note:** Verified end-to-end: BuddyGatePass renders all 7 gate components with targetUserId, useWorksheet builds autoSaveUser with the joinee's id (useWorksheet.ts:135-141), any buddy edit sets dirty via the wrapped setData, and useAutoSave's debounce effect (useAutoSave.ts:241-259) has no buddy-mode guard, so it upserts worksheet_submissions with user_id=joinee as the buddy. RLS rejects this in both states: fresh row fails "Insert own submissions" WITH CHECK auth.uid()=user_id (row_level_security.sql:117-123), and an existing pending_review row fails "Buddy update submissions" WITH CHECK review_status IN ('buddy_approved','needs_revision') since autosave never sends review_status — the claim's Postgres detail about INSERT WITH CHECK on the DO UPDATE path is technically wrong, but the outcome (rejection) is identical. Each failed save fires notifyError (visible toast) 3 times (useAutoSave.ts:226) and sticks saveStatus on 'error'; the only mitigations are that explicit Submit works via the upsert_gate_submission RPC and a beforeunload guard warns before tab close, so total data loss requires dismissing the browser warning — but zero buddy draft work is ever persisted and every editing pause produces false error toasts, which keeps this at HIGH.

#### [HIGH] In-app navigation during the 1.5s autosave debounce silently discards edits — unmount clears the timer without flushing, and beforeunload does not cover SPA navigation  
`React Correctness & State Management` · ✅ verified

- **Location:** src/hooks/useAutoSave.ts:251-258, src/hooks/useWorksheet.ts:307-318, src/components/WorksheetPage.tsx:161
- **Description:** The debounced autosave effect's cleanup (`return () => { if (timerRef.current) clearTimeout(timerRef.current); }`, useAutoSave.ts:258) runs on unmount and cancels any pending save with no flush. The beforeunload guard added in commit cf2b0a2 only fires on tab close/refresh — React Router navigation (the always-visible 'Cancel' button in ActionBar → navigate(backTo), the BackButton, the Navbar links) unmounts the worksheet without any prompt or flush. Any edits made in the final 1.5 seconds before navigating (or while a save is mid-retry — mountedRef.current=false breaks the retry loop at useAutoSave.ts:227) are silently lost.
- **Root cause:** Unmount cleanup treats a pending debounce as cancellable noise instead of unsaved data; there is no navigation blocker (React Router unstable_useBlocker/usePrompt) and no flush-on-unmount.
- **Impact:** Silent data loss in the primary user flow: a joinee finishes typing an answer, immediately clicks 'Back to Phase 1' or 'Cancel', and the last field's content vanishes. Because save status showed 'saved' from the previous debounce cycle, users have no reason to suspect loss.
- **Reproduce:** Open any worksheet, type into a field, and within 1.5s click the Cancel/Back button. Re-open the worksheet: the last edit is gone. No network write occurred (verify in devtools).
- **Expected:** Pending dirty data is flushed (fire-and-forget is acceptable) or the user is warned before in-app navigation while dirty.
- **Current:** Timer cleared on unmount; beforeunload handler only.
- **Suggested fix:** Add an unmount flush in useAutoSave: keep the latest {data,dirty} in refs and in a mount-scoped effect cleanup call `if (dirtyRef.current) void save(latestDataRef.current, { isSubmit: false })` (do not gate the write on mountedRef — only gate setState). Optionally also wire React Router's useBlocker to the same dirty flag so Cancel/Back prompts like beforeunload does.
- **Verifier note:** Verified end-to-end: the debounce effect's cleanup (src/hooks/useAutoSave.ts:258) clears the pending timer on unmount with no flush, and grep confirms zero useBlocker/usePrompt usage anywhere in src — flushSave is only called from explicit submit paths (useWorksheet.ts:257, useGateControl.ts:202), never on navigation. The beforeunload guard (useWorksheet.ts:307-318) only covers tab close/refresh, while WorksheetPage.tsx:161 (Cancel → navigate(backTo)) and the BackButton at line 155 unmount the component, discarding the useState-held edits with no prompt. The loss window is worse than claimed: continuous typing keeps resetting the 1.5s debounce (effect re-runs per keystroke, cleanup at :251/:258 cancels the prior timer), so everything typed since the last ≥1.5s pause is lost, and a navigation during a failed save's backoff breaks the retry loop via mountedRef (useAutoSave.ts:227-231). No server-side mitigation is possible since the data never leaves the client; HIGH stands for silent data loss in the primary joinee flow.

#### [HIGH] useWorksheet never resets loaded/dirty/data when the effective user or worksheet changes under a non-remounted component — cross-user data bleed in BuddyGatePass  
`React Correctness & State Management` · ⚠️ refuted by verifier (claimed HIGH, adjusted to LOW)

- **Location:** src/hooks/useWorksheet.ts:145-193, src/pages/BuddyGatePass.tsx:155
- **Description:** BuddyGatePass renders `<GateComponent targetUserId={userId} />` without a key, so navigating from /buddy/gate-pass/A/gc1 to /buddy/gate-pass/B/gc1 keeps the same GateControl1 instance and thus the same useWorksheet state. The load effect re-runs for B, but: (1) `loaded` stays true from A throughout B's fetch, so A's form data is displayed as B's; (2) `dirty` is not reset, so if the buddy had edited A's form, the autosave effect re-arms immediately (its `save` dependency changes identity because user.id changed) and schedules a save of A's in-memory data under B's user_id 1.5s later — racing B's load; (3) hydration merges with `setDataRaw(prev => ({ ...prev, ...saved.worksheet_data }))`, so any field A had that B's row lacks (e.g. buddyNotes) survives the merge and is later persisted into B's row on the next save. lastSavedJsonRef/dueDateSetRef in useAutoSave are also never reset across identity changes.
- **Root cause:** Identity-carrying hook state (data, loaded, dirty) is keyed to component lifetime, not to (effectiveUserId, worksheetId); the consumer doesn't force a remount with key.
- **Impact:** One joinee's gate-pass content (notes, milestone states) can be displayed as, and written into, another joinee's row — cross-user data corruption performed with the buddy's legitimate credentials (submit goes through the SECURITY DEFINER RPC which would accept it). Today the UI reaches this mostly via manual URL edits since dashboard navigation remounts, but nothing in the code prevents it, and any future direct link (e.g. from notifications) makes it routine.
- **Reproduce:** As a buddy, open /buddy/gate-pass/A/gc1, type into Buddy Notes (dirty=true), then edit the URL to /buddy/gate-pass/B/gc1 (no full reload). Observe A's notes still rendered; wait for autosave/submit and inspect B's worksheet_submissions row.
- **Expected:** Changing effectiveUserId or worksheetId must behave like a fresh mount: defaults restored, loaded=false, dirty=false, autosave refs cleared.
- **Current:** Load effect only merges new data over old state; no reset of loaded/dirty/defaults; GateComponent not keyed.
- **Suggested fix:** Cheapest: key the component — `<GateComponent key={`${userId}-${gateId}`} targetUserId={userId} />` in BuddyGatePass.tsx:155 (and audit other non-keyed useWorksheet consumers). Defense in depth: at the top of useWorksheet's load effect, synchronously reset — setLoaded(false); setDirty(false); setDataRaw({...defaultData, _saved…: ''}) — before fetching, and reset lastSavedJsonRef/dueDateSetRef inside useAutoSave when worksheetId or user.id changes.
- **Verifier note:** The hook-level facts are accurate (useWorksheet.ts:145-193 never resets loaded/dirty/data on identity change; BuddyGatePass.tsx:155 has no key), but the claimed cross-user bleed is unreachable: BuddyGatePass's loadJoinee effect (lines 40-62) sets loading=true on every userId change, and the loading early-return (lines 82-91) unmounts the GateComponent, then remounts a fresh instance (loaded=false, dirty=false, defaultData, fresh autosave refs) once the new joinee's profile loads. The 1500ms autosave debounce armed in the single pre-skeleton commit is cleared by the effect cleanup (useAutoSave.ts:258) on that unmount, so no save of user A's data under user B's id can fire, and the merge-hydration path starts from defaults, not A's data. What remains is a one-frame flash of the previous form plus a latent fragility that relies on the parent's incidental remount — worth a key={userId} hardening, not a HIGH data-corruption finding.

#### [HIGH] Gate-submission RPC accepts arbitrary review_status on INSERT, letting an assigned buddy grant terminal 'approved' and bypass manager review  
`Security Vulnerabilities` · ✅ verified

- **Location:** supabase/migrations/20260710000007_gate_submission_rpc.sql:25-83 (p_status param, INSERT at 64-71); state-machine trigger is BEFORE UPDATE only: supabase/migrations/20260710000003_review_state_machine.sql:107-110
- **Description:** upsert_gate_submission() is SECURITY DEFINER and writes review_status = p_status verbatim with no validation that the caller's role is allowed to set that value. The only server-side review-state enforcement, validate_review_transition(), is a BEFORE UPDATE trigger (see migration 3 line 108-110 and db/schema.sql:486) — there is NO BEFORE INSERT trigger on worksheet_submissions. Gate worksheets (gc1/gc2/gc3) normally have no row until the buddy files the first one, so the buddy's submission is a fresh INSERT, which the trigger never sees. The RLS INSERT policy is also bypassed because SECURITY DEFINER runs as the function owner. The column CHECK constraint permits 'approved'. The client always sends p_status:'buddy_approved' (useGateControl.ts:198), but any authenticated user can call supabase.rpc('upsert_gate_submission', { p_user_id, p_worksheet_id:'gc1', p_data:{}, p_status:'approved' }) directly; the RPC's internal auth check only verifies the caller is the joinee's assigned buddy (or academic_head), not that p_status is legal for that role.
- **Root cause:** State-machine enforcement was implemented as a BEFORE UPDATE trigger only; the SECURITY DEFINER RPC's INSERT path is an unguarded side door that trusts a client-supplied status.
- **Impact:** An assigned buddy (lead_instructor) can unilaterally set a gate worksheet to the terminal 'approved' state, skipping the academic_head (manager) approval step that the entire review state machine is designed to enforce. gc1/gc2/gc3 are in promotion_required_worksheets, so this directly feeds the auto-promotion counter. It collapses the intended two-stage buddy→manager gate control into a single buddy-controlled action.
- **Reproduce:** As a logged-in buddy assigned to joinee Y, call supabase.rpc('upsert_gate_submission', { p_user_id: Y, p_worksheet_id: 'gc1', p_data: {}, p_status: 'approved' }). Row is inserted with review_status='approved', reviewed_by=buddy, with no manager involvement.
- **Expected:** Only academic_head may move a worksheet to 'approved'; a buddy INSERT must be capped at 'buddy_approved'.
- **Current:** p_status flows straight into INSERT ... review_status = p_status; no BEFORE INSERT validation exists.
- **Suggested fix:** Validate p_status inside the RPC: reject anything except 'buddy_approved' / 'needs_revision' when caller_role='lead_instructor', or hardcode review_status='buddy_approved' and ignore the client value entirely for the buddy path. Alternatively add a BEFORE INSERT branch to validate_review_transition() (change the trigger to BEFORE INSERT OR UPDATE and handle TG_OP='INSERT') so INSERTs are held to the same allowed initial-status set as UPDATEs.
- **Verifier note:** Confirmed. upsert_gate_submission (supabase/migrations/20260710000007_gate_submission_rpc.sql:64-77, identical in db/schema.sql:728+) writes p_status verbatim into review_status with no role-vs-status validation; its only auth check is assigned-buddy-or-academic_head (lines 47-53), and it is GRANTed to all authenticated users (line 83). The sole state-machine enforcement, validate_review_transition, is BEFORE UPDATE only (20260710000003_review_state_machine.sql:108-110) — no INSERT trigger exists on worksheet_submissions — and the trigger explicitly forbids lead_instructor from setting 'approved' (lines 76-82), which is exactly what a fresh RPC INSERT with p_status='approved' bypasses; gate rows do not pre-exist (the RPC's own comment at lines 13-17 says the joinee never has a row until the buddy files one), the CHECK constraint permits 'approved' (initial_schema.sql:250-253), and gc1/gc2/gc3 are in promotion_required_worksheets feeding promote_user_if_eligible's review_status='approved' count (20260710000005 lines 23-27, 57-61). Worse than claimed: p_worksheet_id is unconstrained (unknown ids default to phase1), so a buddy can also pre-INSERT review_status='approved' rows for any not-yet-submitted non-gate worksheet, directly stuffing the auto-promotion counter. HIGH (not CRITICAL) because it requires an assigned buddy or academic_head, not an arbitrary user.

#### [HIGH] RLS 'Admin update profiles' over-grants UPDATE on ALL user_profiles to buddy (lead_instructor) and onboarding_lead, enabling self-assignment onto any joinee  
`Security Vulnerabilities` · ✅ verified

- **Location:** supabase/migrations/20260710000006_row_level_security.sql:85-91 (also 'Admin read all profiles' 76-79)
- **Description:** The policy's USING and WITH CHECK both include lead_instructor and onboarding_lead alongside academic_head. WITH CHECK only pins the role column (prevents role change) — every other column, including assigned_buddy_id and assigned_lead_id, is freely updatable on ANY user's row. But the app treats only academic_head as an admin: the /admin route and AssignmentsTab are gated to requiredRoles={['academic_head']} (src/App.tsx:126). onboarding_lead is explicitly documented as a read-only monitoring role (same migration, lines 196-197). So RLS is materially broader than the application's authorization model.
- **Root cause:** The admin-update policy's role list was widened to cover multiple reviewer roles instead of just the manager, without narrowing which columns or target rows they may touch.
- **Impact:** Any buddy (lead_instructor) can call supabase.from('user_profiles').update({ assigned_buddy_id: <self> }).eq('id', <anyJoinee>) directly and make themselves the assigned buddy of any joinee — not just ones assigned to them. That grants them reviewer SELECT/UPDATE on that joinee's worksheets (Reviewers/Buddy policies key off assigned_buddy_id = auth.uid()) and the ability to call upsert_gate_submission for them. Combined with finding #1, a single buddy can seize review control of any joinee and approve their gates. onboarding_lead (meant read-only) can likewise rewrite assignments. This is a horizontal→vertical privilege escalation across the whole review system.
- **Reproduce:** Log in as a buddy; run supabase.from('user_profiles').update({ assigned_buddy_id: currentUserId }).eq('id', someOtherJoineeId). Update succeeds under 'Admin update profiles'.
- **Expected:** Only academic_head (the sole admin per App.tsx routing) should update other users' profile/assignment fields.
- **Current:** USING/WITH CHECK: get_user_role() IN ('academic_head','lead_instructor','onboarding_lead').
- **Suggested fix:** Restrict 'Admin update profiles' USING/WITH CHECK to public.get_user_role() = 'academic_head' (drop lead_instructor and onboarding_lead). If leads legitimately need to manage assignments, do it through a SECURITY DEFINER RPC that validates the caller and constrains which columns/targets are writable, rather than a blanket table-level UPDATE policy.
- **Verifier note:** Real for lead_instructor: the "Admin update profiles" policy (rows 85-91) includes lead_instructor in USING and WITH CHECK, and WITH CHECK pins only the role column, leaving assigned_buddy_id/assigned_lead_id freely updatable on any user_profiles row. No trigger guards those columns. The app gives buddies no assignment surface (canAssign = isManager||isOnboardingLead, AdminDashboard.tsx:69; /buddy has none), so a buddy can directly self-assign onto any joinee via a raw supabase update, gaining reviewer SELECT/UPDATE and gate-approval (is_assigned_buddy in gate RPC). Unmitigated server-side. However the claim is partly inaccurate: /admin is gated to ['academic_head','onboarding_lead'] (App.tsx:126) and onboarding_lead is deliberately allowed to assign (canAssign includes isOnboardingLead), so the onboarding_lead over-grant is intended, not a defect; the "read-only" note applies only to worksheet_submissions. The lead_instructor escalation alone justifies HIGH.

#### [HIGH] Zero automated tests for the server-side security and state-machine layer (RLS, triggers, RPCs)  
`Testing Audit` · ✅ verified

- **Location:** supabase/migrations/20260710000003_review_state_machine.sql:14-108, 20260710000005_promotion_rpc_and_due_dates.sql:30, 20260710000006_row_level_security.sql:54-214, 20260710000007_gate_submission_rpc.sql:25
- **Description:** The actual enforcement boundary of this app is Postgres: the validate_review_transition BEFORE UPDATE trigger, the promote_user_if_eligible SECURITY DEFINER RPC, the upsert_gate_submission RPC, handle_new_user, and ~15 RLS policies across 4 tables. None of these have any automated test — no pgTAP, no supabase-test harness, nothing in CI. The client-side mirror (src/utils/reviewStateMachine.ts) is exhaustively tested, but the client explicitly documents the DB trigger as "the sole guard" (src/hooks/useAutoSave.ts:17-20) and the SQL can silently drift from the 186-line TS test matrix. The only thing exercising the DB is scripts/e2e-full-flow.mjs, a manual script requiring a live instance and credentials, referenced nowhere in package.json or .github/workflows/ci.yml.
- **Root cause:** Testing effort was invested entirely in the Vitest/jsdom layer; the Supabase layer was validated once manually via scripts/e2e-full-flow.mjs and never automated.
- **Impact:** A migration edit that loosens an RLS policy (e.g. letting a joinee UPDATE their own review_status to 'approved') or breaks the transition trigger would pass CI completely green — typecheck, lint, 281 tests, build. The security invariants the client tests assert (owner can never reach 'approved') are only actually enforced server-side, where nothing verifies them.
- **Reproduce:** grep -rn 'pgtap\|pg_prove\|supabase test' supabase/ scripts/ package.json → no matches. grep e2e .github/workflows/ci.yml package.json → no matches.
- **Suggested fix:** Add a DB test stage: run `supabase start` (local Postgres) in CI, apply migrations, and add pgTAP tests (supabase/tests/*.sql, run via `supabase test db`) asserting: (1) joinee UPDATE of review_status to 'approved' is rejected by trigger/RLS; (2) promote_user_if_eligible refuses when any required worksheet is not approved and promotes when all are; (3) upsert_gate_submission rejects a caller who is neither the assigned buddy nor academic_head; (4) each RLS policy's allow/deny per role using set-local request.jwt.claims. Alternatively wire a non-interactive mode of e2e-full-flow.mjs against a CI-local Supabase.
- **Verifier note:** Verified on current main: the trigger, both SECURITY DEFINER RPCs, and ~15 RLS policies exist at the cited lines, and there is no pgTAP/supabase-test harness anywhere — all 17 test files are client-side Vitest with mocked Supabase. .github/workflows/ci.yml runs only tsc/eslint/vitest/build, and scripts/e2e-full-flow.mjs (the only thing that exercises the real DB) is referenced nowhere in package.json or CI. src/hooks/useAutoSave.ts:17 confirms verbatim that "the DB trigger is the sole guard", so the exhaustively-tested TS mirror is non-authoritative and the actual enforcement boundary ships with zero automated verification. HIGH stands: a policy/trigger regression in a migration would pass CI completely green.

#### [HIGH] useGateControl test suite is tautological — the gate submission flow is effectively untested  
`Testing Audit` · ✅ verified

- **Location:** src/hooks/__tests__/useGateControl.test.ts:56-79 (vs src/hooks/useGateControl.ts:119-225)
- **Description:** The three tests assert (a) the hook export is a function, (b) a locally-declared object literal equals itself ('submitted' === 'submitted'), and (c) a locally-declared array `['Not Met','Partial','Met']` cycles — never calling toggleMilestone or handleSubmit at all. Meanwhile useGateControl.handleSubmit contains the most consequential client logic in the app: the fail-closed phase-prerequisite check (checkPhaseWorksheetsComplete, lines 30-71), required-field validation, the buddy-mode routing decision between the upsert_gate_submission RPC and flushSave (lines 180-203), revision_submitted status computation, and the StrictMode double-submit guard (submitGuardRef). None of it is exercised.
- **Root cause:** Placeholder smoke tests were written to make the file exist, then never replaced with renderHook-based tests.
- **Impact:** Any regression in gate submission ships undetected while CI stays green. Concretely testable latent hazard: line 142 computes `parseInt(phase.replace('phase',''))` — a caller passing 'phase-1' (the exact format used elsewhere, e.g. useWorksheet tests and useAutoSave's default phase 'phase-1') yields phaseNum=-1, PHASE_WORKSHEETS_MAP[-1] is undefined, and checkPhaseWorksheetsComplete returns complete:true — the prerequisite gate is silently skipped. Current gate pages pass 'phase1' so it works today, but a real hook test would pin this.
- **Reproduce:** Read src/hooks/__tests__/useGateControl.test.ts — no renderHook call ever invokes handleSubmit or toggleMilestone; delete the entire body of handleSubmit and the suite still passes.
- **Suggested fix:** Rewrite using renderHook with mocked supabase (pattern already established in useWorksheet.test.ts): assert (1) submit blocked with named missing worksheets when prerequisites are not buddy_approved/approved; (2) fail-closed on query error; (3) joinee mode calls flushSave, never the RPC; (4) buddy mode calls supabase.rpc('upsert_gate_submission', {p_user_id, p_worksheet_id, p_data, p_status:'buddy_approved'}) and never a direct upsert; (5) _savedReviewStatus==='needs_revision' produces 'revision_submitted'; (6) phase string 'phase-1' vs 'phase1' both engage the prerequisite check (fixing the parse to strip non-digits).
- **Verifier note:** Verified line-by-line: src/hooks/__tests__/useGateControl.test.ts:56-79 never renders or invokes the hook — test 1 checks the export is a function, tests 2-3 assert locally-declared literals against themselves ('submitted'==='submitted', a local cycle array), while the elaborate vi.mock scaffolding (lines 5-43) is never exercised. None of handleSubmit's logic (useGateControl.ts:119-225) — required-field validation, the client-only fail-closed prerequisite check at 141-161, the buddy-mode RPC-vs-flushSave routing at 180-203, revision_submitted computation, submitGuardRef — is covered by any other test (reviewFlow.test.ts tests different helpers; no test references handleSubmit or upsert_gate_submission), and no migration enforces the phase-prerequisite server-side (20260710000007 only checks caller authorization; the joinee path is a plain upsert). The cited parseInt hazard is real and already half-manifest: GateArtifact1.tsx:26 passes phase 'week-1', which yields NaN and silently skips the prerequisite check, and 'phase-1' would yield phaseNum=-1 → PHASE_WORKSHEETS_MAP[-1] undefined → complete:true per lines 35-37; the only partial downstream mitigation is that the separate promotion RPC re-verifies worksheets server-side, but gate submissions themselves would regress undetected with green CI.

#### [HIGH] PhaseReview.tsx — the only path to 'approved' status and the only promotion trigger — has zero tests  
`Testing Audit` · ✅ verified

- **Location:** src/pages/PhaseReview.tsx:105-180 (handleApprovePhase), 163 (checkAndPromote call)
- **Description:** Manager approval is exclusively phase-level: WorksheetReview.tsx offers buddies approve→buddy_approved and managers only request_revision; the buddy_approved→approved transition happens solely in PhaseReview.handleApprovePhase (bulk UPDATE with .in('id', ids).eq('review_status','buddy_approved') optimistic guard), which then calls checkAndPromote — the promotion entry point. The 447-line file has no test: not the partial-update reconciliation branch (updatedCount < toApprove.length → warning + delayed reload), not the empty-toApprove early return, not the error path, not the per-worksheet handleRequestRevision from the phase list. checkAndPromote itself is unit-tested (useAutoPromote.test.ts), but the page wiring that invokes it is not.
- **Root cause:** Component-test effort covered WorksheetReview (single-sheet flow) but stopped before the phase-level bulk flow.
- **Impact:** The final step of the entire onboarding funnel — manager sign-off and joinee promotion — can regress (e.g. the concurrent-change branch mis-counting, the .eq state guard being dropped, checkAndPromote being called with '' on a bad route param) without any test failing. This is the flow with the fewest daily executions and therefore the least likely to be caught manually before it matters.
- **Reproduce:** ls src/pages/__tests__/ → only WorksheetReview.test.tsx exists; grep -rn 'PhaseReview' src/**/__tests__ → no matches.
- **Suggested fix:** Add src/pages/__tests__/PhaseReview.test.tsx mirroring the WorksheetReview.test.tsx queued-chain pattern: (1) all-buddy_approved phase → single bulk update called with review_status:'approved' and the .eq('review_status','buddy_approved') guard, success toast, checkAndPromote invoked with the route userId; (2) server returns fewer rows than requested → partial-approval warning path, no promotion toast; (3) update error → error surfaced, checkAndPromote NOT called; (4) nothing buddy_approved → early return with no supabase update.
- **Verifier note:** PhaseReview.tsx (447 lines) has no test file; grep confirms it is the only production code setting review_status='approved' and the only caller of checkAndPromote (PhaseReview.tsx:163), so the entire manager-approval + promotion funnel is untested — reviewFlow.test.ts only covers pure readiness helpers and useAutoPromote.test.ts covers checkAndPromote in isolation. The server-side validate_review_transition trigger mitigates data corruption but not funnel breakage, and the untested wiring already looks hazardous: promote_user_if_eligible() promotes auth.uid() (the caller), yet PhaseReview invokes it from the manager's session on behalf of a joinee, exactly the class of regression the missing tests would catch. HIGH stands.

#### [HIGH] Worksheet load failure leaves users on an infinite 'Loading…' screen with no error or retry  
`UI/UX & Accessibility` · ✅ verified

- **Location:** src/components/WorksheetPage.tsx:82,106; src/hooks/useWorksheet.ts:43-50,145-199; src/pages/gate-controls/GateControl1.tsx:79
- **Description:** useWorksheet deliberately never sets loaded=true when the initial Supabase load fails, and exposes loadError/retryLoad with a doc comment saying 'Callers should surface this with a retry affordance'. No caller does: WorksheetPage destructures only { data, loaded, ... } and renders <LoadingView/> ('Loading…' text) whenever !loaded; all three GateControl pages do the same (useGateControl returns loadError/retryLoad but the components never read them). A grep for loadError/retryLoad across all worksheet and gate-control consumers returns zero hits.
- **Root cause:** WorksheetPage.tsx line 82 does not destructure loadError/retryLoad from the useWorksheet result, and line 106 gates the whole page only on `!loaded`.
- **Impact:** Any transient network error, RLS hiccup, or Supabase outage during worksheet open strands the joinee on a permanent 'Loading…' page with no message and no retry button, across all ~40 worksheets and 3 gate controls — the core flow of the product. Users will assume the app is broken and may lose trust or file support tickets; the only recovery is a full page reload they have to guess at.
- **Reproduce:** Open any worksheet (e.g. /phase-1/worksheet-1) with the network throttled to offline for the first request. loadWorksheetData returns an error, loadError is set, loaded stays false, and the page shows 'Loading…' forever.
- **Expected:** On load error, render an error view with the loadError message and a Retry button wired to retryLoad (same pattern already used in Dashboard.tsx:174-192).
- **Current:** if (!loaded) return <LoadingView />; — LoadingView is static 'Loading…' text.
- **Suggested fix:** In WorksheetPage (and GateControl1/2/3), add before the loading branch: `if (ws.loadError) return <WorksheetLoadError message={ws.loadError} onRetry={ws.retryLoad} onBack={() => navigate(backTo)} />;` reusing the existing error-view markup from PhaseAccessGuard.
- **Verifier note:** Verified end-to-end: useWorksheet.ts:150-157 never sets loaded=true on load failure and exposes loadError/retryLoad with a doc comment telling callers to surface it, but WorksheetPage.tsx:82,106 destructures without them and renders a bare 'Loading…' LoadingView (worksheetComponents.tsx:277-285) on !loaded, as do GateControl1-3 AND GateArtifact1-4 (7 gate pages, wider than claimed). Grep confirms zero consumers of the hook's loadError/retryLoad; the loadError hits on Dashboard/Phase pages are unrelated local states, and handleSubmit blocks while loadError is set so the stuck screen has no escape besides a manual full-page reload. No error boundary, toast, or retry mitigates this, so any transient Supabase/network failure permanently strands users on the core worksheet flow — HIGH is warranted.

#### [HIGH] Failed submit shows the 'Submitted' success view; error message unmounts before it can render  
`Input Validation & Error Handling` · ✅ verified

- **Location:** src/hooks/useWorksheet.ts:256-257, src/components/WorksheetPage.tsx:103-105, src/hooks/useGateControl.ts:169-178, src/pages/gate-controls/GateControl1.tsx:48-78
- **Description:** handleSubmit calls setData(submitData) with status='submitted' (and in gate-control buddy mode _savedReviewStatus='buddy_approved') BEFORE awaiting flushSave/the RPC. The component re-renders immediately: isSubmitted/isBuddyApproved become true and WorksheetPage/GateControl early-return the SubmittedView/BuddyApprovedView, unmounting the form and its ErrorAlert. If flushSave then fails after its 3 retries, the catch sets submitError — which is no longer rendered anywhere — and shows only a 3.5s toast. Worse, dirty stays true, so the background autosave (which fires 1.5s after setData, concurrently with the still-retrying flushSave) re-sends the same payload WITHOUT review_status (isSubmit=false). If that background save succeeds while the explicit save failed, the row is persisted with status='submitted' and review_status='' — a state that BuddyDashboard's queue filter (review_status IN pending_review/revision_submitted, BuddyDashboard.tsx:99-101) never shows, while the joinee's page permanently renders 'Submitted' on every reload.
- **Root cause:** Optimistic state mutation before awaiting the write, combined with early-return success views keyed off the same optimistic state.
- **Impact:** A joinee on a flaky connection is told their worksheet was submitted when it was not, or gets a limbo row that shows 'Submitted' to them forever but never appears in any reviewer queue — the onboarding pipeline silently stalls with no recovery path in the UI.
- **Reproduce:** Open any worksheet, fill required fields, throttle network to offline in DevTools, click Submit for Review. Page immediately shows 'Worksheet Submitted' success view; ~20s later a brief 'Submission failed' toast appears; the success page remains.
- **Expected:** Form stays mounted with a spinner until the save confirms; failure re-renders the form with a persistent error and retry.
- **Current:** Success view renders instantly regardless of save outcome; error only exists as a transient toast and an unmounted submitError.
- **Suggested fix:** Do not swap to the success view until the write is confirmed: keep a local 'submitting' view state and only setData(submitData)/markClean after flushSave resolves; on rejection, roll data.status back to its prior value and keep the form mounted with submitError visible. Also suppress the background autosave while an explicit submit is in flight (e.g. an inFlightRef in useAutoSave), so a failed submit can never be half-persisted without its review_status transition.
- **Verifier note:** Verified in code: useWorksheet.ts:256 calls setData (status='submitted') before awaiting flushSave, so isSubmitted flips true and WorksheetPage.tsx:103-105 (and GateControl1.tsx:48-78 via useGateControl.ts:169-178) unmount the form and ErrorAlert before the save resolves; on failure the catch sets submitError that nothing renders, leaving only a 3.5s toast (Toast.tsx:69) while the success view persists. dirty stays true (markClean only runs on success), so the autosave effect (useAutoSave.ts:241-259) fires a concurrent save at 1.5s with isSubmit=false that omits review_status; the DB trigger (migration 20260710000003) only validates review_status when it changes and nothing server-side derives it from status, so if that background save succeeds while all 3 explicit attempts fail, the row persists as status='submitted'/review_status='' — invisible to every BuddyDashboard bucket (BuddyDashboard.tsx:99-107) while the joinee permanently sees SubmittedView with no resubmit path. Only caveats: revision resubmits are unaffected (form stays mounted), and the permanent-limbo variant needs the narrower background-succeeds/explicit-fails race — but the deterministic false-success on any failed first submit alone supports HIGH.

#### [HIGH] Worksheet load failure renders an infinite skeleton — loadError/retryLoad are wired into zero pages  
`Input Validation & Error Handling` · ✅ verified

- **Location:** src/components/WorksheetPage.tsx:106, src/pages/gate-controls/GateControl1.tsx:79, src/pages/gate-controls/GateArtifact1.tsx:41 (and all sibling gate pages)
- **Description:** useWorksheet deliberately never sets loaded=true when the initial Supabase read fails, and exposes loadError + retryLoad, with a doc comment saying 'Callers should surface this with a retry affordance'. No caller does: WorksheetPage destructures neither loadError nor retryLoad and falls through to `if (!loaded) return <LoadingView />`; all seven gate-control/gate-artifact pages do the same. A grep for loadError/retryLoad across WorksheetPage.tsx, gate-controls/*, and worksheetComponents.tsx returns zero hits. The only console.error is emitted (useWorksheet.ts:153).
- **Root cause:** The retry API was added to the hook during the prior remediation but the corresponding UI wiring was never done in any consumer.
- **Impact:** Any transient network/RLS/read failure when opening any of the ~40 worksheets leaves the user staring at a permanent loading skeleton with no message and no retry — indistinguishable from a hung app. Users will assume the portal is down.
- **Reproduce:** Open a worksheet with the network offline (or block the worksheet_submissions request). The page shows LoadingView forever; console shows 'Load error [p1_w1]: ...'.
- **Expected:** Visible 'Unable to load your saved worksheet' message with a Retry button (the string already exists in the hook).
- **Current:** Silent infinite skeleton; error only in console.
- **Suggested fix:** In WorksheetPage (and the gate pages, or a shared wrapper), render an error view when loadError is non-empty: `if (loadError) return <LoadErrorView message={loadError} onRetry={retryLoad} />` before the `!loaded` skeleton branch. The hook already provides everything needed.
- **Verifier note:** Verified line-by-line: useWorksheet.ts:150-157 never sets loaded=true on load failure and exposes loadError/retryLoad with a doc comment demanding callers surface them, yet WorksheetPage.tsx:82/106 and all 7 gate pages (e.g. GateControl1.tsx:79, GateArtifact1.tsx:41) destructure neither and render a bare static LoadingView (worksheetComponents.tsx:277-285) forever; grep confirms zero consumers of loadError/retryLoad from the worksheet hooks anywhere. There is no auto-retry, no timeout, and nothing throws for an ErrorBoundary, so any failed initial read on any of the ~40 worksheets is a permanent unlabeled skeleton recoverable only by a blind page refresh. HIGH stands: it affects the app's primary flow app-wide, and RLS/persistent failures make it a hard dead-end, though no data is lost (autosave is correctly blocked).

#### [HIGH] Buddy-mode background autosave always violates RLS — failed writes and toast spam on every edit, no draft persistence for buddy gate passes  
`Input Validation & Error Handling` · ✅ verified

- **Location:** src/hooks/useAutoSave.ts:196-208 and 241-259, supabase/migrations/20260710000006_row_level_security.sql:117-172, src/hooks/useGateControl.ts:180-200
- **Description:** When a buddy fills a gate pass (BuddyGatePass → GateControl with targetUserId), useWorksheet passes overrideUserId to useAutoSave, and every edit marks the data dirty, so the debounced background save fires a DIRECT client upsert on worksheet_submissions with user_id = joinee. RLS guarantees this fails: 'Insert own submissions' requires auth.uid() = user_id (never true for the buddy), and 'Buddy update submissions' WITH CHECK requires the row's review_status to be 'buddy_approved' or 'needs_revision' — but a background save never changes review_status, so a draft row in ''/pending_review fails the check. Only the explicit submit is routed through the upsert_gate_submission RPC (useGateControl.ts:194); the autosave path is not. Each failed save runs 3 attempts, each calling notifyError → an error toast per attempt.
- **Root cause:** The gate-RPC fix (H2) covered only the explicit submit path; the shared useAutoSave effect still uses the owner-oriented direct upsert for buddy-mode edits.
- **Impact:** A buddy filling a 30-day gate review gets 'Auto-save failed' toasts roughly every time they pause typing (3 toasts per cycle), and none of their in-progress work is ever persisted — closing the tab before the final Submit loses the entire gate review. Edge case: if the joinee's row is in needs_revision, the buddy's autosave PASSES the WITH CHECK and silently overwrites the joinee's worksheet_data mid-revision.
- **Reproduce:** As a lead_instructor, open /buddy/gate-pass/<joineeId>/gc1, type into 'Key Strengths Observed', wait 1.5s. Observe 3 consecutive 'Auto-save failed:' error toasts and a 42501/RLS error in the network tab; repeat on every edit.
- **Expected:** Buddy edits either save via an authorized path or autosave is cleanly disabled with no error noise.
- **Current:** Guaranteed RLS rejection, repeated error toasts, zero persistence until final submit.
- **Suggested fix:** Disable background autosave entirely in buddy mode (pass a flag from useWorksheet when overrideUserId is set and return early in the autosave effect), or route buddy-mode saves through the upsert_gate_submission RPC with a draft status. The hook already knows isBuddyMode.
- **Verifier note:** Verified end-to-end: BuddyGatePass.tsx:155 passes targetUserId into GateControl → useGateControl → useWorksheet(overrideUserId) → useAutoSave with user.id swapped to the joinee (useWorksheet.ts:135-141); every buddy edit sets dirty, and the debounced background save (useAutoSave.ts:241-259) does a direct client upsert with user_id=joinee that RLS guarantees to reject — the sole INSERT policy requires auth.uid()=user_id (row_level_security.sql:117-123) and the Buddy UPDATE WITH CHECK requires review_status in ('buddy_approved','needs_revision') (lines 164-172), which a non-submit save never sets — producing 3 notifyError toasts per failed cycle and zero draft persistence; only the explicit submit uses the upsert_gate_submission RPC (useGateControl.ts:194-200), whose own comment admits the direct path is RLS-blocked. The needs_revision silent-overwrite edge case is also real: validate_review_transition returns NEW for non-owner no-status-change updates (review_state_machine.sql:50-52). Mitigations (working RPC submit, beforeunload dirty-guard at useWorksheet.ts:307-318) reduce accidental tab-close loss but do not prevent toast spam, crash/session data loss, or the overwrite path, so HIGH is warranted.

## MEDIUM findings (93)

#### [MEDIUM] Dual phase/week taxonomy gives the same worksheet two different gating policies — p1_w7 (a Week 2 session) is reachable completely ungated via the phase route  
`Architecture & Spec Compliance`

- **Location:** src/App.tsx:95-113 (route generation, phaseNum>1 only gets PhaseAccessGuard); src/config/worksheetConfigData.ts:520 (p1_w7 in ALL_WORKSHEETS 'Phase 1'); src/config/weeklyWorksheets.ts:34 (p1_w7 in week2Worksheets); src/App.tsx:155 (week-2 route guarded)
- **Description:** Every worksheet that appears in both taxonomies is routed twice with different guards. /week-2/worksheet/p1_w7 is behind WeekAccessGuard(2) (requires all Week 1 worksheets submitted), but the generated /phase-1/worksheet-7 route renders the identical component with NO guard at all because phaseNum === 1 skips PhaseAccessGuard (App.tsx:106-108). Similarly p2_w1/p2_w2/p2_w4/p3_w5/p3_w1 are reachable via week-3/week-4 routes on mere week-2/3 submission, while their /phase-2 and /phase-3 routes require full manager approval of the prior phase. The weakest route wins in every case. The PHASE_WORKSHEETS_MAP comment (worksheetConfigData.ts:558-565) documents the deadlock-avoidance intent for weeks 2-4, but the ungated p1_w7 phase route is not covered by that rationale.
- **Root cause:** Two overlapping worksheet taxonomies (legacy phases, FTP weeks) each got their own routes and guards; nothing derives a single effective policy per worksheet ID.
- **Impact:** Curriculum sequencing is inconsistent even at the client level: a day-1 joinee can open and fill the Week-2 'Quality Standard' worksheet at /phase-1/worksheet-7 without completing anything, and the two entry points show users differently-gated views of the same resource. Future maintainers cannot reason about 'what unlocks this worksheet' — the answer depends on which URL is used.
- **Reproduce:** As a brand-new joinee with zero submissions, navigate to /phase-1/worksheet-7 → Courseware Review Matrix renders and is editable. Navigate to /week-2/worksheet/p1_w7 → 'Week 2 Locked'.
- **Suggested fix:** Make gating a property of the worksheet ID, not the route: derive a single guard from a per-worksheet 'unlockedBy' rule (e.g. a map wsId → {week?:n, phase?:n}) and apply it in both route generators; at minimum wrap the /phase-1/worksheet-7 route in WeekAccessGuard(2) since the curriculum places it in Week 2.

#### [MEDIUM] Gate prerequisite check silently no-ops for all four FTP gates due to magic-string phase protocol  
`Architecture & Spec Compliance`

- **Location:** src/hooks/useGateControl.ts:141-161; src/pages/gate-controls/GateArtifact1.tsx:26 (phase: 'week-1'), GateArtifact2.tsx:19, GateArtifact3.tsx:19, GateArtifact4.tsx:19
- **Description:** useGateControl.handleSubmit derives the phase to validate via parseInt(phase.replace('phase', ''), 10) and runs checkPhaseWorksheetsComplete only 'if (!isNaN(phaseNum))'. GateControl1-3 pass 'phase1'/'phase2'/'phase3' so the check runs; GateArtifact1-4 pass 'week-1'…'week-4', which parse to NaN, so the documented 'Gate completion check: verify phase worksheets are buddy_approved/approved' is silently skipped for every FTP gate (w1_g1–w4_g1). There is no week-equivalent check: a joinee can submit 'Gate 1 — Anchor Artifacts' with zero Week 1 worksheets even started, as long as they tick their own checkboxes. Nothing marks this as intentional — it falls out of string parsing.
- **Root cause:** The phase parameter is a stringly-typed protocol ('phaseN' vs 'week-N') with parsing-as-dispatch; the FTP gates reused the hook without a week-mode branch.
- **Impact:** The FTP gates — the formal weekly sign-off artifacts — enforce no prerequisites, unlike the legacy phase gates, and since a submitted w1_g1 counts toward 'Week 1 complete' in WeekAccessGuard, submitting the gate is part of unlocking Week 2 without the underlying work being reviewed. Behavior differs between two gate families for a reason no reader can discover without tracing parseInt.
- **Reproduce:** Fresh joinee → /week-1/worksheet/w1_g1 → enter name, tick artifacts, Submit. No 'worksheets need approval first' error appears (compare gc1, which blocks).
- **Suggested fix:** Replace the string param with a discriminated union ({ kind: 'phase' | 'week', num: number }) and implement the week branch using WK_WORKSHEETS_MAP (mirror of checkPhaseWorksheetsComplete). If skipping prerequisites for FTP gates is intended, make it explicit: `skipPrereqCheck: true` with a comment, instead of NaN fall-through.

#### [MEDIUM] Dead 'progressUpdate' event pipeline — nothing ever dispatches it, and Navbar can render a stale progress percentage from old localStorage  
`Architecture & Spec Compliance`

- **Location:** src/App.tsx:176-192; src/components/Navbar.tsx:289-303
- **Description:** App.tsx keeps a `progress` state fed by (a) localStorage key 'onboarding_progress' on mount and (b) a window 'progressUpdate' CustomEvent listener that also persists to localStorage. A repo-wide grep shows no dispatchEvent('progressUpdate') anywhere — the only CustomEvent reference in src/ is this listener. Navbar renders a progress bar and 'N%' label for joinees whenever progress > 0. So the feature is dead code, except that any user whose browser still has an 'onboarding_progress' value written by a previous app version will see that frozen, possibly wrong percentage forever.
- **Root cause:** The dispatch side of this event was removed (likely during the Week/Phase merge refactor) without removing the listener/consumer.
- **Impact:** Real users can see an incorrect onboarding percentage in the persistent site header (e.g. '40%' from months ago while actually at 90%), with no code path to update it. Also ~20 lines of misleading plumbing suggesting a progress system that doesn't exist.
- **Reproduce:** localStorage.setItem('onboarding_progress', '37'); reload as a new_joinee → Navbar shows a 37% progress bar that never changes regardless of actual worksheet completion.
- **Suggested fix:** Delete the two useEffects in App.tsx and the progress prop/bar in Navbar, or reimplement properly by computing progress from worksheet_submissions (as Dashboard already does) and passing it via context. Also clear the stale localStorage key on next deploy (localStorage.removeItem('onboarding_progress')).

#### [MEDIUM] Client and server worksheet registries are manually synced with no drift guard (promotion_required_worksheets vs PHASE_WORKSHEETS_MAP), plus 6 parallel client-side registries  
`Architecture & Spec Compliance`

- **Location:** supabase/migrations/20260710000005_promotion_rpc_and_due_dates.sql:14-28; src/config/worksheetConfigData.ts:400-405, 510-575, 718-741, 755-803; src/config/weeklyWorksheets.ts:22-64
- **Description:** The migration itself says: 'this must be kept in sync with PHASE_WORKSHEETS_MAP ... flagged as a cross-stream risk.' Nothing enforces it — no test, no CI check, no generated artifact. On the client, one worksheet ID must be registered consistently in up to 7 places: WORKSHEET_REVIEWER, WORKSHEET_NAMES, WORKSHEET_INFO, ALL_WORKSHEETS, PHASE_WORKSHEETS_MAP or WK_WORKSHEETS_MAP, weeklyWorksheets.ts (a second, independently-maintained week list used by Phase1/WeekPage UI), and WORKSHEET_COMPONENTS. worksheetConfigData.test.ts cross-checks most TS maps against each other (good), but neither weeklyWorksheets.ts ↔ WK_WORKSHEETS_MAP consistency nor the DB table is covered.
- **Root cause:** The DB cannot import TS config, and no single source of truth generates the others.
- **Impact:** Adding/removing a worksheet requires touching a SQL migration plus multiple TS files; if PHASE_WORKSHEETS_MAP and the DB table drift, either promotion becomes impossible (server requires a retired worksheet) or the client 'eligible' pre-check disagrees with the server RPC and users see contradictory promotion messages. If weeklyWorksheets.ts drifts from WK_WORKSHEETS_MAP, WeekWorksheetPage rejects a worksheet ('not part of Week N') that the week UI displays as clickable.
- **Reproduce:** Add a new required worksheet to PHASE_WORKSHEETS_MAP[2] without a migration: client reports '23/24 approved', server RPC promotes at 23/23 — or vice versa.
- **Suggested fix:** Add a vitest that (a) asserts weeklyWorksheets week arrays equal WK_WORKSHEETS_MAP per week, and (b) snapshots the union of PHASE_WORKSHEETS_MAP against a checked-in copy of the promotion_required_worksheets INSERT list (parse the migration file in the test, or generate the migration from the TS map via a script). Longer term, store the canonical worksheet registry in one JSON consumed by both TS and a migration generator.

#### [MEDIUM] Reviewer-type taxonomy is decorative: worksheets badged 'Onboarding Lead' cannot be reviewed by onboarding_lead (read-only in DB)  
`Architecture & Spec Compliance`

- **Location:** src/config/worksheetConfigData.ts:424-425,435 (p1_w4/p1_w5/p2_w4 → 'onboarding_lead'); supabase/migrations/20260710000006_row_level_security.sql:196-198 ('onboarding_lead intentionally has NO update policy'); supabase/migrations/20260710000003_review_state_machine.sql:90-95; src/pages/WorksheetReview.tsx:96-98,428-429; src/config/worksheetConfigData.ts:6-28 (header: 'onboarding_lead → reviews procedures')
- **Description:** WORKSHEET_REVIEWER assigns three worksheets to reviewer type 'onboarding_lead', and ReviewerBadge shows joinees an 'Onboarding Lead' badge on those worksheets (Dashboard, Phase pages). But both RLS and the state-machine trigger make onboarding_lead strictly SELECT-only — the only legal approval path for every worksheet is buddy (lead_instructor) → manager (academic_head), which WorksheetReview.tsx correctly implements ('Read-only view — Onboarding Leads can monitor but not approve'). The file-header flow diagram in worksheetConfigData.ts still describes onboarding_lead as a reviewer of procedures and claims '4 ROLES (selectable at signup)' although signUp deliberately ignores the role parameter (AuthContext.tsx:192-197). App.tsx even routes /onboarding-lead/review/:userId/:worksheetId for a role that can take no action there.
- **Root cause:** The reviewer-type map predates the H03/H24 decision to make onboarding_lead read-only; the config and its header comment were never reconciled.
- **Impact:** Joinees are told the wrong person will review p1_w4/p1_w5/p2_w4; onboarding leads clicking into their 'review' routes can never act; the config header actively misdocuments the authorization model that the DB enforces, which is exactly the kind of doc a future dev will trust when modifying RLS.
- **Reproduce:** As new_joinee open /phase-1 → p1_w4 shows 'Onboarding Lead' badge. As onboarding_lead open /onboarding-lead/review/<joinee>/p1_w4 → read-only banner; any update would be blocked by RLS.
- **Suggested fix:** Either give the badges truthful semantics (relabel these three as buddy-reviewed, or introduce a 'monitored by Onboarding Lead' secondary label), and rewrite the worksheetConfigData.ts header flow diagram to match the enforced buddy→manager pipeline and non-selectable roles; or, if onboarding_lead review is a real requirement, add the corresponding RLS UPDATE policy + trigger edges — but pick one.

#### [MEDIUM] Dashboard 'Overall Progress' denominator excludes gc2/gc3 and phase totals disagree across pages (12 vs 36 worksheets for Phase 1; duplicates double-counted)  
`Architecture & Spec Compliance`

- **Location:** src/pages/Dashboard.tsx:16,28-31,97-101,262-267; src/pages/Phase1.tsx:46-51,192; src/utils/worksheetHelpers.ts:26-31; src/config/weeklyWorksheets.ts:24,35,48,59
- **Description:** Three inconsistencies: (1) Dashboard's overall progress divides totalApproved (count of ALL rows with review_status='approved' — up to 23, since gc2/gc3 are manager-approvable via PHASE_WORKSHEETS_MAP) by totalWorksheets = union of its phase lists = 21 (phase 2/3 lists at lines 30-31 omit gc2/gc3 while the phase-1 list includes gc1 and w1_g1) — so the bar/label can exceed 100% ('23 / 21'). (2) Dashboard tells joinees 'Phase 1 — 12 worksheets' while Phase1.tsx header says 'Days 1–30 — 36 worksheets' because getAllWeekWorksheetIds() concatenates week1-4 lists + additional without dedupe. (3) p1_w6 appears in week 1 AND week 2, p3_w5 in week 3 AND week 4 (weeklyWorksheets.ts), and countCompleted counts list entries, not unique IDs, so a single p1_w6 submission adds 2 to Phase 1's completed count.
- **Root cause:** Each surface derives totals from a different registry (phase lists with/without gates, week lists with intentional repeats) and shared helpers don't dedupe.
- **Impact:** Progress numbers users and managers rely on are internally contradictory and can be arithmetically wrong (>100%, double-counted completions, 12 vs 36 for the same phase). This erodes trust in the tracker, which is the app's whole purpose.
- **Reproduce:** Approve all 23 phase-map worksheets for a joinee → Dashboard shows '23 / 21'. Submit only p1_w6 → Phase 1 header shows 2/36 completed.
- **Suggested fix:** Define one selector, e.g. getPhaseWorksheetIds(phase): string[] returning the deduped canonical set (PHASE_WORKSHEETS_MAP with gates consistently included or excluded), use it for every numerator/denominator, and make countCompleted operate on new Set(ids). Clamp progress width to 100% defensively.

#### [MEDIUM] Dashboard 'Final Assessment' quick link is inaccessible to the joinees who see it — silently bounces to /  
`Architecture & Spec Compliance`

- **Location:** src/pages/Dashboard.tsx:431; src/App.tsx:163; src/components/ProtectedRoute.tsx:35-39
- **Description:** Dashboard is the landing page for new_joinee/lab_instructor (HomeRoute sends lead_instructor to /buddy). Its Quick Links section renders 'Final Assessment — Check readiness criteria' → /assessment, but the /assessment route requires roles ['academic_head','onboarding_lead','lead_instructor']. ProtectedRoute redirects unauthorized users to '/' with no message, so for the page's primary audience the link is a no-op that navigates back to the same dashboard. (The Assessment page itself is a reviewer tool for rating an instructor's readiness — it was never a joinee 'check your criteria' page, so the link copy is wrong too.)
- **Root cause:** Quick Links list is static and not role-filtered; route roles were tightened later without revisiting Dashboard links.
- **Impact:** A visibly broken/no-op navigation element on the app's main landing page for its main user class; confusing 'nothing happened' UX.
- **Reproduce:** Log in as new_joinee → Dashboard → click 'Final Assessment' → URL flashes /assessment then lands back on /.
- **Suggested fix:** Filter Quick Links by profile.role (only render /assessment for the three reviewer roles), or replace it for joinees with a link to something they can use (e.g. /phase-3 readiness summary).

#### [MEDIUM] Post-login race: ProtectedRoute treats 'profile not yet loaded' as 'wrong role' and bounces every role-gated deep link to '/'  
`Authentication & Session Handling` · ✅ verified (was HIGH)

- **Location:** src/components/ProtectedRoute.tsx:35-39, src/context/AuthContext.tsx:170-182, src/App.tsx:77-89
- **Description:** AuthContext's `loading` flag is only true during the initial getSession() bootstrap. When a user signs in (SIGNED_IN handler, AuthContext.tsx:174-176), setUser() fires immediately but fetchProfile() is async and never sets loading=true. Login.tsx:29 then navigates to `from` (the page the user was on when their session expired). ProtectedRoute renders with loading=false, user set, profile=null — and for any route with requiredRoles (all phase/week/worksheet/admin routes, App.tsx:126-157) the check at ProtectedRoute.tsx:36-38 sees userRole undefined and redirects to '/'. The same race makes HomeRoute (App.tsx:84) briefly render the joinee Dashboard for lead_instructor users before profile resolves.
- **Root cause:** loading conflates 'auth bootstrap' with 'profile resolution'; fetchProfile after SIGNED_IN runs with loading=false, so the role check evaluates against a not-yet-fetched profile.
- **Impact:** The 'return you to where you were' flow (ProtectedRoute.tsx:32 passes state.from; Login.tsx:17,29 honors it) is broken for essentially every protected page: a joinee whose session expired mid-worksheet logs back in and is dumped on the dashboard instead of their worksheet — every single re-login. Buddies see a flash of the wrong dashboard. Data fetches also briefly run for a null profile.
- **Reproduce:** Sign out. Navigate to /phase-1 → redirected to /login with state.from=/phase-1. Sign in with valid joinee credentials. Observe landing on '/' instead of /phase-1 (profile fetch resolves a few hundred ms after navigation).
- **Expected:** Role-gated routes should wait (render the loading state) while user is set but profile is still being fetched, and only redirect once the profile fetch has actually settled.
- **Current:** Role check fails closed to '/' whenever profile is null, even transiently during fetch.
- **Suggested fix:** Track profile resolution explicitly: in AuthContext keep `profileLoading` (set true at the start of fetchProfile, false in finally) and expose it; in ProtectedRoute render the spinner when `loading || (user && !profile && profileLoading)`. Simplest minimal patch: in the SIGNED_IN branch call setLoading(true) before fetchProfile(session.user.id) (fetchProfile's finally already sets it false).
- **Verifier note:** Verified in code: AuthContext.tsx:170-182 never sets loading=true on SIGNED_IN (fetchProfile only calls setLoading(false) in finally), Login.tsx:29 navigates to `from` immediately after signInWithPassword resolves, and ProtectedRoute.tsx:35-39 treats profile=null (userRole undefined) as a role failure and redirects to '/'. Since nearly all routes in App.tsx:126-163 have requiredRoles, the deep-link restoration is deterministically lost on every password re-login, and HomeRoute (App.tsx:77-89) briefly renders the joinee Dashboard for lead_instructor before profile resolves. However, the impact is purely navigational UX — the user lands authenticated on a working dashboard with no security bypass or data loss (null-profile fetches remain RLS-guarded) — so MEDIUM, not HIGH.

#### [MEDIUM] Privilege escalation to admin via self-INSERT of user_profiles: INSERT policy does not constrain role, and the sync trigger propagates it into JWT app_metadata  
`Authentication & Session Handling` · ✅ verified (was HIGH)

- **Location:** supabase/migrations/20260710000006_row_level_security.sql:60-61, supabase/migrations/20260710000002_role_resolution_and_signup.sql:52-55, src/context/AuthContext.tsx:55-56,120-128
- **Description:** The 'Insert own profile' policy is WITH CHECK (id = auth.uid()) only — the role column is not constrained (the migration comment at :57-59 even acknowledges the policy 'doesn't reference role at all'). The user_profiles_role_check constraint (20260710000001:237-238) allows 'academic_head' as a valid value. If a user's profile row is ever missing, an authenticated user can call the PostgREST endpoint directly with `{id: <own uid>, role: 'academic_head'}`; the AFTER INSERT trigger sync_role_to_app_metadata (20260710000002:52-55 fires on INSERT) then writes that role into auth.users.raw_app_meta_data, so on next token refresh get_user_role() returns 'academic_head' and every RLS policy grants full admin power (read all profiles, approve any worksheet, admin-update any profile). The missing-row precondition is not theoretical: the client's own createProfileFromAuth path (AuthContext.tsx:55-56, 'No profile found — auto-create for OAuth users') exists precisely because profile rows have been observed missing in practice, and any manual cleanup of user_profiles without deleting the auth user reopens the window.
- **Root cause:** INSERT policy validates ownership but not the role column, while the role→app_metadata sync trigger trusts every INSERT on user_profiles equally.
- **Impact:** Single-request escalation from any authenticated account to academic_head whenever the profile row is absent — full control over the review pipeline, all user PII, and role assignments. Defense-in-depth failure that silently converts an ops hiccup (missing profile row) into an admin takeover vector.
- **Reproduce:** With a user whose user_profiles row is absent (e.g., delete it with service role to simulate the OAuth gap the client code handles), run: curl -X POST '<url>/rest/v1/user_profiles' -H 'apikey: <anon>' -H 'Authorization: Bearer <user jwt>' -d '{"id":"<uid>","email":"x@y.z","full_name":"X","role":"academic_head"}'. Then refresh the session and observe get_user_role() = 'academic_head'.
- **Expected:** Client-originated inserts must never set a privileged role; only handle_new_user/seeds should establish roles.
- **Current:** WITH CHECK (id = auth.uid()); any valid role value accepted on first insert.
- **Suggested fix:** Tighten the policy: CREATE POLICY "Insert own profile" ON public.user_profiles FOR INSERT WITH CHECK (id = auth.uid() AND role = 'new_joinee'); (the client insert at AuthContext.tsx:120-128 omits role, so the column default 'new_joinee' satisfies this). Optionally also make sync_role_to_app_metadata skip INSERTs not performed by definer paths.
- **Verifier note:** The mechanics are exactly as claimed: the "Insert own profile" RLS policy is WITH CHECK (id = auth.uid()) with no role constraint (20260710000006:60-61), there is no BEFORE INSERT trigger on user_profiles to force role (handle_new_user fires on auth.users only), the CHECK constraint permits 'academic_head' (20260710000001:237-238), and sync_role_to_app_metadata fires on TG_OP='INSERT' propagating NEW.role into raw_app_meta_data (20260710000002:52-55), which get_user_role() reads. So a self-INSERT with role='academic_head' does escalate, and this is not mitigated by any other server-side guard. However, the attack requires the victim/attacker's profile row to be ABSENT (PK conflict blocks it otherwise), and there is NO DELETE policy on user_profiles, so an authenticated user cannot open that window themselves — it depends on an operational precondition (manual cleanup / trigger failure) outside the attacker's control. Real defense-in-depth privilege-escalation gap worth fixing, but the 'any authenticated account, single request' framing overstates exploitability, so severity is MEDIUM rather than HIGH.

#### [MEDIUM] Failed signOut leaves the user fully signed in with no feedback  
`Authentication & Session Handling`

- **Location:** src/context/AuthContext.tsx:231-236, src/components/Navbar.tsx:83-88
- **Description:** AuthContext.signOut() throws when supabase.auth.signOut() returns an error (which supabase-js does for unexpected server errors — in that case it also does NOT clear the local session), so setUser(null)/setProfile(null) never run. Navbar's handleSignOut catches the error, only console.errors it, resets the signing-out state and closes the confirm UI — the user remains authenticated on a protected page with zero indication that sign-out failed.
- **Root cause:** signOut treats server sign-out failure as fatal and Navbar swallows the exception silently.
- **Impact:** On a shared machine (the exact scenario for a faculty onboarding lab), a user who clicks Sign Out during a Supabase hiccup walks away believing they are logged out while their session, refresh token and all data access remain live in localStorage.
- **Reproduce:** Block network to the Supabase auth endpoint (devtools offline) and click Sign Out → confirm. The dialog closes, the navbar still shows the signed-in user, no error is displayed.
- **Expected:** Local session/state must always be cleared on sign-out intent (fail-closed), and any server-side failure surfaced to the user.
- **Current:** throw on error before clearing local state; caller logs and moves on.
- **Suggested fix:** In AuthContext.signOut: call supabase.auth.signOut({ scope: 'local' }) (or ignore the error), then unconditionally setUser(null); setProfile(null); and clear app localStorage keys. In Navbar, show a toast if the (now best-effort) server revocation failed. Example: const { error } = await supabase.auth.signOut(); setUser(null); setProfile(null); if (error) console.warn(...).

#### [MEDIUM] Cross-user identity bleed: cached employee name (and progress) in localStorage survives sign-out and is prefilled into the next user's worksheets  
`Authentication & Session Handling`

- **Location:** src/hooks/useAutoSave.ts:293-313, src/hooks/useWorksheet.ts:186-188, src/App.tsx:178-192, src/context/AuthContext.tsx:231-236
- **Description:** getOAuthName() caches the resolved name under the global localStorage key 'onboarding_employee_name' and returns the cache before ever consulting the current session (useAutoSave.ts:295-298). Nothing clears this key on signOut (AuthContext.tsx:231-236 clears only React state). useWorksheet.ts:186-188 injects this name into worksheet data as employeeName, which autosave then persists to worksheet_submissions. 'onboarding_progress' (App.tsx:180,188) similarly leaks the previous user's progress bar to the next user.
- **Root cause:** Session-scoped identity cached under a user-agnostic localStorage key, with no sign-out cleanup and cache-before-session read order.
- **Impact:** On a shared computer, user B's worksheets are prefilled — and saved to the database — with user A's full name, corrupting submission data and confusing reviewers; the navbar progress bar also shows the previous user's progress.
- **Reproduce:** Sign in as user A, open any worksheet (name cached). Sign out. Sign in as user B on the same browser, open a fresh worksheet: employeeName shows user A's name and is autosaved under user B's submission.
- **Expected:** Identity-derived caches keyed by user id, or purged on sign-out/sign-in.
- **Current:** Cache hit returns the previous user's name unconditionally.
- **Suggested fix:** Key the cache by user id (e.g., `onboarding_employee_name:${user.id}`) or, simpler, remove 'onboarding_employee_name' and 'onboarding_progress' in AuthContext.signOut() and in the SIGNED_OUT branch of onAuthStateChange.

#### [MEDIUM] Session expiry / SIGNED_OUT mid-edit instantly unmounts the worksheet and silently discards unsaved edits  
`Authentication & Session Handling`

- **Location:** src/context/AuthContext.tsx:177-181, src/components/ProtectedRoute.tsx:31-33, src/hooks/useWorksheet.ts:304-318
- **Description:** When the refresh token fails (revoked, expired after long sleep, cleared storage), onAuthStateChange delivers a null session → setUser(null) → every ProtectedRoute immediately renders <Navigate to="/login">, unmounting the worksheet component. All un-flushed form state lives only in React state; the beforeunload guard (useWorksheet.ts:311-317) only covers tab close/refresh, not SPA navigation, and there is no local draft persistence. Any autosave in flight also dies with a 401 (useAutoSave retries cannot succeed without a session). Combined with the ProtectedRoute race (separate finding), even the post-login return-to-page restore fails, so the user cannot easily get back to re-enter the lost work.
- **Root cause:** Auth state change unconditionally and synchronously evicts the user from the route tree with no draft persistence layer.
- **Impact:** A joinee who leaves a half-completed worksheet open overnight (or whose token is revoked) loses up to 1.5s-debounce-worth — and in practice everything typed since the last successful autosave — with no warning, on a form-heavy app whose entire purpose is filling worksheets.
- **Reproduce:** Open a worksheet, type into a field, then in devtools Application → Local Storage delete the sb-*-auth-token entry and wait for the next auto-refresh tick (or dispatch the SIGNED_OUT event). The app instantly navigates to /login; the typed content is gone after re-login.
- **Expected:** Unsaved worksheet edits survive an auth interruption — e.g., mirrored to localStorage and rehydrated after re-login.
- **Current:** Immediate redirect, in-memory edits dropped.
- **Suggested fix:** Persist a per-user, per-worksheet draft (e.g., localStorage key `draft:${userId}:${worksheetId}` written in the same debounce as autosave) and rehydrate it in useWorksheet when it is newer than the server copy; and/or on SIGNED_OUT show a blocking 'session expired — sign in again to continue' modal over the worksheet instead of navigating away.

#### [MEDIUM] fetchProfile treats every non-PGRST116 error as 'no profile' and falls through to a spurious INSERT; transient failures leave a signed-in user with a null profile and no recovery  
`Authentication & Session Handling`

- **Location:** src/context/AuthContext.tsx:44-57, 152-168
- **Description:** In fetchProfile, after a non-recursion, non-PGRST116 error (network blip, 5xx, 401 mid-refresh) the code notifies the error but then still evaluates `if (data) ... else createProfileFromAuth(userId)` — so any transient SELECT failure triggers an INSERT attempt of a profile that already exists (a guaranteed PK-conflict round trip), followed by a retry SELECT; if that also fails, the user ends with user set, profile null, loading false, and nothing ever retries. Additionally, if the initial getSession() at :155 errors, loading is set false and profile is never fetched even though the INITIAL_SESSION event at :170-176 will still set user (it only calls fetchProfile for the SIGNED_IN event).
- **Root cause:** The 'no rows' path and the 'query failed' path share the same else-branch; there is no retry/refetch for a failed profile load.
- **Impact:** A user hitting a flaky connection at load time gets a permanent degraded session: hasRole() is false for everything, all role-gated routes bounce to '/', HomeRoute shows the wrong dashboard, and only a full page reload fixes it. The conflict-INSERT also produces noisy error toasts (notifyError) for a self-inflicted failure.
- **Reproduce:** Throttle/fail the first user_profiles SELECT after login (devtools request blocking on /rest/v1/user_profiles). Observe an INSERT attempt with a 409, then a signed-in session where every phase link redirects to '/'.
- **Expected:** Only PGRST116/zero-rows should trigger auto-creation; genuine errors should surface a retry path (and ideally auto-retry).
- **Current:** error → notifyError → createProfileFromAuth insert → possible permanent null profile.
- **Suggested fix:** Return early after a non-PGRST116 error (set a profileError state instead of falling through to createProfileFromAuth), and add a lightweight retry — e.g., refetch on window 'online'/focus or expose the existing refreshProfile() via an inline 'Retry' UI in ProtectedRoute when user && !profile.

#### [MEDIUM] Role changes are not reflected in the JWT until token refresh — no refreshSession() after promotion, and demotion leaves stale privileges for up to the JWT TTL  
`Authentication & Session Handling`

- **Location:** supabase/migrations/20260710000002_role_resolution_and_signup.sql:14-22, src/hooks/useAutoPromote.ts:60-76, src/context/AuthContext.tsx (no refreshSession anywhere)
- **Description:** All RLS decisions flow through get_user_role(), which reads auth.jwt()->'app_metadata'->>'role' — i.e., the role snapshotted into the access token at issue time. The sync trigger updates auth.users.raw_app_meta_data, but active sessions keep their old JWT until the next refresh (default 1h). The codebase contains no supabase.auth.refreshSession() call at all (grep confirms). Consequences: (a) once promotion is fixed (see CRITICAL finding), a freshly promoted lead_instructor still gets RLS-denied on all buddy queries ('Admin read all profiles', 'Buddy update submissions') until their token rotates, while the UI (which reads user_profiles.role via fetchProfile) already shows buddy features — every buddy screen errors; (b) conversely, a user demoted or role-corrected by an admin retains the old role's RLS access for up to an hour.
- **Root cause:** JWT-snapshotted authorization with no forced token rotation after role mutation.
- **Impact:** Post-promotion the app appears broken (buddy dashboard loads nothing / RLS errors) for up to an hour; security-wise, revoking someone's reviewer role does not take effect promptly.
- **Reproduce:** Manually UPDATE a signed-in test user's user_profiles.role to 'lead_instructor' (as service role), call refreshProfile in the app: UI shows buddy nav, but /buddy queries governed by get_user_role() fail until the access token refreshes.
- **Expected:** Client forces refreshSession() immediately after any known role change; server keeps JWT TTL short.
- **Current:** Role change → app_metadata updated → old JWT used for up to 1h.
- **Suggested fix:** After a successful promote_user_if_eligible() result, call await supabase.auth.refreshSession() then refreshProfile(). For admin-initiated changes, consider reducing JWT expiry in Supabase settings and/or having RLS fall back to a user_profiles lookup for the rare demotion-sensitive policies.

#### [MEDIUM] Open self-signup with no email-domain restriction feeds strangers into reviewer dashboards, where the unassigned-joinee fallback lets any buddy act on them  
`Authentication & Session Handling`

- **Location:** src/pages/Signup.tsx:31, supabase/migrations/20260710000002_role_resolution_and_signup.sql:62-89, supabase/migrations/20260710000006_row_level_security.sql:154-172
- **Description:** Anyone who finds the URL can create an account (Signup.tsx has no domain allowlist; nothing in src/ or migrations restricts email domains — the '@newton.edu' strings are placeholder text only). handle_new_user gives them a real new_joinee profile. New joinees are visible to every lead_instructor/academic_head/onboarding_lead ('Admin read all profiles', RLS :76-79), their submissions appear in buddy/manager dashboards, and because the buddy/manager UPDATE policies deliberately include the `assigned_buddy_id IS NULL` / `assigned_lead_id IS NULL` fallback (:161,183), any buddy can spend review effort on — and approve worksheets for — an account that has no business existing.
- **Root cause:** Signup is public by design of Supabase email auth, with no server-side domain gate.
- **Impact:** For an internal faculty portal: spam/imposter accounts pollute real reviewer queues, can submit arbitrary worksheet content (phishing-style text shown to reviewers), and consume the exact review workflow meant for actual staff. Combined with the promotion RPC, a determined outsider who tricks reviewers into approving everything would be promoted to lead_instructor with read access to all user profiles.
- **Reproduce:** From an incognito window, sign up with any mailbox you control, confirm the email, submit p1_w1 → it appears in the buddy dashboard's unassigned queue.
- **Expected:** Only institution-controlled identities can enter the onboarding workflow.
- **Current:** Any email → confirmed account → active new_joinee in the workflow.
- **Suggested fix:** Enforce a domain allowlist in handle_new_user (RAISE EXCEPTION when split_part(new.email,'@',2) NOT IN ('newtonschool.co', ...)) or via Supabase Auth hooks; alternatively restrict the Google OAuth provider to the workspace domain (hd claim) and disable public email signup in the Supabase dashboard.

#### [MEDIUM] user_profiles INSERT policy does not constrain the role column — a self-insert can set role='academic_head' if the profile row is ever absent  
`Authorization, Roles & RLS`

- **Location:** supabase/migrations/20260710000006_row_level_security.sql:60-61 ("Insert own profile"); interacts with handle_new_user trigger (20260710000002_role_resolution_and_signup.sql:62-89) and client createProfileFromAuth (src/context/AuthContext.tsx:104-149)
- **Description:** The INSERT policy WITH CHECK is only id = auth.uid(); it does not restrict role. The role CHECK constraint permits 'academic_head' among others, and sync_role_to_app_metadata propagates whatever role lands in the row into app_metadata (the authz source of truth). The only thing preventing self-escalation is that handle_new_user already inserted the profile row at signup, so a client INSERT normally hits a primary-key conflict. That mitigation is incidental timing, not a policy guarantee: if the row is ever missing (trigger failure/disabled, an admin deleting the profile row while leaving the auth user, a migration gap, or the RLS-recursion degraded path), a user can insert their own row with role='academic_head'.
- **Root cause:** The INSERT policy protects ownership (id) but not the privileged role column, relying on the signup trigger's row already existing to prevent abuse.
- **Impact:** Latent full privilege escalation to academic_head (top role) with no reviewer involvement. Because the client's createProfileFromAuth insert path exists precisely for the 'no profile row yet' case, the escalation window is reachable through normal code, not just DB corruption. Defense-in-depth for the single most security-critical column is absent.
- **Reproduce:** Preconditions: no user_profiles row for the caller (e.g., trigger failed). 1. Sign in. 2. Run supabase.from('user_profiles').insert({ id: '<my-uid>', email: 'x', full_name: 'x', role: 'academic_head' }). 3. Row inserted (RLS allows it); sync trigger copies role to app_metadata; get_user_role() now returns 'academic_head'.
- **Expected:** Self-insert can only create a least-privilege (new_joinee) row; role is never client-settable.
- **Current:** WITH CHECK (id = auth.uid()) — role unconstrained on insert.
- **Suggested fix:** Add role to the INSERT WITH CHECK: WITH CHECK (id = auth.uid() AND (role IS NULL OR role = 'new_joinee')). This still supports handle_new_user (SECURITY DEFINER, bypasses RLS) and OAuth profile completion, while making self-granted admin structurally impossible.

#### [MEDIUM] Unassigned-joinee fallback in buddy/manager RLS lets ANY buddy or ANY manager act on any joinee who has no assignment  
`Authorization, Roles & RLS`

- **Location:** supabase/migrations/20260710000006_row_level_security.sql:154-194 (assigned_buddy_id IS NULL / assigned_lead_id IS NULL branches); mirrored client-side in src/pages/WorksheetReview.tsx:80-86
- **Description:** The "Buddy update submissions" and "Manager update submissions" policies both include an '... OR up.assigned_buddy_id IS NULL' / '... OR up.assigned_lead_id IS NULL' fallback, and the same 'null == allow' logic is in WorksheetReview.checkAssignedBuddy (lines 81-82). New joinees start with NULL assignments (schema default), so until an admin assigns them, every lead_instructor in the system can buddy_approve/needs_revision their worksheets and every academic_head can approve their phases.
- **Root cause:** A convenience fallback for the 'no buddy assigned yet' state was encoded directly into the security policy rather than handled by guaranteeing an assignment.
- **Impact:** Weakens the assignment-based authorization model into an open one for the (common, early-onboarding) unassigned window. Combined with finding #3 it is redundant, but on its own it still means any of the many buddy accounts can review a brand-new joinee's submissions before assignment — undermining accountability and the review_history 'reviewer_id' record.
- **Reproduce:** 1. Create a new joinee (assigned_buddy_id NULL). 2. Sign in as an unrelated lead_instructor. 3. Open /buddy/review/<newJoinee>/<worksheet> and approve — succeeds because assigned_buddy_id IS NULL.
- **Expected:** Review authority requires a concrete assignment linking the reviewer to the joinee.
- **Current:** assigned_*_id IS NULL is treated as 'any reviewer of that role may act'.
- **Suggested fix:** Remove the IS NULL fallback so review requires an explicit assignment; have the admin assignment step (or handle_new_user) set a default buddy/lead, or gate submission on assignment existing. If an unassigned fallback is a deliberate product decision, scope it tightly (e.g., only academic_head may act on unassigned joinees) and document the accepted risk.

#### [MEDIUM] Cross-user client notification inserts are silently blocked by RLS — assignment notifications never delivered  
`API Contract & Data Flow` · ✅ verified (was HIGH)

- **Location:** src/components/admin/AssignmentsTab.tsx:80-81,95-96, src/hooks/useNotifications.ts:172-186 vs supabase/migrations/20260710000006_row_level_security.sql:210-212
- **Description:** The 'Users can insert notifications' policy WITH CHECK requires user_id = auth.uid(). AssignmentsTab calls triggerNotification four times to notify the joinee and the newly assigned manager/buddy — all rows target OTHER users, so every insert fails RLS. triggerNotification swallows the error (console.error only), so the admin flow reports 'Manager assigned!'/'Buddy assigned!' while zero notifications exist. useNotifications' own doc comment claims this helper still serves 'buddy/manager assignment' notifications — that claim is false under the current policy.
- **Root cause:** Notification INSERT policy was tightened to self-only during remediation, but the AssignmentsTab call sites (and the helper's documented purpose) were not migrated to a server-side mechanism.
- **Impact:** Joinees are never told a buddy/manager was assigned to them, and buddies/managers are never told they received a joinee — a silent no-op in production with a misleading in-code contract comment.
- **Reproduce:** As academic_head, assign a buddy in the admin dashboard. Check the notifications table (or the assignee's bell): no rows created; browser console shows the RLS error.
- **Expected:** Assignment notifications created server-side, exempt from client RLS
- **Current:** Client inserts to other users' notification rows, silently rejected
- **Suggested fix:** Create an AFTER UPDATE OF assigned_buddy_id, assigned_lead_id trigger on user_profiles (SECURITY DEFINER, like notify_managers_of_new_signup) that inserts the four notifications server-side, and delete the client triggerNotification calls.
- **Verifier note:** Fully verified: the sole INSERT policy on notifications (20260710000006_row_level_security.sql:210-212) requires user_id = auth.uid(), all four triggerNotification calls in AssignmentsTab.tsx (lines 80-81, 95-96) target other users, the helper swallows the RLS error (useNotifications.ts:183-185), and no DB trigger or RPC covers assignment events (20260710000004 only fires on submission transitions and signups) — so assignment notifications are a 100% silent no-op while the UI reports success and the doc comment at useNotifications.ts:164-170 falsely claims the helper serves this case. Downgraded to MEDIUM because the assignment itself persists and is visible in dashboards, reviewers still get server-side notifications on the joinee's first submission, and there is no security or data-integrity impact — the workflow is delayed in awareness, not broken.

#### [MEDIUM] upsert_gate_submission accepts arbitrary p_worksheet_id and p_status — fresh INSERTs bypass the review state machine  
`API Contract & Data Flow`

- **Location:** supabase/migrations/20260710000007_gate_submission_rpc.sql:25-77
- **Description:** The RPC validates only that the caller is the assigned buddy (or academic_head), then upserts with elevated privileges. p_worksheet_id is not restricted to gc1/gc2/gc3 (unknown ids just default phase to 'phase1'), and p_status is not restricted to 'buddy_approved' — 'approved' passes the column CHECK. On the INSERT path no trigger validates the state (validate_review_transition is BEFORE UPDATE only), so a buddy calling the RPC directly can create ANY not-yet-existing worksheet row for their joinee already in the terminal 'approved' state (which counts toward promotion eligibility), or clobber worksheet_data.
- **Root cause:** RPC input surface wider than its documented gc1/gc2/gc3 + buddy_approved contract; INSERT path exempt from the transition trigger.
- **Impact:** Defense-in-depth failure: the meticulously enforced pending_review → buddy_approved → approved pipeline can be skipped wholesale for new rows by any assigned buddy with a REST client, forging manager-level approvals and promotion prerequisites.
- **Reproduce:** As an assigned buddy: supabase.rpc('upsert_gate_submission', { p_user_id: joinee, p_worksheet_id: 'p3_w1', p_data: {}, p_status: 'approved' }) — row created with review_status='approved', reviewed_by=buddy.
- **Expected:** RPC whitelist matches its documented gate-only, buddy_approved-only contract
- **Current:** Unvalidated text parameters flow into a SECURITY DEFINER upsert
- **Suggested fix:** In the RPC: `IF p_worksheet_id NOT IN ('gc1','gc2','gc3','w1_g1','w2_g1','w3_g1','w4_g1') THEN RAISE EXCEPTION …; END IF; IF p_status <> 'buddy_approved' THEN RAISE EXCEPTION …; END IF;` (or drop p_status entirely).

#### [MEDIUM] First autosave of each mount re-sends due_date, racing the async start_date fetch — can overwrite the persisted due date with a '30 days ago'-derived value  
`API Contract & Data Flow`

- **Location:** src/hooks/useAutoSave.ts:87,99-123,170-179,193 and src/hooks/useDueDates.ts:52-57,73-81
- **Description:** dueDateSetRef is a per-mount ref, so despite the 'never overwrite a persisted value' comment, the first save() of every page visit includes due_date in the upsert, overwriting the stored column. The value comes from startDateRef, populated by an async user_profiles fetch; if that fetch hasn't resolved (or errored) before the first debounced save, calculateDueDate falls back to getDefaultStartDate() = localStorage 'onboarding_start_date' or Date.now() − 30 days. A worksheet like w1_o1 (offset 3) then gets a due_date ~27 days in the past.
- **Root cause:** Idempotency guard held in component-lifetime state instead of respecting the existing DB value; demo-era fallback start date still live in calculateDueDate.
- **Impact:** Persisted due dates drift on every mount, and under the race a correct future due_date is replaced with a past one, triggering false 'overdue' cron notifications (check_due_date_notifications) and wrong overdue badges.
- **Reproduce:** Throttle network so the user_profiles start_date query is slow; open a worksheet and type within ~1.5s. Inspect the row: due_date rewritten to a date derived from 30-days-ago.
- **Expected:** due_date written once, from the real start_date, never overwritten
- **Current:** due_date recomputed client-side and resent on first save of every mount, with a fabricated fallback start date
- **Suggested fix:** Only include due_date when the loaded row had none (thread saved.due_date through useWorksheet), and make calculateDueDate return null instead of using the 30-days-ago fallback when no real start date is available.

#### [MEDIUM] Gate revision resubmit records 'pending_review' instead of 'revision_submitted'  
`API Contract & Data Flow`

- **Location:** src/hooks/useGateControl.ts:165-177 with src/utils/reviewStateMachine.ts:41-53
- **Description:** In joinee mode, useGateControl.handleSubmit overwrites d._savedReviewStatus to 'revision_submitted' BEFORE calling flushSave. computeSubmitReviewStatus then sees savedReviewStatus='revision_submitted' (not 'needs_revision'), misses both special cases, and returns PENDING_REVIEW. useWorksheet.handleSubmit (the non-gate path) correctly leaves _savedReviewStatus as 'needs_revision' and yields REVISION_SUBMITTED.
- **Root cause:** Pre-mutating the input (_savedReviewStatus) that computeSubmitReviewStatus uses to derive the transition.
- **Impact:** A resubmitted FTP gate shows 'Pending Review' instead of 'Re-submitted' in every reviewer surface, the notify trigger emits a 'submitted' rather than 'revision_submitted' notification, and review history/analytics misclassify the event. Inconsistent with the identical flow on regular worksheets.
- **Reproduce:** Buddy requests revision on a joinee-submitted w1_g1; joinee edits and resubmits. Row lands at review_status='pending_review', notification type='submitted'.
- **Expected:** needs_revision → revision_submitted
- **Current:** needs_revision → pending_review on gate resubmit
- **Suggested fix:** Do not set _savedReviewStatus in the submit payload for the joinee path — pass the previously loaded value through, matching useWorksheet.handleSubmit.

#### [MEDIUM] status column casing split: RPC writes 'Submitted', app contract is 'submitted'  
`API Contract & Data Flow`

- **Location:** supabase/migrations/20260710000007_gate_submission_rpc.sql:69 vs src/constants/status.ts:15, src/utils/worksheetHelpers.ts:16-21, src/pages/Dashboard.tsx:82-84, src/pages/WorksheetReview.tsx:29-30, src/types/supabase.ts:65
- **Description:** upsert_gate_submission hardcodes status='Submitted' (capital S) while SUBMISSION_STATUS.SUBMITTED and the SubmissionStatus TS union use lowercase 'submitted'. Two consumers (Dashboard StatusBadge, WorksheetReview StatusBadge) carry explicit dual-casing workarounds, but isWorksheetSubmitted()/isWorksheetComplete() and WeekAccessGuard's status check do not — a buddy-RPC-written row is only saved from misclassification because its review_status is simultaneously buddy_approved. There is also no CHECK constraint on the status column, so nothing prevents further drift.
- **Root cause:** The RPC predates/ignores the centralized status constants; no DB CHECK pins the legal value set.
- **Impact:** Any future reader of the status column (and any RPC row whose review_status is later reset) misclassifies buddy-filed gates as not submitted; the codebase is accumulating per-callsite dual-casing patches instead of one canonical value.
- **Reproduce:** Call upsert_gate_submission, then evaluate isWorksheetSubmitted(row.status) → false for a submitted gate.
- **Expected:** Single canonical value enforced by a CHECK
- **Current:** Two spellings of the same status in one column
- **Suggested fix:** Change the RPC to write 'submitted', migrate existing rows (UPDATE … SET status='submitted' WHERE status='Submitted'), add a CHECK (status IN ('Not Started','In Progress','submitted','Reviewed')), then remove the dual-casing workarounds.

#### [MEDIUM] Hard result caps silently truncate reviewer queues (limit 200 / 2000) with newest-first ordering  
`API Contract & Data Flow`

- **Location:** src/pages/BuddyDashboard.tsx:78-86, src/pages/AdminDashboard.tsx:107-115, src/pages/OnboardingLeadDashboard.tsx:69-76
- **Description:** BuddyDashboard fetches all worksheets for its assigned joinees with .limit(200) ordered by updated_at desc; ~39 worksheets exist per joinee, so a buddy/manager with 6+ assignees exceeds the cap and the OLDEST rows — precisely the stale pending_review items most in need of attention — silently vanish from the pending queue and stats. Admin/OL dashboards have the same pattern at limit(2000) (~51 joinees). No pagination or count check exists, and .in('user_id', ids) with up to 500 UUIDs also risks exceeding URL length limits.
- **Root cause:** Fixed limits added as a safety cap without truncation detection or pagination.
- **Impact:** Review queues and progress stats under-report without any error at realistic cohort sizes; pending submissions can sit invisible indefinitely.
- **Reproduce:** Assign 6 joinees with full worksheet histories to one buddy; the earliest-updated pending worksheet disappears from /buddy.
- **Expected:** Complete queue or explicit truncation signal
- **Current:** Silent truncation at 200/2000 rows, newest-first
- **Suggested fix:** Page with .range() until exhausted (or filter server-side to the review-relevant statuses to shrink the result set), and warn when data.length === limit.

#### [MEDIUM] Notification clicks with empty worksheet_id navigate to a 404; Notification TS type denies '' exists  
`API Contract & Data Flow`

- **Location:** src/components/NotificationBell.tsx:65-81 vs supabase/migrations/20260710000001_initial_schema.sql:171 and src/types/supabase.ts:158
- **Description:** Signup, promotion, and assignment notifications are written with worksheet_id = '' (DB default, NOT NULL). NotificationBell's reviewer branch builds `/${reviewPath}/review/${uid}/${notification.worksheet_id}` — with '' that is '/buddy/review/<uid>/' which matches no route and renders NotFound. The Notification interface types worksheet_id as WorksheetId, so the '' case is invisible to the type system, and the joinee branch's PHASE_MAP[''] silently defaults to 'phase-1' regardless of relevance.
- **Root cause:** Navigation handler assumes every notification references a worksheet; TS type models the ideal rather than the DB contract (TEXT NOT NULL DEFAULT '').
- **Impact:** Clicking a new-signup notification (a primary manager/OL workflow entry point) dead-ends on the 404 page; promotion notifications would do the same.
- **Reproduce:** As academic_head, click a '<name> has signed up…' notification in the bell → NotFound page.
- **Expected:** Type-aware routing for non-worksheet notifications
- **Current:** worksheet_id='' interpolated into a review URL
- **Suggested fix:** In handleNotificationClick, when !notification.worksheet_id route by type (signup → /admin, promoted → /). Type worksheet_id as WorksheetId | ''.

#### [MEDIUM] Assessment rows are keyed to the assessor, not the assessed joinee, and duplicate emails permanently break the lookup  
`API Contract & Data Flow`

- **Location:** src/pages/Assessment.tsx:59-93 vs supabase/migrations/20260710000001_initial_schema.sql:94-110,274 and src/types/supabase.ts:133-143
- **Description:** Assessment (a reviewer-only route) inserts onboarding_submissions with user_id = user.id — the ASSESSOR's id — while the OnboardingSubmission type and FK semantics treat user_id as the assessed instructor. Consequence: RLS 'Users can update own submissions' (auth.uid() = user_id) means only the original assessor can ever update that record; any other reviewer's update legitimately affects 0 rows. Additionally the dedupe lookup uses .eq('email', email).maybeSingle() but the table has no UNIQUE constraint on email — two assessors inserting concurrently create duplicates, after which maybeSingle() errors on every future attempt for that email, permanently wedging the page.
- **Root cause:** user_id misassigned to the session user; missing UNIQUE(email) needed by the read-then-write upsert pattern.
- **Impact:** Assessment ownership is semantically wrong (cascade-deletes with the assessor's account, not the joinee's), cross-reviewer updates fail, and a one-time race bricks the assessment flow for that joinee's email.
- **Reproduce:** Two reviewers submit an assessment for the same email near-simultaneously → two rows; third attempt shows 'Could not check for an existing assessment: JSON object requested, multiple (or no) rows returned'.
- **Expected:** user_id = assessed joinee; enforced unique key for the upsert
- **Current:** user_id = assessor; non-unique email used as a logical key
- **Suggested fix:** Resolve the assessed joinee's id (lookup user_profiles by email) and store that as user_id; add UNIQUE(email) (after dedupe) or switch to .upsert(..., { onConflict: 'email' }); use .limit(1) instead of maybeSingle() defensively.

#### [MEDIUM] Assignment notifications are silently dropped: client inserts for other users violate the notifications RLS INSERT policy and the error is swallowed  
`Database Schema & Integrity` · ✅ verified (was HIGH)

- **Location:** src/components/admin/AssignmentsTab.tsx:80-96, src/hooks/useNotifications.ts:172-186, supabase/migrations/20260710000006_row_level_security.sql:210-212
- **Description:** The hardened policy "Users can insert notifications" requires user_id = auth.uid(). AssignmentsTab calls triggerNotification four times with userId = the joinee / the assigned manager / the assigned buddy — never the caller — so every one of these inserts fails RLS. triggerNotification catches the error and only console.error's it, so the admin sees the assignment succeed while zero notifications are created. No DB trigger covers assignment changes (the only user_profiles trigger, notify_managers_of_new_signup, fires on INSERT only), so this feature is completely dead. The comment block in useNotifications.ts:167-169 explicitly claims this helper 'remains for... buddy/manager assignment' notifications — the code contradicts its own security model.
- **Root cause:** RLS tightening (contract item 5) removed reviewer→anyone insert rights without adding the server-side trigger that assignment notifications now require.
- **Impact:** Joinees are never told a buddy/manager was assigned to them, and buddies/managers are never told they have a new joinee — in a workflow where the buddy must proactively review, this silently stalls onboarding for every new assignment in production.
- **Reproduce:** As academic_head, assign a buddy to a joinee in AssignmentsTab. Check the notifications table: no rows created for either party; browser console shows an RLS violation from PostgREST.
- **Expected:** Assignment notifications created by a SECURITY DEFINER trigger on user_profiles, like every other workflow notification.
- **Current:** Client-side inserts with user_id != auth.uid(), blocked by WITH CHECK (user_id = auth.uid()), error swallowed.
- **Suggested fix:** Add an AFTER UPDATE OF assigned_buddy_id, assigned_lead_id ON user_profiles SECURITY DEFINER trigger that inserts the four notifications server-side (mirroring notify_managers_of_new_signup), and delete the dead triggerNotification calls from AssignmentsTab.
- **Verifier note:** Fully confirmed mechanically: the notifications INSERT policy (migration 20260710000006:210-212) requires user_id = auth.uid(), all four triggerNotification calls in AssignmentsTab.tsx:80-96 target other users (joinee/manager/buddy), the RLS failure is swallowed at useNotifications.ts:183-185 while the UI reports success, and no DB trigger covers assignment updates (notify_managers_of_new_signup is AFTER INSERT only; the assignment is a raw client update, not an RPC). Assignment notifications are therefore completely dead in production. Severity is adjusted down from HIGH because the claimed impact ("silently stalls onboarding") overstates it: the SECURITY DEFINER trigger notify_reviewer_on_submission still notifies the assigned buddy/manager whenever a submission actually needs review, and assignments remain visible in dashboards — only the assignment-announcement notifications are lost.

#### [MEDIUM] No notification is ever created for review outcomes (needs_revision / buddy_approved / approved) — neither by trigger nor by client  
`Database Schema & Integrity` · ✅ verified (was HIGH)

- **Location:** supabase/migrations/20260710000004_server_side_notifications.sql:27-33 (only pending_review/revision_submitted covered); src/pages/WorksheetReview.tsx (no notification writes); supabase/migrations/20260710000001_initial_schema.sql:261-267 (CHECK lists the unused types)
- **Description:** notify_reviewer_on_submission returns early for every review_status except 'pending_review'/'revision_submitted'. Grep of the whole src tree confirms no client code inserts notifications of type 'needs_revision', 'approved', 'buddy_approved' or 'phase_approved' (the only triggerNotification call sites are AssignmentsTab, which is itself broken — see previous finding). Yet the notifications type CHECK explicitly allows these types, NOTIFICATION_TYPE constants define them (src/constants/status.ts:37-43), and NotificationBell.tsx:22-30 has icon mappings for them — the feature is clearly intended but has no producer. The old client-side inserts were removed in the remediation sweep ('those client-side inserts have been removed at their call sites', useNotifications.ts:165-167) without a server-side replacement for the reviewer→joinee direction.
- **Root cause:** Remediation removed client inserts (correctly, they were forgeable) but the replacement trigger only covers the joinee→reviewer direction, not reviewer→joinee.
- **Impact:** A joinee whose worksheet is sent back with needs_revision gets no notification and only discovers it by manually revisiting the worksheet; approvals are equally silent. In a due-date-driven onboarding program this delays revision loops and makes the notification bell misleadingly quiet for the primary user persona.
- **Reproduce:** As buddy, set a pending_review worksheet to needs_revision in WorksheetReview. Query notifications for the joinee: no row. Bell shows nothing.
- **Expected:** Every state-machine transition that changes who must act next produces a server-side notification to the affected party.
- **Current:** Trigger covers only transitions INTO pending_review/revision_submitted; nothing produces the other five allowed types except 'promoted' (RPC) and due_soon/overdue (unscheduled cron function).
- **Suggested fix:** Extend notify_reviewer_on_submission (or add a sibling AFTER UPDATE OF review_status trigger) to insert a notification to NEW.user_id when review_status transitions into 'needs_revision', 'buddy_approved', or 'approved', using NEW.reviewed_by as from_user_id.
- **Verifier note:** Confirmed: notify_reviewer_on_submission (20260710000004:27-29) early-returns for all statuses except pending_review/revision_submitted, WorksheetReview.tsx writes needs_revision/buddy_approved/approved via bare .update() (lines 159/210/263) with no notification insert, and the only triggerNotification callers are AssignmentsTab assignment messages — so no producer exists for the reviewer-to-joinee notification types the CHECK (20260710000001:264-267) and NOTIFICATION_TYPE constants clearly intend. Downgraded from HIGH to MEDIUM because the joinee's Dashboard (src/pages/Dashboard.tsx:80) prominently shows a "Needs Revision" badge on their landing page, so the outcome is passively discoverable at next login; the defect is a silent notification bell and delayed revision loops, not lost or hidden state.

#### [MEDIUM] First INSERT of a worksheet row accepts forged review_history, reviewer_name, reviewed_at and review_comment from the owner  
`Database Schema & Integrity`

- **Location:** supabase/migrations/20260710000006_row_level_security.sql:117-123, supabase/migrations/20260710000003_review_state_machine.sql:107-110
- **Description:** validate_review_transition is BEFORE UPDATE only, and the "Insert own submissions" policy checks only review_status IN ('','pending_review') AND reviewed_by IS NULL. review_history, reviewer_name, reviewed_at and review_comment are unconstrained on INSERT, so a joinee's very first PostgREST insert can carry a fabricated review_history array (e.g. entries with action 'buddy_approved' and a real buddy's name) and a fabricated reviewer_name/reviewed_at. The migration's own comment (initial_schema.sql:141-142) claims review_history is 'written only by validate_review_transition(), never trusted from the client' — that is only true for UPDATEs. WorksheetReview.tsx:446 renders these entries to reviewers as an authentic timeline.
- **Root cause:** State-machine trigger scoped to UPDATE; INSERT policy allowlist omits the reviewer-metadata columns other than reviewed_by.
- **Impact:** A joinee can present a spoofed review timeline to their manager (e.g. a fake 'buddy approved' history entry), lending false legitimacy during phase review. It cannot directly change review_status, but it corrupts the audit trail the schema explicitly promises is server-authoritative.
- **Reproduce:** Before any autosave has created the row: supabase.from('worksheet_submissions').insert({user_id: <self>, worksheet_id:'p1_w1', phase:'phase1', review_status:'pending_review', reviewer_name:'Real Buddy Name', reviewed_at: now, review_history:[{action:'buddy_approved',reviewer_name:'Real Buddy',...}]}) — accepted.
- **Expected:** All reviewer-authored columns server-forced to empty on owner INSERT, matching the documented 'server-authoritative' contract.
- **Current:** INSERT WITH CHECK guards review_status and reviewed_by only.
- **Suggested fix:** Either extend the trigger to BEFORE INSERT OR UPDATE (on INSERT: force NEW.review_history := '[]', NEW.reviewer_name/reviewed_at/review_comment := NULL when auth.uid() = NEW.user_id), or extend the INSERT policy WITH CHECK with reviewer_name IS NULL AND reviewed_at IS NULL AND review_history = '[]'::jsonb.

#### [MEDIUM] onboarding_submissions has no UNIQUE constraint on email or user_id — check-then-insert race creates duplicates that then permanently break the assessment flow  
`Database Schema & Integrity`

- **Location:** supabase/migrations/20260710000001_initial_schema.sql:94-110 (no unique), src/pages/Assessment.tsx:60-82
- **Description:** Assessment.tsx does SELECT ... eq('email', email).maybeSingle() then INSERTs if nothing was found. There is no UNIQUE(email) or UNIQUE(user_id) on onboarding_submissions, so a double-click, a retry after a slow response, or two tabs each pass the existence check and both INSERT. Once two rows share an email, every subsequent .maybeSingle() on that email returns a PostgREST error (multiple rows), which Assessment.tsx:64-67 surfaces as 'Could not check for an existing assessment' — the user can never submit or update again.
- **Root cause:** TOCTOU pattern in the client with no database-level uniqueness backing it.
- **Impact:** Real users on flaky connections will duplicate rows; the failure mode is not just duplicate data but a hard, self-inflicted lockout of the assessment feature for that user, requiring manual DB cleanup.
- **Reproduce:** Open Assessment in two tabs for the same account, submit in both within the check-insert window; then attempt a third submission — the lookup errors.
- **Expected:** UNIQUE(email) (or user_id) with an atomic upsert.
- **Current:** No uniqueness; client-side existence check only.
- **Suggested fix:** ALTER TABLE public.onboarding_submissions ADD CONSTRAINT onboarding_submissions_email_key UNIQUE (email); (dedupe first), then convert Assessment.tsx to a single .upsert(..., { onConflict: 'email' }). Also make user_id NOT NULL if the legacy anonymous path is gone.

#### [MEDIUM] Buddy-mode gate-control autosave is structurally rejected by RLS on every background save  
`Database Schema & Integrity`

- **Location:** src/hooks/useAutoSave.ts:181-208 (direct upsert with user_id = joinee), supabase/migrations/20260710000006_row_level_security.sql:117-123 and 154-172
- **Description:** When a buddy edits a gate worksheet (useWorksheet overrideUserId → useAutoSave with user_id = joinee), the debounced background save does a direct PostgREST upsert. The INSERT path fails "Insert own submissions" (auth.uid() != user_id); the UPDATE path fails the buddy policy's WITH CHECK (review_status IN ('buddy_approved','needs_revision')) because background saves deliberately omit review_status, leaving it at ''/'pending_review'. So every background save while a buddy drafts a gate pass errors, retries 3 times with backoff (up to ~9s of retries per keystroke burst), fires notifyError each attempt, and persists nothing. Only the explicit submit works, because it goes through the upsert_gate_submission RPC (useGateControl.ts:194-200). The code comments (useGateControl.ts:183-190) acknowledge the INSERT limitation for submit but the autosave path was left pointed at the blocked direct-upsert route.
- **Root cause:** Autosave path not updated when gate writes were moved to the SECURITY DEFINER RPC.
- **Impact:** A buddy filling a long gate-pass form gets repeated save-error noise and loses all draft content on tab close/crash (the beforeunload guard warns, but nothing was ever persisted). Also generates a steady stream of RLS-violation errors in Supabase logs.
- **Reproduce:** As assigned buddy, open a joinee's GateControl1, type into any field, wait 1.5s: autosave enters the retry loop and ends in saveStatus='error'; worksheet_submissions has no row / unchanged row.
- **Expected:** Buddy drafts either persist via the authorized RPC or autosave is disabled in buddy mode with clear UX.
- **Current:** isBuddyMode autosave uses the same direct .upsert() as owners; both RLS paths reject it.
- **Suggested fix:** In buddy mode, route background saves through upsert_gate_submission too (with p_status preserving the current status, after fixing the RPC per the CRITICAL finding), or suppress background autosave entirely when isBuddyMode (save only on explicit submit).

#### [MEDIUM] due_date is client-computed and owner-writable — a joinee can rewrite their own deadlines, and the 'never overwrite' guard is per-mount only  
`Database Schema & Integrity`

- **Location:** src/hooks/useAutoSave.ts:170-179,193; supabase/migrations/20260710000006_row_level_security.sql:136-139 (no column restriction); 20260710000001_initial_schema.sql:144 (no default/derivation)
- **Description:** due_date exists only as a bare DATE column; nothing server-side derives or protects it. The owner's upsert includes due_date on the first save of every hook mount (dueDateSetRef is a useRef reset on every page load, so the 'Calculate due_date ONLY once' comment holds per-session, not per-row — it re-sends a recomputed value on the first save of each visit), and "Update own submissions" WITH CHECK is ownership-only, so any authenticated owner can also PATCH due_date directly to any date. check_due_date_notifications (migration 5) and the lead dashboards trust this column for overdue tracking.
- **Root cause:** Due-date derivation lives in the client (calculateDueDate) with no server mirror or column protection.
- **Impact:** Overdue/due-soon accountability — a headline feature for onboarding leads — is trivially falsifiable by the person being tracked, and legitimate re-saves can overwrite an admin-adjusted due_date with the formula-derived one whenever the persisted value differs from the recomputation.
- **Reproduce:** As joinee: supabase.from('worksheet_submissions').update({due_date:'2030-01-01'}).eq('user_id', uid).eq('worksheet_id','p1_w1') — succeeds; overdue notification logic now never fires.
- **Expected:** Server-derived, owner-immutable due_date.
- **Current:** Client computes and writes due_date; owner can overwrite arbitrarily; per-mount ref is the only overwrite guard.
- **Suggested fix:** Set due_date server-side (BEFORE INSERT trigger deriving start_date + offset from a small offsets table mirroring DEFAULT_DUE_OFFSETS), and in validate_review_transition (or the same trigger) force NEW.due_date := OLD.due_date when auth.uid() = OLD.user_id. Then stop sending due_date from useAutoSave.

#### [MEDIUM] Concurrent worksheet edits are silent last-write-wins — conflict detection only console.warns and saves anyway  
`Database Schema & Integrity`

- **Location:** src/hooks/useAutoSave.ts:131-154 (detection), 206-208 (unconditional upsert)
- **Description:** The save path reads the row's updated_at, compares to the locally-hydrated _savedUpdatedAt, logs 'Conflict detected ... Saving anyway (last-write-wins)' and proceeds. The upsert itself carries no .eq('updated_at', savedAt) guard, so the whole worksheet_data JSONB of the losing writer is replaced wholesale. Two tabs of the same joinee, or a joinee editing while their buddy has the gate open, silently destroy each other's field values. (Reviewer status transitions, by contrast, ARE properly guarded with .eq('review_status', loadedStatus) in WorksheetReview.tsx:168/219/272 and PhaseReview.tsx:138/201 — the same technique was simply not applied to content saves.)
- **Root cause:** Optimistic-concurrency check implemented as advisory logging rather than a guarded write.
- **Impact:** Silent loss of user-entered worksheet content in a multi-tab/multi-actor system; the user whose data vanished gets no signal at all (the warning goes to the other user's console).
- **Reproduce:** Open the same worksheet in two tabs, edit different fields in each, let both autosave: the second save erases the first tab's edit.
- **Expected:** Guarded write with a user-visible conflict path.
- **Current:** Detected conflicts are logged and then overwritten.
- **Suggested fix:** Split the flow: INSERT when no _savedUpdatedAt, otherwise UPDATE with .eq('updated_at', savedAt); on 0 rows affected, refetch, merge/prompt, and update _savedUpdatedAt from the write's RETURNING value. The updated_at trigger already gives a reliable version token.

#### [MEDIUM] Dependabot ignore rule silently disables ALL React security updates  
`Dependencies & Supply Chain`

- **Location:** .github/dependabot.yml:32-36
- **Description:** The ignore block lists `dependency-name: react` / `react-dom` with `versions: [">=19.0.0"]`. The app already runs React 19.2.x, so every future React release (including 19.2.x/19.3.x security patches) matches >=19.0.0 and will never get a Dependabot PR. The apparent intent was to block the next major (React 20).
- **Root cause:** Ignore range written as an absolute version floor instead of the next-major floor or an update-type filter.
- **Impact:** If a React or react-dom security advisory ships as a 19.x patch, the team's automated update channel will never surface it. Combined with the fact that npm audit only runs when someone manually invokes it (CI has no audit step), a React CVE could sit unpatched indefinitely in production.
- **Reproduce:** Read .github/dependabot.yml lines 32-36; compare against installed react@19.2.7. Any version Dependabot could propose satisfies >=19.0.0 and is ignored.
- **Suggested fix:** Change to `versions: [">=20.0.0"]`, or better, use `update-types: ["version-update:semver-major"]` so minor/patch (incl. security) PRs still flow:
```yaml
ignore:
  - dependency-name: "react"
    update-types: ["version-update:semver-major"]
  - dependency-name: "react-dom"
    update-types: ["version-update:semver-major"]
```
Optionally add an `npm audit --audit-level=high` step to .github/workflows/ci.yml as a second safety net.

#### [MEDIUM] typescript ^6.0.3 sits one minor below typescript-eslint's hard peer ceiling (<6.1.0)  
`Dependencies & Supply Chain`

- **Location:** package.json:45 (typescript), package.json:33-34 (@typescript-eslint/*), tsconfig.json:22 (ignoreDeprecations)
- **Description:** @typescript-eslint/parser@8.61.1 and eslint-plugin@8.61.1 declare peer `typescript ">=4.8.4 <6.1.0"` (verified in package-lock.json). The declared range `typescript: "^6.0.3"` permits any 6.x, so the very next TypeScript minor (6.1.0) violates the peer contract — a Dependabot bump or `npm update` will hit ERESOLVE or run the linter against an unsupported compiler. TypeScript latest is already 7.0.2 (one major ahead). Additionally tsconfig.json sets `ignoreDeprecations: "6.0"`, meaning deprecated compiler options (the baseUrl/paths style config used at tsconfig.json:23-26) are being suppressed rather than migrated — that escape hatch disappears in a future major, hard-blocking the TS 7 upgrade path.
- **Root cause:** Bleeding-edge TS major adopted before the lint toolchain extended support; deprecation warnings silenced instead of resolved.
- **Impact:** The project is pinned into a one-minor-wide TypeScript window. The first routine TS bump after 6.1.0 releases will break dependency resolution or produce an unsupported lint toolchain; the ignoreDeprecations crutch guarantees extra migration work when the team is eventually forced onto TS 7 (e.g., for a security fix or ecosystem requirement).
- **Reproduce:** node -e "console.log(require('./node_modules/@typescript-eslint/parser/package.json').peerDependencies.typescript)" → ">=4.8.4 <6.1.0"; npm outdated shows typescript latest 7.0.2.
- **Suggested fix:** Short term: keep typescript-eslint in the weekly Dependabot 'eslint' group (already configured) so its peer window widens promptly, and consider narrowing the range to `"~6.0.3"` until typescript-eslint supports 6.1+. Medium term: remove `ignoreDeprecations` by migrating off deprecated options (drop `baseUrl`, use relative `paths`), which also clears the road to TS 7.

#### [MEDIUM] Zero production error tracking; sourcemaps disabled with contradictory comment (prior audit M69, unremediated)  
`Deployment, Ops & Observability` · ✅ verified (was HIGH)

- **Location:** src/components/ErrorBoundary.tsx:26-28, vite.config.js:16-24, src/utils/errorHandling.ts:30-36, src/api/supabase.ts:34-42
- **Description:** There is no error-tracking integration anywhere (grep for sentry/posthog/logrocket/datadog/bugsnag/web-vitals across src and index.html returns nothing), no window.onerror or unhandledrejection handler, and ErrorBoundary.componentDidCatch only calls console.error. The entire logging strategy is 47 console.* call sites in 20+ files (e.g. notifyError in errorHandling.ts:31 logs to console + toast). vite.config.js:17-18 says 'Generate sourcemaps for production debugging but not for end users' but sets sourcemap: false, so no sourcemaps exist at all — any stack trace a user screenshots is against minified esbuild output. This was finding M69 in docs/audit/2026-07-10/04-architecture-operations-quality.md:402-419 and was not touched by the remediation sweep.
- **Root cause:** No observability tooling was ever integrated; the sourcemap comment/value mismatch suggests an intended 'hidden' sourcemap setup that was never completed.
- **Impact:** When a real joinee's worksheet submission crashes, or the promotion RPC fails, or an RLS policy silently blocks a write, nobody operating the system will know unless the user files a complaint — and even then the minified stack is undebuggable. For an onboarding portal where a broken flow blocks a new hire's first weeks, silent client-side failure is an operational blind spot with direct HR impact.
- **Reproduce:** Build with npm run build; throw an error in any lazy-loaded worksheet component in production; observe it appears only in the end user's devtools console with mangled symbols, never reaching any operator.
- **Expected:** Errors reported to a tracker with readable stacks; config comment matches behavior
- **Current:** console.error only; sourcemap: false; comment claims sourcemaps are generated
- **Suggested fix:** Add Sentry (or GlitchTip/self-hosted equivalent): init in src/main.tsx, report from ErrorBoundary.componentDidCatch and a global unhandledrejection listener, and route notifyError() through it. Set build.sourcemap: 'hidden' and upload maps via sentryVitePlugin with filesToDeleteAfterUpload so users never receive them. Note the CSP connect-src in vercel.json:15 must gain the tracker's ingest domain.
- **Verifier note:** Every factual element holds on current main: no error-tracking SDK or web-vitals anywhere in src/index.html/package.json (the only grep hit is a local variable `sessionError` in ResetPassword.tsx:32), main.tsx registers no window.onerror/unhandledrejection handler, ErrorBoundary.componentDidCatch (src/components/ErrorBoundary.tsx:26-28) only calls console.error, and vite.config.js:17-18 sets sourcemap: false directly under a comment claiming sourcemaps are generated; 47 console.* call sites across 25 files are the entire logging story. This is verbatim prior finding M69 (docs/audit/2026-07-10/04-architecture-operations-quality.md), untouched by the remediation sweep. However, the prior audit itself rated it Medium, and that is the right level: it is an observability gap in an internal portal with human reviewers in the loop (failures surface via blocked joinees/reviewers) and Supabase's dashboard provides partial server-side visibility into failed RPC/RLS operations, so I adjust the claimed HIGH down to MEDIUM.

#### [MEDIUM] Database migrations are applied manually with no CI application, no drift detection, dual hand-synced sources of truth, and no rollback  
`Deployment, Ops & Observability`

- **Location:** supabase/migrations/ (7 files), db/README.md:93-104, db/schema.sql, .github/workflows/ci.yml, docs/audit/2026-07-10/REMEDIATION.md:51-59
- **Description:** The deploy process for schema changes is: a human runs `supabase db push` or pastes SQL into the Supabase SQL editor (db/README.md). There is no supabase/config.toml in the repo (only migrations/), no CI job that applies or even dry-run-diffs migrations against the live project, and no record in-repo of which migrations have been applied to production. db/README.md:93 admits 'There's no automation for this today' for keeping db/schema.sql (the 'canonical snapshot') in sync with supabase/migrations/ — two sources of truth maintained by hand. There are no down migrations, so DB rollback is undefined. db/README.md:106-115 further documents that public.promotion_required_worksheets must be manually kept in sync with src/config/worksheetConfigData.ts or promote_user_if_eligible() silently drifts from the UI.
- **Root cause:** Migration reorganization in the remediation sweep created the ordered files but stopped short of wiring any pipeline or drift check.
- **Impact:** Frontend deploys (automatic on git push via Vercel) are completely decoupled from migration application. Shipping code that depends on a new RPC (e.g. the gate_submission_rpc migration) before someone remembers to run db push produces production runtime failures with no error tracking to surface them (see finding 1). Conversely, rolling back the frontend on Vercel cannot roll back an applied migration. Schema drift between schema.sql, migrations, and the live DB is undetectable until something breaks.
- **Expected:** Migrations applied (or at least drift-checked) by CI, single source of truth, documented rollback
- **Current:** Manual supabase db push / SQL-editor paste; hand-synced snapshot; no applied-migration record; no rollback
- **Suggested fix:** Commit supabase/config.toml, add a GitHub Actions job (on merge to main, with SUPABASE_ACCESS_TOKEN + project ref as secrets) that runs `supabase db push --dry-run` on PRs (drift/lint gate) and `supabase db push` on main before/alongside the Vercel deploy. Generate db/schema.sql from `supabase db dump` in CI instead of hand-editing, or delete it as a source of truth. Document a rollback runbook (forward-fix policy at minimum).

#### [MEDIUM] Production deploys are not gated by CI and rollback is undocumented  
`Deployment, Ops & Observability`

- **Location:** .github/workflows/ci.yml, vercel.json, README.md:88-113
- **Description:** The only workflow (ci.yml) validates but does not deploy; deployment happens via Vercel's git integration (README.md:90 'This app deploys to Vercel as a static SPA'). Nothing in the repo (no deploy workflow, no Ignored Build Step script, no documented branch-protection/required-checks setup) ties the Vercel production deploy to CI passing — with default Vercel git integration, a push to main that fails lint/tests/typecheck still builds and deploys on Vercel's side (Vercel runs `npm run build`, which includes tsc, so type errors are caught, but test and lint failures deploy fine). The README's Deployment section never mentions rollback; the only rollback story is the implicit, undocumented Vercel instant-rollback UI, and it does not cover the DB (finding above).
- **Root cause:** Reliance on Vercel auto-deploy defaults; process controls (required checks, deploy gating) were never configured or documented in-repo.
- **Impact:** A commit with failing tests (e.g. a broken review-approval flow that unit tests would have caught) reaches production users while CI is still red. During an incident, whoever is on call has no runbook for reverting.
- **Expected:** Production deploy gated on green CI; written rollback runbook
- **Current:** Push to main deploys regardless of CI test/lint outcome; no rollback documentation
- **Suggested fix:** Either (a) disable Vercel auto-deploy and add a deploy job to ci.yml that runs `vercel deploy --prebuilt --prod` only after validate succeeds, or (b) enable GitHub branch protection requiring the CI check plus Vercel's 'require checks before deploy', and document whichever is chosen plus the rollback procedure (Vercel promote-previous-deployment) in README's Deployment section.

#### [MEDIUM] Compromised Supabase anon key rotation is an unverifiable manual runbook item; prod project ref still hardcoded in scripts  
`Deployment, Ops & Observability`

- **Location:** README.md:115-146, scripts/run_migration.cjs:16, scripts/run_rls_migration.cjs:17, git history (7e5ca88 added .env, 9979b3d removed it)
- **Description:** A real .env with the live VITE_SUPABASE_URL/key was committed at the initial commit (verified: `git log --all -- .env` shows 7e5ca88 added, 9979b3d removed) and remains recoverable from history. README's 'Security handoff runbook' correctly demands rotation, history purge, and an audit of accounts created with the exposed key, but nothing in-repo evidences any of it was done, and the production project ref 'fuoqoryqndtdooujslee' is still hardcoded in two scripts (and in REMEDIATION.md:51). The key is the RLS-gated publishable/anon key, not service_role, so this is not a direct credential breach — but the runbook items are open production blockers per the project's own audit, and the single-environment setup (seed/e2e scripts with published 'Test123!' passwords pointing at the same project, README.md:138-141) persists.
- **Root cause:** Rotation requires Supabase dashboard access outside the repo; the remediation sweep could only document it.
- **Impact:** If rotation was never performed, anyone with a clone has a working key to the production project and can exercise any residual RLS gap; the hardcoded project ref makes it trivial to target. Test accounts with a published password may still exist in the production auth table.
- **Expected:** Rotated key, documented completion, no prod identifiers in ad-hoc scripts, separate staging project
- **Current:** Key exposed in git history; rotation status unknown; prod project ref hardcoded in tooling
- **Suggested fix:** Rotate the anon key in the Supabase dashboard now and update Vercel env vars; run the account audit in the runbook; delete or parameterize the hardcoded project ref in scripts/run_migration.cjs:16 and run_rls_migration.cjs:17; create a separate staging Supabase project for all scripts/ tooling. Record completion (date + who) in the README runbook section so the next auditor can verify.

#### [MEDIUM] Self-hosted fonts (~1.9 MB of TTFs) have no Cache-Control rule in vercel.json  
`Deployment, Ops & Observability`

- **Location:** vercel.json:19-30, public/fonts/ (8 .ttf files, 108-319 KB each), src/styles/index.css (8 @font-face with url('/fonts/*.ttf'))
- **Description:** Fonts were self-hosted in commit 139f2a8 as 8 TTF files (Inter 300-700 at ~318 KB each, Playfair variants) served from /fonts/. vercel.json's caching rules cover only /assets/* (immutable) and an explicit list of icon/manifest files — /fonts/* matches neither, so the files get Vercel's default `max-age=0, must-revalidate`, forcing a conditional revalidation round-trip for all 8 fonts on every hard navigation. Compounding it: they are uncompressed TTFs rather than woff2 (typically 60-70% smaller), and serve-app.mjs's MIME table (lines 9-13) still only knows .woff2, so the local prod-preview server serves them as text/plain.
- **Root cause:** The self-hosting commit added the files but never extended vercel.json's cache rules, and shipped TTF instead of converting to woff2.
- **Impact:** Every real user pays 8 extra request round-trips per full page load for ~1.9 MB of font weight that should be a one-time immutable download; on the institute's mobile/flaky networks this measurably delays first render (fonts block text styling).
- **Expected:** Long-lived immutable caching; woff2
- **Current:** /fonts/* served with default max-age=0, must-revalidate; TTF format
- **Suggested fix:** Add a header block: { "source": "/fonts/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] } (font files are effectively content-stable; rename on change). Convert to woff2 and update the @font-face declarations; add '.ttf'/'.woff2' handling to serve-app.mjs MIME if TTF is kept.

#### [MEDIUM] ALL_ISSUES.md issue tracker is stale and contradicts CHANGELOG and code on current main  
`Documentation & Onboarding` · ✅ verified (was HIGH)

- **Location:** ALL_ISSUES.md:54-88 (vs CHANGELOG.md:33-37 and commits 0cfbb7a, cf2b0a2, 139f2a8, 9b27db8)
- **Description:** ALL_ISSUES.md declares itself current only as of HEAD 7c9487e (line 4), but four commits have landed since. It still lists as 'REMAINING — Critical Bug' B1 (Week 2 stuck on Loading, ALL_ISSUES.md:58) which was fixed in 0cfbb7a — verified: src/components/WeekAccessGuard.tsx now has WeekAccessErrorView with retry (lines 56-77). It also lists M1 (beforeunload guard — fixed, src/hooks/useWorksheet.ts:304-317), M2 (AutoSave logging — fixed in 0cfbb7a), L2 (Week1-4 duplication — src/pages/WeekPage.tsx exists), L3 (bundle code-split — src/config/worksheetConfig.tsx:52+ uses React.lazy), L5 (self-hosted fonts — public/fonts/ exists), L6 (CHANGELOG — exists), and L7 (Dependabot — .github/dependabot.yml exists) as open. CHANGELOG.md in the same tree says B1/M1/M2 are Fixed. The 'Current Gate Status' table (TypeScript 0 errors, 281/281 tests) is likewise a snapshot of a 4-commits-old HEAD presented as current.
- **Root cause:** Fix commits 0cfbb7a through 9b27db8 updated code and CHANGELOG but only partially updated ALL_ISSUES.md (0cfbb7a rewrote it to add the very bugs it was fixing as 'remaining').
- **Impact:** This is the repo's only issue tracker. A handoff engineer or go-live reviewer reading it will conclude a critical Week-2-blocking bug is still open, may re-fix already-fixed issues, or — worse — distrust the fixed state and delay launch. Conversely the stale green gate-status table could be trusted when it no longer describes HEAD.
- **Reproduce:** Open ALL_ISSUES.md line 58 (B1 'REMAINING'); then open src/components/WeekAccessGuard.tsx (error view + retry present) and CHANGELOG.md line 33 (same bug listed as Fixed).
- **Expected:** Tracker reflects actual main: B1, M1, M2, L2, L3, L5, L6, L7 moved to CLOSED; gate status re-run at current HEAD.
- **Current:** Header says 'Last updated: 2026-07-11, HEAD: 7c9487e'; B1 under '🔴 REMAINING — Critical Bug'; M1-M3 and L1-L7 under REMAINING.
- **Suggested fix:** Update ALL_ISSUES.md: move the eight fixed items into the CLOSED section with fixing commit hashes (0cfbb7a, cf2b0a2, 139f2a8, 9b27db8), leave M3 (ESLint warnings), L1 (ReviewContent size), L4 (Realtime), and DB1-DB4 (manual dashboard steps) as remaining, and refresh the header HEAD + gate-status table. Add a note that CHANGELOG.md is the authoritative fixed-list to avoid future double-bookkeeping.
- **Verifier note:** Verified: ALL_ISSUES.md:4 pins HEAD 7c9487e while four commits (0cfbb7a, cf2b0a2, 139f2a8, 9b27db8) have landed since; it lists B1/M1/M2/L2/L3/L5/L6/L7 as open even though the fixes exist on main (WeekAccessGuard.tsx:175 WeekAccessErrorView, useWorksheet.ts:304 beforeunload guard, WeekPage.tsx, lazy worksheetConfig.tsx, public/fonts/, CHANGELOG.md, .github/dependabot.yml) and CHANGELOG.md:33-35 in the same tree records them as Fixed. The contradiction and stale gate-status table are real, but severity is downgraded to MEDIUM: it is documentation-only, mostly errs pessimistically (claims fixed bugs still open), has no runtime/security impact, and is trivially resolvable via CHANGELOG.md or git log with a five-minute doc update.

#### [MEDIUM] Two conflicting production-audit reports with no reconciliation; README labels the superseded one 'current'  
`Documentation & Onboarding`

- **Location:** README.md:147-151, docs/audit/2026-07-10/README.md:8-9, PRODUCTION_AUDIT_REPORT.md:1-6,943-946
- **Description:** The repo contains two full audits with opposite verdicts: docs/audit/2026-07-10/ scores 31/100 with 'Verdict: No — this application cannot be safely deployed to production today', while root-level PRODUCTION_AUDIT_REPORT.md (dated 2026-07-11, post-remediation) scores 7.3/10 'PRODUCTION-READY WITH MINOR ISSUES'. README.md's 'Project docs' section (line 149) calls docs/audit/2026-07-10/ the 'current production-readiness audit' and never links PRODUCTION_AUDIT_REPORT.md, CHANGELOG.md, or ALL_ISSUES.md at all. The 07-10 audit's README carries no banner noting that its Critical/High findings were remediated (the remediation record lives in the sibling file REMEDIATION.md, which the audit README does not link).
- **Root cause:** The 07-11 audit was dropped at repo root by a later session without updating the docs index or cross-referencing the 07-10 audit.
- **Impact:** Anyone assessing go-live from the README is pointed at a 'cannot deploy' verdict that no longer reflects main, while the newer report claiming readiness is undiscoverable from the docs index. Stakeholders reading different documents will reach opposite conclusions about the same tree.
- **Expected:** One clearly-designated current status document; superseded audit marked as remediated with a pointer forward.
- **Current:** README line 149: 'docs/audit/2026-07-10/ — current production-readiness audit'; root PRODUCTION_AUDIT_REPORT.md unreferenced from README.
- **Suggested fix:** In README 'Project docs': list PRODUCTION_AUDIT_REPORT.md (2026-07-11) as the latest audit, relabel docs/audit/2026-07-10/ as 'prior audit (findings remediated — see its REMEDIATION.md)', and add links to CHANGELOG.md and ALL_ISSUES.md. Add a one-line status banner at the top of docs/audit/2026-07-10/README.md linking to REMEDIATION.md.

#### [MEDIUM] README 'Database bootstrap' section is stale — references repo-root migration files that no longer exist and hedges about files that do exist  
`Documentation & Onboarding`

- **Location:** README.md:58-73
- **Description:** Three claims in this section are out of date: (1) lines 71-73 say 'As of this writing there are also some numbered supabase_migration_*.sql files at the repo root; check with whoever owns db/ before running those' — no such files exist at the root (verified: glob returns nothing; they were moved to db/legacy/ per db/README.md:82-90). (2) Lines 62-65 hedge 'Start with db/README.md if present… If db/README.md doesn't exist yet, treat db/schema.sql as the base schema' — db/README.md exists and is the authoritative doc. (3) Line 67 says 'If a supabase/migrations/ directory exists in this repo' — it exists with 7 migrations.
- **Root cause:** README was written mid-cleanup (before/while db/ was reorganized) and never revised after the reorganization landed.
- **Impact:** The single most operationally sensitive setup step (applying the schema, where the prior audit found the live-DB-state-unknowable H10 disaster) is documented with speculative, partly false guidance. A new operator will hunt for nonexistent root SQL files and may distrust the correct db/README.md instructions.
- **Expected:** Definitive: 'Run supabase db push against supabase/migrations/ (7 files), or paste db/schema.sql once in the SQL editor — see db/README.md.'
- **Current:** Speculative 'if present / if exists' phrasing plus a pointer to nonexistent supabase_migration_*.sql root files.
- **Suggested fix:** Rewrite the section to state directly that db/README.md is the source of truth, supabase/migrations/ contains 7 ordered idempotent migrations applied via `supabase db push`, and delete the paragraph about root-level supabase_migration_*.sql files (superseded — they live in db/legacy/ and must not be run).

#### [MEDIUM] db/README.md migration-order table omits migration 7 (upsert_gate_submission RPC)  
`Documentation & Onboarding`

- **Location:** db/README.md:46-56 (vs supabase/migrations/20260710000007_gate_submission_rpc.sql)
- **Description:** The 'Migration order' table documents migrations 1-6 and stops at 20260710000006_row_level_security.sql, but supabase/migrations/ contains a 7th file, 20260710000007_gate_submission_rpc.sql (the SECURITY DEFINER upsert_gate_submission RPC that the buddy gate-pass flow depends on). Ironically, that migration's own header comment says 'see db/README.md for how these two are kept in sync'. The RPC is present in db/schema.sql (line 689), so the two schema sources are in sync — only the documentation table is incomplete. db/README's sync-discipline section (lines 92-103) mandates keeping this documentation aligned when adding migrations, which was not followed for exactly the next migration added.
- **Root cause:** Migration 7 was added after db/README.md was written and the documented sync checklist (which covers schema.sql but implicitly also this table) was not fully executed.
- **Impact:** An operator applying migrations by hand from the documented table (e.g. via SQL editor per-file, a workflow the README explicitly contemplates) would skip migration 7, breaking the buddy gate-submission flow (RPC not found) at runtime. Also undermines confidence in the table's completeness for future migrations.
- **Expected:** Table lists all 7 migrations including 20260710000007_gate_submission_rpc.sql with a one-line description (SECURITY DEFINER RPC letting an assigned buddy create/update gc1-gc3 gate worksheet rows).
- **Current:** Table lists 6 rows; 7 migration files exist.
- **Suggested fix:** Add the missing row: `| 20260710000007_gate_submission_rpc.sql | upsert_gate_submission() SECURITY DEFINER RPC — buddy-authored gate-control (gc1/gc2/gc3) submissions on behalf of assigned joinees |`

#### [MEDIUM] CHANGELOG claims a service worker / PWA offline support that does not exist in the code  
`Documentation & Onboarding`

- **Location:** CHANGELOG.md:25 (vs public/, src/main.tsx, index.html)
- **Description:** CHANGELOG 1.0.0-beta 'Added' lists 'PWA Support: Service worker, manifest, icon set, offline-ready <meta> tags'. Verified: there is no service-worker file anywhere (no sw.js/service-worker.js in public/ — only fonts/, favicons, icons, logo, manifest.json) and no navigator.serviceWorker registration anywhere in src/ or index.html (repo-wide case-insensitive grep for serviceworker/workbox returns zero hits). Only the manifest and icons exist; without a registered service worker there is no offline capability and the app is not installable-with-offline as 'PWA support' implies.
- **Root cause:** Retrospective changelog written from commit subjects (2456096 'add PWA icons, manifest…') and inflated to 'Service worker' without verifying against the tree.
- **Impact:** Stakeholders and future developers reading the release notes will believe offline support exists. Someone could ship this to faculty with 'works offline' expectations, or a developer could waste time debugging why 'the existing service worker' isn't caching.
- **Reproduce:** grep -rniE 'serviceworker|sw\.js|workbox' src index.html public → 0 matches; ls public/ shows no worker script.
- **Expected:** CHANGELOG describes only what shipped: 'Web app manifest + icon set (installable shortcut; no offline support)'.
- **Current:** CHANGELOG asserts 'Service worker … offline-ready'; no service worker exists or is registered.
- **Suggested fix:** Edit CHANGELOG.md line 25 to 'PWA groundwork: web app manifest, icon set, theme-color meta tags (no service worker/offline support yet)' — or actually implement and register a service worker if offline support is a launch requirement.

#### [MEDIUM] Buddy/manager assignment notifications are silently swallowed by RLS  
`User Journeys End-to-End` · ✅ verified (was HIGH)

- **Location:** src/components/admin/AssignmentsTab.tsx:80-96, src/hooks/useNotifications.ts:172-186, supabase/migrations/20260710000006_row_level_security.sql:210-212
- **Description:** AssignmentsTab calls triggerNotification() four times to notify the joinee and the assigned manager/buddy. The notifications INSERT policy now requires user_id = auth.uid() (self only). All four inserts target OTHER users, so Postgres rejects them; triggerNotification catches and console.errors, and the UI still shows 'Manager assigned!' / 'Buddy assigned!'. The comment block in useNotifications explicitly claims this helper 'remains for … buddy/manager assignment' — but that path is dead under the tightened policy.
- **Root cause:** RLS lockdown of notifications INSERT without moving assignment notifications server-side.
- **Impact:** Neither the joinee nor the newly-assigned buddy/manager ever learns of the assignment through the app. A buddy who does not proactively open /buddy will not know they have a joinee; the review queue silently accumulates.
- **Reproduce:** As academic_head, assign a buddy in /admin -> Assignments. Check the buddy's notification bell: nothing. Browser console shows the RLS insert error.
- **Expected:** Assignment produces notifications for joinee and assignee.
- **Current:** Client-side cross-user inserts fail silently; success message shown anyway.
- **Suggested fix:** Create a SECURITY DEFINER trigger on user_profiles AFTER UPDATE OF assigned_buddy_id, assigned_lead_id that inserts the notifications, and delete the client-side triggerNotification calls (or convert to an RPC).
- **Verifier note:** Confirmed mechanically: the sole notifications INSERT policy (migration 000006:210-212) requires user_id = auth.uid(), while all four triggerNotification calls in AssignmentsTab.tsx:80-81,95-96 target other users' IDs, so Postgres rejects them; triggerNotification (useNotifications.ts:183-185) swallows the error and the UI still shows 'Manager/Buddy assigned!'. No server-side trigger covers assignment changes — migration 000004 only fires on worksheet_submissions review_status transitions and profile INSERT (signup). Severity downgraded from HIGH: the claimed worst impact ('review queue silently accumulates') is mitigated because notify_reviewer_on_submission (SECURITY DEFINER) notifies the assigned buddy/manager on every actual submission, so only the one-time assignment announcements are lost, not workflow review notifications.

#### [MEDIUM] PhaseReview lets the manager 'approve the phase' when most worksheets are missing — banner text is false  
`User Journeys End-to-End`

- **Location:** src/pages/PhaseReview.tsx:224-237,335-357
- **Description:** isAllBuddyApproved = buddyApproved.length > 0 && pending.length === 0 ignores notSubmitted and needsRevision. With e.g. 3 of 12 Phase-1 worksheets buddy-approved and the other 9 never submitted (pending=0), the purple banner appears saying 'All 3 worksheet(s) in this phase have been buddy-approved. Approving will mark all worksheets in this phase as fully approved.' and the manager can bulk-approve. The phase remains un-approved for gating (isPhaseApproved requires all 12), so the joinee stays locked while the manager believes the phase is done. Dashboards only surface the button when getPhaseReviewStatus().ready, but the page is deep-linkable and reachable after a revision request empties the pending bucket.
- **Root cause:** Readiness computed from 'no pending' instead of the shared getPhaseReviewStatus (buddyApproved === total).
- **Impact:** Manager mental model diverges from actual gating: 'I approved Phase 1' yet the joinee still sees Phase 2 locked; partially-approved phases also skew the auto-promote expectations.
- **Reproduce:** Joinee submits and gets buddy-approval on 3 Phase-1 sheets only. Manager deep-links /admin/review-phase/<uid>/1 -> banner claims phase ready; Approve marks 3 approved; joinee's Phase 2 stays locked.
- **Expected:** canApprove only when every phase worksheet is buddy_approved.
- **Current:** canApprove = isManager && buddyApproved>0 && pending===0.
- **Suggested fix:** Use getPhaseReviewStatus(phaseNumber, submissions, userId).ready for canApprove, and reword the banner to state x/y worksheets; show notSubmitted/needsRevision blockers explicitly.

#### [MEDIUM] Dashboard overall progress numerator counts worksheets its denominator excludes — bar can exceed 100%  
`User Journeys End-to-End`

- **Location:** src/pages/Dashboard.tsx:29-31,97-101,260-267
- **Description:** totalApproved counts every submission with review_status='approved' — including FTP week-2/3/4 ids (w2_e1, w3_d1, w4_b1 …) and gc2/gc3. totalWorksheets is the union of the three phase definitions in this file, which include Phase-1's 12 ids but only p2_w1-4 and p3_w1-5 (gc2/gc3 and all 13 FTP week-2/4-only ids excluded) = 21. A joinee progressing through the FTP weeks accrues approved sheets not in the denominator, so the count reads e.g. '27 / 21' and the fill width exceeds 100%. Similarly getPhaseProgress reports Phase 2 as 4/4 'complete' while gc2 is still outstanding for actual phase approval.
- **Root cause:** Two different worksheet universes (submission table vs local phase arrays) used for numerator vs denominator.
- **Impact:** Visibly wrong progress numbers on the primary landing page; joinees see phases at 100% that are not approvable, or totals above the maximum.
- **Reproduce:** Approve all Week-2 FTP sheets + gc2 for a user; open Dashboard: totalApproved includes 6+ ids not in totalWorksheets.
- **Expected:** Both sides computed over the same canonical worksheet set.
- **Current:** Numerator unscoped; denominator omits gates/FTP ids.
- **Suggested fix:** Compute totalApproved as submissions.filter(s => allPhaseWorksheetIds.has(s.worksheet_id) && s.review_status==='approved').length, and include gc2/gc3 in the phase arrays (or derive them from PHASE_WORKSHEETS_MAP).

#### [MEDIUM] Review queues and assignment lists show stale data right after acting, due to un-invalidated fetch caches  
`User Journeys End-to-End`

- **Location:** src/pages/BuddyDashboard.tsx:77-85, src/pages/WorksheetReview.tsx:187,238,291 (navigate(-1) after 2s), src/pages/AdminDashboard.tsx:85-115, src/components/admin/AssignmentsTab.tsx:84,99
- **Description:** After a buddy approves/rejects, WorksheetReview navigates back to /buddy, whose loadData wraps the worksheet query in fetchWithCache (ttl 15s) keyed by instructor ids — the cache is only invalidated by the manual Refresh button. The just-reviewed worksheet therefore still appears in 'Pending Review' for up to 15s. AssignmentsTab's onRefresh calls AdminDashboard.loadData, which serves 'admin-instructors' from a 30s cache, so a successful assignment does not appear in 'Current Assignments' despite the success message.
- **Root cause:** Mutations never call invalidateCache/invalidateCacheByPrefix; only the Refresh buttons do.
- **Impact:** Reviewers immediately re-open items they just handled (risking the concurrency-conflict path) and admins believe assignments failed; both erode trust in the dashboards.
- **Reproduce:** Approve a pending worksheet as buddy; auto-return to /buddy within 2s: the item is still listed Pending. Assign a buddy in /admin: list unchanged until 30s pass or manual Refresh.
- **Expected:** Post-mutation navigation shows fresh state.
- **Current:** TTL caches served immediately after mutations.
- **Suggested fix:** invalidateCacheByPrefix('buddy-') after successful approve/revision (or on WorksheetReview unmount), and invalidateCacheByPrefix('admin-') inside AssignmentsTab before onRefresh().

#### [MEDIUM] Notification clicks misroute: FTP worksheet ids fall back to /phase-1, and workflow-less notifications send reviewers to a 404  
`User Journeys End-to-End`

- **Location:** src/components/NotificationBell.tsx:32-40,65-82
- **Description:** PHASE_MAP contains only legacy p*/gc* ids; all 16 FTP ids (w1_o1 … w4_g1) are missing, so a joinee clicking any FTP-worksheet notification is sent to /phase-1 regardless of week. For reviewers, every notification navigates to `/{rolePath}/review/${from_user_id||user_id}/${worksheet_id}` — but signup, assignment, and promotion notifications have worksheet_id '' (and assignment ones have from_user_id = the admin), producing /admin/review/<uid>/ which matches no route and lands on the 404 page (or a review page for the wrong user).
- **Root cause:** Single navigation formula assumes every notification references a reviewable worksheet; PHASE_MAP never extended for FTP.
- **Impact:** The notification bell — the main cross-role hand-off mechanism — routinely drops users somewhere unrelated or on 'Page Not Found', particularly for the new-signup notifications managers actually receive.
- **Reproduce:** As academic_head, click the '<name> has signed up and started onboarding.' notification: URL /admin/review/<uid>/ renders NotFound.
- **Expected:** Every notification lands on a meaningful page.
- **Current:** Empty worksheet_id interpolated into review URL; FTP ids default to phase-1.
- **Suggested fix:** Guard: if (!notification.worksheet_id) navigate(role-appropriate dashboard); extend PHASE_MAP with WK ids -> /week-N (or navigate joinees directly to /week-N/worksheet/<id>).

#### [MEDIUM] Gate artifact pages give no feedback on blocked/failed submits (silent button, unrendered submitError, invisible required field)  
`User Journeys End-to-End`

- **Location:** src/pages/gate-controls/GateArtifact1.tsx:93-98, GateArtifact2.tsx/GateArtifact3.tsx/GateArtifact4.tsx (no submitError render — grep 0 matches), src/hooks/useGateControl.ts:132-137
- **Description:** GateArtifact1's Submit button does `if (!allRequiredMet) { return; }` — clicking with unchecked required artifacts does nothing, and the error alert renders only when `!allRequiredMet && submitError`, but submitError is never set on that path, so no message ever appears. GateArtifact2-4 disable the button instead but render submitError nowhere, so validation failures (e.g. the required 'employeeName' — a field none of the four gate pages has an input for, relying entirely on invisible OAuth prefill) and RPC errors set state that is never displayed (network errors at least toast; validation errors do not).
- **Root cause:** Copy-paste divergence between gate pages; required field without a corresponding input; error state not rendered.
- **Impact:** A joinee at the week gate can click Submit and get zero feedback about why nothing happened — a dead-end on the critical week-unlock path (w*_g1 submission is required for the next week's WeekAccessGuard).
- **Reproduce:** Open /week-1/worksheet/w1_g1 with required artifacts unchecked; click 'Submit Gate' — nothing happens, no message. Or clear localStorage name cache with a profile lacking user_metadata name/email: employeeName validation blocks silently.
- **Expected:** Every blocked submit explains itself inline.
- **Current:** Silent no-op submits and invisible errors.
- **Suggested fix:** Render {submitError && <ErrorAlert/>} unconditionally in all four GateArtifact pages; on !allRequiredMet click, set a visible message instead of returning; drop employeeName from requiredFields or add the input.

#### [MEDIUM] Onboarding-lead-designated worksheets (p1_w4, p1_w5, p2_w4) notify a role that can never act; badges misstate the actual reviewer  
`User Journeys End-to-End`

- **Location:** src/config/worksheetConfigData.ts:424-435, supabase/migrations/20260710000004_server_side_notifications.sql:44-45, src/pages/WorksheetReview.tsx:57,97-98
- **Description:** WORKSHEET_REVIEWER marks p1_w4/p1_w5/p2_w4 as reviewer_type 'onboarding_lead'; the submission trigger notifies every onboarding_lead when these are submitted. But onboarding_lead is read-only by design (client isReadOnly, no RLS UPDATE policy), so they can never approve or clear these items — their notifications accumulate with a perpetual read-only banner at /onboarding-lead/review/…. Meanwhile the buddy (lead_instructor) is who actually approves these sheets, contradicting the 'Onboarding Lead' ReviewerBadge shown to joinees and the review flow documented at the top of worksheetConfigData.ts.
- **Root cause:** Reviewer-type taxonomy predates the 'onboarding_lead is monitor-only' security decision; never reconciled.
- **Impact:** Onboarding leads get an actionable-looking queue they cannot action (dead-end clicks), and if buddies assume 'Onboarding Lead' sheets aren't theirs, those three worksheets can sit unreviewed — they are required for phase approval and promotion.
- **Reproduce:** Joinee submits p1_w4. Onboarding lead clicks the notification: read-only view, no action possible. Buddy dashboard shows it in Pending Review only because it lists all statuses regardless of reviewer_type.
- **Expected:** Reviewer badge, notification target, and actual approval authority agree.
- **Current:** Notified role is powerless; acting role is mislabeled.
- **Suggested fix:** Either give onboarding_lead approve rights for their designated worksheet ids (client + RLS + trigger), or re-map those three worksheets to reviewer 'buddy' and stop notifying onboarding_leads for them.

#### [MEDIUM] Managers and onboarding leads land on the joinee Dashboard where the primary CTAs silently bounce; joinee 'Final Assessment' quick link also bounces  
`User Journeys End-to-End`

- **Location:** src/App.tsx:77-89,142-146,163, src/pages/Dashboard.tsx:284-306,425-433
- **Description:** HomeRoute only redirects lead_instructor to /buddy. academic_head and onboarding_lead get the joinee Dashboard at '/', whose phase cards (role=button) and 'Start Phase 1/2/3' quick links point at routes requiring new_joinee/lab_instructor — ProtectedRoute redirects them straight back to '/', i.e. clicking does nothing visible. Conversely, joinees see a 'Final Assessment' quick link to /assessment, which requires academic_head/onboarding_lead/lead_instructor and bounces them back to '/' too.
- **Root cause:** Role-aware landing implemented only for lead_instructor; quick links not role-filtered.
- **Impact:** Silent-no-op clicks on the landing page for three roles; the manager's first experience after login is a dashboard of dead cards ('Not Started' everywhere, since it queries their own empty submissions).
- **Reproduce:** Log in as academic_head, land on '/', click the Phase 1 card: URL flickers to /phase-1 then back to '/'. Log in as new_joinee, click 'Final Assessment': same bounce.
- **Expected:** Each role lands on and is offered only pages it can use.
- **Current:** Redirect-to-'/' loops disguise forbidden links as dead clicks.
- **Suggested fix:** Extend HomeRoute: academic_head -> /admin (or /buddy), onboarding_lead -> /onboarding-lead. Filter Dashboard quick links by role (hide /assessment for joinees or open it to them).

#### [MEDIUM] PhaseAccessGuard flashes the 'Phase Locked' screen before its access query runs  
`User Journeys End-to-End`

- **Location:** src/components/PhaseAccessGuard.tsx:77-79,109-135
- **Description:** checking is initialized to false and only set true inside the effect. On the first render for phase 2/3, checking=false, loadError=false, allSubmissions=[] -> canAccessPhase(...,[]) is false -> PhaseLockedView renders for a frame (or longer on slow devices) before the query flips to 'Loading…' and then unlocks. Every legitimately-unlocked visit to /phase-2/worksheet-N or /phase-3/worksheet-N shows a 'Phase Locked' flash; a fast back/forward can leave it visible long enough to be read.
- **Root cause:** Initial state renders the decision UI before the async check has started.
- **Impact:** Joinees who earned Phase 2/3 access repeatedly glimpse 'Phase 2 Locked — complete all worksheets in Phase 1' — confusing and support-ticket-generating; WeekAccessGuard got this right (checking starts true).
- **Reproduce:** As a joinee with Phase 1 fully approved, navigate to /phase-2/worksheet-1; observe the locked view flash before content.
- **Expected:** Loading state until the first access check resolves.
- **Current:** useState(false) for checking.
- **Suggested fix:** Initialize checking = phaseNum > 1 (mirror WeekAccessGuard.tsx:84).

#### [MEDIUM] Admin/Lead dashboards silently truncate at 2000 worksheet rows — stats wrong and 'Phases Ready' pipeline stalls at scale  
`Performance & Scalability` · ✅ verified (was HIGH)

- **Location:** src/pages/AdminDashboard.tsx:107-115, src/pages/OnboardingLeadDashboard.tsx:69-76
- **Description:** Both dashboards fetch a flat list of worksheet_submissions for up to 500 joinees with .order('updated_at', {ascending:false}).limit(2000) and then compute ALL aggregate stats, per-phase progress, and getPhaseReviewStatus() readiness client-side from that array. 40 distinct worksheet IDs exist per joinee (PHASE_WORKSHEETS_MAP + FTP weeks), so the cap is exhausted at ~50 active joinees. Because ordering is most-recent-first, the rows dropped are the OLDEST — i.e. exactly the long-approved worksheets of senior joinees.
- **Root cause:** The prior audit's 'add limits to unbounded selects' remediation (H34/H36) added hard caps without pagination or server-side aggregation, converting an unbounded-fetch problem into a silent-truncation problem.
- **Impact:** At the stated production scale (500 joinees, 3 years of data ≈ 20,000 rows) the dashboard operates on 10% of the data: header stats (totalPending/totalApproved) are wrong, per-joinee phase bars regress, and getPhaseReviewStatus().ready — which requires EVERY worksheet in a phase to be visible as buddy_approved — returns false for joinees whose earlier approvals fell outside the 2000-row window. The 'Phases Ready' tab (PhasesReadyTab.tsx:16-23) and the per-joinee 'Review Phase' buttons disappear, so managers can no longer find phases to approve and the promotion pipeline silently stalls. No error, no warning. The 500-row cap on user_profiles (AdminDashboard.tsx:90) has the same silent-drop behavior for joinee #501.
- **Reproduce:** Seed 60 joinees with all 40 worksheets each (2,400 rows). Load /admin as academic_head: the 400 oldest rows are missing; a joinee whose Phase 1 was buddy-approved 3 months ago no longer shows as 'Phase ready'.
- **Expected:** Server-side aggregate (view/RPC) or paginated fetch that provably covers all rows needed for readiness computation
- **Current:** .select(rows).in('user_id', ids).order('updated_at',{ascending:false}).limit(2000) + client-side reduce over the array
- **Suggested fix:** Move aggregation server-side: a Postgres view or RPC (e.g. get_joinee_progress()) returning one row per joinee with per-phase counts (total, buddy_approved, approved, pending, needs_revision) and a ready_phases array — 500 rows instead of 20,000. Keep raw-row fetches only for the single-joinee PhaseReview page (already scoped). If a view is too much before launch, at minimum detect truncation (count:'exact' vs rows returned) and surface a visible warning instead of silently computing wrong readiness.
- **Verifier note:** The mechanism is fully real: both dashboards fetch at most 2000 worksheet rows newest-first (AdminDashboard.tsx:107-115, OnboardingLeadDashboard.tsx:69-76) and compute all stats plus getPhaseReviewStatus().ready (worksheetConfigData.ts:598-611, requires every phase worksheet visible as approved) client-side, so truncation silently hides Approve Phase buttons (PhasesReadyTab.tsx:16-23) and shows a misleading 'All Caught Up' state; ~40 worksheet IDs per joinee is accurate. However, the claimed scale math is overstated: the query is scoped .in('user_id', ids) to current new_joinee/lab_instructor profiles only, and the promotion RPC (migration 20260710000005:70) moves joinees to lead_instructor, removing their rows from the dataset — so 3 years of promoted-joinee history does NOT accumulate, and the bug fires only at ~50+ concurrently tracked onboardees rather than automatically over time. It remains a genuine silent time bomb (lab_instructor has no promotion path, so that cohort's rows accumulate against the cap indefinitely), warranting MEDIUM rather than HIGH.

#### [MEDIUM] AdminDashboard recomputes O(instructors × worksheets) aggregations twice per render with no memoization — search box lags at scale  
`Performance & Scalability`

- **Location:** src/pages/AdminDashboard.tsx:161-223 (getInstrStats/getPhaseProgress/getReadyPhases/totalReadyPhases), 306-307 (search input), 311 & 317 (filterInstructors() called twice)
- **Description:** Every render calls filterInstructors() TWICE (once for the empty-state check at line 311, once to map at line 317). Each call runs getInstrStats (5 full .filter() passes over allWorksheets) and, for the buddy_approved filter, getReadyPhases (3 × getPhaseReviewStatus, each of which re-filters the entire allWorksheets array and does a nested .find() per worksheet ID) for every instructor. totalReadyPhases (line 218) adds another instructors×3 pass. Nothing is wrapped in useMemo, and every keystroke in the search input (controlled at line 306) re-renders the whole component and re-runs all of it. At 500 instructors × 2000 rows this is on the order of 10⁷–10⁸ array operations per keystroke.
- **Impact:** Typing in the admin search field becomes visibly janky (hundreds of ms per keystroke) well before the 500-joinee target; the same recomputation runs on every unrelated state change (tab switch, filter click). OnboardingLeadDashboard (lines 119-158) and PhasesReadyTab share the pattern at smaller multiples.
- **Reproduce:** Seed 500 instructors + 2000 worksheet rows, open /admin, type in the search box with the Performance profiler open — each keystroke triggers a full recompute of all per-instructor stats twice.
- **Expected:** Memoized Map-based grouping computed once per data load
- **Current:** Per-render closures doing repeated .filter()/.find() over the full submissions array, invoked twice
- **Suggested fix:** One useMemo keyed on [allWorksheets]: group submissions once into a Map<user_id, WorksheetSubmission[]> (O(N)), precompute per-instructor stats + readyPhases into a Map (O(instructors × 40)), then have filterInstructors/searching consume the precomputed maps. Call filterInstructors once and reuse the result: const visible = useMemo(...); visible.length === 0 ? ... : visible.map(...).

#### [MEDIUM] ~2.3 MB of uncompressed TTF fonts, no WOFF2, no preload, and /fonts/* excluded from immutable cache headers  
`Performance & Scalability`

- **Location:** src/styles/index.css:9-70 (@font-face), public/fonts/ (Inter-300/400/500/600/700.ttf ≈ 318 KB each, Playfair ×3 ≈ 350 KB), vercel.json:20-24 (Cache-Control only for /assets/*)
- **Description:** Fonts were self-hosted (good, fixes the old CDN dependency) but as raw .ttf files: 5 Inter weights + 3 Playfair faces total ~2.26 MB. WOFF2 equivalents are ~25-30% of TTF size (~100 KB/face, less with latin subsetting). vercel.json's immutable Cache-Control rule covers only /assets/(.*) and a hardcoded list of root files — /fonts/* gets Vercel's default max-age=0, must-revalidate, so every session revalidates 8 font URLs. No <link rel="preload"> for the primary body face, so with font-display:swap the first render flashes fallback text and shifts layout while megabytes of fonts stream in.
- **Impact:** First visit on a mid-range connection spends multiple seconds downloading fonts (the fonts outweigh the entire JS bundle ~20:1); FOUT/CLS on every cold load; repeat visits pay 8 revalidation round-trips. For a portal used daily by 500 faculty on campus Wi-Fi this is the single largest byte cost in the app.
- **Expected:** Subsetted WOFF2 (~200-400 KB total), immutable caching, preloaded primary face
- **Current:** 8 TTF faces, ~2.26 MB total, default (revalidate) caching, no preload
- **Suggested fix:** Convert to WOFF2 (fonttools/pyftsubset or glyphhanger with latin subset), update @font-face src to format('woff2'), drop unused weights (audit which of 300/500/600 are actually used in theme.ts), add a vercel.json header rule for /fonts/(.*) with public, max-age=31536000, immutable, and preload the 400-weight body face in index.html.

#### [MEDIUM] 500-UUID .in('user_id', ...) filters serialized into GET query strings — ~20 KB URLs at target scale, plus pathological cache keys  
`Performance & Scalability`

- **Location:** src/pages/AdminDashboard.tsx:104-113, src/pages/OnboardingLeadDashboard.tsx:65-75, src/pages/BuddyDashboard.tsx:76-85
- **Description:** supabase-js serializes .in() filters into the URL query string of a GET request. With 500 instructor UUIDs (36 chars + encoding each) the request URL is ~20 KB. This sails past common proxy/CDN URL limits (many default 8-16 KB; Cloudflare 32 KB) and is fragile — one infrastructure change away from HTTP 414 failures that only manifest at scale. The same joined-ID string is also used as the queryCache key (`admin-worksheets-${ids.sort().join(',')}`), creating ~20 KB Map keys.
- **Impact:** Admin/lead dashboard queries can start failing outright (414/400) once joinee count grows, in exactly the environment (production, full roster) not exercised in testing. Cache keys of this size are wasteful and make invalidateCacheByPrefix scans slower.
- **Expected:** RPC/view with body-passed ids, RLS-scoped query, or chunked batches
- **Current:** GET /rest/v1/worksheet_submissions?user_id=in.(uuid1,uuid2,...×500)
- **Suggested fix:** Prefer the server-side aggregate from finding #1 (eliminates the ID list entirely). Otherwise: since RLS already restricts reviewer roles' visibility, drop the .in() and filter by role-visible rows with a bounded .limit + pagination, or batch the .in() into chunks of ~100 ids, or use a POST-based RPC that takes the id array in the body. Use a short hash of the id set for the cache key.

#### [MEDIUM] Notification polling every 15 s per client with no visibility pause — ~33 req/s of idle background load at 500 users  
`Performance & Scalability`

- **Location:** src/hooks/useNotifications.ts:52 (default 15000), 100-108 (setInterval, no document.hidden check); src/components/NotificationBell.tsx:46 (mounted in Navbar for every logged-in user)
- **Description:** Every logged-in session polls the notifications table (SELECT ... limit 50) every 15 s via setInterval, including when the tab is backgrounded or the laptop lid is half-closed. There is no visibilitychange pause, no backoff on error (a failing Supabase instance keeps getting hammered every 15 s), and no Realtime subscription despite Supabase supporting it (wss://*.supabase.co is even already allowed in the CSP).
- **Impact:** 500 concurrent faculty = ~2,000 requests/min of constant baseline load on Supabase for a feature where 60 s latency would be unnoticeable; contributes directly to API rate-limit consumption on smaller Supabase tiers. Prior audit flagged this (P5) and it was not remediated.
- **Expected:** Realtime subscription or visibility-aware 60 s polling with error backoff
- **Current:** Unconditional 15 s setInterval per client
- **Suggested fix:** Either subscribe to postgres_changes on notifications filtered by user_id (Realtime channel, unsubscribes on unmount), or keep polling but: pause when document.hidden, resume+refresh on visibilitychange, raise the interval to 60 s, and back off exponentially after consecutive fetch errors.

#### [MEDIUM] Autosave issues a conflict-check SELECT before every UPSERT whose result is only console-logged — 2× round-trips per save  
`Performance & Scalability`

- **Location:** src/hooks/useAutoSave.ts:131-154 (conflict check), 203-232 (upsert), 252-257 (1.5 s debounce)
- **Description:** Every save — including every background debounced save that fires after each 1.5 s typing pause — first SELECTs updated_at for the row, compares it, logs a console.warn on mismatch, and then upserts anyway ('Saving anyway (last-write-wins)'). The check changes no behavior visible to the user; it purely doubles latency and query count. Each upsert also rewrites the entire worksheet_data JSON blob and fires the BEFORE UPDATE validation trigger.
- **Impact:** A joinee writing a long reflection generates a save every pause: an hour-long worksheet session can produce 100+ save cycles = 200+ queries, and the extra SELECT adds ~100-300 ms to each cycle's completion (slower 'Saved' indicator, longer window for tab-close data loss). At 500 concurrent joinees during an onboarding cohort week this doubles the write-path query volume for zero user benefit.
- **Expected:** Single conditional write (or plain upsert) per save; check only if its result changes behavior
- **Current:** SELECT updated_at → console.warn → upsert full payload regardless, per 1.5 s pause
- **Suggested fix:** Either make the check meaningful — surface a conflict UI / abort the save when server updated_at is newer (true optimistic concurrency, e.g. .eq('updated_at', savedAt) on the upsert's underlying update) — or delete the pre-SELECT entirely and keep last-write-wins. Also consider raising the debounce to 3-5 s; nothing in the UX needs 1.5 s persistence granularity.

#### [MEDIUM] Assignment mutations bypass cache invalidation — AssignmentsTab refresh re-reads 30 s-stale data  
`Performance & Scalability`

- **Location:** src/pages/AdminDashboard.tsx:399 (onRefresh={loadData}), 85-99 (fetchWithCache 'admin-instructors' default 30 s TTL); src/components/admin/AssignmentsTab.tsx:76-84, 91-99 (update then onRefresh())
- **Description:** After assigning a manager/buddy, AssignmentsTab calls onRefresh(), which is loadData — but loadData reads user_profiles through fetchWithCache('admin-instructors') with the default 30 s TTL and no invalidation. Only the manual header Refresh button calls invalidateCacheByPrefix('admin-') first. So the freshly written assignment is not reflected: the 'Current Assignments' list, '(managed)/(buddy)' select annotations, and the No Manager/No Buddy badges in Overview all show pre-mutation state for up to 30 s.
- **Impact:** Admin assigns a buddy, sees 'Buddy assigned!' but the list still shows the joinee unassigned → assumes failure, re-selects, re-assigns, and fires duplicate notification inserts to joinee and buddy (AssignmentsTab.tsx:95-96). Confusing and generates duplicate notification rows.
- **Reproduce:** Open /admin → Assignments, assign a buddy, observe the Current Assignments list: the new buddy does not appear until 30 s later or a manual header Refresh.
- **Expected:** Mutation invalidates the affected cache prefix before refetching
- **Current:** Post-mutation refresh served from 30 s TTL cache
- **Suggested fix:** Call invalidateCacheByPrefix('admin-') inside loadData when invoked as a post-mutation refresh, or simplest: pass onRefresh={() => { invalidateCacheByPrefix('admin-'); loadData(); }} at AdminDashboard.tsx:399.

#### [MEDIUM] markClean() after submit wipes the dirty flag for edits made during the in-flight flushSave — those edits are never autosaved and beforeunload will not warn  
`React Correctness & State Management`

- **Location:** src/hooks/useWorksheet.ts:250-260, src/hooks/useGateControl.ts:169-207
- **Description:** handleSubmit builds submitData from the current data, awaits flushSave(submitData) (network round-trip, possibly with retries up to ~9s), then calls markClean() which sets dirty=false unconditionally. Any updateField call the user makes during the await sets dirty=true and schedules an autosave — but markClean() then clears dirty, the autosave effect re-runs, its cleanup cancels the pending timer, and it returns early on !dirty. The interim edit exists only in memory: no autosave will fire for it (until yet another edit re-dirties), and the beforeunload guard (gated on dirty, useWorksheet.ts:309) will not warn if the user closes the tab. The same pattern is copied in useGateControl.handleSubmit.
- **Root cause:** markClean() asserts 'in sync with server' based on the pre-submit snapshot, not on whether data changed since flushSave started.
- **Impact:** Data loss window proportional to submit latency: fields edited while the 'Submitting…' spinner runs are dropped silently. Worksheet forms are not disabled during submit in all worksheets, so this is reachable by real users on slow connections (flushSave can take 9+ seconds through its retry backoff).
- **Reproduce:** Throttle network to Slow 3G, click Submit, immediately edit a textarea while submitting, wait for the success toast, close the tab (no warning), reload — the edit is gone.
- **Expected:** Only mark clean if no edits occurred during the await.
- **Current:** await flushSave(submitData); markClean();
- **Suggested fix:** Track an edit counter: increment a ref in setData; capture it before flushSave and only call markClean() if it is unchanged after: `const gen = editGenRef.current; await flushSave(submitData); if (editGenRef.current === gen) markClean();`

#### [MEDIUM] WorksheetReview/PhaseReview data loads have no cancellation — out-of-order responses can render one joinee's submission under another joinee's review URL  
`React Correctness & State Management`

- **Location:** src/pages/WorksheetReview.tsx:100-132, src/pages/PhaseReview.tsx:68-103
- **Description:** loadData in both review pages is re-invoked when :userId/:worksheetId params change (same Route pattern → no remount; NotificationBell navigates reviewers directly between review URLs, NotificationBell.tsx:76), but carries no cancelled flag or request token. Two overlapping fetches can resolve out of order: the older response's setSubmission/setInstructor lands last and wins, leaving joinee A's content displayed while the URL (and all approve/revision mutations, which use params userId/worksheetId) targets joinee B. The optimistic-concurrency `.eq('review_status', loadedStatus)` only saves you when the two rows' statuses differ — both being 'pending_review' is the common case, so an approve would succeed against B while the reviewer believes they are reading A. useWorksheet's own load effect (useWorksheet.ts:147,151) does this correctly with a cancelled flag; the review pages skipped it.
- **Root cause:** Async effect without cancellation/latest-wins guard.
- **Impact:** A reviewer can approve or send-for-revision the wrong person's worksheet based on misrendered content — a review-integrity failure requiring only a slow first response plus a quick second navigation (clicking two bell notifications in succession).
- **Reproduce:** Throttle network; on /buddy/review/A/p1_w1 (slow response pending), click a bell notification for B's p1_w1; when A's delayed response lands after B's, the page shows A's answers at B's URL; clicking Approve updates B's row.
- **Expected:** Stale responses discarded when params change.
- **Current:** loadData is a bare async useCallback; effect calls it with no cleanup.
- **Suggested fix:** Mirror useWorksheet's pattern: run the fetch inside the effect with `let cancelled = false; ... if (cancelled) return; ... return () => { cancelled = true; };`, or keep a requestIdRef incremented per loadData call and ignore results whose id is stale.

#### [MEDIUM] PhaseAccessGuard initializes checking=false, flashing the full 'Phase N Locked' screen to authorized users on every visit before the access query even starts  
`React Correctness & State Management`

- **Location:** src/components/PhaseAccessGuard.tsx:78, 115-133
- **Description:** For phaseNum > 1, the first render happens before the useEffect that starts the query: checking=false, loadError=false, allSubmissions=[] → canAccessPhase(user.id, phaseNum, []) is false → PhaseLockedView is rendered for at least one paint (longer if the browser is busy). Only when the effect runs does setChecking(true) switch to the Loading view. WeekAccessGuard gets this right by initializing checking=true (WeekAccessGuard.tsx:84).
- **Root cause:** Loading state defaults to 'not checking' while access defaults to 'derived from empty data' — fail-closed rendering happens before fail-closed checking begins.
- **Impact:** Every legitimate Phase 2/3 visit flashes a full-page 'Phase 2: Contribution Locked — complete all worksheets…' screen, which reads as a scary regression to users who just got approved, and may trigger support requests. On slow devices the flash is clearly visible.
- **Reproduce:** As a joinee with Phase 1 fully approved, navigate to /phase-2 with CPU throttling; observe the Locked view render before 'Loading…'.
- **Expected:** Guard renders a loading state until the first check completes.
- **Current:** const [checking, setChecking] = useState(false);
- **Suggested fix:** Initialize `useState(phaseNum > 1)` for checking (matching WeekAccessGuard), or track a separate `checked` boolean and render the loading view until checked || phaseNum <= 1.

#### [MEDIUM] dirty flag is never cleared after a successful background autosave — beforeunload warns about 'unsaved changes' that are already saved  
`React Correctness & State Management`

- **Location:** src/hooks/useAutoSave.ts:214-222, src/hooks/useWorksheet.ts:307-318
- **Description:** dirty is set on any edit and only cleared by markClean(), which is called exclusively after an explicit submit. A joinee who edits a field, waits for the 'saved' indicator (background autosave succeeded, lastSavedJsonRef updated), and then closes the tab still gets the browser's 'unsaved changes' dialog, because the beforeunload effect keys on dirty alone.
- **Root cause:** Dirty-tracking conflates 'user has edited since load' with 'there are edits not yet persisted'; successful background saves don't feed back into the flag.
- **Impact:** Persistent false-positive unload warnings on the most common flow (edit → autosave → leave). Users learn to click through the dialog, which neuters the guard for the cases where it matters (finding #3's real-loss window).
- **Reproduce:** Edit any worksheet field, wait 2s for 'Saved', close the tab — browser prompts anyway.
- **Expected:** beforeunload should fire only when in-memory data differs from last persisted data.
- **Current:** save() updates lastSavedJsonRef but has no channel to clear the caller's dirty state.
- **Suggested fix:** Have useAutoSave expose an onSaved callback (or a hasUnsavedChanges boolean computed as JSON.stringify(worksheetData) !== lastSavedJsonRef.current, mirrored into state on save success), and gate the beforeunload effect on that instead of raw dirty.

#### [MEDIUM] Due-date 'never overwrite persisted value' guard is per-mount only, and races the async start_date fetch — a save can overwrite the stored due_date with a bogus 'now minus 30 days'-based value  
`React Correctness & State Management`

- **Location:** src/hooks/useAutoSave.ts:87, 99-123, 170-179; src/hooks/useDueDates.ts:52-57, 73-81
- **Description:** dueDateSetRef starts false on every mount, so the FIRST save of any session includes due_date in the upsert for any non-approved worksheet — overwriting whatever due_date is already persisted, contradicting the comment 'never overwrite a persisted value' (line 169). Usually the recomputed value matches (deterministic from start_date), but startDateRef is populated by an async profile fetch (lines 99-123) that races the first debounced save (1.5s after the first edit): if the fetch hasn't resolved (slow network, or the fetch errored and was swallowed), calculateDueDate(worksheetId, null) falls back to getDefaultStartDate() = localStorage['onboarding_start_date'] or Date.now() - 30 days (useDueDates.ts:52-57), producing a rolling garbage date that is then persisted over the correct one.
- **Root cause:** The 'set once' guard is a component-lifetime ref, not a check against the row's existing due_date, and the deterministic input (start date) is fetched asynchronously with a today-based fallback.
- **Impact:** Corrupted due_date values in the DB under slow-network/first-edit conditions — exactly the H07/H23 class of bug the sweep claimed to fix. Wrong 'Overdue by Nd' labels and (per migrations) due-date notifications for real users; also silently clobbers any manually adjusted due date.
- **Reproduce:** Clear localStorage, throttle to Slow 3G, open a worksheet with a persisted due_date and type immediately; the 1.5s autosave fires before the start_date query returns; inspect the row: due_date is now (today - 30d + offset).
- **Expected:** due_date is written only when the row has none, and never computed from a fallback 'now' base.
- **Current:** if (!dueDateSetRef.current && …) { dueDateValue = calculateDueDate(worksheetId, startDateRef.current) … }
- **Suggested fix:** Skip due_date entirely when startDateRef.current is null (no fallback), and additionally only include it when the loaded row had no due_date (thread saved.due_date through loadWorksheetData into a ref). Best: move due_date defaulting server-side (BEFORE INSERT trigger using user_profiles.start_date) and stop sending it from the client.

#### [MEDIUM] Navbar and NotificationBell sit outside the app's only ErrorBoundary — any render error there white-screens the entire app  
`React Correctness & State Management`

- **Location:** src/App.tsx:199-201 vs 116, src/components/NotificationBell.tsx:198-248
- **Description:** The single ErrorBoundary wraps only <Routes> (inside AppRoutes, App.tsx:116). Navbar — which contains NotificationBell rendering a 15s-polled list of server-provided notification objects (dynamic types, dates fed to new Date(), message strings) — plus ToastProvider's toast list and the footer are all outside it. A throw during Navbar/NotificationBell render propagates to the root with no boundary, unmounting the whole tree to a blank page.
- **Root cause:** Boundary placed around routed content only; chrome components unprotected.
- **Impact:** A single malformed notification row (or future bug in Navbar) takes down the entire app for that user on every page, with no 'Refresh' fallback UI — the worst possible failure mode, in the one component that renders on every route and re-renders every 15 seconds.
- **Reproduce:** Simulate by throwing inside NotificationBell's map (or a notification with created_at causing a thrown formatter in future edits): the app renders a blank document; the route-level boundary never engages.
- **Expected:** Every top-level region is inside some boundary; chrome failures degrade to a hidden bell, not a dead app.
- **Current:** <Navbar/> and footer are siblings of the boundary-wrapped <AppRoutes/>.
- **Suggested fix:** Wrap Navbar (or just NotificationBell) in <ErrorBoundary fallback={null}> and consider one outer boundary around AppLayout as a last resort: <ErrorBoundary><AppLayout>…</AppLayout></ErrorBoundary>.

#### [MEDIUM] NotificationBell routes reviewers to a review page for themselves when from_user_id is null, and routes joinees' FTP-week notifications to the wrong page  
`React Correctness & State Management`

- **Location:** src/components/NotificationBell.tsx:76, 79-80, 32-40
- **Description:** Reviewer click handler builds `/{path}/review/${notification.from_user_id || notification.user_id}/${worksheet_id}` — but notification.user_id is the RECIPIENT (the reviewer), so any notification without from_user_id (system/promoted/due_soon/overdue types; the promotion RPC inserts from_user_id NULL for the self-notify, migration 20260710000005 line 73-77) navigates the reviewer to reviewing their own userId, an invalid page. For joinees, PHASE_MAP only contains legacy p*/gc* ids; all FTP week worksheet ids (w1_o1 … w4_g1) fall through to 'phase-1', so a joinee clicking 'needs revision on w2_e1' lands on /phase-1 instead of /week-2/worksheet/w2_e1.
- **Root cause:** Fallback to notification.user_id conflates recipient with subject; PHASE_MAP never extended for the week-based worksheets.
- **Impact:** Notification click-through — the primary re-engagement loop for the review cycle — dead-ends or misroutes for entire notification classes; FTP-track joinees (the current program format, weeks 1-4) always get sent to the wrong track's page.
- **Reproduce:** As an FTP joinee, receive a needs_revision notification for w2_e1 and click it → you land on /phase-1. As a buddy, click a due_soon/system notification → URL is /buddy/review/<your-own-id>/<ws>.
- **Expected:** Notifications without a subject user should not produce review links; week worksheets should deep-link to /week-N/worksheet/<id>.
- **Current:** PHASE_MAP covers only p1_*/p2_*/p3_*/gc*; reviewer path uses from_user_id || user_id.
- **Suggested fix:** For reviewers: `if (!notification.from_user_id) { navigate('/buddy'); return; }`. For joinees: extend the map or derive: `const wk = worksheet_id.match(/^w([1-4])_/); navigate(wk ? `/week-${wk[1]}/worksheet/${worksheet_id}` : `/${PHASE_MAP[worksheet_id] || 'phase-1'}`)`.

#### [MEDIUM] Gate prerequisite check silently no-ops for FTP week gates and fails OPEN on unknown phase numbers  
`React Correctness & State Management`

- **Location:** src/hooks/useGateControl.ts:141-161, 35-38
- **Description:** handleSubmit derives phaseNum via parseInt(phase.replace('phase','')). For the four FTP gate artifacts phase is 'week-1'…'week-4' (GateArtifact1.tsx:26) → NaN → the entire 'worksheets must be buddy/manager approved first' check is skipped with no error or log. Separately, checkPhaseWorksheetsComplete returns {complete:true} when PHASE_WORKSHEETS_MAP[phaseNum] is undefined/empty (lines 35-38) — so any unexpected phase string that parses to a number ('phase-1' would parse to -1) bypasses the gate check silently. The DB-side upsert path does not re-validate gate prerequisites for the joinee flow (only the review state machine).
- **Root cause:** String-parsing the phase prop instead of passing structured gating config; missing-map lookup treated as vacuously complete (fail open).
- **Impact:** Joinees can submit week gate passes (w1_g1…w4_g1) without any of the week's worksheets approved — the client-side gate integrity rule only actually protects gc1/gc2/gc3. Combined with WeekAccessGuard counting gates toward week completion, a joinee can advance weeks on gate submissions alone.
- **Reproduce:** As a joinee with zero approved Week-1 worksheets, open /week-1/worksheet/w1_g1, fill the name field, submit — no 'worksheets need approval first' error appears (phase 'week-1' → NaN skips the check).
- **Expected:** Every gate declares its prerequisite worksheet list explicitly; unknown config fails closed.
- **Current:** const phaseNum = parseInt(phase.replace('phase',''), 10); if (!isNaN(phaseNum)) { …check… }
- **Suggested fix:** Pass `prerequisiteWorksheetIds: string[]` (from PHASE_WORKSHEETS_MAP or WK_WORKSHEETS_MAP) into useGateControl and check that list directly; in checkPhaseWorksheetsComplete return {complete:false} when the map lookup is missing. Long-term, enforce in upsert_gate_submission()/a trigger server-side.

#### [MEDIUM] getOAuthName's localStorage cache ('onboarding_employee_name') is never invalidated on sign-out — the next user's worksheets prefill and persist the previous user's name  
`React Correctness & State Management`

- **Location:** src/hooks/useAutoSave.ts:293-309, src/context/AuthContext.tsx:231-236
- **Description:** getOAuthName returns the cached localStorage value before ever consulting supabase.auth.getUser(). signOut() clears no localStorage keys. On a shared machine, after user A signs out and user B signs in, B's first-open worksheets hydrate employeeName with A's name (useWorksheet.ts:186-187); once B edits anything, autosave persists A's name into B's worksheet_submissions row, and reviewers see the wrong instructor name on submissions.
- **Root cause:** Global, userId-unscoped cache with no lifecycle tie to the auth session.
- **Impact:** Cross-user identity bleed on shared/lab machines (realistic for a faculty-onboarding portal), producing submissions attributed to the wrong person's name in reviewer-facing views.
- **Reproduce:** Sign in as A, open a fresh worksheet (name cached). Sign out, sign in as B on the same browser, open a fresh worksheet — the Employee Name field shows A's name.
- **Expected:** Cache keyed by user id, or purged on sign-out/sign-in of a different user.
- **Current:** localStorage.getItem('onboarding_employee_name') returned unconditionally if present.
- **Suggested fix:** Key it: `onboarding_employee_name:${user.id}` (fetch user first, then check cache), and/or in AuthContext.signOut and the SIGNED_OUT branch of onAuthStateChange call localStorage.removeItem('onboarding_employee_name').

#### [MEDIUM] Auth flows are mostly untested: signIn/signOut/onAuthStateChange and all five auth pages have no tests  
`Testing Audit`

- **Location:** src/context/AuthContext.tsx:170-240; src/pages/Login.tsx, Signup.tsx, ForgotPassword.tsx, ResetPassword.tsx, AuthCallback.tsx (no corresponding __tests__)
- **Description:** AuthContext.test.tsx covers only signUp (role-smuggling prevention — good) and the OAuth profile auto-create name fallback chain. Untested: signIn/signInWithPassword error propagation, signOut, and the onAuthStateChange handler (AuthContext.tsx:170) whose async profile fetch on auth events is the classic race-prone path (stale profile after rapid sign-out/sign-in, unsubscribe on unmount). The pages Login, Signup, ForgotPassword, ResetPassword, and AuthCallback (the OAuth redirect landing page — 54 lines that, if broken, lock out every Google-SSO user) have zero tests of validation, error display, or redirect behavior.
- **Root cause:** Auth testing focused on the two security-critical write paths (signUp role, profile insert) and skipped the session lifecycle.
- **Impact:** Login and OAuth callback are the front door for every user; a regression in redirect handling, error mapping, or the auth-event→profile-fetch sequencing would not be caught by CI. The prior audit's untested-journey list (logout, admin login) remains untested.
- **Reproduce:** grep -rn 'signIn\|signOut\|AuthCallback\|ResetPassword' src/**/__tests__/ → only mockUseAuth stubs; no direct tests.
- **Suggested fix:** Extend AuthContext.test.tsx: mock onAuthStateChange to capture the callback, fire SIGNED_IN/SIGNED_OUT events, assert profile is fetched/cleared and the subscription is unsubscribed on unmount; assert signIn rethrows supabase errors. Add render tests for Login (error banner on bad credentials, redirect to location.state.from) and AuthCallback (session → navigate, error → message).

#### [MEDIUM] useAutoSave's save() core — retry loop, conflict check, buddy-mode reviewer-column gating (H15) — untested at unit level  
`Testing Audit`

- **Location:** src/hooks/useAutoSave.ts:125-259 (vs src/hooks/__tests__/useAutoSave.test.ts which tests only the standalone helpers)
- **Description:** useAutoSave.test.ts covers only loadWorksheetData and getOAuthName. The hook body is untested except indirectly via useWorksheet.test.ts's two scenarios (failed-load blocks upsert; successful load allows one). Untested invariants that the code itself documents as security/data-integrity critical: (1) background debounced saves must never include review_status (only isSubmit does, line 161-166/191); (2) reviewer columns reviewed_by/reviewed_at/reviewer_name are written ONLY when isBuddyMode (H15, lines 196-200) — an owner-path regression here would let a joinee's autosave stamp reviewer fields; (3) due_date is written exactly once and never when already buddy_approved/approved (lines 170-179); (4) the 3-attempt retry with backoff sets saveStatus='error' and rethrows so submit handlers can't report false success (H06/H17/H32, lines 202-238); (5) last-write-wins conflict warning path (lines 131-154).
- **Root cause:** Only the easily-testable pure exports got tests; the stateful hook was covered by proxy through two useWorksheet scenarios.
- **Impact:** These are precisely the invariants the July remediation sweep introduced (H15/H29/H30/H32 comments); with no tests pinning them, the next refactor of this 313-line hook can silently undo them — e.g. reintroducing review_status on background saves, which re-triggers DB state transitions on every keystroke.
- **Reproduce:** Read src/hooks/__tests__/useAutoSave.test.ts — no renderHook(useAutoSave) call exists anywhere in the suite.
- **Suggested fix:** Add renderHook(useAutoSave) tests with fake timers and a captured upsert mock: assert background save payload has no review_status/reviewed_by keys; assert isBuddyMode payload includes reviewer columns and non-buddy payload never does (expect(payload).not.toHaveProperty('reviewed_by')); assert flushSave({status:'submitted', _savedReviewStatus:'needs_revision'}) sends review_status:'revision_submitted'; assert upsert failing 3 times → saveStatus 'error' and flushSave rejects; assert due_date present on first save only.

#### [MEDIUM] No coverage measurement, thresholds, or reporting anywhere  
`Testing Audit`

- **Location:** package.json (no @vitest/coverage-v8 devDependency), vitest.config.ts:18-22 (no coverage block), .github/workflows/ci.yml (no coverage step)
- **Description:** There is no coverage provider installed, no `coverage` configuration in vitest.config.ts, no coverage script, and CI never produces or gates on a coverage number. Given the pattern already demonstrated in this codebase (a tautological suite for useGateControl making the module look tested), the absence of line/branch metrics means test-coverage regressions and hollow tests are invisible.
- **Root cause:** Coverage tooling was never added when the suite was bootstrapped.
- **Impact:** The team cannot distinguish 'tested' from 'has a test file'; ~5,000+ lines of pages (Dashboard 457, BuddyDashboard 422, AdminDashboard 405, PhaseReview 447, plus 40+ worksheet components) sit at 0% with nothing surfacing that fact.
- **Reproduce:** npx vitest run --coverage → fails: coverage provider not installed. grep coverage vitest.config.ts package.json .github/workflows/ci.yml → no matches.
- **Suggested fix:** npm i -D @vitest/coverage-v8; add `coverage: { provider: 'v8', include: ['src/**'], thresholds: { lines: 60, branches: 55 } }` (ratcheting upward) to vitest.config.ts; run `vitest run --coverage` in ci.yml and upload the summary.

#### [MEDIUM] No E2E or integration tests in CI; the existing E2E script is manual-only and unmaintained by automation  
`Testing Audit`

- **Location:** scripts/e2e-full-flow.mjs (referenced nowhere in package.json scripts or .github/workflows/ci.yml)
- **Description:** scripts/e2e-full-flow.mjs walks the full funnel (create 6-role users → assign → submit all worksheets → buddy approve → manager approve per phase → verify auto-promotion) against a live Supabase using the anon key, but it must be run by hand (`node scripts/e2e-full-flow.mjs`), needs .env credentials and a seeded/clean database, and emits SQL for a manual RLS-bypass step. Nothing in CI exercises the app against a real database or a real browser; the prior audit's browser E2E was a one-off manual session. Every jsdom test mocks supabase at the module boundary, so the mock chains (select().eq().maybeSingle()) can drift from actual supabase-js semantics without failures.
- **Root cause:** E2E was built as a developer seeding/verification utility, not as a CI gate.
- **Impact:** The one class of bug this app has actually shipped (per CHANGELOG: 'Week 2 loading bug', RLS-rejected silent writes) lives exactly at the client↔database boundary that no automated test crosses. Regressions in query shape, RLS interaction, or the promotion funnel reach production undetected.
- **Reproduce:** grep -n e2e package.json .github/workflows/ci.yml → no matches.
- **Suggested fix:** In CI, boot a local stack with `supabase start`, apply migrations, then run a non-interactive variant of e2e-full-flow.mjs (replace the manual SQL assignment step with a service-role call available locally) as an integration gate. Longer term add 2-3 Playwright smoke flows (login → submit worksheet → buddy approve → manager phase-approve) against the local stack.

#### [MEDIUM] Reviewer/admin surfaces and the notification polling hook are untested  
`Testing Audit`

- **Location:** src/pages/Dashboard.tsx (457 lines), src/pages/BuddyDashboard.tsx (422), src/pages/AdminDashboard.tsx (405), src/pages/OnboardingLeadDashboard.tsx (287), src/pages/BuddyGatePass.tsx (159), src/components/NotificationBell.tsx (255), src/hooks/useNotifications.ts:52-109
- **Description:** All four role dashboards (queue building, role-based filtering, status aggregation), the buddy gate-pass page, and NotificationBell have no tests. useNotifications' exported helpers are well tested, but the hook itself — 15s setInterval polling with fetch races, cleanup on user change (useNotifications.ts:89-109), and mark-read mutations — is not, despite being exactly the 'race-prone async hook' category.
- **Root cause:** Testing prioritized pure logic and the joinee submit path; reviewer-side pages were left to manual QA.
- **Impact:** A buddy seeing the wrong joinees, an admin queue mis-filtering by status constant, or a leaked polling interval after logout would pass CI. These are the daily working surfaces for reviewers.
- **Reproduce:** ls src/pages/__tests__ src/components/__tests__ — none of the listed files have counterparts.
- **Suggested fix:** At minimum, extract each dashboard's queue-derivation logic (submissions → grouped/filterable view model) into pure functions and table-test them like worksheetConfigData; add one renderHook test for useNotifications asserting interval cleanup on unmount/user change (vi.useFakeTimers + spy on clearInterval).

#### [MEDIUM] Dashboard 'Final Assessment' quick link is broken for joinees — silently bounces back to dashboard  
`UI/UX & Accessibility` · ✅ verified (was HIGH)

- **Location:** src/pages/Dashboard.tsx:431; src/App.tsx:163; src/components/ProtectedRoute.tsx:35-39
- **Description:** The joinee Dashboard's Quick Links section renders a link to /assessment ('Final Assessment — Check readiness criteria'), but the /assessment route is protected with requiredRoles=['academic_head','onboarding_lead','lead_instructor']. Joinees (new_joinee/lab_instructor) — the only users who normally see this Dashboard — are redirected back to '/' by ProtectedRoute with no message.
- **Root cause:** The quick-links array is static and not filtered by role; ProtectedRoute redirects role mismatches silently.
- **Impact:** Every joinee sees a prominent quick link on their home page that appears to do nothing when clicked (URL flickers and returns). This reads as a bug, teaches users the app is unreliable, and hides the fact that assessment is a reviewer-only feature.
- **Reproduce:** Sign in as a new_joinee, scroll to Quick Links on the Dashboard, click 'Final Assessment'. You are returned to the Dashboard with no feedback.
- **Expected:** Role-inappropriate links are hidden (or the assessment route allows joinees a read-only view), and role-denied navigation shows a toast/notice.
- **Current:** Static link list shown to all Dashboard viewers; silent Navigate-to-/ on role failure.
- **Suggested fix:** Filter the quick-links array by profile.role (drop /assessment for joinees), and have ProtectedRoute fire a toast ('You do not have access to that page') before redirecting.
- **Verifier note:** Verified: Dashboard.tsx:431 unconditionally renders the /assessment quick link, HomeRoute (App.tsx:77-89) shows this Dashboard to new_joinee/lab_instructor (and acad_ops), the /assessment route (App.tsx:163) requires academic_head/onboarding_lead/lead_instructor, and ProtectedRoute.tsx:35-39 silently redirects mismatched roles to '/' with no message — so every joinee gets a home-page link that visibly does nothing. However, no joinee workflow is actually blocked (assessment is legitimately reviewer-only); the damage is confusion and perceived unreliability, so MEDIUM is the supported severity, not HIGH.

#### [MEDIUM] Autosave status indicator is dead code — 'Saving…/Saved/Failed' never rendered on any worksheet  
`UI/UX & Accessibility`

- **Location:** src/config/worksheetComponents.tsx:103,153-177; src/components/WorksheetPage.tsx:156
- **Description:** WorksheetPage passes saveStatus to WorksheetHeader (`<WorksheetHeader ... saveStatus={saveStatus} />`), and WorksheetHeaderProps declares saveStatus, but the component destructures only { icon, title, subtitle, badge } and never renders it. The fully-built SaveIndicator component (Saving…/Saved/Failed with icons) has zero usages anywhere in src (grep confirms only its definition).
- **Root cause:** WorksheetHeader's parameter destructuring omits saveStatus; SaveIndicator was never wired in.
- **Impact:** Joinees typing long worksheet answers get no visual confirmation that autosave ran or succeeded. On save failure the only signal is a transient 3.5s toast ('Auto-save failed'); the persistent saveStatus='error' state the hooks maintain is invisible, so a user who missed the toast keeps typing believing their work is being saved.
- **Reproduce:** Open any worksheet, edit a field, watch the header: no Saving/Saved indicator ever appears even though useAutoSave cycles saving→saved→idle.
- **Expected:** Header shows the SaveIndicator bound to saveStatus, persisting the 'Failed' state until a successful save.
- **Current:** saveStatus prop accepted by the type but silently dropped; SaveIndicator unused.
- **Suggested fix:** In WorksheetHeader, destructure saveStatus and render `<SaveIndicator status={saveStatus} />` next to the title (e.g. in the badge row).

#### [MEDIUM] Validation and info messages rendered as green success alerts on review pages  
`UI/UX & Accessibility`

- **Location:** src/pages/WorksheetReview.tsx:145,193,506-511,542-546; src/components/admin/AssignmentsTab.tsx:74,89,105; src/pages/PhaseReview.tsx:182,429
- **Description:** Alert styling is chosen by `message.includes('Error')`. Messages like 'Please add a comment explaining what needs revision.', 'Cannot approve: worksheet is in "approved" state.', 'This worksheet changed since you loaded it…', and AssignmentsTab's 'Select a joinee and a manager.' do not contain the literal string 'Error', so they render with lux-alert-success styling — green text, green border, and a CheckCircle2 checkmark icon.
- **Root cause:** String-sniffing (`includes('Error')` / `includes('✅')`) instead of a typed message severity.
- **Impact:** Reviewers see failure/validation feedback presented as success. A buddy who clicks Approve without meeting preconditions sees a green checkmarked banner and can reasonably believe the approval succeeded, delaying real reviews of joinee work.
- **Reproduce:** As a buddy on /buddy/review/:userId/:worksheetId, click 'Request Revision' with an empty comment box: 'Please add a comment…' appears in a green success alert with a checkmark icon.
- **Expected:** Errors and validation failures use lux-alert-error with the AlertCircle icon; only genuine successes use success styling.
- **Current:** Heuristic string matching misclassifies most non-exception failure messages as success.
- **Suggested fix:** Replace the string with state: `const [actionMessage, setActionMessage] = useState<{text: string; kind: 'success'|'error'} | null>(null)` and set kind explicitly at each call site.

#### [MEDIUM] Irreversible bulk 'Approve Phase' (and buddy Approve) execute with a single click — no confirmation  
`UI/UX & Accessibility`

- **Location:** src/pages/PhaseReview.tsx:345-350,105-175; src/pages/WorksheetReview.tsx:513-518
- **Description:** The manager's 'Approve Phase N' button immediately bulk-updates every buddy-approved worksheet in the phase to approved and can trigger auto-promotion (checkAndPromote) of the user to full access. There is no confirmation dialog and no undo path in the UI (the only reversal is per-worksheet Request Revision before approval). Buddy per-worksheet Approve is likewise one click. The app does implement confirmation for sign-out (Navbar), so the pattern exists but is missing where the stakes are highest.
- **Root cause:** handleApprovePhase is bound directly to onClick with no confirm step.
- **Impact:** A single mis-click by a manager permanently approves an entire phase and may promote a joinee who isn't ready; there is no UI to revert an approved worksheet back. This is the most consequential action in the system and the easiest to fire accidentally.
- **Reproduce:** As academic_head on /admin/review-phase/:userId/:phaseNum with all worksheets buddy-approved, click 'Approve Phase' once — all worksheets flip to approved and promotion check runs immediately.
- **Expected:** An inline confirmation ('Approve all N worksheets in Phase X for {name}? This cannot be undone here.') like the existing sign-out confirm.
- **Current:** onClick={handleApprovePhase} fires the bulk UPDATE directly.
- **Suggested fix:** Add a confirming state: first click switches the button to 'Confirm Approve Phase N' with a Cancel option (mirroring Navbar.tsx:228-255's confirmingSignOut pattern).

#### [MEDIUM] Phase 2/3 and WeekPage render content with wrong statuses (and gated-content flash) while data is loading  
`UI/UX & Accessibility`

- **Location:** src/pages/Phase2.tsx:100-124; src/pages/Phase3.tsx (same structure); src/pages/WeekPage.tsx:26-49,69
- **Description:** Phase2/Phase3 have checkingAccess state but no loading branch: while the access query is in flight, the component falls through to the full phase render, so a joinee who has NOT unlocked Phase 2 briefly sees the entire Phase 2 page (header, worksheet list, all rows clickable) before the Locked view replaces it. WeekPage has no loading state at all — it renders immediately with every worksheet badged 'Not Started', then statuses pop in when the query resolves. Phase1 and Dashboard, by contrast, have proper skeletons.
- **Root cause:** Missing `if (checkingAccess) return <skeleton/>` branch in Phase2/Phase3; WeekPage never tracks loading.
- **Impact:** Locked users see a flash of gated content (they can even click a worksheet row during the flash); returning users see their completed worksheets momentarily labeled 'Not Started', which reads as data loss for a second or two on slow connections.
- **Reproduce:** Throttle network to Slow 3G, navigate to /phase-2 as a joinee who hasn't completed Phase 1: the unlocked Phase 2 page renders first, then swaps to the Locked view. Navigate to /week-1 as a user with submissions: all rows show 'Not Started' before flipping.
- **Expected:** Loading skeleton (as in Phase1.tsx:91-156) until both access check and statuses resolve; locked content never painted.
- **Current:** Content renders optimistically with empty status map during fetch.
- **Suggested fix:** In Phase2/Phase3 add `if (checkingAccess) return <PhaseSkeleton/>;` before the locked/content branches; in WeekPage add a loading flag set in loadStatuses and render SkeletonCard rows while true.

#### [MEDIUM] Same worksheet ID listed in two different weeks under two different titles; Phase 1 totals double-count  
`UI/UX & Accessibility`

- **Location:** src/config/weeklyWorksheets.ts:24,35,48,59; src/pages/Phase1.tsx:46-51,85-87; src/pages/Dashboard.tsx:16
- **Description:** p1_w6 appears in Week 1 as 'Structured Observation — Recorded Lectures' and in Week 2 as 'Recorded Lectures — TLAC Lens'; p3_w5 appears in Week 3 as 'Build Full Lecture Package' and Week 4 as 'Lecture Package v2 — Final Approval'. Both entries share one submission row, so submitting the Week 1 version instantly marks the differently-titled Week 2 item as submitted, and opening it shows the SubmittedView — the 'second' task can never be done. Phase1.tsx's getAllWeekWorksheetIds() does not dedupe, so the header count and completedAll/totalAll double-count these two IDs, while Dashboard.tsx dedupes via new Set — the two screens report different Phase 1 totals.
- **Root cause:** Reused worksheet IDs across week configs with divergent titles; Phase1 aggregates without Set-dedup.
- **Impact:** Joinees are told to do two distinct-sounding tasks that are secretly one worksheet; completing one silently 'completes' the other and its distinct instructions are unreachable. Progress numbers disagree between Dashboard and Phase 1 page, undermining trust in tracking that reviewers rely on.
- **Reproduce:** Submit /week-1/worksheet/p1_w6, then open Week 2: 'Recorded Lectures — TLAC Lens' already shows Pending; clicking it shows 'Worksheet Submitted'. Compare the worksheet count badge for Phase 1 on Dashboard vs the 'Days 1–30 — N worksheets' header on /phase-1.
- **Expected:** Either distinct worksheet IDs per week task, or one canonical title with an explicit 'continued in Week 2' label; totals deduped consistently.
- **Current:** Duplicate IDs with different titles; Phase1 counts duplicates twice.
- **Suggested fix:** Dedupe in Phase1 (`[...new Set(ids)]`) for counts, and either split the duplicated tasks into their own IDs or render a 'Continues from Week 1' badge instead of a second full row.

#### [MEDIUM] Gold and warning status text fails WCAG contrast; critical status labels rendered at 8–9.6px  
`UI/UX & Accessibility`

- **Location:** src/styles/index.css:83,87; src/pages/BuddyDashboard.tsx:305,374; src/pages/WorksheetReview.tsx:30; src/pages/Dashboard.tsx:361-373,404; src/pages/AdminDashboard.tsx:359-366,380; src/components/PhaseWorksheetList.tsx:78-84
- **Description:** --color-gold #D4AF37 on --color-alabaster #F9F8F6 has a contrast ratio of roughly 2.0:1 (WCAG AA requires 4.5:1 for text this size). It is used for meaningful text: 'Pending' / 'Pending Review' status badges (BuddyDashboard, WorksheetReview StatusBadge), pending counts in stat tiles, and the 'View all worksheets in Phase 1' link. --color-warning #E65100 due-date labels (~3.3:1) also fail. Separately, status labels, due-date chips, and even action buttons are set at 0.5rem–0.6rem (8–9.6px): AdminDashboard's 'Review Phase' button is fontSize 0.5rem, PhaseWorksheetList due-date/status text is 0.55–0.6rem.
- **Root cause:** Brand gold used directly as text color; editorial micro-type scale applied to functional UI.
- **Impact:** The most decision-relevant text in the app — what state a worksheet is in and what's overdue — is the hardest to read, and effectively invisible to low-vision users; 8px button text is a mobile usability failure for reviewers approving phases.
- **Reproduce:** Run any contrast checker on #D4AF37 vs #F9F8F6; view /buddy pending queue on a phone and try to read the 'Pending' badges or /admin 'Review Phase' buttons.
- **Expected:** Status text ≥4.5:1 contrast (e.g. a darkened gold #8a6d1f for text while keeping #D4AF37 for borders/decoration) and functional labels/buttons ≥12px.
- **Current:** #D4AF37 text at 0.55rem on near-white background.
- **Suggested fix:** Add --color-gold-text: #8A6D1F for text usage; bump status labels and the Review Phase button to ≥0.7rem.

#### [MEDIUM] Toasts are not announced to screen readers (no aria-live region)  
`UI/UX & Accessibility`

- **Location:** src/components/Toast.tsx:105-137
- **Description:** The toast container is a plain fixed div and each toast a plain div. There is no role='status'/'alert' or aria-live attribute anywhere. Almost all action feedback in the app (submit success, submission failed, auto-save failed, phase approved, revision requested) is delivered exclusively via these toasts.
- **Root cause:** Missing live-region semantics on the toast container.
- **Impact:** Screen-reader users receive zero confirmation that their worksheet submitted, that autosave failed, or that a phase was approved — for failures this means silent data-risk situations.
- **Reproduce:** With VoiceOver/NVDA running, submit a worksheet: the visual toast appears but nothing is announced.
- **Expected:** Success/info toasts announced politely; error toasts assertively.
- **Current:** Visually rendered only.
- **Suggested fix:** Add role='status' aria-live='polite' to the container, and role='alert' on error-type toast items (error type already known per toast).

#### [MEDIUM] NotificationBell dropdown: items not keyboard-operable, no aria-expanded/Escape, overflows small screens  
`UI/UX & Accessibility`

- **Location:** src/components/NotificationBell.tsx:99-115,140-145,178-183,203-215
- **Description:** Notification list items are <div onClick> with no role, tabIndex, or key handler — a keyboard user can open the dropdown (button) but cannot focus or activate any notification. The bell button lacks aria-expanded/aria-haspopup; the dropdown closes only on outside mousedown, not Escape. The 'refresh' icon button has no aria-label. The panel is a fixed 360px wide anchored right:0, so on viewports narrower than ~380px it clips off the left edge of the screen.
- **Root cause:** Non-semantic clickable divs; fixed panel width without viewport clamp.
- **Impact:** Keyboard and screen-reader users can see there are notifications but cannot open the item they refer to (navigation to the relevant review/worksheet happens only via the click handler). On small phones part of the notification text is unreachable off-screen.
- **Reproduce:** Tab to the bell, press Enter to open, press Tab: focus skips past all notification rows. Set viewport to 360px: panel extends past the left edge.
- **Expected:** Items as buttons (or role='button' tabIndex=0 with Enter/Space handlers, as PhaseWorksheetList already does), aria-expanded on the trigger, Escape-to-close, aria-label on refresh, width: min(360px, calc(100vw - 24px)).
- **Current:** div onClick rows, width: '360px', no keyboard/ARIA wiring beyond the bell's aria-label.
- **Suggested fix:** Mirror the PhaseWorksheetList keyboard pattern on each row; add aria-expanded={open} aria-haspopup='true' to the bell, an Escape keydown listener, aria-label='Refresh notifications', and clamp the panel width.

#### [MEDIUM] Assessment readiness-level radios are keyboard-inaccessible (display:none inputs)  
`UI/UX & Accessibility`

- **Location:** src/pages/Assessment.tsx:169-186
- **Description:** The required 'Readiness Level' selector hides its real <input type='radio'> with style={{display:'none'}} and draws a custom div. display:none removes the radios from the tab order entirely, so the level cannot be selected via keyboard, and the custom indicator has no focus style. This is the only required control on the form that is mouse-only — the form cannot be completed without a pointer.
- **Root cause:** display:none instead of a visually-hidden-but-focusable pattern.
- **Impact:** Faculty leads using keyboard navigation (or assistive tech) cannot submit the final readiness assessment at all; validation blocks submit because selectedLevel stays empty.
- **Reproduce:** On /assessment, Tab through the form: focus jumps from 'Faculty Lead' input straight to the comments textarea, skipping all three level options.
- **Expected:** Radios focusable with arrow-key group behavior and a visible focus ring on the custom indicator.
- **Current:** Radio inputs removed from the accessibility tree and tab order.
- **Suggested fix:** Replace display:'none' with the existing .ws-sr-only clip technique (position:absolute;clip:…) and add a :focus-visible style on the sibling indicator, e.g. `input:focus-visible + div { outline: 1px solid var(--color-charcoal); outline-offset: 2px; }`.

#### [MEDIUM] BuddyDashboard has no loading state and its review-queue rows are keyboard-inaccessible  
`UI/UX & Accessibility`

- **Location:** src/pages/BuddyDashboard.tsx:51,160-250,284-291
- **Description:** While loading=true the full dashboard renders with zeros — header reads 'Review ALL worksheets from 0 assigned instructor(s) — 0 pending review', stats tiles show 0, and the queue shows the 'All Caught Up' empty state, then everything pops in. (Admin/Lead dashboards got SkeletonCard loaders; this page did not.) Additionally each queue row is a <div onClick={navigate…}> with no role/tabIndex/keydown, so buddies cannot open a review with the keyboard.
- **Root cause:** Missing loading branch before the queue render; non-semantic clickable divs.
- **Impact:** A buddy on a slow connection is told 'All Caught Up' while items are actually pending — the exact wrong signal for a review queue; keyboard-only reviewers cannot reach the review page from their primary queue at all.
- **Reproduce:** Throttle to Slow 3G and open /buddy: the empty-state 'All Caught Up' copy renders before the pending list arrives. Tab through the pending tab: no row receives focus.
- **Expected:** Skeleton rows while loading (pattern exists in AdminDashboard.tsx:309-310); rows as role='button' tabIndex=0 with Enter/Space handling like PhaseWorksheetList.tsx:45-48.
- **Current:** Optimistic zero-state render; mouse-only rows.
- **Suggested fix:** Add `{loading ? <SkeletonCard count={5}/> : <WorksheetQueueTab …/>}` and copy the keyboard/a11y props from PhaseWorksheetList onto queue rows.

#### [MEDIUM] BuddyDashboard 'Fill Gate N — Artifacts' buttons dead-end on 'Invalid Gate Pass' for all four FTP artifact gates  
`Input Validation & Error Handling` · ✅ verified (was HIGH)

- **Location:** src/pages/BuddyDashboard.tsx:29-32 and 397, src/pages/BuddyGatePass.tsx:25-29 and 67-80
- **Description:** BuddyDashboard's GATE_INFO entries 4-7 generate 'Fill Gate 1 — Anchor Artifacts' … 'Fill Gate 4 — Independence Artifacts' buttons that navigate to /buddy/gate-pass/:userId/w1_g1..w4_g1. BuddyGatePass's GATE_COMPONENTS map only contains gc1/gc2/gc3, so every artifact-gate id falls into the `!GATE_COMPONENTS[gateId]` branch and renders 'Invalid Gate Pass — No gate component found for "w1_g1"'. The GateArtifact1-4 components exist and accept targetUserId but are only registered in WORKSHEET_COMPONENTS (joinee routes), never in BuddyGatePass.
- **Root cause:** GATE_COMPONENTS was never updated when the four FTP artifact gates were added to GATE_INFO.
- **Impact:** The buddy-side flow for filling FTP weekly artifact gates is completely broken: the dashboard actively advertises an action that lands on an error page. Buddies cannot complete the week-gate sign-off the dashboard tells them is needed.
- **Reproduce:** As a buddy whose joinee has all Week-1 sheets buddy-approved but no w1_g1 row, open Buddy Dashboard → My Instructors → click 'Fill Gate 1 — Anchor Artifacts'. 'Invalid Gate Pass' page renders.
- **Expected:** The GateArtifact form renders in buddy mode.
- **Current:** Hard error page with no path forward except Back.
- **Suggested fix:** Add the artifact gates to the map: `const GATE_COMPONENTS = { gc1: GateControl1, gc2: GateControl2, gc3: GateControl3, w1_g1: GateArtifact1, w2_g1: GateArtifact2, w3_g1: GateArtifact3, w4_g1: GateArtifact4 }` in BuddyGatePass.tsx (and fix the hard-coded 'Back to Week 1' navigation inside the artifact components for buddy context).
- **Verifier note:** Code-verified: BuddyDashboard.tsx:29-32,397 generates 'Fill Gate 1-4 Artifacts' buttons navigating to /buddy/gate-pass/:userId/w1_g1..w4_g1, and BuddyGatePass.tsx:25-29,67 only registers gc1/gc2/gc3, so all four buttons dead-end on the 'Invalid Gate Pass' screen; GateArtifact1-4 accept targetUserId and useGateControl.ts has a dedicated buddy-mode RPC path, so the flow was intended but never wired up. However, the impact is overstated: the same w*_g1 gates are joinee-submittable via week pages (weeklyWorksheets.ts:29,41,53,63 + worksheetConfig.tsx:116-122) and buddy-approvable through the standard review flow (ReviewContent.tsx:652-682), so week-gate sign-off remains completable end-to-end. A prominently advertised dashboard action that always errors is a real bug, but with a working alternate path it is MEDIUM, not HIGH.

#### [MEDIUM] Assignment notifications are silently rejected by RLS — triggerNotification swallows the error  
`Input Validation & Error Handling`

- **Location:** src/components/admin/AssignmentsTab.tsx:80-81 and 95-96, src/hooks/useNotifications.ts:172-186, supabase/migrations/20260710000006_row_level_security.sql:210-212
- **Description:** The hardened 'Users can insert notifications' policy only permits user_id = auth.uid(). AssignmentsTab inserts notifications for the joinee and for the newly assigned manager/buddy — user_id is never the acting admin — so all four inserts are guaranteed RLS failures. triggerNotification catches the error and only console.errors it, and AssignmentsTab still reports 'Manager assigned!' success. The useNotifications doc comment even claims this helper 'remains for … buddy/manager assignment' notifications, which is exactly what the policy now blocks.
- **Root cause:** RLS tightening (contract item 5) removed the reviewer insert allowance without migrating the remaining client-side notification call sites to a server path.
- **Impact:** Joinees, buddies, and managers never receive assignment notifications in production; admins believe they were sent. A whole notification category is dead with zero surfaced errors.
- **Reproduce:** As academic_head, assign a buddy in Admin → Assignments. UI says 'Buddy assigned!'; the notifications insert returns a 42501 in the network tab; neither joinee nor buddy ever sees a bell notification.
- **Expected:** Assignment triggers notifications, or the failure is surfaced.
- **Current:** Guaranteed silent failure, success message shown.
- **Suggested fix:** Move assignment notifications server-side, mirroring the existing pattern: an AFTER UPDATE trigger on user_profiles.assigned_lead_id/assigned_buddy_id (SECURITY DEFINER) that inserts the notifications. Alternatively expose a SECURITY DEFINER RPC. Also make triggerNotification return/propagate its error so callers can at least log a warning toast.

#### [MEDIUM] Autosave failure is invisible in the UI: SaveIndicator is dead code and WorksheetHeader ignores its saveStatus prop; failures surface only as a 3x toast storm  
`Input Validation & Error Handling`

- **Location:** src/config/worksheetComponents.tsx:103 and 153-177, src/components/WorksheetPage.tsx:156, src/hooks/useAutoSave.ts:226
- **Description:** WorksheetPage passes saveStatus into WorksheetHeader, but WorksheetHeader's destructure drops it ({ icon, title, subtitle, badge }) and renders nothing; the purpose-built SaveIndicator component is exported but referenced nowhere in the app. So the persistent saveStatus='error' state (set after all retries fail) is never shown. Meanwhile notifyError sits INSIDE the retry loop, so each failed save cycle fires three identical 'Auto-save failed:' error toasts (~at 0s, 3s, 9s), and each subsequent edit repeats the storm.
- **Root cause:** The indicator component was built but never mounted; the notify call was placed inside the retry loop.
- **Impact:** Users typing offline get no steady 'Save failed' affordance — only bursts of transient toasts they may miss — and can navigate away believing edits are saved (the beforeunload guard fires, but with no context). Conversely, users who do see the toasts get spammed 3x per failure.
- **Reproduce:** Open a worksheet, go offline, type a character, wait ~10s: three 'Auto-save failed' toasts appear, then nothing; no persistent indicator anywhere on the page.
- **Expected:** A persistent 'Save failed' pill near the header plus one toast per failure cycle.
- **Current:** No indicator at all; 3 duplicate toasts per cycle.
- **Suggested fix:** Render <SaveIndicator status={saveStatus} /> inside WorksheetHeader (accept and use the prop) and in the gate-control headers; move notifyError out of the per-attempt loop so it fires once per exhausted save cycle.

#### [MEDIUM] GateArtifact submit is a silent no-op when required artifacts are unchecked  
`Input Validation & Error Handling`

- **Location:** src/pages/gate-controls/GateArtifact1.tsx:93-96 (same pattern in GateArtifact2.tsx, GateArtifact3.tsx, GateArtifact4.tsx)
- **Description:** The submit button's onClick is `() => { if (!allRequiredMet) { return; } handleSubmit(); }` — a silent early return that never sets submitError. The error alert on line 93 only renders when `!allRequiredMet && submitError`, but submitError can only be set by handleSubmit, which was never called. Result: clicking 'Submit Gate' with unchecked required artifacts does absolutely nothing — no message, no state change, button stays enabled.
- **Root cause:** Guard clause returns before the only code path that sets the error message, and the alert's render condition depends on that message.
- **Impact:** Joinees/buddies click Submit repeatedly with zero feedback and conclude the app is broken; the actual requirement (check all required artifacts) is never communicated.
- **Reproduce:** Open /week-1/worksheet/w1_g1, fill your name, leave a required artifact unchecked, click 'Submit Gate'. Nothing happens; no error is displayed.
- **Expected:** Clear inline error listing what must be completed.
- **Current:** Dead click.
- **Suggested fix:** Replace the silent return with visible feedback, e.g. lift a local error state: `if (!allRequiredMet) { setLocalError('All required artifacts must be confirmed before submitting.'); return; }` and render it unconditionally, or move the allRequiredMet check into useGateControl's validation so submitError is set through the normal path.

#### [MEDIUM] AssignmentsTab refresh reads 30s-stale cache — assignments appear not to have applied  
`Input Validation & Error Handling`

- **Location:** src/components/admin/AssignmentsTab.tsx:84 and 99, src/pages/AdminDashboard.tsx:84-115 and 399
- **Description:** After a successful assignment update, AssignmentsTab calls onRefresh() → AdminDashboard.loadData(), which fetches through fetchWithCache('admin-instructors', …) with a 30s TTL. Unlike the Retry/Refresh buttons (which call invalidateCacheByPrefix('admin-') first), onRefresh performs no invalidation, so the reloaded instructor list still shows the pre-assignment assigned_lead_id/assigned_buddy_id for up to 30 seconds. The 'Current Assignments' list and the '(managed)/(buddy)' markers don't update, contradicting the 'Manager assigned!' success message.
- **Root cause:** Mutation path bypasses the cache-invalidation step that the manual refresh button performs.
- **Impact:** Admins see no effect from a successful action, retry it, or report it as broken. Combined with the silent notification failure (separate finding), the whole assignment flow looks dead even when it worked.
- **Reproduce:** Admin → Assignments → assign a buddy → observe 'Buddy assigned!' but the joinee still shows 'No Buddy' in Current Assignments/Overview until 30s pass and a manual refresh occurs.
- **Expected:** UI reflects the new assignment immediately after the success message.
- **Current:** Stale cached data re-served for up to 30 seconds.
- **Suggested fix:** Invalidate before reloading in the success path: pass onRefresh={() => { invalidateCacheByPrefix('admin-'); loadData(); }} from AdminDashboard, or invalidate inside loadData when called with a force flag.

#### [MEDIUM] PhaseAccessGuard has no promise rejection handler (stuck 'Loading…') and flashes the Locked view before checking  
`Input Validation & Error Handling`

- **Location:** src/components/PhaseAccessGuard.tsx:78, 90-105, 115-133
- **Description:** Two defects: (1) the supabase query uses .then(({data,error})=>…) with no rejection callback and no try/catch — if the underlying fetch throws/rejects (network abort, CORS, proxy error from the uninitialized-client guard) the rejection is unhandled and `checking` remains true forever, leaving the user on a bare 'Loading…' with no retry (contrast WeekAccessGuard.tsx:150-156, which handles exactly this). (2) `checking` is initialized to false and only set true inside the effect, so for phase 2/3 the first paint evaluates canAccessPhase(user.id, phaseNum, []) with empty submissions and flashes the full 'Phase Locked' view before the check even starts.
- **Root cause:** Single-callback .then() and checking initialized to the post-check value.
- **Impact:** (1) A thrown network error permanently blocks access to Phase 2/3 pages with no recovery UI. (2) Every legitimate Phase 2/3 navigation flashes a scary 'Phase Locked' screen for a frame or more.
- **Reproduce:** (2) As a joinee with Phase 1 approved, navigate to /phase-2 on a slow connection: 'Phase 2: Contribution Locked' flashes, then content loads. (1) Simulate a rejected fetch on worksheet_submissions: page stays on 'Loading…' indefinitely.
- **Expected:** Loading → verified result, with an error/retry view on failure (as WeekAccessGuard does).
- **Current:** Locked-view flash on entry; permanent spinner on thrown errors.
- **Suggested fix:** Add the same rejection handler WeekAccessGuard has (set loadError, checking=false), and initialize checking to `phaseNum > 1` so the loading state renders first.

#### [MEDIUM] Cached employeeName in localStorage is not user-scoped and never cleared — cross-account prefill on shared machines  
`Input Validation & Error Handling`

- **Location:** src/hooks/useAutoSave.ts:293-313, src/context/AuthContext.tsx:231-236
- **Description:** getOAuthName() caches the resolved display name under the fixed key 'onboarding_employee_name' and returns the cached value before consulting the current auth user. signOut() never removes it (no removeItem exists anywhere in src/). When user B signs in on the same browser after user A, every new worksheet B opens is prefilled with A's full name in the employeeName field — which is also the required field used for submission.
- **Root cause:** Global, unkeyed, never-invalidated localStorage cache read before the auth check.
- **Impact:** On shared lab/onboarding machines (this is a faculty-onboarding portal used on campus), worksheets get silently attributed to the wrong person's name; a joinee who doesn't notice submits worksheets bearing a colleague's name.
- **Reproduce:** Sign in as A, open any worksheet (name cached). Sign out, sign in as B, open a worksheet B has never saved: the Full Name field shows A's name.
- **Expected:** Prefill always reflects the currently authenticated user.
- **Current:** Previous user's name persists across accounts indefinitely.
- **Suggested fix:** Key the cache by user id (e.g. `onboarding_employee_name:${user.id}`) or, simpler, remove the item in signOut() and validate the cache against supabase.auth.getUser().id before returning it.

#### [MEDIUM] Concurrent-edit conflicts are detected but silently discarded (last-write-wins with only a console.warn)  
`Input Validation & Error Handling`

- **Location:** src/hooks/useAutoSave.ts:131-154
- **Description:** Before each save, the hook compares the row's server updated_at with the locally hydrated _savedUpdatedAt; on mismatch it logs '[AutoSave] Conflict detected … Saving anyway (last-write-wins)' and proceeds to overwrite the entire worksheet_data JSONB. The user is never informed. Two tabs (or joinee + buddy on a needs_revision row, where buddy updates pass RLS) will silently destroy each other's edits wholesale, since the payload is the full document, not a merge.
- **Root cause:** Conflict handler deliberately downgraded to log-and-proceed.
- **Impact:** Real data loss scenario for multi-tab users or joinee/buddy overlap: minutes of form work vanish with zero user-facing signal; only a console line no user reads.
- **Reproduce:** Open the same worksheet in two tabs, edit field X in tab 1 (autosaves), then edit field Y in tab 2 and wait 1.5s: tab 2's stale snapshot overwrites tab 1's edit; console shows the conflict warning; no UI feedback in either tab.
- **Expected:** User-visible conflict resolution or at least notification.
- **Current:** Silent full-document overwrite.
- **Suggested fix:** On conflict, at minimum surface it: block the save, set saveStatus='error', and show a toast/banner ('This worksheet was changed elsewhere — reload to get the latest version') with a reload/overwrite choice. The detection plumbing already exists; only the reaction is missing.

## LOW findings (62)

#### [LOW] Dead code sweep: 4 unused barrel files, 4 unused type files, unused ProjectInfo 'knowledge base', unused assets, unused '@' path alias  
`Architecture & Spec Compliance`

- **Location:** src/api/index.ts; src/hooks/index.ts; src/utils/index.ts; src/config/index.ts; src/types/index.ts; src/types/config.ts; src/types/worksheet.ts; src/types/worksheets/{index.ts,p1_w1.ts}; src/context/ProjectInfo.ts; src/assets/{hero.png,react.svg,vite.svg}; vite.config.js:11-14 + tsconfig.json paths
- **Description:** Verified by repo-wide import greps: no file imports from any of the four barrel index.ts files (all consumers import concrete modules directly); src/types/index.ts, types/config.ts, types/worksheet.ts and types/worksheets/* are never imported (only types/supabase.ts is used), and types/config.ts + types/worksheet.ts + types/supabase.ts + worksheetConfigData.ts + App.tsx each re-declare near-identical WorksheetSheet/PhaseData shapes (5 copies of the same interface, with App.tsx:37-46 declaring a local PhaseData and casting ALL_WORKSHEETS values to it instead of importing the exported PhaseGroup). PROJECT_CONTEXT in src/context/ProjectInfo.ts is referenced nowhere. hero.png/react.svg/vite.svg in src/assets are unreferenced. The '@' alias is configured in both vite.config.js and tsconfig.json but zero imports use '@/'.
- **Root cause:** TS migration created barrels/types speculatively; consumers were written against concrete paths and the scaffolding was never pruned.
- **Impact:** Misleading module surface: barrels imply a public API that nothing uses and that drifts from reality (api/index.ts exports only supabase, not unwrap); duplicate type shapes invite divergence (they already differ in optionality); dead files inflate review surface and confuse newcomers about where truth lives.
- **Suggested fix:** Delete the four barrels, types/{index,config,worksheet}.ts, types/worksheets/, ProjectInfo.ts, and unused assets; export PhaseGroup/WorksheetSheet from worksheetConfigData.ts and import it in App.tsx instead of the local PhaseData cast; drop the '@' alias or start using it consistently. Enable knip or eslint import/no-unused-modules in CI to keep it pruned.

#### [LOW] CHANGELOG contains false/overstated claims: no service worker or offline support exists; 'status strings → constants' migration is incomplete  
`Architecture & Spec Compliance`

- **Location:** CHANGELOG.md:25,38; public/manifest.json; index.html; src/hooks/useGateControl.ts:60,165-168,198; src/hooks/useWorksheet.ts:278
- **Description:** CHANGELOG 1.0.0-beta 'Added' lists 'PWA Support: Service worker, manifest, icon set, offline-ready <meta> tags'. There is a manifest and icons, but zero service-worker registration anywhere in src/, index.html, or public/ (grep for serviceWorker/register: no hits), so the app is not installable-with-offline and 'offline-ready' is false. The 'Fixed' entry claims '~60 raw status strings migrated to REVIEW_STATUS.*', yet ~35 raw review-status literals remain outside tests/constants — including load-bearing ones like useGateControl.ts:165-168 ('needs_revision', 'buddy_approved', 'revision_submitted' written into submission payloads) and useWorksheet.ts:278.
- **Root cause:** Changelog written aspirationally/by summary rather than verified against the tree.
- **Impact:** The changelog is the go-live evidence trail; false capability claims (offline PWA) can drive wrong operational decisions (e.g. assuming field usability without connectivity), and the half-done constants migration recreates the exact casing-drift risk the constants file exists to prevent.
- **Reproduce:** Chrome devtools → Application → Service Workers on the deployed app: none registered. grep -rn "'buddy_approved'" src --include='*.ts*' | grep -v test.
- **Suggested fix:** Amend CHANGELOG to 'PWA manifest + icons (no offline support)' or add a real SW (Workbox/vite-plugin-pwa) if offline is required; finish the constants sweep in useGateControl.ts/useWorksheet.ts (the strings written to the DB are the most important ones to source from REVIEW_STATUS).

#### [LOW] Stale documentation: README references root-level migration files that no longer exist; config comments cite .jsx files and a signup-role flow that were removed  
`Architecture & Spec Compliance`

- **Location:** README.md:71-73; src/config/worksheetConfigData.ts:6-7,15-17,42 ('worksheetConfig.jsx', 'App.jsx', 'WorksheetReview.jsx', '4 ROLES (selectable at signup)'); vite.config.js:17-18 (comment says 'Generate sourcemaps for production debugging' above sourcemap: false); vercel.json CSP (allows fonts.googleapis.com/gstatic though fonts are self-hosted in public/fonts per commit 139f2a8)
- **Description:** README still warns about 'numbered supabase_migration_*.sql files at the repo root' — those were moved to db/legacy/ during remediation; no *.sql exists at the root. worksheetConfigData.ts's authoritative-looking flow header references .jsx files (the codebase is fully .tsx) and says roles are selectable at signup, contradicting AuthContext (signUp ignores role; server forces new_joinee). vite.config's comment contradicts its own setting. The CSP retains Google Fonts hosts although fonts were self-hosted, leaving an unnecessary third-party allowance.
- **Root cause:** Remediation moved files and changed flows without a docs pass over README/headers.
- **Impact:** Onboarding docs and in-code architecture commentary send new maintainers hunting for files that don't exist and describe a signup/authorization flow that would be a security bug if reimplemented as documented.
- **Suggested fix:** One doc-sweep commit: fix README §Database bootstrap, rewrite the worksheetConfigData.ts header to the enforced flow (roles server-assigned; buddy→manager pipeline; .tsx names), fix the vite comment, and drop fonts.googleapis.com/fonts.gstatic.com from the CSP.

#### [LOW] Gating/locked-view logic duplicated four ways instead of shared  
`Architecture & Spec Compliance`

- **Location:** src/components/PhaseAccessGuard.tsx:18-47; src/pages/Phase2.tsx:29,38-64,80-120; src/pages/Phase3.tsx (same pattern); src/pages/Dashboard.tsx:103-117; src/components/WeekAccessGuard.tsx:19-24 vs src/config/worksheetConfigData.ts:389-394 (WEEK_LABELS duplicated as local weekLabels)
- **Description:** The 'Phase N Locked' view and the phase-access check exist in three near-identical copies (PhaseAccessGuard, Phase2, Phase3 — each with its own phaseLabels map and its own Supabase query + canAccessPhase call), and Dashboard implements a fourth lock computation (lockedPhase). The /phase-2 page route is protected by its page-internal check while /phase-2/worksheet-N uses PhaseAccessGuard — two different loaders for the same rule. WeekAccessGuard likewise re-declares week labels locally instead of using WEEK_LABELS.
- **Root cause:** Pages predate the guard components; the guard was added for worksheet routes without retrofitting the phase pages.
- **Impact:** This duplication is precisely why the rejection-handler fix landed in one guard but not the other (see the PhaseAccessGuard finding); every future gating change must be replicated in 4 places or behavior silently diverges.
- **Suggested fix:** Wrap /phase-2 and /phase-3 routes in PhaseAccessGuard in App.tsx, delete the in-page checks and PhaseLockedView copies, export a single LockedView component, and have both guards share one useAccessCheck(queryFn, predicate) hook. Import WEEK_LABELS in WeekAccessGuard.

#### [LOW] ReviewContent.tsx remains a 1047-line monolith (prior-audit dedup item not done); shared UI components live in src/config/  
`Architecture & Spec Compliance`

- **Location:** src/components/ReviewContent.tsx (1047 lines: SECTION_LAYOUTS registry at line 382 + 6 renderer families + per-worksheet key lists); src/config/worksheetComponents.tsx (496 lines of Section/Slider/LoadingView/BuddyApprovedView/ReviewFeedback React components)
- **Description:** PRODUCTION_AUDIT_REPORT's scorecard explicitly listed 'Deduplication needed (Week1-4, ReviewContent)'. Week pages were merged (WeekPage.tsx), but ReviewContent.tsx still combines a giant per-worksheet SECTION_LAYOUTS data registry, table/checklist/score-grid/milestone renderers, and value-formatting heuristics in one file — the layout data belongs in config next to the other worksheet registries, the renderers in components. Separately, src/config/worksheetComponents.tsx is 496 lines of shared *view* components (imported by all 7 gate controls and WorksheetPage) living in the config layer, blurring the config-vs-presentation boundary the codebase otherwise maintains (worksheetConfig.tsx's own header advertises that split).
- **Root cause:** Incremental growth; the prior audit's dedup item was deprioritized during the security-focused remediation.
- **Impact:** Maintainability: adding a worksheet's review layout means editing a 1k-line component file; the config folder no longer means 'pure data', so the 'directly testable, no React' guarantee stated in worksheetConfigData.ts's header is only half true.
- **Suggested fix:** Split ReviewContent: move SECTION_LAYOUTS (+ per-worksheet key lists) into src/config/reviewLayouts.ts (pure data, unit-testable like worksheetConfigData), keep renderers in components/review/*. Rename/move worksheetComponents.tsx to src/components/worksheet/ primitives.

#### [LOW] AuthCallback: OAuth errors in the hash fragment are ignored, a fixed 1s timer gates session detection, and the intended destination is always dropped  
`Authentication & Session Handling`

- **Location:** src/pages/AuthCallback.tsx:14-16, 26-36, src/pages/Login.tsx:44-53
- **Description:** The error check reads only window.location.search, but with supabase-js's default implicit flow, provider/Supabase errors arrive in the hash fragment (#error=...&error_description=...) — those users see the generic 'Sign in failed. Redirecting…' instead of the actual reason. Session detection is a single getSession() behind a hardcoded 1000ms setTimeout with no onAuthStateChange subscription — functional (getSession awaits the client's initialize promise) but adds a fixed 1s to every OAuth login and races nothing meaningful. Finally, success always navigates to '/', so the location.state.from restore that password login honors (Login.tsx:17,29) is lost for every Google login.
- **Root cause:** Query-string-only error parsing; timer-based instead of event-based session detection; redirectTo does not carry the origin path.
- **Impact:** Google users who hit a real OAuth error get an unactionable generic message; all Google users lose their deep link and pay a guaranteed 1s delay.
- **Reproduce:** Visit /auth/callback#error=access_denied&error_description=User+cancelled → shows generic failure, not the description. Sign in with Google from a /phase-1 redirect → land on '/'.
- **Expected:** Parse both search and hash for error params; subscribe to onAuthStateChange('SIGNED_IN'); round-trip the pre-auth path (e.g., redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(from)}`).
- **Current:** search-only error parse, setTimeout(1000) + getSession, navigate('/').
- **Suggested fix:** const hashParams = new URLSearchParams(window.location.hash.slice(1)); check both. Replace the timer with an onAuthStateChange subscription plus a 10s expiry fallback, and navigate(params.get('next') ?? '/').

#### [LOW] Auth pages are reachable while authenticated, and the Signup success screen claims a confirmation email was sent even when auto-confirm yields an active session  
`Authentication & Session Handling`

- **Location:** src/pages/Login.tsx:6, src/pages/Signup.tsx:40-55, src/App.tsx:119-123
- **Description:** None of /login, /signup, /forgot-password redirect an already-authenticated user away, so a signed-in user can open /login and sign in as someone else on top of their session (fine) or get confused by the form. More concretely: the prior audit's own smoke test recorded signup as auto-confirmed ('New user login (after signup) — Auto-confirmed'); when email confirmation is disabled, supabase.auth.signUp returns an active session and SIGNED_IN fires — yet Signup.tsx:40-55 unconditionally shows 'Check your email to confirm your account' and a 'Go to Sign In' button, while the user is in fact already signed in.
- **Root cause:** Success copy hardcodes the confirmation-required flow; no session check after signUp resolves.
- **Impact:** New users are told to wait for an email that never comes and are routed to a login form they don't need — a confusing first-run experience on the very first touchpoint of the portal.
- **Reproduce:** With Supabase email auto-confirm enabled (per the prior audit's test evidence), sign up: the success screen demands email confirmation; navigating to '/' shows you are already signed in.
- **Expected:** If signUp returns a session, navigate straight into the app; only show the confirmation message when data.session is null.
- **Current:** Static 'check your email' message regardless of data.session.
- **Suggested fix:** In Signup.handleSubmit inspect the result: const { user } = await signUp(...); const { data: { session } } = await supabase.auth.getSession(); if (session) navigate('/', { replace: true }); else setSuccess(true). Optionally add an if (user) <Navigate to="/"> guard at the top of Login/Signup.

#### [LOW] Real Supabase project URL and publishable key remain recoverable from git history; key rotation unverifiable  
`Authentication & Session Handling`

- **Location:** git history: commit 7e5ca88 (.env), removed in 9979b3d; .env.example
- **Description:** The initial commit added a real .env (VITE_SUPABASE_URL=https://fuoq..., VITE_SUPABASE_PUBLISHABLE_KEY=...). It was deleted in the remediation commit, but `git show 7e5ca88:.env` still yields both values to anyone with repo access. The prior audit (S1) flagged this as critical and demanded rotation; nothing in the repo evidences that rotation happened. Severity here is LOW rather than CRITICAL because the anon/publishable key is public by design (it ships in the JS bundle anyway) — the true security boundary is RLS — but the leak does hand the project URL + key to anyone with historical repo access, enabling the open-signup abuse in the separate finding without even visiting the site.
- **Root cause:** .env committed in the initial commit; deletion does not purge history.
- **Impact:** If the repo is or becomes readable beyond the team, outsiders get direct REST access as anon/authenticated (bounded by RLS), and history rewrite is the only cleanup.
- **Reproduce:** git show 7e5ca88:.env
- **Expected:** History purged (filter-repo/BFG) or key rotated with confirmation recorded.
- **Current:** Credentials in history; rotation status unknown.
- **Suggested fix:** Rotate the publishable key in the Supabase dashboard (and update Vercel env), or if the key was already rotated post-audit, record that in the repo docs; optionally rewrite history if the repo will ever be shared.

#### [LOW] fetchProfile has no in-flight guard: concurrent refreshProfile/SIGNED_IN fetches can resolve out of order and write a stale profile  
`Authentication & Session Handling`

- **Location:** src/context/AuthContext.tsx:36-69, 170-182, 242-244
- **Description:** fetchProfile is invoked from getSession bootstrap, every SIGNED_IN event, and refreshProfile() (called by consumers after mutations). There is no request token/abort logic, so two overlapping fetches (e.g., refreshProfile right after a role change while a SIGNED_IN re-fetch is in flight) can land in reverse order, leaving setProfile with the older row — e.g., reverting a just-promoted role in the UI until the next refresh. Likewise, a fetch resolving after sign-out can resurrect a profile for a null user (SIGNED_OUT sets profile null at :179, but a late fetchProfile resolution will setProfile again).
- **Root cause:** Unsequenced async setState from multiple triggers.
- **Impact:** Occasional stale role/name in the UI after rapid auth events; a signed-out shell can briefly show the previous user's profile-derived nav until reload.
- **Reproduce:** Race refreshProfile() against sign-out: call refreshProfile, immediately signOut; when the profile SELECT resolves it re-populates profile state while user is null.
- **Expected:** Only the most recent fetch for the current user id may write state.
- **Current:** Last-resolved-wins regardless of dispatch order or current user.
- **Suggested fix:** Keep a ref: const fetchSeq = useRef(0); inside fetchProfile capture const seq = ++fetchSeq.current and guard every setProfile/setLoading with if (seq !== fetchSeq.current) return; bump fetchSeq in the SIGNED_OUT branch too.

#### [LOW] reviewer_type is client-controlled and steers server-side notification routing  
`Authorization, Roles & RLS`

- **Location:** src/hooks/useAutoSave.ts:129,186 (reviewer_type from getReviewerType, client-set on every upsert); consumed by supabase/migrations/20260710000004_server_side_notifications.sql:38-52 (notify_reviewer_on_submission branches on NEW.reviewer_type)
- **Description:** The worksheet owner's autosave/submit upsert sets reviewer_type directly, and the SECURITY DEFINER notify_reviewer_on_submission trigger branches on NEW.reviewer_type to decide whether to notify managers, the onboarding_lead pool, or the buddy pool. A joinee can send an arbitrary reviewer_type (constrained only to the CHECK set 'buddy'/'manager'/'onboarding_lead') and thereby redirect their submission notification to, e.g., all onboarding_leads or all academic_heads.
- **Root cause:** reviewer_type is stored as a client-writable column and simultaneously used as a server-side routing key.
- **Impact:** Low: it only affects notification recipients, not who can actually approve (that is enforced by role + assignment in RLS/trigger). Worst case is notification spam/misrouting to the manager or onboarding-lead pool. No data exposure or escalation.
- **Reproduce:** 1. As a joinee, upsert a worksheet_submissions row with reviewer_type='onboarding_lead' and review_status='pending_review'. 2. Observe every onboarding_lead receives a 'ready for review' notification regardless of the worksheet's real track.
- **Expected:** reviewer_type is server-derived and not accepted from the client for routing decisions.
- **Current:** Client sets reviewer_type; trigger trusts it for fan-out.
- **Suggested fix:** Derive reviewer_type server-side from the worksheet_id (a small mapping table or CASE in a BEFORE INSERT/UPDATE trigger) instead of trusting the client value, so notification routing cannot be steered by the submitter.

#### [LOW] upsert_gate_submission writes phase='phase1' for FTP gates that the client stores as 'week-N'  
`API Contract & Data Flow`

- **Location:** supabase/migrations/20260710000007_gate_submission_rpc.sql:57-62 vs src/pages/gate-controls/GateArtifact1.tsx:26 (and GateArtifact2-4)
- **Description:** The RPC derives phase only for gc1/gc2/gc3 and defaults everything else to 'phase1'. GateArtifact pages save the same worksheets client-side with phase='week-1'..'week-4'. Once the BuddyGatePass routing gap is fixed (or the RPC is called directly), the same worksheet family will carry two different phase values depending on which writer touched it last. The phase column is currently only display-informational (WorksheetPage.tsx:51-54), limiting the blast radius.
- **Root cause:** RPC CASE not extended when FTP gate ids were introduced.
- **Impact:** Inconsistent phase metadata across writers; any future phase-based filtering or reporting will misbucket buddy-filed FTP gates.
- **Reproduce:** Call the RPC with p_worksheet_id='w1_g1' → row.phase='phase1'; joinee-save the same gate → 'week-1'.
- **Expected:** Phase derivation covers every id the RPC legitimately accepts
- **Current:** ELSE 'phase1' fallback for all non-gc ids
- **Suggested fix:** Extend the CASE: WHEN 'w1_g1' THEN 'week-1' … WHEN 'w4_g1' THEN 'week-4', and prefer preserving an existing row's phase in the ON CONFLICT branch.

#### [LOW] TS row types drift from schema: UserProfile lacks start_date; stale _savedUpdatedAt makes the conflict check permanently misfire  
`API Contract & Data Flow`

- **Location:** src/types/supabase.ts:11-21, src/hooks/useAutoSave.ts:51-54,131-154,181-189
- **Description:** user_profiles.start_date (added in migration 1, load-bearing for due dates) is absent from the canonical UserProfile interface, forcing ad-hoc shadow types (UserProfileStartDate in useAutoSave, inline shape in useDueDates) — the exact drift the shared type exists to prevent. Separately, save()'s optimistic-conflict check compares data._savedUpdatedAt (hydration-time value, plus client-clock format written on INSERT) against the server's trigger-set updated_at; after the first save of a session the local value is never refreshed, so every subsequent autosave logs a false 'Conflict detected … saving anyway (last-write-wins)' warning, making the log useless for detecting real cross-tab conflicts.
- **Root cause:** Type not updated with the migration; _savedUpdatedAt not refreshed from the upsert response (upsert doesn't .select()).
- **Impact:** Type safety gap invites future column-name mistakes; the conflict-detection signal is noise, so genuine concurrent-edit clobbering (buddy vs joinee editing the same gate) is indistinguishable from normal operation.
- **Reproduce:** Open a previously saved worksheet, type twice with >1.5s gaps; second save logs a conflict warning despite no concurrent writer.
- **Expected:** One schema-accurate row type; conflict baseline refreshed after each successful save
- **Current:** Shadow types for start_date; conflict check compares a stale value
- **Suggested fix:** Add start_date: string | null to UserProfile and select it in AuthContext/fetch sites; have save() .select('updated_at').single() on the upsert and write the returned value back into _savedUpdatedAt (or drop the advisory check).

#### [LOW] worksheet_submissions.user_id (and onboarding_submissions.user_id) are nullable, weakening the UNIQUE(user_id, worksheet_id) dedupe guarantee  
`Database Schema & Integrity`

- **Location:** supabase/migrations/20260710000001_initial_schema.sql:114 (user_id UUID with no NOT NULL), 96, 154-162
- **Description:** Every row in worksheet_submissions is logically user-owned (all app writes and every RLS policy assume it), yet the column allows NULL. Under Postgres semantics the UNIQUE(user_id, worksheet_id) constraint does not apply between NULL user_id rows, so service-role/seed/admin paths (which bypass RLS) can create unlimited orphan duplicates per worksheet_id. notifications.user_id got its SET NOT NULL (line 178); the two submission tables did not.
- **Impact:** Latent data-quality hole: any future server-side script bug produces unattributable rows that dashboards (which filter by user_id) never surface, and the dedupe invariant the upsert relies on is not total.
- **Expected:** NOT NULL on owner columns that every policy and query assumes are present.
- **Current:** user_id UUID NULL on both submission tables.
- **Suggested fix:** After verifying no NULLs exist: ALTER TABLE public.worksheet_submissions ALTER COLUMN user_id SET NOT NULL; same for onboarding_submissions once the legacy anonymous-assessment path is confirmed dead.

#### [LOW] status column has no CHECK constraint and migration 7 still writes the 'wrong' casing ('Submitted') that constants/TS declare legacy  
`Database Schema & Integrity`

- **Location:** supabase/migrations/20260710000007_gate_submission_rpc.sql:69 ('Submitted'); src/constants/status.ts:14 (SUBMITTED='submitted'); src/types/supabase.ts:65 (union lacks 'Submitted'); src/pages/Dashboard.tsx:82-84 (both-casings workaround)
- **Description:** worksheet_submissions.status is free text (no CHECK, unlike every other enum-ish column in the schema). The centralized constant is lowercase 'submitted', the TS SubmissionStatus union is ('Not Started'|'In Progress'|'submitted'|'Reviewed'), and Dashboard carries a comment calling capital 'Submitted' a legacy value 'from gate controls before fix' — yet the live gate RPC hardcodes 'Submitted' on every insert, so the drift is ongoing, not legacy. Any consumer comparing status === SUBMISSION_STATUS.SUBMITTED without the dual-casing workaround misclassifies RPC-created gate rows.
- **Impact:** Continual reintroduction of the exact casing bug the prior remediation centralized constants to kill; new UI code will predictably compare against the constant and miss gate rows.
- **Expected:** One canonical value set enforced by a CHECK and mirrored exactly in constants/status.ts and types/supabase.ts.
- **Current:** Unconstrained text column with two live casings and a TS union matching neither fully.
- **Suggested fix:** Change migration 7 (and db/schema.sql) to write 'submitted'; add CHECK (status IN ('Not Started','In Progress','submitted')) after a one-time UPDATE normalizing existing rows; drop 'Reviewed' from the TS union or add it to the CHECK deliberately.

#### [LOW] TypeScript row types drift from the schema: missing due_date, start_date, and three notification types  
`Database Schema & Integrity`

- **Location:** src/types/supabase.ts:11-21 (UserProfile lacks start_date), 110-126 (WorksheetSubmission lacks due_date), 146-152 (NotificationType lacks 'buddy_approved','phase_approved','promoted'); supabase/migrations/20260710000001_initial_schema.sql:90,153,261-267
- **Description:** The DB has user_profiles.start_date and worksheet_submissions.due_date; both are absent from the canonical row interfaces, which is why useAutoSave.ts:51-54 and useDueDates.ts:154-161 declare private ad-hoc shapes and cast. The notifications CHECK allows nine types; the TS union has six — 'promoted' is actively written by promote_user_if_eligible (migration 5:73-82), so real rows arrive typed outside the union (NotificationBell survives only via a Record<string,...> fallback at line 199).
- **Impact:** Casts scattered across hooks defeat the strict-mode guarantees the project pays for (noUncheckedIndexedAccess), and future switch-on-type code over NotificationType will silently drop 'promoted' notifications.
- **Expected:** Row types matching the migrations exactly, ideally generated.
- **Current:** Hand-maintained interfaces missing two live columns and three live enum values.
- **Suggested fix:** Add start_date: string | null to UserProfile, due_date: string | null to WorksheetSubmission, and 'buddy_approved' | 'phase_approved' | 'promoted' to NotificationType (or generate types via supabase gen types typescript and delete the hand-written ones). Also note Notification.worksheet_id is typed WorksheetId but the DB default/trigger writes '' — widen to WorksheetId | ''.

#### [LOW] Missing indexes on FK columns worksheet_submissions.reviewed_by and notifications.from_user_id  
`Database Schema & Integrity`

- **Location:** supabase/migrations/20260710000001_initial_schema.sql:213-216, 223-226 (FKs), 274-288 (index list omits both)
- **Description:** Both columns carry ON DELETE SET NULL FKs to auth.users but have no index, so deleting an auth user (offboarding a buddy/manager) sequential-scans both tables inside the auth deletion transaction. All other FK columns (user_id, assigned_lead_id, assigned_buddy_id) are indexed.
- **Impact:** At current scale negligible; with a year of notifications rows, user deletion via the Supabase dashboard gets measurably slow and locks the tables longer than needed.
- **Expected:** Every FK column referenced by ON DELETE actions indexed.
- **Current:** Unindexed SET NULL FK columns.
- **Suggested fix:** CREATE INDEX IF NOT EXISTS idx_worksheets_reviewed_by ON public.worksheet_submissions (reviewed_by); CREATE INDEX IF NOT EXISTS idx_notifications_from_user ON public.notifications (from_user_id);

#### [LOW] promote_user_if_eligible has no concurrency guard and a manually-synced worksheet list  
`Database Schema & Integrity`

- **Location:** supabase/migrations/20260710000005_promotion_rpc_and_due_dates.sql:44-88 (no lock), 14-28 (manual mirror of PHASE_WORKSHEETS_MAP)
- **Description:** Two concurrent invocations (e.g. useAutoPromote firing from two tabs after the final approval) both read role='new_joinee' before either commits, both promote (idempotent) and both insert the full 'promoted' notification set — duplicate self-notification plus duplicate broadcasts to every academic_head. Separately, promotion_required_worksheets is a hand-maintained mirror of PHASE_WORKSHEETS_MAP (currently verified in sync — 23 ids each, matching src/config/worksheetConfigData.ts:566-575) with only a code comment guarding against drift; adding a worksheet to the TS map without the SQL insert silently loosens the promotion requirement.
- **Impact:** Duplicate congratulation/broadcast notifications on a race; longer-term, silent promotion-criteria drift on the next curriculum change.
- **Expected:** Row-locked promotion check; single source of truth for required worksheet ids.
- **Current:** Unlocked read-check-update; two sources of truth reconciled by comment only.
- **Suggested fix:** Add SELECT role INTO existing_role FROM public.user_profiles WHERE id = caller FOR UPDATE; to serialize. For drift: add a vitest that asserts PHASE_WORKSHEETS_MAP flat ids equal the seeded list (checked into a shared JSON both sides consume), or generate the SQL INSERT from the TS config in CI.

#### [LOW] Owner state machine allows fabricating 'revision_submitted' from scratch, and check_due_date_notifications nags users whose work is already submitted  
`Database Schema & Integrity`

- **Location:** supabase/migrations/20260710000003_review_state_machine.sql:67-70; supabase/migrations/20260710000005_promotion_rpc_and_due_dates.sql:117-137
- **Description:** The owner branch validates only the target set {'', 'pending_review', 'revision_submitted'} without consulting OLD, so an owner can transition '' → 'revision_submitted' directly (never having been asked for a revision), which fires notify_reviewer_on_submission with a misleading 'revision submitted' notification to the buddy. Separately, the due-date function excludes only ('approved','buddy_approved'), so a worksheet sitting in 'pending_review' (submitted, waiting on the reviewer) past its due date sends the joinee 'is overdue! ... Please submit it as soon as possible' — blaming the wrong party (mitigated: the cron is not scheduled by default).
- **Impact:** Minor state-machine looseness producing misleading notifications; low because neither path changes approval outcomes.
- **Expected:** OLD-aware owner transitions; overdue nags only for states where the joinee actually owes action.
- **Current:** Target-set-only validation for owners; overdue check keyed solely on not-yet-approved.
- **Suggested fix:** Owner branch: allow 'revision_submitted' only when OLD.review_status IN ('needs_revision','revision_submitted'). Due-date function: also exclude 'pending_review'/'revision_submitted' (or send the reviewer a 'review overdue' variant instead).

#### [LOW] "automerge" label applied to all Dependabot PRs with no workflow or gate defining it  
`Dependencies & Supply Chain`

- **Location:** .github/dependabot.yml:16, .github/workflows/ci.yml (only workflow)
- **Description:** Every npm Dependabot PR is labeled `automerge`, but the repo's only workflow (ci.yml) never references the label, and there is no auto-merge action or Mergify config in the repo. Either the label is dead configuration, or an org/repo-level automation outside the repo acts on it — in which case major bumps of bleeding-edge deps (Vite 8→9, ESLint 10→11, Tailwind 4→5) would merge automatically gated only by tsc/lint/test/build.
- **Impact:** If external automation honors the label, breaking-major dependency PRs can land on main without human review on a stack where five core tools are on brand-new majors. If nothing honors it, the label is misleading process debt that invites someone to wire up blanket automerge later.
- **Suggested fix:** Either remove the `automerge` label, or add an explicit gated workflow (e.g., dependabot/fetch-metadata + `gh pr merge --auto` restricted to `update-type == version-update:semver-patch` / `semver-minor`) so majors always require review.

#### [LOW] esbuild devDep exists only to back a non-default Vite 8 minifier; caret range can escape Vite's peer window  
`Dependencies & Supply Chain`

- **Location:** package.json:37 (esbuild), vite.config.js:20 (minify: 'esbuild')
- **Description:** Vite 8 is rolldown-based and no longer depends on esbuild (its deps are rolldown 1.0.3, lightningcss, postcss; verified in package-lock.json) — the default minifier is OXC. The direct devDep `esbuild: ^0.28.1` exists solely to satisfy Vite's *optional* peer (`^0.27.0 || ^0.28.0`) for `build.minify: 'esbuild'`. esbuild is one of only two packages in the entire tree with an install script (the other is fsevents), so it is disproportionate supply-chain surface for a non-default code path. Also, esbuild is 0.x (minors are breaking): a future 0.29 release will fall outside Vite's peer range while `^0.28.1` keeps the door open to confusion during manual bumps.
- **Impact:** Unnecessary install-script package in every CI/Vercel install; a future esbuild 0.29 Dependabot PR would create a peer conflict with vite; the 'fast minification' comment in vite.config.js is stale since OXC is the fast default in Vite 8.
- **Suggested fix:** Set `minify: true` (OXC default) in vite.config.js and remove the esbuild devDependency, or if esbuild output is deliberately preferred, document why and pin `"esbuild": "~0.28.1"` to stay inside Vite's peer window.

#### [LOW] @testing-library/dom is a required peer but undeclared — present only via npm auto-peer-install  
`Dependencies & Supply Chain`

- **Location:** package.json:26-48 (devDependencies), package-lock.json (node_modules/@testing-library/dom@10.4.1)
- **Description:** @testing-library/react@16.3.2 declares a non-optional peer `@testing-library/dom: ^10.0.0`. It is installed (10.4.1 in the lockfile) only because npm >=7 auto-installs peers; package.json never declares it. Testing Library's own docs instruct consumers to declare it explicitly since v16.
- **Impact:** Any move to a package manager or setting with strict/non-auto peer installation (pnpm, yarn, legacy-peer-deps toggles) silently drops the package and breaks the entire test suite; version control of a directly-relied-upon API is delegated to resolution side effects.
- **Suggested fix:** Add `"@testing-library/dom": "^10.4.1"` to devDependencies.

#### [LOW] sharp is a permanent heavyweight devDependency for a one-off, already-materialized icon script  
`Dependencies & Supply Chain`

- **Location:** package.json:43, scripts/generate-icons.mjs:9
- **Description:** sharp ^0.35.3 is used only by scripts/generate-icons.mjs (icons are already generated and committed, and the script is not wired into any npm script or CI job). It pulls platform-native binaries on every `npm ci`, and on this machine has already caused node_modules/lockfile drift: `npm ls` reports extraneous wasm-fallback packages (@img/sharp-wasm32, @emnapi/core, @emnapi/runtime, @napi-rs/wasm-runtime, @tybys/wasm-util).
- **Impact:** Slower, heavier installs in CI/Vercel and a larger native-binary supply-chain surface for functionality exercised approximately never; local extraneous-package noise makes `npm ls`-based drift checks cry wolf.
- **Suggested fix:** Remove sharp from devDependencies and run the icon script on demand (`npm exec --package=sharp -- node scripts/generate-icons.mjs`), or move icon generation to a separately-installed tools folder.

#### [LOW] Routine version drift: 13 packages behind, all minor/patch except TypeScript  
`Dependencies & Supply Chain`

- **Location:** package.json:19-49
- **Description:** npm outdated (actual output): @supabase/supabase-js 2.108.2→2.110.2, @tailwindcss/vite and tailwindcss 4.3.1→4.3.2, @typescript-eslint/* 8.61.1→8.63.0, @vitejs/plugin-react 6.0.2→6.0.3, eslint 10.5.0→10.7.0, globals 17.6.0→17.7.0, lucide-react 1.21.0→1.24.0, react-router-dom 7.18.0→7.18.1, typescript 6.0.3→7.0.2 (major, blocked by typescript-eslint peer), vite 8.0.16→8.1.4, vitest 4.1.9→4.1.10. All are within declared caret ranges except typescript.
- **Impact:** No known vulnerabilities are involved (audit is clean), but the auth/data-layer package (@supabase/supabase-js) trailing by two minors means bugfixes to token refresh/realtime behavior are not being picked up; drift will compound if the misconfigured Dependabot rules (see other finding) aren't fixed.
- **Suggested fix:** Run `npm update` (all wanted versions are in-range), commit the refreshed lockfile, and let corrected Dependabot config keep pace weekly.

#### [LOW] Dependabot config permanently blocks all React updates and applies an 'automerge' label with no automerge mechanism in-repo  
`Deployment, Ops & Observability`

- **Location:** .github/dependabot.yml (ignore block: react/react-dom versions ">=19.0.0"; labels: "automerge")
- **Description:** package.json already depends on react ^19.2.6, but dependabot.yml ignores react and react-dom for all versions >=19.0.0 — i.e. every possible future update, including 19.x security patches, will never be proposed. Separately, every dependency PR gets an 'automerge' label, but .github/workflows contains only ci.yml; there is no automerge workflow in the repo, so the label is either inert or, if an org-level bot honors it, silently auto-merges dependency bumps gated only by CI.
- **Root cause:** The ignore rule was probably meant to pin a pre-19 project or block a future major, but as written (>=19.0.0 while on 19.2.6) it blocks everything.
- **Impact:** A React security release (they happen — e.g. the 2025 react-dom XSS advisories) would never surface via Dependabot; maintainers would have to notice it manually. The automerge label is at best dead config, at worst an undocumented auto-merge path.
- **Expected:** Patch/minor React updates flow; label matches an actual mechanism
- **Current:** All react/react-dom updates ignored forever; automerge label with no consumer
- **Suggested fix:** Change the ignore to update-types: ["version-update:semver-major"] for react/react-dom (allows minor/patch, blocks 20.x), and either add an actual automerge workflow (e.g. dependabot-auto-merge action gated on CI) or drop the label.

#### [LOW] CSP still whitelists Google Fonts domains although fonts are fully self-hosted  
`Deployment, Ops & Observability`

- **Location:** vercel.json:15 (style-src ... https://fonts.googleapis.com; font-src ... https://fonts.gstatic.com), index.html:11, src/styles/index.css
- **Description:** Commit 139f2a8 self-hosted all fonts (index.html:11 comment confirms; zero references to fonts.googleapis.com/fonts.gstatic.com remain in src/ or index.html), but the CSP in vercel.json still allows stylesheets from fonts.googleapis.com and fonts from fonts.gstatic.com. Stale allowances widen the injection surface for no benefit (an attacker who achieves style injection could pull arbitrary Google-hosted stylesheets).
- **Impact:** Marginally weaker CSP than intended; also misleading for the next person auditing the header.
- **Expected:** CSP allows only what the app actually loads
- **Current:** font-src/style-src allow Google Fonts hosts
- **Suggested fix:** Tighten to style-src 'self' 'unsafe-inline'; font-src 'self' in vercel.json:15.

#### [LOW] Legacy migration-runner scripts with dangerous SQL splitting and hardcoded prod ref left in scripts/ instead of quarantined  
`Deployment, Ops & Observability`

- **Location:** scripts/run_migration.cjs:16,34-42,54-57,83-85,102-104; scripts/run_rls_migration.cjs:17,134-139
- **Description:** Both runners now crash with ENOENT because their target SQL files moved to db/legacy/ — db/README.md:88-91 documents this as an intended fail-safe, so they cannot silently misfire today. But they remain in the active scripts/ directory (not scripts/legacy or deleted), hardcode the production project ref, and run_migration.cjs's statement splitter (split on /;\s*\n/, run_migration.cjs:54-57) corrupts dollar-quoted PL/pgSQL function bodies, swallows 'already exists' errors as successes (lines 83-85), and continues past failures (lines 102-104) — so anyone who 'fixes' the file path to reuse the runner would apply partially-executed, corrupted DDL against production via the Management API.
- **Impact:** Latent footgun: one path edit away from executing broken DDL against the live database with fail-open error handling.
- **Expected:** Superseded deploy tooling removed or hard-disabled
- **Current:** Fail-safe-by-ENOENT, but resurrection-prone with unsafe execution semantics
- **Suggested fix:** Delete both scripts (supabase CLI supersedes them) or move them under a scripts/legacy/ directory with a top-of-file abort (process.exit(1) with an explanatory message) rather than relying on a missing-file crash.

#### [LOW] serve-app.mjs: crash on malformed percent-encoding and missing .ttf MIME (local preview tool)  
`Deployment, Ops & Observability`

- **Location:** serve-app.mjs:19 (decodeURIComponent), serve-app.mjs:9-13 (MIME table)
- **Description:** The local static preview server calls decodeURIComponent(req.url...) at line 19 with no try/catch; a request like GET /%zz throws URIError inside the request handler, which is an uncaught exception that kills the whole Node process. The MIME map also lacks '.ttf', so the app's actual font files under /fonts/*.ttf are served as text/plain locally (works in browsers but diverges from prod). Not referenced by any npm script and never deployed (Vercel serves dist/), so impact is confined to local prod-build previews.
- **Impact:** Local-only: preview server dies on a single malformed request; local font serving diverges from production headers/types, weakening 'preview parity'.
- **Expected:** Robust decode, correct MIME, documented purpose
- **Current:** Uncaught URIError path; text/plain fonts
- **Suggested fix:** Wrap the URL decode in try/catch (fall back to index.html), add '.ttf': 'font/ttf' to MIME, and add a one-line header comment stating its purpose (or delete it in favor of `npm run preview`, which already exists).

#### [LOW] CI runs the TypeScript typecheck twice and has no concurrency cancellation  
`Deployment, Ops & Observability`

- **Location:** .github/workflows/ci.yml (steps 'TypeScript typecheck' and 'Build'), package.json:11
- **Description:** ci.yml runs `npx tsc --noEmit` as a dedicated step and then `npm run build`, whose script is `tsc --noEmit && vite build` — the full typecheck executes twice per run. The workflow also lacks a concurrency group, so rapid pushes to the same PR stack redundant runs. Additionally, pushes to main trigger both the push run and (if via PR) an already-completed PR run — normal, but with no cancel-in-progress it wastes minutes.
- **Impact:** Slower feedback and wasted Actions minutes only; gates themselves are correct and comprehensive (typecheck, lint, 281 tests, build).
- **Expected:** Single typecheck per run, superseded runs cancelled
- **Current:** Duplicate typecheck, unbounded concurrent runs
- **Suggested fix:** Drop the standalone tsc step (build covers it) or split build into a no-typecheck variant for CI; add `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`.

#### [LOW] CHANGELOG describes the review state machine with states and ordering that don't exist  
`Documentation & Onboarding`

- **Location:** CHANGELOG.md:20 (vs src/constants/status.ts:21-34)
- **Description:** The Auto-Promotion Engine entry claims transitions 'pending → submitted → approved → reviewing → buddy_approved'. The actual REVIEW_STATUS constants are pending_review, buddy_approved, approved, needs_revision, revision_submitted (src/constants/status.ts:21-34), and the real flow is submitted → pending_review → buddy_approved → approved (with needs_revision/revision_submitted loops). 'pending' and 'reviewing' are not states, and the listed order places approved before buddy_approved.
- **Impact:** The CHANGELOG is the only prose description of the state machine outside SQL comments; a developer or DB admin using it as reference will look for nonexistent states and misunderstand the approval order when debugging the validate_review_transition trigger.
- **Expected:** 'submitted → pending_review → buddy_approved → approved, with needs_revision → revision_submitted revision loop'
- **Current:** 'pending → submitted → approved → reviewing → buddy_approved'
- **Suggested fix:** Correct the state names/order in CHANGELOG.md:20 to match src/constants/status.ts and the validate_review_transition trigger in supabase/migrations/20260710000003_review_state_machine.sql.

#### [LOW] Version drift: package.json is 0.0.0 while CHANGELOG declares 1.0.0-beta and SemVer adherence; last two commits missing from CHANGELOG  
`Documentation & Onboarding`

- **Location:** package.json:5, CHANGELOG.md:6,10
- **Description:** CHANGELOG.md states 'this project adheres to Semantic Versioning' and records releases 0.8.0, 0.9.0, and 1.0.0-beta, but package.json version has never moved off '0.0.0'. Additionally, commits 139f2a8 (self-hosted fonts, WeekPage refactor) and 9b27db8 (React.lazy code-split of 40+ worksheet components — a user-visible bundle/perf change) are absent from CHANGELOG's 1.0.0-beta entry even though 139f2a8 is the commit that created the CHANGELOG.
- **Impact:** No way to correlate a deployed build with a changelog entry; the SemVer claim is false in practice, and the two most recent (perf-significant) changes are unrecorded for the release being shipped.
- **Expected:** package.json version matches the released tag; CHANGELOG covers all commits in the release.
- **Current:** package.json '0.0.0'; CHANGELOG top entry 1.0.0-beta missing fonts/WeekPage/code-split items.
- **Suggested fix:** Set package.json version to 1.0.0-beta (or an Unreleased section per Keep a Changelog), and append the code-split, WeekPage consolidation, and self-hosted-fonts changes to the 1.0.0-beta (or Unreleased) entry.

#### [LOW] Developer-onboarding gaps: undocumented cr-* npm scripts requiring an external binary, undocumented serve-app.mjs, no CONTRIBUTING.md  
`Documentation & Onboarding`

- **Location:** package.json:15-17, serve-app.mjs, README.md:75-83
- **Description:** Three onboarding rough edges: (1) package.json defines cr-review/cr-doctor/cr-install-hook scripts that shell out to a `cr` (CodeRabbit) binary expected at ~/.local/bin — not installed by npm, not mentioned in README, so `npm run cr-install-hook` installs a pre-commit hook (scripts/pre-commit.sh) whose tooling a fresh clone won't have. (2) serve-app.mjs (a root-level static dist/ server) is referenced nowhere in README or docs — its purpose vs `npm run preview` is undocumented (the archived audit also flagged a path-traversal bug in it; if it's dead tooling it should say so or be removed). (3) ALL_ISSUES.md L6 called for 'CHANGELOG.md + CONTRIBUTING.md'; only CHANGELOG was added — there is no CONTRIBUTING.md documenting branch/PR/commit conventions despite CI gating on lint/tests.
- **Impact:** New contributors hit unexplained script failures, don't know whether serve-app.mjs is supported tooling, and have no documented contribution workflow — friction and inconsistent practice on a multi-person handoff.
- **Expected:** README (or CONTRIBUTING.md) explains optional CodeRabbit tooling and the pre-commit hook, states serve-app.mjs's status, and documents the PR workflow.
- **Current:** cr-* scripts and serve-app.mjs undocumented; CONTRIBUTING.md absent.
- **Suggested fix:** Add a short 'Contributing / local tooling' section (or CONTRIBUTING.md): CodeRabbit CLI is optional, how to install it, what pre-commit.sh runs; either document serve-app.mjs ('local dist smoke-server, not for production') or delete it in favor of `npm run preview`.

#### [LOW] No consolidated RPC/API reference; gate-submission RPC documented only inside SQL comments  
`Documentation & Onboarding`

- **Location:** db/README.md:105-113, supabase/migrations/20260710000007_gate_submission_rpc.sql, src/api/
- **Description:** The app's server API surface is two RPCs (promote_user_if_eligible, upsert_gate_submission) plus trigger-driven behavior (validate_review_transition state machine, server-side notifications, handle_new_user). db/README documents promote_user_if_eligible's cross-stream coupling with PHASE_WORKSHEETS_MAP (lines 105-113) but there is no single place listing the RPCs' signatures, auth requirements (who may call), error shapes, and which frontend hooks call them — upsert_gate_submission(uuid, text, jsonb, text) is described only in migration/schema SQL comments. Frontend developers must read SQL to learn the contract.
- **Impact:** During handoff, changes to RPC parameters or the state-machine edges can silently break frontend callers because the contract lives only in SQL comments; the documented drift risk (promotion_required_worksheets vs TS config) already shows this class of problem.
- **Expected:** A short docs/api.md (or db/README section) tabulating each RPC: signature, caller role, behavior, error cases, and the frontend call sites.
- **Current:** RPC contracts discoverable only by reading migration SQL.
- **Suggested fix:** Add an 'RPC reference' section to db/README.md covering both RPCs with signatures, allowed callers, and pointers to the frontend call sites, plus a one-paragraph description of the trigger-enforced review-state transitions.

#### [LOW] Buddy review queue silently truncated at 200 rows  
`User Journeys End-to-End`

- **Location:** src/pages/BuddyDashboard.tsx:77-85
- **Description:** The buddy's worksheet query uses .order('updated_at', desc).limit(200) across all assigned instructors. The full program is ~36 worksheet rows per joinee; a buddy/manager (academic_head also uses this page) with 6+ active joinees exceeds 200 rows, and the oldest — precisely the longest-waiting pending reviews — drop out of the queue and all counts with no indicator.
- **Root cause:** Flat limit without pagination or per-status querying.
- **Impact:** Stalest pending reviews disappear from the queue; gate-readiness computation (isPhaseReadyForGate) also sees an incomplete picture.
- **Reproduce:** Seed 7 joinees x 30 submissions assigned to one buddy; the oldest ~10 rows are absent from every tab.
- **Expected:** Queue reflects all actionable submissions.
- **Current:** Hard cap 200, newest-first.
- **Suggested fix:** Filter server-side by review_status IN (pending_review, revision_submitted, buddy_approved) for queue tabs, or paginate; at minimum warn when result length === limit.

#### [LOW] WeekPage renders 'Not Started' for every worksheet while statuses are still loading  
`User Journeys End-to-End`

- **Location:** src/pages/WeekPage.tsx:26-49,116
- **Description:** WeekPage has no loading state: statuses starts {} and PhaseWorksheetList renders immediately, so every row briefly shows 'Not Started' (and bogus overdue badges per the due-date finding) until the fetch resolves; on a slow connection a submitted-everything user sees a fully 'Not Started' week for seconds. Phase1/Dashboard both implement skeletons; this page skips it.
- **Root cause:** No loading flag around the statuses fetch.
- **Impact:** Momentary false status display after refresh mid-flow; users may click into worksheets thinking work was lost.
- **Reproduce:** Throttle network, open /week-2 as a user with submissions: all rows read Not Started before snapping to real statuses.
- **Expected:** Skeleton until statuses arrive.
- **Current:** Immediate render with empty status map.
- **Suggested fix:** Add a loading state mirroring Phase1.tsx's skeleton (or reuse it) and render it until the first fetch settles.

#### [LOW] Empty database: no in-app path to bootstrap the first manager/onboarding lead  
`User Journeys End-to-End`

- **Location:** supabase/migrations/20260710000002_role_resolution_and_signup.sql:59-70, supabase/migrations/20260710000006_row_level_security.sql:65-91, src/components/admin/AssignmentsTab.tsx (no role controls)
- **Description:** handle_new_user forces every signup to role new_joinee; role changes are possible only via promote_user_if_eligible() (broken, and only to lead_instructor) or a self-update by an existing academic_head. With an empty database there is no academic_head, so no one can assign buddies/managers, review anything, or create another admin — every joinee's submission notifies zero reviewers (both fallback array_aggs are empty). Bootstrap requires manual SQL against user_profiles, which is undocumented in the app.
- **Root cause:** Role lockdown removed all client paths to set roles without providing a seeded admin or documented bootstrap.
- **Impact:** A fresh production deployment is inert until someone edits the database by hand; if that step is missed, joinees submit into a void with no reviewer ever notified.
- **Reproduce:** Fresh Supabase project + migrations; sign up any user; observe role new_joinee and no route to elevate anyone.
- **Expected:** Deterministic, documented first-admin bootstrap.
- **Current:** Manual SQL required, undocumented in-app.
- **Suggested fix:** Add a documented seed script (scripts/) or migration that promotes a configured email to academic_head, and mention it in the deploy runbook.

#### [LOW] Joinee Dashboard query capped at limit(50) with no ordering while the worksheet catalog defines 40 IDs  
`Performance & Scalability`

- **Location:** src/pages/Dashboard.tsx:55-60
- **Description:** The joinee dashboard fetches the user's submissions with .limit(50) and no .order(). There are currently 40 distinct worksheet IDs (PHASE_WORKSHEETS_MAP + FTP weeks), so a fully-complete joinee sits at 40/50 — only 10 IDs of headroom. If the curriculum grows past 50 worksheets, rows are dropped in Postgres-arbitrary order and progress/phase-lock computations (isPhaseApproved at lines 104-105) silently regress, re-locking phases the joinee already passed.
- **Impact:** Latent time bomb: adding a dozen worksheets to the curriculum would break phase unlocking for completed users with no error anywhere.
- **Expected:** Query scoped to the known worksheet-ID set (bounded by catalog, immune to growth)
- **Current:** .eq('user_id', uid).limit(50) — unordered
- **Suggested fix:** Scope the query instead of capping it: .in('worksheet_id', [...allPhaseWorksheetIds]) (the component already computes this set at line 100), or derive the limit from the catalog size (allPhaseWorksheetIds.size + margin) with an .order() so any truncation is at least deterministic.

#### [LOW] queryCache never evicts expired entries and accumulates multi-kilobyte keys for the session lifetime  
`Performance & Scalability`

- **Location:** src/utils/queryCache.ts:26, 59-66; key construction at AdminDashboard.tsx:107, BuddyDashboard.tsx:77, OnboardingLeadDashboard.tsx:69
- **Description:** Expired CacheEntry values remain in the module-level Map until the same key is re-fetched or explicitly invalidated — there is no sweep. Keys embed the full sorted joined ID list (~20 KB per key at 500 joinees), and every change to the instructor set (new signup between refreshes) mints a brand-new key while orphaning the old one, along with its cached row array (potentially 2000 rows).
- **Impact:** Slow unbounded memory growth in long-lived admin tabs (an onboarding lead keeping the dashboard open all day accumulates orphaned 2000-row arrays). Not a crash risk at current sizes, but it is a textbook leak pattern.
- **Expected:** TTL-swept, size-bounded cache with constant-size keys
- **Current:** Map entries live forever unless overwritten; keys are O(n_ids) strings
- **Suggested fix:** In fetchWithCache, delete entries whose expiresAt has passed when encountered, and add a periodic or size-capped sweep (e.g. if store.size > 50, evict expired/oldest). Replace joined-ID keys with a short hash (e.g. djb2 of the joined string).

#### [LOW] Week/worksheet navigation performs 3-4 sequential fetches of the joinee's own submissions with no shared cache  
`Performance & Scalability`

- **Location:** src/components/WeekAccessGuard.tsx:114-118, src/pages/WeekPage.tsx:37, src/hooks/useWorksheet.ts:150 + src/hooks/useAutoSave.ts:104-108, src/components/PhaseAccessGuard.tsx:90-93
- **Description:** Navigating /week-2 runs WeekAccessGuard (fetch prior-week rows) then WeekPage (fetch ALL user submissions); opening a worksheet inside it runs WeekAccessGuard again (route-level), loadWorksheetData (row fetch), and useAutoSave's user_profiles start_date fetch. Each is an independent round-trip on the render critical path; the joinee's own submission list is re-fetched from scratch on every route change with no cache (queryCache is used only by reviewer dashboards).
- **Impact:** Perceived navigation latency of 2-4 chained RTTs per page for the app's highest-frequency user path; multiplies request volume ~3× versus a cached approach. Functionally correct, purely wasteful.
- **Expected:** Session-scoped cache for own-submissions and profile start_date
- **Current:** Fresh Supabase round-trips per guard + per page + per worksheet mount
- **Suggested fix:** Cache the joinee's own submissions (queryCache with a short TTL keyed by user id, invalidated by useAutoSave on successful save), and have WeekAccessGuard/WeekPage/Dashboard read through it; fetch profile start_date once per session (it never changes) instead of per worksheet mount.

#### [LOW] WorksheetReview leaves 2 s navigate(-1) timers running after unmount  
`Performance & Scalability`

- **Location:** src/pages/WorksheetReview.tsx:187, 238, 291
- **Description:** After approve/revision actions, setTimeout(() => navigate(-1), 2000) is scheduled with no cleanup and no ref. If the reviewer clicks Back or a notification link within those 2 s, the stale timer still fires navigate(-1) on the new page, yanking the user away from wherever they went. Contrast with PhaseReview, which correctly tracks reloadTimerRef and clears it on unmount (PhaseReview.tsx:56-60).
- **Impact:** Occasional phantom back-navigation for fast-moving reviewers processing a queue — confusing, looks like a browser glitch; also a (tiny) timer leak per action.
- **Expected:** Ref-tracked timer cleared on unmount
- **Current:** Unmanaged setTimeout capturing navigate
- **Suggested fix:** Store the timeout in a ref and clear it in a useEffect cleanup, mirroring the PhaseReview pattern: navTimerRef.current = setTimeout(...); useEffect(() => () => clearTimeout(navTimerRef.current), []).

#### [LOW] WorksheetReview's post-action setTimeout(() => navigate(-1), 2000) is never cleared — reviewers get yanked to history -1 even after navigating elsewhere  
`React Correctness & State Management`

- **Location:** src/pages/WorksheetReview.tsx:187, 238, 291
- **Description:** All three action handlers schedule navigate(-1) 2s later without storing/clearing the timer. If the reviewer clicks a bell notification or a link within those 2 seconds, the stale timer still fires and navigates back one history entry from wherever they now are. (PhaseReview correctly ref-tracks and clears its reload timer, PhaseReview.tsx:56-60.)
- **Root cause:** Un-owned timeout with a navigation side effect.
- **Impact:** Disorienting phantom navigation for fast-moving reviewers batch-processing submissions.
- **Reproduce:** Approve a worksheet, immediately click a notification to another review page; 2s later you are navigated away from it.
- **Expected:** Timer stored in a ref and cleared on unmount/param change.
- **Current:** setTimeout(() => navigate(-1), 2000) with no ref/cleanup.
- **Suggested fix:** const navTimerRef = useRef<ReturnType<typeof setTimeout>>(); navTimerRef.current = setTimeout(...); useEffect(() => () => clearTimeout(navTimerRef.current), []); also clear it at the top of loadData.

#### [LOW] Autosave conflict detection is permanently stale after the first save — _savedUpdatedAt is never refreshed, so every later save logs a spurious conflict and real conflicts are indistinguishable  
`React Correctness & State Management`

- **Location:** src/hooks/useAutoSave.ts:132-154, 188, 215
- **Description:** The conflict check compares data._savedUpdatedAt (set once at load, useWorksheet.ts:169) against the row's updated_at. Every save writes a fresh updated_at (line 188) but never updates the in-memory _savedUpdatedAt, so from the second save onward the check always 'detects' a conflict against the client's own previous write and console.warns; since the policy is last-write-wins with no user surfacing, genuine concurrent-edit conflicts (e.g. buddy editing while joinee edits) are buried in guaranteed noise.
- **Root cause:** One-shot snapshot never advanced after successful writes.
- **Impact:** The conflict-detection feature is effectively dead code plus log spam; concurrent reviewer/joinee writes silently clobber each other with no distinguishable signal.
- **Reproduce:** Edit a field twice with >1.5s pause: the second save's console shows '[AutoSave] Conflict detected … Saving anyway'.
- **Expected:** After each successful save, the baseline advances to the written updated_at.
- **Current:** savedAt read from load-time data only.
- **Suggested fix:** Generate the timestamp once (`const newUpdatedAt = new Date().toISOString()`), send it, and on success store it in a ref used as the conflict baseline (preferring the ref over data._savedUpdatedAt); optionally surface real mismatches via dispatchToast instead of console.warn.

#### [LOW] AuthContext.fetchProfile treats transient fetch errors as 'profile missing' and attempts to INSERT a profile row  
`React Correctness & State Management`

- **Location:** src/context/AuthContext.tsx:44-57, 104-149
- **Description:** When .single() returns a non-PGRST116, non-recursion error (timeout, 5xx), the code notifies the error but then falls into `if (data) … else await createProfileFromAuth(userId)` — issuing an INSERT into user_profiles for a user who almost certainly already has a row. The insert fails on PK conflict and a retry SELECT papers over it, but on a flaky network this generates a needless insert+select storm per auth event, and if the insert ever succeeded post-deletion scenarios it would resurrect a defaulted-role profile.
- **Root cause:** Error and empty-result branches share the `!data` path.
- **Impact:** Extra failing writes and confusing error logs on flaky connections; profile creation semantics coupled to error handling.
- **Reproduce:** Block the user_profiles select (devtools request blocking) and sign in: console shows 'Error fetching profile' followed by 'Auto-profile creation error' from the conflicting insert.
- **Expected:** Only PGRST116 / genuinely-zero-rows triggers auto-creation; other errors leave profile untouched.
- **Current:** notifyError(...) then falls through to createProfileFromAuth when data is null.
- **Suggested fix:** After notifyError for a non-PGRST116 error, `return;` (keeping setLoading(false) in finally) so createProfileFromAuth runs only on confirmed no-row results.

#### [LOW] Dead 'progressUpdate' event wiring: nothing ever dispatches it, so the Navbar progress bar shows a stale localStorage percentage forever  
`React Correctness & State Management`

- **Location:** src/App.tsx:178-192, src/components/Navbar.tsx:289-303
- **Description:** App listens for a 'progressUpdate' CustomEvent and seeds progress from localStorage('onboarding_progress'), but a repo-wide search finds zero dispatchEvent('progressUpdate') calls. Whatever value a previous app version wrote to localStorage is displayed as the joinee's progress percentage indefinitely, never updating as worksheets are approved.
- **Root cause:** The event dispatcher was removed in a refactor; listener and persistence survived.
- **Impact:** Joinees see a frozen, potentially wrong progress figure in the navbar (e.g. an old 35% after completing everything), undermining trust in the dashboard's real numbers.
- **Reproduce:** localStorage.setItem('onboarding_progress','35'); reload as a joinee — navbar shows 35% regardless of actual state; complete a worksheet — it never changes.
- **Expected:** Either progress is computed from live submissions or the feature is removed.
- **Current:** Listener + localStorage read with no producer.
- **Suggested fix:** Remove the progress state/listener/localStorage key and the Navbar bar, or derive progress in Navbar from a lightweight submissions query/shared context instead of an event.

#### [LOW] Anon Supabase key and project URL committed to git history in .env  
`Security Vulnerabilities`

- **Location:** .env at commit 7e5ca88 (and 9979b3d); now untracked and .gitignored (.env pattern present)
- **Description:** git history contains .env with VITE_SUPABASE_URL=https://fuoqoryqndtdooujslee.supabase.co and VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_1JTwEK8CgHC6PLtOOnYeSw_xaHwa-i9. The publishable/anon key is public by design (it ships in every client bundle) and RLS is the real boundary, so this is not a true secret leak, but the file was tracked and remains recoverable from history. No service_role key was ever committed (verified across history).
- **Impact:** Low — anon key + project ref are already public in the shipped SPA. The concern is process hygiene: the ignore rule was added after the fact, and create-admin.cjs reads VITE_SUPABASE_SERVICE_ROLE_KEY, so a future careless .env with a service key could be committed the same way.
- **Expected:** No credential files in history; anon key rotation is cheap insurance.
- **Current:** .env with anon key present in git history; file no longer tracked on main.
- **Suggested fix:** Optionally rotate the anon key and scrub .env from history (git filter-repo/BFG). Keep the current .gitignore .env rule. Ensure no service_role key is ever placed in a tracked file.

#### [LOW] No Strict-Transport-Security (HSTS) header configured  
`Security Vulnerabilities`

- **Location:** vercel.json:5-20 (headers block)
- **Description:** The security headers block sets X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy and CSP, but no Strict-Transport-Security header. Vercel serves over HTTPS and redirects HTTP, but does not add an HSTS header automatically, so browsers won't enforce HTTPS-only on subsequent visits or preload.
- **Impact:** Low — leaves a small window for SSL-strip/downgrade on first navigation over a hostile network. This is an auth-bearing app (Supabase session tokens in storage), so HTTPS enforcement matters.
- **Expected:** HSTS present so browsers pin HTTPS.
- **Current:** No HSTS header emitted.
- **Suggested fix:** Add to the global headers array: { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" }.

#### [LOW] CSP allows style-src 'unsafe-inline' (inline styles used throughout)  
`Security Vulnerabilities`

- **Location:** vercel.json:15 (Content-Security-Policy style-src)
- **Description:** style-src includes 'unsafe-inline' because the app renders extensive inline style={{...}} objects. This weakens CSP against style-based injection. script-src is correctly 'self' with no unsafe-inline/eval, and there are no HTML sinks, so exploitability is minimal. Carried over from prior audit finding S5, still present.
- **Impact:** Low — no dynamic HTML rendering path exists, so there is no realistic style-injection vector; this is defense-in-depth degradation only.
- **Expected:** style-src without 'unsafe-inline' once inline styles are removed.
- **Current:** style-src 'self' 'unsafe-inline' https://fonts.googleapis.com.
- **Suggested fix:** Longer-term, migrate inline styles to CSS classes / a stylesheet and drop 'unsafe-inline' from style-src. Not a ship blocker.

#### [LOW] Verbose console.error logging of raw error objects in production  
`Security Vulnerabilities`

- **Location:** src/utils/errorHandling.ts:31; and ~30 call sites incl. src/hooks/useNotifications.ts:184, src/pages/PhaseReview.tsx:78-93, src/context/AuthContext.tsx (notifyError)
- **Description:** notifyError() and many components log full error objects (including Supabase/PostgREST error payloads) to the browser console unconditionally, in dev and prod builds alike. No secrets are exposed, but backend error detail (constraint names, RLS messages, occasionally row data echoed in messages) surfaces in the client console.
- **Impact:** Low — aids an attacker in reconnaissance (schema/policy details) and is noisy in production. Not a data breach.
- **Expected:** Detailed error logging only in DEV; production logs minimal/sanitized.
- **Current:** console.error(message, details) runs in all environments.
- **Suggested fix:** Gate verbose logging behind import.meta.env.DEV (as already done at ReviewContent.tsx:813) or route through a logger that strips detail in production; keep user-facing toasts generic.

#### [LOW] useAutoPromote test mocks a nonexistent '.jsx' module path — works only via Vite's jsx→tsx resolution quirk  
`Testing Audit`

- **Location:** src/hooks/__tests__/useAutoPromote.test.ts:18 (vi.mock('../../config/worksheetConfig.jsx')) vs src/hooks/useAutoPromote.ts:2 (imports '../config/worksheetConfig', actual file src/config/worksheetConfig.tsx)
- **Description:** The mock path names a file that does not exist (worksheetConfig.jsx); it currently intercepts the real import only because Vite's resolver maps .jsx specifiers onto .tsx files and vitest normalizes both to the same module ID. The mock also defines 20 worksheet IDs while the real PHASE_WORKSHEETS_MAP has 23 (verified by reviewFlow.test.ts expectations), so assertions like '5/20 worksheets approved' encode the fake map.
- **Root cause:** Leftover from a pre-TypeScript rename; the mock path was never updated.
- **Impact:** Any change to resolver settings, a rename to .ts, or a move to a different runner silently un-mocks the module; the tests would then run against the real 23-entry map and fail with confusing '5/23' mismatches — or worse, if assertions were looser, keep passing while testing the wrong data.
- **Reproduce:** ls src/config/worksheetConfig.* → only worksheetConfig.tsx exists.
- **Suggested fix:** Change to vi.mock('../../config/worksheetConfig', ...) (extension-less, matching the source import), and derive the expected totals from the mock map length instead of hardcoding 20.

#### [LOW] Conditionally-asserting and wall-clock-dependent tests in useDueDates suite  
`Testing Audit`

- **Location:** src/hooks/__tests__/useDueDates.test.ts:83-90 (and 69-81)
- **Description:** The test 'shows remaining days for future due dates' wraps all its expect() calls in `if (!info.isOverdue && !info.isDueSoon)` — if the guard is false the test body asserts nothing and passes vacuously. Both this and the 'due soon' test compute inputs from `new Date()` (real current time) rather than fake timers, so behavior at day boundaries is not pinned.
- **Root cause:** Test written defensively around real-clock inputs instead of controlling the clock.
- **Impact:** A regression that makes every worksheet report isDueSoon=true would leave this test green; time-derived inputs invite rare boundary flakes in CI.
- **Reproduce:** Read the cited lines — the conditional wraps every assertion.
- **Suggested fix:** Use vi.setSystemTime(new Date('2025-06-15T12:00:00Z')) and fixed start dates, then assert unconditionally on daysRemaining/isDueSoon/isOverdue for each boundary (due in 3d, 2d, today, -1d).

#### [LOW] Navbar user menu lacks menu semantics and Escape handling; mobile toggle missing aria-expanded  
`UI/UX & Accessibility`

- **Location:** src/components/Navbar.tsx:166-190,191-264,280-284
- **Description:** The avatar/user-menu trigger has no aria-expanded, aria-haspopup, or aria-label (on mobile only the initial letter is visible, so its accessible name is a single character); the dropdown closes on outside click but not on Escape, and focus is not returned/managed. The mobile hamburger has aria-label but no aria-expanded state.
- **Root cause:** Custom dropdown built without disclosure semantics.
- **Impact:** Screen-reader users can't tell the buttons open menus or whether they're open; keyboard users must Tab away to dismiss the dropdown, which is disorienting but not blocking (items themselves are real buttons).
- **Reproduce:** Inspect the user-menu button: no ARIA state attributes; open it and press Escape — it stays open.
- **Expected:** aria-expanded/aria-haspopup on both triggers, Escape closes and restores focus to the trigger.
- **Current:** Plain buttons + conditional divs.
- **Suggested fix:** Add aria-haspopup='menu' aria-expanded={userMenuOpen} aria-label='Account menu' to the trigger, aria-expanded={mobileOpen} to the hamburger, and a keydown Escape handler in the outside-click effect.

#### [LOW] Password visibility toggles have no accessible name; auth error alerts not announced  
`UI/UX & Accessibility`

- **Location:** src/pages/Login.tsx:91-96,99-104; src/pages/Signup.tsx:91-93; src/pages/ResetPassword.tsx:136-141,153-158
- **Description:** The Eye/EyeOff show-password buttons on Login, Signup, and ResetPassword contain only an icon and have no aria-label, so screen readers announce them as 'button'. The inline error alerts (invalid credentials, password mismatch, etc.) are plain divs without role='alert', so failures after submit are not announced.
- **Root cause:** Icon-only buttons and static error divs.
- **Impact:** Blind users don't know the toggle exists/what state it's in and may not hear why their sign-in failed, forcing guesswork on the most critical entry flow.
- **Reproduce:** Inspect the eye button on /login: no accessible name; submit bad credentials with a screen reader running: the error text is not announced.
- **Expected:** aria-label={showPw ? 'Hide password' : 'Show password'} (plus aria-pressed) and role='alert' on the error containers.
- **Current:** Unlabeled icon buttons; silent error divs.
- **Suggested fix:** Add the aria-label/aria-pressed to each toggle and role='alert' to the .lux-alert-error blocks on all four auth pages.

#### [LOW] Residual non-responsive fixed multi-column grids on gate controls and Assessment  
`UI/UX & Accessibility`

- **Location:** src/pages/gate-controls/GateControl1.tsx:157; src/pages/gate-controls/GateControl2.tsx:146; src/pages/gate-controls/GateControl3.tsx:166,199; src/pages/Assessment.tsx:147; src/pages/Stakeholders.tsx:75; src/pages/worksheets/Phase1Worksheet5.tsx:65; src/pages/worksheets/Phase2Worksheet4.tsx:44
- **Description:** The prior audit's responsive fix introduced .ws-stack-sm (collapses to 1 column under 640px), but these locations still use raw gridTemplateColumns:'1fr 1fr' (GateControl3 even '1fr 1fr 1fr'). Note .ws-stack-sm is only defined inside WorksheetPage's inline <style>, so gate-control pages (which don't render WorksheetPage) can't use it even if the class were added.
- **Root cause:** Fixed grid templates without a small-screen collapse; stack utility scoped to WorksheetPage only.
- **Impact:** On a 360px phone, signature/name inputs and Assessment's name+email fields are squeezed to ~150px each — underline inputs become hard to tap and text is clipped; gate reviews are done by buddies possibly on mobile.
- **Reproduce:** Open /buddy/gate-pass/:userId/gc1 at 360px width: 'Manager Signature' and 'Instructor Signature' inputs sit side-by-side at half width.
- **Expected:** Two-column field grids collapse to one column below 640px everywhere.
- **Current:** Hard-coded 1fr 1fr grids.
- **Suggested fix:** Move the .ws-stack-sm rule (or the existing .grid-2 class in index.css:608-609, which already collapses at 640px) into global CSS and apply it to these seven grids.

#### [LOW] Gate controls require 'Instructor Name' but render no input for it  
`UI/UX & Accessibility`

- **Location:** src/pages/gate-controls/GateControl1.tsx:20-27,43; GateControl2.tsx:21,42; GateControl3.tsx:22,45; src/hooks/useAutoSave.ts:293-313
- **Description:** All three gate controls declare requiredFields=[{key:'employeeName', label:'Instructor Name'}] with defaultData.employeeName='', yet none of them render an employeeName field. The value is only filled by getOAuthName() prefill (metadata name or email prefix) on first load when no saved row exists, or by joinee-profile prefill in buddy mode. If a row was previously saved with an empty employeeName (prefill only runs when no saved row exists), submit fails with 'Please fill in: Instructor Name' and there is no field on the page the user can fill to fix it.
- **Root cause:** Required field relies entirely on invisible prefill.
- **Impact:** Affected users hit a hard dead-end: a validation error naming a field that does not exist anywhere on the form, with no recovery besides contacting support.
- **Reproduce:** Create a worksheet_submissions row for gc1 with worksheet_data.employeeName='' (e.g. saved in an earlier session), reload the gate, click Submit: error names a field that isn't rendered.
- **Expected:** Either render a (read-only) Instructor Name field, or drop it from requiredFields and derive it server-side from the profile.
- **Current:** Hidden required field validated on submit.
- **Suggested fix:** Add `<FieldGroup label='Instructor Name' required id='gcN-name'><input …value={data.employeeName} onChange={e=>updateField('employeeName', e.target.value)}/></FieldGroup>` to each gate control's form.

#### [LOW] academic_head/onboarding_lead land on the joinee Dashboard whose primary content silently dead-ends for them  
`UI/UX & Accessibility`

- **Location:** src/App.tsx:77-89,144-146; src/pages/Dashboard.tsx:194-453
- **Description:** HomeRoute redirects only lead_instructor to /buddy. academic_head and onboarding_lead get the joinee Dashboard ('Welcome to Your Onboarding Journey', phase roadmap, 'Start Phase 1' quick links). All phase routes require new_joinee/lab_instructor, so every phase card and most quick links bounce these roles back to '/' with no feedback.
- **Root cause:** HomeRoute only special-cases lead_instructor.
- **Impact:** A manager's home page is a wall of clickable content that does nothing when clicked; their real workspace (/admin) is only reachable via the small nav link. Confusing first-run experience for the most senior users.
- **Reproduce:** Sign in as academic_head, land on '/', click the Phase 1 card: the URL flickers to /phase-1 and returns to '/'.
- **Expected:** academic_head → /admin, onboarding_lead → /onboarding-lead (or a role-aware home page).
- **Current:** return <Dashboard /> for all non-lead_instructor roles.
- **Suggested fix:** Extend HomeRoute: `if (profile?.role === 'academic_head' || profile?.role === 'onboarding_lead') return <Navigate to='/admin' replace/>;` (onboarding_lead could go to /onboarding-lead).

#### [LOW] Phase 1 page lists Week 2–4 worksheets as clickable with no locked indicator despite week gating  
`UI/UX & Accessibility`

- **Location:** src/pages/Phase1.tsx:233-286; src/components/PhaseWorksheetList.tsx:45-61; src/components/WeekAccessGuard.tsx:82-183
- **Description:** Phase 1 renders all four weeks' worksheets as fully active rows. Week 2–4 worksheet routes are wrapped in WeekAccessGuard, so a joinee who hasn't completed Week 1 clicks e.g. 'Micro-Teach #1' and gets the full-page 'Week 2: Co-create Locked' screen. Unlike the Dashboard phase cards (which show a Lock icon, 0.5 opacity, and a reason), the Phase 1 listing gives no advance affordance of the lock.
- **Root cause:** PhaseWorksheetList has no lock awareness; week completion state isn't passed down.
- **Impact:** Users learn about week gating only by trial-and-error clicks, each costing a navigation + full lock page + back navigation; on the primary joinee planning screen this is repeated friction.
- **Reproduce:** As a fresh joinee on /phase-1, click any Week 2 row: locked page appears.
- **Expected:** Locked weeks' rows shown with Lock icon/reduced opacity and a 'Complete Week N-1 first' hint, matching the Dashboard's locked-phase treatment.
- **Current:** All rows identical and clickable regardless of gate state.
- **Suggested fix:** Phase1 already has the status map — compute per-week completion with the same logic as WeekAccessGuard and pass a `locked` flag into PhaseWorksheetList to render the locked affordance and suppress navigation.

#### [LOW] ReviewContent zebra striping uses invalid CSS value  
`UI/UX & Accessibility`

- **Location:** src/components/ReviewContent.tsx:202
- **Description:** Row backgrounds alternate with `background: 'var(--md-surface-variant)30'` — appending '30' after a var() does not produce an alpha color; the declaration is invalid and dropped by the browser, so zebra striping never renders.
- **Root cause:** Attempted hex-alpha concatenation onto a CSS variable.
- **Impact:** Purely cosmetic: dense review tables lose the intended row separation, making long submissions slightly harder for reviewers to scan.
- **Reproduce:** Inspect any even/odd row of a review table: computed background is transparent for both.
- **Expected:** Alternating subtle row tint.
- **Current:** Invalid property value ignored.
- **Suggested fix:** Use `background: idx % 2 === 0 ? 'transparent' : 'rgba(26,26,26,0.03)'` or define a dedicated --md-surface-variant-30 token.

#### [LOW] NotificationBell misroutes clicks: FTP week worksheets fall back to /phase-1 and empty worksheet_id notifications produce broken review URLs  
`Input Validation & Error Handling`

- **Location:** src/components/NotificationBell.tsx:32-40 and 65-81
- **Description:** PHASE_MAP only covers p1_*/p2_*/p3_*/gc* ids. For all 20+ FTP week worksheets (w1_o1 … w4_g1) a joinee clicking e.g. a 'needs revision' notification is navigated to /phase-1 instead of the relevant week page. For reviewers, signup/assignment notifications have worksheet_id '' so the click navigates to `/{role}/review/{uid}/` — a trailing-slash route that doesn't match and lands on the 404 page.
- **Root cause:** Routing map predates the FTP week worksheets; no guard for empty worksheet_id.
- **Impact:** Notifications frequently take users to the wrong page or a Not Found screen, eroding trust in the one async signal the app has.
- **Reproduce:** As a joinee, receive a needs_revision notification for w2_e1 and click it → lands on /phase-1. As a manager, click a 'X has signed up' notification → 404 page.
- **Expected:** Click lands on the specific worksheet/week or a sensible dashboard.
- **Current:** Wrong page or NotFound.
- **Suggested fix:** Extend PHASE_MAP with the WK_WORKSHEETS_MAP ids (mapping to /week-N), and guard reviewer navigation: if !worksheet_id, navigate to the dashboard instead of the review route.

#### [LOW] validate() assumes required-field values are strings — a non-string value crashes submit as an unhandled rejection  
`Input Validation & Error Handling`

- **Location:** src/hooks/useWorksheet.ts:229-236, src/hooks/useGateControl.ts:132-137
- **Description:** Required-field validation calls `(data[f.key] as string)?.trim()`. Optional chaining only guards null/undefined; a boolean, number, or array value (e.g. if a future worksheet marks a checkbox or rating as required, or saved data was corrupted to a non-string) throws TypeError: trim is not a function. In useWorksheet the validate() call sits before the try block, so the async onClick handler rejects unhandled — the Submit button silently does nothing. Currently all configured requiredFields happen to be text inputs, so this is latent.
- **Root cause:** Unchecked string cast in shared validation used by 40+ forms.
- **Impact:** Latent foot-gun: the next developer who adds a non-text required field ships a submit button that dies silently with only a console rejection.
- **Reproduce:** Add `{ key: 'buddyConfirmed', label: 'Buddy confirmed' }` (a boolean field) to any worksheet's requiredFields and click Submit: unhandled 'trim is not a function' rejection, no UI feedback.
- **Expected:** Type-tolerant emptiness check or config-time validation.
- **Current:** Crash on any non-string required value.
- **Suggested fix:** Coerce defensively: `const v = data[f.key]; const empty = v == null || (typeof v === 'string' ? !v.trim() : v === false);` — or restrict via types and validate the config in the existing worksheetConfigData tests.

#### [LOW] No length limits on any text input/textarea — unbounded payloads are re-sent whole every 1.5 seconds  
`Input Validation & Error Handling`

- **Location:** src/pages/worksheets/* (all), src/config/worksheetComponents.tsx, src/hooks/useAutoSave.ts:181-208 (grep: zero maxLength attributes in src/)
- **Description:** No input or textarea in the entire app sets maxLength, and neither the client nor the DB (jsonb worksheet_data, no CHECK on size) bounds field length. The autosave loop serializes and uploads the FULL worksheet_data document on every debounced save, so a multi-megabyte paste (accidental or malicious) is re-uploaded on every subsequent keystroke pause, and every reviewer page then downloads it via select('*'). Unicode/emoji and HTML payloads are handled safely (React text rendering, no dangerouslySetInnerHTML found), so this is a resource/abuse issue, not injection.
- **Root cause:** No length policy at any layer.
- **Impact:** One pathological paste degrades that user's saves (timeouts → error toasts), bloats the row, and slows every reviewer/dashboard query that fetches worksheet_data. No production blocker, but an easy abuse vector on a free-tier Supabase project.
- **Reproduce:** Paste a 10MB string into any textarea; watch 10MB upserts fire every 1.5s in the network tab.
- **Expected:** Bounded field sizes client-side with a server backstop.
- **Current:** Unbounded.
- **Suggested fix:** Add sane maxLength (e.g. 2000-10000) to lux-input/lux-textarea via the shared components, and a server-side guard (CHECK pg_column_size(worksheet_data) < 256kb or trigger) as a backstop.

#### [LOW] Concurrency-conflict and info messages are styled as success (green + check icon) due to string-sniffing on 'Error'  
`Input Validation & Error Handling`

- **Location:** src/pages/WorksheetReview.tsx:506-510 and 542-546, src/components/admin/AssignmentsTab.tsx:105, src/pages/PhaseReview.tsx:352
- **Description:** Alert styling is chosen by actionMessage.includes('Error'). The optimistic-concurrency message 'This worksheet changed since you loaded it. Reloading the latest version…' and the buddy state-machine rejection 'Cannot approve: worksheet is in "…" state' contain no 'Error' substring, so they render as green success alerts with a CheckCircle icon, telling the reviewer the opposite of what happened.
- **Root cause:** Presentation derived from message text content.
- **Impact:** Reviewers can read a rejected/blocked action as a successful one and walk away believing they approved a worksheet they did not.
- **Reproduce:** Two buddies open the same pending worksheet; buddy A approves; buddy B clicks Approve → sees a green check-marked alert saying the worksheet changed.
- **Expected:** Warning/info styling for conflict and rejection messages.
- **Current:** Green success styling with check icon.
- **Suggested fix:** Track message type explicitly: setActionMessage({ text, kind: 'error' | 'success' | 'info' }) instead of substring sniffing.

#### [LOW] Gate-control milestone labels come from a mutable window global — wrong/generic labels when multiple ReviewContent instances render  
`Input Validation & Error Handling`

- **Location:** src/components/ReviewContent.tsx:800-805 and 936-941, src/pages/PhaseReview.tsx:411-414
- **Description:** ReviewContent stashes its worksheetId on window.__reviewWorksheetId in a useEffect, and MilestonesRenderer reads that global at render time. PhaseReview renders one ReviewContent per worksheet when expandedSheet==='all' (auto-set for managers at line 233-237); the last-mounted instance wins the global, so a gate control's milestones render against the wrong id and fall back to generic 'Milestone 1..N' labels (or, worse, another gate's labels). Also a render-order dependency: effects run after render, so on first paint the global may hold a stale id from a previous page.
- **Root cause:** Prop threaded through a window global instead of function arguments.
- **Impact:** Managers approving a phase see gate milestone outcomes without their real labels/verification criteria — reviewing 'Milestone 3: Partial' with no idea what milestone 3 is.
- **Reproduce:** As academic_head, open a PhaseReview where all sheets auto-expand including gc1: gc1's Milestone Outcomes show generic 'Milestone N' labels.
- **Expected:** Correct per-worksheet milestone labels regardless of how many ReviewContents are mounted.
- **Current:** Last-mounted instance's id leaks into all milestone renderers.
- **Suggested fix:** Pass worksheetId down through renderField/MilestonesRenderer as a prop (it is already available as ReviewContent's prop); delete the window global.

#### [LOW] markAsRead / markAllAsRead / bell navigation failures are fully silent  
`Input Validation & Error Handling`

- **Location:** src/hooks/useNotifications.ts:111-146
- **Description:** Both mutation helpers catch errors and only console.error them; the UI gives no feedback, so 'Mark all read' appears to just not work when the update fails (the unread badge stays). This is the correct non-optimistic pattern, but with zero surfaced signal.
- **Root cause:** Swallowed catch blocks.
- **Impact:** Occasional 'the button does nothing' reports; low stakes since notifications are auxiliary.
- **Reproduce:** Go offline, click 'Mark all read': badge unchanged, no message.
- **Expected:** A small error toast on failure.
- **Current:** Console-only.
- **Suggested fix:** On catch, dispatchToast('Could not update notifications — try again.', 'error') using the existing errorHandling bridge.
