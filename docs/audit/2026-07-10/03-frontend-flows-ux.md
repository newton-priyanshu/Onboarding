# Production Readiness Audit — Frontend, Flows & UX

_Audit date: 2026-07-10 · Part of the [2026-07-10 audit](./README.md)_

## User Journeys & Flows — score 42/100

Core happy paths (login, signup, new-hire worksheet flow, buddy/admin review) are wired and navigable, with good guard-rail UX (locked views with escape buttons, 404 catch-all, deep-link preservation in ProtectedRoute). However, password recovery is a hard dead-end (link to a nonexistent route, no reset flow at all), the final phase-approval journey silently corrupts the approving admin's own auth role metadata, and the auto-promotion journey strands promoted users with dead phase cards. Several medium races (post-login deep links, OAuth callback false failures, signup notifications lost to missing session) further erode journey reliability.

**Done well:** ProtectedRoute preserves the attempted URL in location state and Login honors it (ProtectedRoute.tsx:32, Login.tsx:17,29), and it renders a loading state instead of flashing redirects on initial session restore · 404 catch-all route exists with clear recovery actions (App.tsx:146, NotFound.tsx:18-23) · PhaseAccessGuard and WeekAccessGuard locked views explain the unlock condition and offer two escape routes (Go to Dashboard / previous phase-week), so client-side gates never hard dead-end (PhaseAccessGuard.tsx:20-47, WeekAccessGuard.tsx:26-53) · Login differentiates error messaging (invalid credentials vs unconfirmed email) and offers Google OAuth fallback (Login.tsx:32-37) · Route-level ErrorBoundary resets on location change, so a crashed page recovers by navigating away (App.tsx:97), and heavy admin/review pages are lazy-loaded with a Suspense fallback (App.tsx:105-118)

### H19 — Forgot-password link dead-ends at 404; no password reset flow exists anywhere

**Severity:** High _(adversarially verified: DOWNGRADED to this severity)_

**Location:** src/pages/Login.tsx:125-130 (link); src/App.tsx:98-147 (no /forgot-password route); src/ (zero resetPasswordForEmail calls)

**Description:** Login renders a 'Forgot your password?' link to /forgot-password, but App.tsx defines no such route, no ForgotPassword/ResetPassword page exists in src/pages, and supabase.auth.resetPasswordForEmail is never called anywhere in src/. The link falls into the '*' catch-all and renders the 404 page.

**Why it is a problem:** Any user who forgets their password is permanently locked out: the advertised recovery path lands on 'Page Not Found', and there is no admin-side reset UI either. For an onboarding app where new hires log in on day one with fresh credentials, this is a guaranteed support incident.

**Steps to reproduce:** 1. Open /login. 2. Click 'Forgot your password?'. 3. Observe 404 page. 4. grep -rn resetPasswordForEmail src/ returns nothing.

**Root cause:** Link shipped without the corresponding route/page or Supabase recovery integration (updateUser password flow also absent).

**Suggested fix:** Add /forgot-password and /reset-password routes; call supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + '/reset-password' }) and handle the PASSWORD_RECOVERY auth event with supabase.auth.updateUser({ password }).

**Example implementation:**

```
<Route path="/forgot-password" element={<ForgotPassword />} />
<Route path="/reset-password" element={<ResetPassword />} />
```

> Verifier evidence: Login.tsx:125-130 links to /forgot-password; App.tsx:98-146 has no such route, so App.tsx:146 catch-all renders NotFound; zero resetPasswordForEmail calls in src/. But Login.tsx:114-122 offers Google sign-in as an alternate path, and Supabase dashboard allows admin resets — lockout is not permanent, so Critical overstates it.

### H20 — Promoted users (lead_instructor) are locked out of all phase/worksheet content with silently dead dashboard cards

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** src/App.tsx:91,123-125 (requiredRoles ['new_joinee','lab_instructor']); src/pages/Dashboard.tsx:270 (navigate(phase.path)); src/components/ProtectedRoute.tsx:35-39

**Description:** Auto-promotion changes role to lead_instructor, but every /phase-N and worksheet route only allows new_joinee/lab_instructor. The role-agnostic Dashboard at '/' still shows their (fully unlocked) phase cards; clicking one navigates to /phase-N, ProtectedRoute bounces straight back to '/', producing a silent click-does-nothing loop. Navbar also hides Phase links for lead_instructor (Navbar.tsx:73-78), so promoted users lose all access to their own completed onboarding work.

**Why it is a problem:** The culminating moment of the product journey — completing onboarding — visibly breaks the UI for the user: buttons that no-op, and permanent loss of access to everything they wrote across 17 worksheets.

**Steps to reproduce:** Promote a user to lead_instructor (or set role in DB), log in, land on '/', click any phase card: URL flickers to /phase-1 and returns to '/'.

**Root cause:** Route role lists were never extended for the post-promotion state, and Dashboard renders the joinee view unconditionally.

**Suggested fix:** Either include lead_instructor in phase/worksheet route roles (read-only view of own work), or render a role-appropriate dashboard at '/' that hides phase cards for non-joinee roles.

**Example implementation:**

```
requiredRoles={['new_joinee','lab_instructor','lead_instructor']} // or branch Dashboard on profile.role
```

> Verifier evidence: useAutoPromote.ts:63 sets role lead_instructor (invoked via PhaseReview.tsx:157). App.tsx:91,123-125,128-136 gate all phase/worksheet routes to ['new_joinee','lab_instructor']. ProtectedRoute.tsx:38 silently redirects to '/'. Dashboard.tsx:270 navigates unlocked cards with no role check; Navbar.tsx:73-78 hides Phase links. No mitigation found.

### M29 — Approving the final phase overwrites the reviewing admin's own auth role metadata

**Severity:** Medium _(adversarially verified: DOWNGRADED to this severity)_

**Location:** src/hooks/useAutoPromote.ts:69-75 (auth.updateUser); src/pages/PhaseReview.tsx:157 (caller)

**Description:** checkAndPromote(userId) is invoked from PhaseReview by the academic_head/onboarding_lead session. It updates the joinee's user_profiles.role correctly, but then calls supabase.auth.updateUser({ data: { role: 'lead_instructor' } }), which mutates the CALLER's (the reviewer's) auth user_metadata — not the promoted joinee's. The joinee's auth metadata is never updated.

**Why it is a problem:** The admin who approves the last phase gets their JWT user_metadata.role silently set to lead_instructor. get_user_role() (db/schema.sql:321-333) and the admin RLS policies coalesce from that metadata, so after the next token refresh the admin loses admin-level DB access; AuthContext's metadata fallback (AuthContext.tsx:71-92) would also misreport their role. Meanwhile the promoted user's metadata stays stale, breaking any metadata-derived role fallback for them.

**Steps to reproduce:** As academic_head, open /admin/review-phase/:userId/3 with all other phases approved and click Approve Phase; inspect your own auth user's user_metadata afterwards — role is now lead_instructor.

**Root cause:** auth.updateUser always operates on the current session; the code assumes it targets the userId being promoted.

**Suggested fix:** Remove the auth.updateUser call from the client path entirely; perform promotion (profile role + auth metadata) in a Postgres trigger or an edge function using the admin API keyed to the promoted userId.

**Example implementation:**

```
// server-side: supabaseAdmin.auth.admin.updateUserById(promotedUserId, { user_metadata: { role: 'lead_instructor' } })
```

> Verifier evidence: Bug real: useAutoPromote.ts:69 updateUser targets the caller (academic_head per PhaseReview.tsx:56,157). But no admin access loss: every metadata-gated policy includes 'lead_instructor' (schema.sql:70,77,193,209,289,370); only :346 is academic_head-only and other permissive policies bypass it. AuthContext.tsx:40 reads role from the untouched user_profiles row. Remaining harm: silent admin metadata corruption; joinee's stale metadata, mitigated by assigned_buddy_id paths (:198,:213).

### M30 — No role-based landing: admins, leads, and buddies land on the new-hire phase dashboard

**Severity:** Medium _(adversarially verified: DOWNGRADED to this severity)_

**Location:** src/pages/Dashboard.tsx (entire file — no profile/hasRole usage, only useAuth().user at line 43); src/App.tsx:121; src/components/ProtectedRoute.tsx:38 (wrong-role redirect target '/')

**Description:** Dashboard.tsx contains zero role branching — it renders the new-hire phase view (Days 1-30 hero, phase cards, own-submission progress) for every authenticated role. After login, academic_head/onboarding_lead/lead_instructor land here and must discover /admin, /onboarding-lead, or /buddy via navbar links (Navbar.tsx:63-66). ProtectedRoute's wrong-role redirect also targets '/', reinforcing the mismatched view.

**Why it is a problem:** Every privileged role's first-session experience is a joinee dashboard showing empty personal onboarding progress; combined with finding 3, the '/' page is actively misleading for 3 of the 5 roles. Reviewers may miss pending reviews entirely if they don't open the navbar menu.

**Suggested fix:** At '/', redirect (or branch render) based on profile.role: academic_head → /admin, onboarding_lead → /onboarding-lead, lead_instructor → /buddy; keep phase view for new_joinee/lab_instructor.

**Example implementation:**

```
if (hasRole('academic_head')) return <Navigate to="/admin" replace />;
```

> Verifier evidence: Dashboard.tsx:43 (no role usage), App.tsx:121, Login.tsx:29, ProtectedRoute.tsx:38 confirm all roles land on the joinee dashboard. But Navbar.tsx:63-66,80,136-141 render Reviews/Monitoring/Admin as first, always-visible top-level nav links — not a hidden menu — so "may miss pending reviews entirely" is false; it's one-click UX friction, not lost functionality.

### M31 — Post-login deep-link redirect races profile fetch: role-gated destinations bounce to '/'

**Severity:** Medium

**Location:** src/pages/Login.tsx:28-29; src/context/AuthContext.tsx:147-159 (SIGNED_IN does not set loading=true); src/components/ProtectedRoute.tsx:35-39

**Description:** Login navigates to the preserved 'from' URL immediately after signIn resolves. At that moment loading is false (set on initial no-session load) and profile is still null because fetchProfile runs async after the SIGNED_IN event without re-setting loading=true. ProtectedRoute therefore evaluates requiredRoles with userRole=undefined and redirects to '/'.

**Why it is a problem:** The deep-link preservation feature is defeated for every role-gated page: an admin who followed a link to /admin/review/:userId/:worksheetId, got sent to /login, and signs in ends up on the new-hire dashboard instead of the review they intended to do. Notification links to review pages break the same way.

**Steps to reproduce:** Logged out, open /admin (redirects to /login with from state), sign in as academic_head: you land on '/' instead of /admin.

**Root cause:** AuthContext exposes loading=false during the post-sign-in profile fetch window, so ProtectedRoute cannot distinguish 'profile loading' from 'no role'.

**Suggested fix:** Set loading=true (or a separate profileLoading flag) when SIGNED_IN triggers fetchProfile, and have ProtectedRoute wait when user exists but profile is null.

**Example implementation:**

```
if (user && !profile && requiredRoles) return <LoadingView />; // instead of redirecting
```

### M32 — Signup's profile insert and 'assign a buddy' notifications run without a session and are silently lost

**Severity:** Medium

**Location:** src/context/AuthContext.tsx:183-206 (post-signUp inserts); src/pages/Signup.tsx:40-55 (unconditional 'check your email to confirm' success screen)

**Description:** signUp inserts into user_profiles and sends notifications to managers/onboarding leads immediately after auth.signUp. The success screen states email confirmation is required, meaning no session exists at that point — RLS (own-row insert, authenticated notification insert) rejects both writes; errors only go to notifyError/console. Profile creation is later recovered by createProfileFromAuth on first login (AuthContext.tsx:94-131), but the 'New Joinee joined... needs a manager and buddy assigned' notifications are never re-sent.

**Why it is a problem:** The new-hire intake journey silently loses its handoff signal: managers are never notified to assign a buddy/lead, so submissions can sit unreviewed until someone manually checks the AdminDashboard 'No Manager/No Buddy' list. Also, if email confirmation is disabled in Supabase, the success screen's instruction is wrong and pushes an already-authenticated user back to /login.

**Suggested fix:** Move profile creation and intake notifications server-side (the handle_new_user trigger already creates the profile — add a notification insert there), or defer notifications to the first authenticated session; make Signup's success copy depend on whether data.session exists.

**Example implementation:**

```
if (data.session) navigate('/'); else showConfirmEmailScreen();
```

### M33 — AuthCallback misses hash-fragment OAuth errors and can falsely report failure on slow token exchange

**Severity:** Medium

**Location:** src/pages/AuthCallback.tsx:14-19 (query-string-only error parse), 22-32 (single getSession after fixed 1s timer, always navigates '/')

**Description:** OAuth errors from Supabase's implicit flow arrive in the URL hash fragment (#error=...&error_description=...), but AuthCallback only inspects window.location.search, so real errors show the generic 'Sign in failed' path with no reason. Separately, success is decided by one getSession() call after a fixed 1000ms delay: if session persistence takes longer (slow network/device), the user is told 'Sign in failed' and dumped on /login while actually signed in moments later — and Login does not redirect authenticated users. The callback also always navigates to '/', discarding any pre-auth deep link.

**Why it is a problem:** Google sign-in — the primary flow per Login's error copy — intermittently shows false failures and hides real error causes; users end up on a login form while already authenticated, a confusing dead-end state.

**Suggested fix:** Parse both location.search and location.hash for error params; replace the fixed timer with an onAuthStateChange SIGNED_IN listener (with a longer timeout fallback); restore the stored 'from' path after success.

**Example implementation:**

```
const hash = new URLSearchParams(window.location.hash.slice(1)); const err = hash.get('error_description') ?? query.get('error_description');
```

### L14 — /login and /signup render for already-authenticated users (no redirect)

**Severity:** Low

**Location:** src/pages/Login.tsx:6-53 and src/pages/Signup.tsx:6-38 (no user check); src/pages/NotFound.tsx:21-23 ('Go to Login' button); src/App.tsx:100-101

**Description:** Neither Login nor Signup checks useAuth().user, so authenticated users who navigate to them (via NotFound's 'Go to Login' button, browser history, or the AuthCallback false-failure path in finding 7) see a full credentials form despite having an active session.

**Why it is a problem:** Confusing loop-adjacent UX: a signed-in user is prompted to sign in again; combined with the AuthCallback race it strands successfully-authenticated users on the login form. Signing up while signed in can also fire the signUp side effects under an existing session.

**Suggested fix:** In Login/Signup, redirect when user is present: if (user && !loading) return <Navigate to='/' replace />; and hide/replace NotFound's Login button for authenticated users.

### L15 — PhaseAccessGuard flashes the 'Phase Locked' screen on first paint for users who have access

**Severity:** Low

**Location:** src/components/PhaseAccessGuard.tsx:54 (checking initialized false), 79-91 (render path before effect runs)

**Description:** checking starts as false and is only set true inside useEffect, which runs after the first paint. For phase 2/3 routes the initial render therefore evaluates canAccessPhase(user.id, phaseNum, []) with an empty submissions array and paints the full PhaseLockedView before flipping to 'Loading…' and then the real content. WeekAccessGuard initializes checking=true (WeekAccessGuard.tsx:62) and does not have this flash.

**Why it is a problem:** Every navigation into a Phase 2/3 worksheet by an eligible user flashes a 'Phase Locked — complete all previous worksheets' screen, which reads as data loss / regression to users mid-journey and can trigger mistaken back-navigation.

**Suggested fix:** Initialize checking to phaseNum > 1 (mirroring WeekAccessGuard) so the loading state renders until the submissions query resolves.

**Example implementation:**

```
const [checking, setChecking] = useState(phaseNum > 1);
```

## Feature Completeness & Business Logic — score 46/100

The core review loop (submit → pending_review → buddy_approved → approved, with needs_revision/revision_submitted) is implemented end-to-end in the UI, but several product features are broken or demo-grade in the current tree: auto-promotion corrupts the manager's own auth metadata, joinee-to-reviewer notifications are denied by RLS and silently swallowed, the FTP gate-pass flow dead-ends on an "Invalid Gate Pass" page, and due dates are computed from a hardcoded "30 days ago" demo start date so Phase 1 sheets are born overdue. The state machine has no server-side transition enforcement, and there are two conflicting definitions of what "Phase 1 complete" means.

**Done well:** Full revision loop implemented: needs_revision -> edit -> revision_submitted -> re-review, with append-only review_history timeline rendered in WorksheetReview.tsx:342-385 · handleBuddyApprove validates current state before transition (WorksheetReview.tsx:97-103) and buddy assignment is checked (isAssignedBuddy, :49-66) · Gate controls gc1-gc3 verify prerequisite worksheets are buddy_approved/approved and fail CLOSED on query error (useGateControl.ts:45-55) · Centralized status constants with casing-drift guards exist (src/constants/status.ts) and are used by the core hooks · Auto-save has retry with backoff, mounted-guards, and notification targeting prefers the assigned reviewer with role-wide fallback (useAutoSave.ts:132-157)

### H21 — Auto-promotion updates the manager's own auth metadata instead of the joinee's

**Severity:** High _(adversarially verified: DOWNGRADED to this severity)_

**Location:** src/hooks/useAutoPromote.ts:69-75 (called from src/pages/PhaseReview.tsx:157 in the manager's session)

**Description:** checkAndPromote() runs when the MANAGER clicks 'Approve Phase'. It correctly updates the joinee's user_profiles.role, but then calls supabase.auth.updateUser({ data: { role: 'lead_instructor' } }), which always targets the CURRENT session user — the manager. The joinee's auth user_metadata role is never updated; the manager's is overwritten to lead_instructor.

**Why it is a problem:** The manager's JWT-derived role (get_user_role() COALESCEs app_metadata then user_metadata, db/schema.sql:321-333) silently becomes lead_instructor, breaking admin RLS paths (e.g. user_profiles admin read/update) and the AuthContext JWT-fallback profile. Meanwhile the promoted joinee's auth metadata stays 'new_joinee', so any metadata-based authorization for them is wrong.

**Steps to reproduce:** As academic_head, open /admin/review-phase/:userId/3 for a joinee whose final phase is fully buddy_approved and click Approve Phase. Inspect the manager's auth user via supabase.auth.getUser(): user_metadata.role is now 'lead_instructor'.

**Root cause:** supabase.auth.updateUser only ever mutates the authenticated session's user; promoting another user's metadata requires the Admin API / an edge function, which does not exist here.

**Suggested fix:** Remove the auth.updateUser call from checkAndPromote (rely on user_profiles.role), or move promotion to a SECURITY DEFINER RPC / edge function using the service role that updates the target user's app_metadata.

**Example implementation:**

```
// delete lines 68-75 of useAutoPromote.ts, or:
await supabase.rpc('promote_user', { target: userId }); // definer fn updates profile + app_metadata
```

> Verifier evidence: useAutoPromote.ts:69-71 updateUser does hit the manager session (PhaseReview.tsx:56,157,180; roles in user_metadata per AuthContext.tsx:173). But claimed admin-RLS breakage is wrong: schema.sql:68-79, 289, 366-374 all grant lead_instructor the same access as academic_head, and the metadata fallback only runs on RLS-recursion errors (AuthContext.tsx:60-63). Real harm: joinee's JWT role stays new_joinee, so promoted-buddy reviewer RLS silently fails.

### H22 — Joinee-to-reviewer notifications denied by RLS — submission notifications silently do nothing

**Severity:** High _(adversarially verified: DOWNGRADED to this severity)_

**Location:** db/schema.sql:282-291 and supabase_migration_fix_rls_security.sql:156-167 vs src/hooks/useAutoSave.ts:148-156, src/context/AuthContext.tsx:197, src/hooks/useNotifications.ts:151-165

**Description:** The notifications INSERT policy allows a row only when user_id = auth.uid() OR the SENDER's role is lead_instructor/academic_head/onboarding_lead. When a new_joinee submits a worksheet, useAutoSave inserts notification rows with user_id = buddy/manager id from the joinee's session — get_user_role() returns 'new_joinee', so the insert is rejected. triggerNotification catches the error and only console.errors, so the feature no-ops silently. Signup notifications to managers (AuthContext.tsx:197) fail the same way.

**Why it is a problem:** Reviewers never learn a worksheet was submitted or resubmitted — the entire 'submit → notify buddy' pipeline is dead for every joinee, and reviews only happen if buddies manually poll their dashboard. Silent catch means no error surfaces to users or monitoring.

**Steps to reproduce:** Sign in as a new_joinee, submit any worksheet, then check the buddy's notification bell: no 'submitted' notification exists; browser console shows an RLS violation from triggerNotification.

**Root cause:** RLS hardening (audit fix RLS-4) restricted inserts to self-or-reviewer, but the app architecture has the SUBMITTER write the reviewer's notification client-side.

**Suggested fix:** Create notifications server-side: a DB trigger on worksheet_submissions (on review_status transition to pending_review/revision_submitted) or a SECURITY DEFINER RPC that validates the sender-recipient relationship; also make triggerNotification surface failures.

**Example implementation:**

```
CREATE TRIGGER notify_reviewer AFTER INSERT OR UPDATE OF review_status ON worksheet_submissions FOR EACH ROW WHEN (NEW.review_status IN ('pending_review','revision_submitted')) EXECUTE FUNCTION notify_assigned_reviewer();
```

> Verifier evidence: schema.sql:281-291 policy requires user_id=auth.uid() OR sender role in reviewer set; joinee role is 'new_joinee' (AuthContext.tsx:169-176), so useAutoSave.ts:148-156 inserts are RLS-denied and swallowed at useNotifications.ts:163. But BuddyDashboard.tsx:72,84-86 lists pending_review submissions directly, so reviews aren't blocked — only bell notifications fail.

### H23 — Due dates computed from hardcoded demo start date (30 days ago) — Phase 1 sheets are born overdue

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** src/hooks/useDueDates.ts:48-57, 73-81; persisted via src/hooks/useAutoSave.ts:96-99; displayed via src/components/PhaseWorksheetList.tsx:75

**Description:** getDefaultStartDate() reads localStorage key 'onboarding_start_date' — which is never written anywhere in the codebase (only read, verified by grep) — and falls back to Date.now() - 30 days, explicitly commented 'For demo/simulation'. calculateDueDate adds per-worksheet offsets (p1_w1=7d … gc1=30d) to that. So every Phase 1 due date is 0-23 days in the past on day one. useAutoSave freezes this wrong value into worksheet_submissions.due_date on first save, while PhaseWorksheetList recomputes from the rolling '30 days ago' on every render, so displayed and stored due dates also drift apart daily.

**Why it is a problem:** The entire due-date/overdue feature produces false data for every real user, training everyone to ignore deadline indicators; overdue badges and 'due soon' warnings are meaningless in production.

**Steps to reproduce:** Create a fresh joinee, open Phase 1: p1_w1 shows 'Overdue by 23d' before any work has begun; save it and re-open next week — the stored due_date and the list's computed date disagree.

**Root cause:** Demo scaffolding shipped: no real join/start-date source (e.g. user_profiles.start_date or profile created_at) was wired in.

**Suggested fix:** Add a start_date column to user_profiles (default created_at), compute due dates from it, and stop recomputing from a rolling default when a persisted due_date exists.

**Example implementation:**

```
const base = startDate || new Date(profile.start_date ?? profile.created_at);
```

> Verifier evidence: useDueDates.ts:52-57 falls back to Date.now()-30d ("For demo/simulation"); grep shows 'onboarding_start_date' is read at line 54 but written nowhere. useAutoSave.ts:98 and PhaseWorksheetList.tsx:75 both call calculateDueDate/getDueDateInfo with no startDate. Phase 1 offsets 7-30d (lines 24-27) minus 30d base = overdue on day one; stored (frozen, line 121) vs displayed (rolling) values diverge daily.

### H24 — Review state machine has no server-side transition enforcement — joinee can self-approve

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** db/schema.sql:354-374 ('Users can update own submissions' and 'Reviewers can update submissions' policies)

**Description:** The own-row UPDATE policy's WITH CHECK permits any review_status in the full enum, including 'buddy_approved' and 'approved', and no trigger enforces transition order or reviewer identity. Separately, the reviewer policy grants onboarding_lead full UPDATE rights even though the UI (PhaseReview.tsx:251-255, WorksheetReview.tsx:72) treats that role as read-only monitoring.

**Why it is a problem:** Every client-side state machine rule (buddy-then-manager order, gate readiness, phase locking, promotion eligibility) can be bypassed with one API call; the 'read-only' onboarding lead can also rewrite any submission.

**Steps to reproduce:** As a new_joinee, run supabase.from('worksheet_submissions').update({ review_status: 'approved' }).eq('user_id', myId) from the browser console — the update succeeds, marking all sheets manager-approved, unlocking Phase 2/3 (PhaseAccessGuard) and satisfying checkAndPromote's criteria.

**Root cause:** State machine lives entirely in client code; RLS validates role and value membership but not transitions.

**Suggested fix:** Add a BEFORE UPDATE trigger validating (old.review_status -> new.review_status) against an allowed-transition table keyed by get_user_role(), and drop onboarding_lead from the reviewer UPDATE policy.

**Example implementation:**

```
IF NOT is_allowed_transition(OLD.review_status, NEW.review_status, public.get_user_role()) THEN RAISE EXCEPTION 'illegal transition'; END IF;
```

> Verifier evidence: schema.sql:358-364 WITH CHECK allows own-row review_status='approved'; only triggers are updated_at (240-251) and handle_new_user (377). schema.sql:366-374 gives onboarding_lead full UPDATE while WorksheetReview.tsx:72 sets isReadOnly=isOnboardingLead and PhaseReview.tsx:251-255 shows a read-only banner. Older policies (__fix_rls_jwt.sql:55) lack WITH CHECK entirely.

### M34 — FTP gate-pass buttons dead-end on 'Invalid Gate Pass' page

**Severity:** Medium _(adversarially verified: DOWNGRADED to this severity)_

**Location:** src/pages/BuddyDashboard.tsx:22-30, :361-365 vs src/pages/BuddyGatePass.tsx:25-29, :55-68

**Description:** BuddyDashboard's GATE_INFO advertises seven gates including FTP gates w1_g1, w2_g1, w3_g1, w4_g1, and renders 'fill gate pass' buttons that navigate to /buddy/gate-pass/:userId/:gateId. But BuddyGatePass's GATE_COMPONENTS maps only gc1, gc2, gc3, so any FTP gate renders the 'Invalid Gate Pass — No gate component found' screen. GateArtifact1-4 accept a targetUserId prop but are never mounted in buddy mode anywhere.

**Why it is a problem:** The FTP track's gate approval workflow is unreachable through the primary UI affordance; buddies must know to use the generic /buddy/review/:userId/w1_g1 route instead. The feature the dashboard promises does not exist.

**Steps to reproduce:** As a buddy whose joinee has all Week-1 sheets buddy_approved, click 'Gate 1 — Anchor Artifacts' on the buddy dashboard → 'Invalid Gate Pass' error page.

**Root cause:** GATE_COMPONENTS map was not extended when FTP gates (GateArtifact1-4) were added.

**Suggested fix:** Register the FTP gate components in BuddyGatePass's GATE_COMPONENTS map (they already support targetUserId).

**Example implementation:**

```
const GATE_COMPONENTS = { gc1: GateControl1, gc2: GateControl2, gc3: GateControl3, w1_g1: GateArtifact1, w2_g1: GateArtifact2, w3_g1: GateArtifact3, w4_g1: GateArtifact4 };
```

> Verifier evidence: BuddyGatePass.tsx:25-29 lacks w1_g1-w4_g1 so BuddyDashboard.tsx:365 buttons hit the Invalid Gate Pass screen (:55-68) — confirmed. But weeklyWorksheets.ts:29 + WeekWorksheetPage.tsx:25 let joinees submit wN_g1 themselves, and BuddyDashboard.tsx:211 links buddies to /buddy/review/:uid/w1_g1 (ReviewContent.tsx:650), so the approval workflow is reachable; only the buddy-fill button is broken.

### M35 — Stale-tab autosave can silently revert a buddy approval and wipe reviewer fields

**Severity:** Medium

**Location:** src/hooks/useAutoSave.ts:77-83 (warn-only conflict handling), :88-94 (review_status recomputed from stale _savedReviewStatus), :116-118 (reviewed_by/reviewed_at/reviewer_name overwritten)

**Description:** Conflict detection compares updated_at but only console.warns and 'saves anyway (last-write-wins)'. review_status is recomputed from the tab's stale _savedReviewStatus, so a joinee tab loaded while the sheet was needs_revision/revision_submitted will, on its next autosave after the buddy approves, upsert review_status back to 'revision_submitted' and set reviewed_by/reviewed_at/reviewer_name from its stale (null) local fields — undoing the approval with no user-visible warning.

**Why it is a problem:** Approvals intermittently 'disappear', requiring buddies to re-review; review audit fields are corrupted; the race is invisible except in the console.

**Steps to reproduce:** Joinee opens a needs_revision worksheet and leaves the tab open; buddy approves the resubmission in another session; joinee types one character — autosave downgrades buddy_approved back to revision_submitted and nulls reviewed_by.

**Root cause:** Client-computed review_status on every upsert + last-write-wins policy with no server authority over review columns.

**Suggested fix:** On detected conflict, re-fetch and merge server review fields before saving (or abort and prompt reload); never write review_status/reviewed_* columns from the joinee's save path — let only reviewer actions touch them.

**Example implementation:**

```
if (current && current.updated_at !== savedAt) { const fresh = await loadWorksheetData(...); data._savedReviewStatus = fresh.review_status; }
```

### M36 — Manager can 'approve phase' while worksheets are unsubmitted or in needs_revision

**Severity:** Medium

**Location:** src/pages/PhaseReview.tsx:174-180 (canApprove), :88-93 (handleApprovePhase), :277-279 (banner text)

**Description:** canApprove = isManager && buddyApproved.length > 0 && pending.length === 0. Worksheets with review_status 'needs_revision' and worksheets never submitted (no row) do not block approval. The banner then claims 'All N worksheet(s) in this phase have been buddy-approved' where N counts only the buddy_approved subset. handleApprovePhase upgrades only those, leaving the phase partially approved.

**Why it is a problem:** Managers are told a phase is complete when it is not; partial approvals create submissions stuck in mixed states, 'phase approved' toasts/notifications fire while the phase never unlocks the next one (isPhaseApproved requires all sheets approved), confusing everyone downstream.

**Steps to reproduce:** Joinee submits 1 of Phase 2's 5 sheets, buddy approves it, the other 4 are untouched: PhaseReview shows 'Phase 2 Ready for Manager Approval' and the manager can approve.

**Root cause:** canApprove checks only pending_review/revision_submitted counts, ignoring needsRevision and notSubmitted which are computed two lines earlier.

**Suggested fix:** Require needsRevision.length === 0 && notSubmitted.length === 0 in canApprove (matching getPhaseReviewStatus's ready = buddyApproved === total), and fix the banner copy.

**Example implementation:**

```
const canApprove = isManager && isAllBuddyApproved && needsRevision.length === 0 && notSubmitted.length === 0;
```

### M37 — reviewed_by audit column wiped on every joinee save after a review

**Severity:** Medium

**Location:** src/hooks/useWorksheet.ts:123-132 (loads _savedReviewedAt/_savedReviewerName but never _savedReviewedBy) + src/hooks/useAutoSave.ts:103,116 (reviewed_by: reviewedBy || null)

**Description:** useAutoSave always includes reviewed_by in the upsert, sourced from data._savedReviewedBy. Regular worksheets never populate that key on load (only gate controls set it in buddy mode), so every joinee autosave after a buddy review writes reviewed_by = NULL while keeping reviewer_name/reviewed_at.

**Why it is a problem:** The FK-backed audit trail of who reviewed a submission is destroyed in the common revision path; only the free-text reviewer_name and review_history JSONB remain.

**Steps to reproduce:** Buddy requests revision (reviewed_by set, WorksheetReview.tsx:177); joinee opens the sheet and types — next autosave sets worksheet_submissions.reviewed_by to NULL.

**Root cause:** Asymmetric hydration: the loader hydrates 3 of the 4 review passthrough fields.

**Suggested fix:** Hydrate _savedReviewedBy in useWorksheet's load, or better, omit reviewed_by/reviewed_at/reviewer_name from the upsert payload when the saver is not a reviewer.

**Example implementation:**

```
_savedReviewedBy: saved.reviewed_by || '', // in useWorksheet.ts:130
```

### M38 — Worksheet flips to 'revision_submitted' on first keystroke of a revision, not on resubmit

**Severity:** Medium

**Location:** src/hooks/useAutoSave.ts:88-91 with src/hooks/useWorksheet.ts:222-229

**Description:** After needs_revision, worksheet_data.status remains 'submitted' from the original submission (nothing resets it to In Progress), and the form is editable (isSubmitted excludes needs_revision). The autosave formula maps status==='submitted' && _savedReviewStatus==='needs_revision' to 'revision_submitted', so the very first debounced autosave — one character typed — marks the sheet as re-submitted in the buddy's queue.

**Why it is a problem:** Buddies review half-edited drafts believing the joinee finished; the explicit 'Submit' action and its toast are meaningless in the revision loop; review queue counts are inflated.

**Steps to reproduce:** Buddy requests revision; joinee opens the sheet and edits a single field; within 1.5s the buddy dashboard shows it as 'Re-submitted' (pending), and handleBuddyApprove accepts it (WorksheetReview.tsx:100 allows revision_submitted).

**Root cause:** Submission intent is inferred from a persisted status flag rather than an explicit resubmit action; status is never reset when a revision begins.

**Suggested fix:** When loading a needs_revision worksheet (or on first edit), reset status to 'In Progress' so only handleSubmit's explicit status='submitted' triggers the revision_submitted transition.

**Example implementation:**

```
if (saved.review_status === REVIEW_STATUS.NEEDS_REVISION) merged.status = SUBMISSION_STATUS.IN_PROGRESS;
```

### M39 — Two conflicting definitions of phase completeness (p1_w7 orphaned, FTP sheets inconsistently required)

**Severity:** Medium

**Location:** src/config/worksheetConfigData.ts:565-574 (PHASE_WORKSHEETS_MAP) vs src/pages/BuddyDashboard.tsx:22-31 (GATE_INFO.regularSheets); src/hooks/useAutoPromote.ts:41-49

**Description:** PHASE_WORKSHEETS_MAP[1] = 12 ids (legacy minus p1_w7, plus FTP w1_o1/w1_e1/w1_o2/w1_g1). BuddyDashboard's GATE_INFO[1].regularSheets = the 8 legacy sheets including p1_w7 and excluding all FTP sheets. So gate-pass readiness, joinee-side gate checks (useGateControl uses PHASE map), PhaseAccessGuard/phase approval, and auto-promotion (all 23 PHASE-map sheets) each require different worksheet sets. p1_w7 is required for buddy gate readiness and Week-3 access (WK_WORKSHEETS_MAP[2]:401) but never for phase approval or promotion.

**Why it is a problem:** Buddies, managers, and joinees see contradictory 'ready/complete' signals; progression can stall (gate offered but unsatisfiable) or skip required work depending on which code path evaluates it.

**Steps to reproduce:** Get the 8 legacy Phase-1 sheets buddy_approved but no FTP sheets: buddy dashboard offers the gc1 gate pass, yet the joinee's own gc1 submit is blocked demanding w1_o1/w1_e1/w1_o2/w1_g1; conversely a joinee can be promoted having never completed p1_w7.

**Root cause:** FTP-track worksheets were merged into PHASE_WORKSHEETS_MAP without updating BuddyDashboard's hardcoded GATE_INFO or reconciling p1_w7's removal.

**Suggested fix:** Derive GATE_INFO.regularSheets from PHASE_WORKSHEETS_MAP (minus the gate id) as the single source of truth, and either restore p1_w7 to the phase map or remove it from GATE_INFO/WK map.

**Example implementation:**

```
regularSheets: PHASE_WORKSHEETS_MAP[1].filter(id => id !== 'gc1')
```

### L16 — FTP gates skip prerequisite verification entirely

**Severity:** Low

**Location:** src/hooks/useGateControl.ts:135-155 (phase parse) with src/pages/gate-controls/GateArtifact1.tsx:26 (phase: 'week-1'); src/components/WeekAccessGuard.tsx:101-110

**Description:** useGateControl's prerequisite check parses parseInt(phase.replace('phase','')) — for FTP gates phase is 'week-1', yielding NaN, so the check is skipped (and would look up an undefined PHASE_WORKSHEETS_MAP entry anyway). Combined with WeekAccessGuard accepting mere status==='submitted', a joinee can submit all four week gates and unlock Weeks 2-4 with zero completed or reviewed work — artifacts are self-attested checkboxes.

**Why it is a problem:** The FTP track's gates provide no gating; 'gate' semantics exist only for legacy gc1-gc3, undermining the progression model the product advertises.

**Steps to reproduce:** Fresh joinee: open /week-1/worksheet/w1_g1 (or its gate page), tick required checkboxes, submit — succeeds with no week-1 worksheets even started.

**Root cause:** Phase-string convention drift ('phase1' vs 'week-1') plus no week-scoped prerequisite map wired into the hook.

**Suggested fix:** Extend the completion check to parse 'week-N' and validate against WK_WORKSHEETS_MAP[N] (excluding the gate itself), with the same fail-closed behavior.

**Example implementation:**

```
const m = phase.match(/^(phase|week)-?(\d+)$/); const ids = m[1]==='week' ? WK_WORKSHEETS_MAP[+m[2]] : PHASE_WORKSHEETS_MAP[+m[2]];
```

### L17 — GateArtifact1 Submit button silently does nothing when required artifacts are unchecked

**Severity:** Low

**Location:** src/pages/gate-controls/GateArtifact1.tsx:93-96 (contrast GateArtifact2.tsx:101, GateArtifact3.tsx:65, GateArtifact4.tsx:68)

**Description:** GateArtifact1's Submit onClick does `if (!allRequiredMet) { return; }` — no error state is set, and the inline error div only renders when `!allRequiredMet && submitError`, but submitError is never set on this path. GateArtifact2-4 instead disable the button (visible affordance). So on Gate 1 the button looks active but clicking it produces no feedback at all.

**Why it is a problem:** Joinees stall at the first FTP gate believing the app is broken; inconsistent behavior across the four sibling pages.

**Steps to reproduce:** Open /week-1's Gate 1 artifacts page with a required artifact unchecked and click 'Submit Gate': nothing happens, no message shown.

**Root cause:** Validation-feedback pattern diverged between GateArtifact1 and its siblings.

**Suggested fix:** Match GateArtifact2-4: disable the button when !allRequiredMet (or set submitError before returning).

**Example implementation:**

```
<button disabled={submitting || !allRequiredMet} onClick={handleSubmit} ...>
```

## UI — score 60/100

The app has a coherent custom "lux" design system with tokens, skeletons, empty states, focus-visible and reduced-motion support, and a working mobile nav drawer. However, a login-page link points to a route that does not exist, the core worksheet forms use fixed 3-5 column input grids with no responsive handling (unusable on phones), and every dashboard swallows fetch errors and renders misleading "Not Started"/empty states instead. PWA additions are cosmetic: the maskable icon is not maskable-safe and there is no service worker despite standalone display.

**Done well:** Token-based design system with keyboard focus-visible outlines and prefers-reduced-motion support (src/styles/index.css:192-224, 589-597) · Skeleton loading states on Dashboard, AdminDashboard, OnboardingLeadDashboard, Phase1, BuddyGatePass plus Suspense PageFallback for lazy admin routes (src/App.tsx:51-60) · Real empty states with actionable guidance text (src/pages/BuddyDashboard.tsx:315, src/pages/AdminDashboard.tsx:270, src/components/NotificationBell.tsx:195) · Mobile nav drawer with 850px breakpoint and sign-out confirmation flow in both desktop and mobile menus (src/components/Navbar.tsx:389-391, 228-262, 341-385) · Standardized disabled/loading button treatment: .lux-btn:disabled (src/styles/index.css:185), spinner + label swap during sign-out/sign-in (Navbar.tsx:251-252, Login.tsx:105-107)

### H25 — Login page links to /forgot-password, a route that does not exist

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** src/pages/Login.tsx:125 (link); src/App.tsx:98-147 (route table has no /forgot-password; falls through to catch-all at :146)

**Description:** Login renders a 'Forgot password?' Link to /forgot-password, but App.tsx defines no such route and no reset-password page exists anywhere in src/pages. The link falls into the `*` catch-all and renders NotFound.

**Why it is a problem:** Any user who forgets their password hits a 404 dead end from the login screen. There is no password recovery path at all, so locked-out employees need manual admin intervention. This is a broken link on the single most-trafficked page.

**Steps to reproduce:** Open /login, click 'Forgot password?'. NotFound page renders.

**Expected behavior:** Link opens a working password-reset request form

**Current behavior:** Link → catch-all → 404 NotFound

**Root cause:** Link added before the reset flow was built; route and page were never created.

**Suggested fix:** Either build a ForgotPassword page using supabase.auth.resetPasswordForEmail plus an update-password page for the recovery redirect, and register both routes; or remove the link until the flow exists.

**Example implementation:**

```
<Route path="/forgot-password" element={<ForgotPassword />} />
```

> Verifier evidence: src/pages/Login.tsx:125 renders `<Link to="/forgot-password">`; src/App.tsx:98-146 route table has no /forgot-password route, so it hits the `*` catch-all (line 146, NotFound). No reset page exists in src/pages and grep finds no `resetPasswordForEmail` anywhere — no recovery path except Google OAuth.

### H26 — Worksheet form tables use fixed 3-5 column input grids with no responsive collapse or overflow container — unusable on mobile

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** src/pages/worksheets/Phase1Worksheet7.tsx:31-56 ('1.8fr 1.2fr 0.8fr 0.8fr 1.8fr'); also Phase1Worksheet1.tsx:45,63, Phase1Worksheet4.tsx:37,52, Phase1Worksheet5.tsx:33, Phase1Worksheet8.tsx:30, Phase2Worksheet1.tsx:32,45, Phase3Worksheet3.tsx:36; container src/components/WorksheetPage.tsx:126

**Description:** Worksheet rows are inline-styled CSS grids of 3-5 columns containing text inputs and a 5-star rating widget, inside a 720px container. There is no media query, no column collapse, and no overflow-x wrapper (zero `overflow-x` occurrences in src/**/*.tsx, zero Tailwind sm:/md:/lg: prefixes in the entire codebase). The only responsive CSS shipped is for .phase-ws-row, .grid-2 and section padding (styles/index.css:363-586).

**Why it is a problem:** New hires filling 17 worksheets — the core product flow — get ~35-60px-wide inputs on a 360px phone; the 0.8fr star-rating cell needs ~110px (5 x 22px buttons) and forces row overflow/horizontal page scroll. Star tap targets are ~22px, well under the 44px minimum. The primary user journey is effectively desktop-only while the app ships a PWA manifest inviting mobile install.

**Steps to reproduce:** Open /phase-1/worksheet-7 at 360-390px viewport width; observe squished inputs and horizontal overflow on the Courseware Review Log rows.

**Expected behavior:** Rows stack or scroll gracefully below ~640px; tap targets >=44px

**Current behavior:** Fixed fr-column grids, no breakpoints, no scroll container

**Root cause:** Layouts built with hardcoded inline gridTemplateColumns; the design system's responsive utilities (.grid-2 collapse) were never applied to worksheet tables.

**Suggested fix:** Add a shared .ws-grid class (or wrap rows in an overflow-x:auto container with min-width) and a max-width:640px media query collapsing rows to stacked label/input pairs; enlarge star buttons to >=44px tap targets on touch.

**Example implementation:**

```
@media (max-width:640px){ .ws-grid{ grid-template-columns:1fr !important; } }
```

> Verifier evidence: Phase1Worksheet7.tsx:31,37 inline 5-col grid '1.8fr 1.2fr 0.8fr 0.8fr 1.8fr' with 22px star buttons (lines 43-51); WorksheetPage.tsx:126 720px container, no overflow wrapper; only overflowX in repo is ReviewContent.tsx:185 (reviewer view); index.css media queries (529-586) cover only .grid-2/.phase-ws-row/paddings; index.html:8 ships PWA manifest. Pattern repeats in ~13 worksheets.

### M40 — Dashboard and BuddyDashboard swallow fetch errors and render misleading 'Not Started' / empty states

**Severity:** Medium _(adversarially verified: DOWNGRADED to this severity)_

**Location:** src/pages/Dashboard.tsx:55-68 (catch → console.error, finally setLoading(false)); Dashboard.tsx:71-72 getWorksheetStatus defaults to 'Not Started'; src/pages/BuddyDashboard.tsx:77-81 (same pattern) with empty state at :315

**Description:** loadSubmissions/loadData catch network or Supabase errors, log to console only, and clear the loading flag. No error state is stored or rendered. On failure, Dashboard shows every worksheet as 'Not Started' with 0% progress, and BuddyDashboard shows 'No instructors assigned yet. Ask an admin to assign joinees…'.

**Why it is a problem:** A transient network/RLS failure makes a new hire believe all their submitted/approved work vanished, and makes a buddy believe they have no assignees — a false instruction to contact an admin. No retry affordance; user must guess to refresh.

**Steps to reproduce:** Block requests to *.supabase.co (devtools offline) and load /. Skeleton resolves to a dashboard where all 17 worksheets read 'Not Started'.

**Expected behavior:** Visible error banner with retry; never present failure as empty data

**Current behavior:** Errors logged to console; UI shows false empty/Not-Started data

**Root cause:** catch blocks only console.error; UI has no error branch distinct from the genuine empty branch.

**Suggested fix:** Add loadError state set in catch; render a lux-alert-error banner with a Retry button instead of the normal/empty content when set. Distinguish 'fetched empty' from 'fetch failed'.

> Verifier evidence: Dashboard.tsx:57-62 destructures only `data`, ignores Supabase `error` (which doesn't throw), so submissions=[] renders 'Not Started' (line 72) with no error UI. BuddyDashboard.tsx:63-76 same; empty state at line 315 as claimed. But BuddyDashboard.tsx:143-149 has a Refresh button, refuting 'no retry affordance'; failure is transient and self-heals on reload.

### M41 — Global footer renders 'Faculty Onboarding Programme' twice on every page

**Severity:** Medium

**Location:** src/App.tsx:194-195

**Description:** Two identical <p style={{fontSize:'0.65rem',...}}>Faculty Onboarding Programme</p> lines are rendered back-to-back in the app-wide footer, a leftover from the recent rebrand commit.

**Why it is a problem:** Visible duplicated text in the chrome of every single page (all roles, all routes) — an obvious polish defect that undermines perceived quality for a launch-branded product.

**Steps to reproduce:** Load any page; scroll to footer.

**Expected behavior:** Subtitle appears once

**Current behavior:** Subtitle appears twice

**Root cause:** Line duplicated during the NST BLR - AARAMBH rebrand edit.

**Suggested fix:** Delete one of the two <p> elements at App.tsx:194-195.

### M42 — PWA maskable icon is not maskable-safe; icon pipeline only generates full-bleed 'any' icons

**Severity:** Medium

**Location:** public/manifest.json:18-23 (icon-512.png declared purpose 'maskable'); scripts/generate-icons.mjs:18-22 (SIZES all purpose 'any', plain resize of favicon.svg); public/favicon.svg (text 'NST'/'AARAMBH' and rule at y=72 span x=30-70, rounded-rect rx=12 background)

**Description:** The manifest reuses the full-bleed icon-512.png as the maskable icon. It is generated by directly rasterizing favicon.svg with no safe-zone padding: the rounded-rect corners are transparent and the AARAMBH text/underline sit near the 80%-safe-zone boundary. Android adaptive masks (circle/squircle) will crop corners and can clip content; transparent corners show as background-colored notches.

**Why it is a problem:** Installed-app icon looks broken/cropped on Android launchers — the most visible artifact of the new PWA effort. Lighthouse PWA audit flags non-maskable maskable icons.

**Steps to reproduce:** Run Lighthouse PWA audit or maskable.app editor with /icon-512.png; observe cropping outside the safe zone.

**Expected behavior:** Separate maskable asset with content inside the 80% safe zone

**Current behavior:** Same full-bleed transparent-corner PNG serves 'any' and 'maskable'

**Root cause:** generate-icons.mjs never produces a padded maskable variant, but manifest.json claims one.

**Suggested fix:** Generate a dedicated icon-512-maskable.png with the logo scaled to ~66-80% on a solid #1A1A1A full-bleed square (sharp extend/composite), reference it for purpose 'maskable', and keep the current file for 'any'.

### M43 — Notification dropdown and toast stack overflow the viewport on small phones

**Severity:** Medium

**Location:** src/components/NotificationBell.tsx:140-153 (position:absolute; right:0; width:'360px'); src/components/Toast.tsx:104-109 (position:fixed; right:'24px'; width:'100%'; maxWidth:'400px')

**Description:** The notification panel is a fixed 360px wide, right-anchored to the bell which sits ~16px from the viewport edge — on 360px-wide phones it extends ~16px past the left edge (worse at 320px). The toast container computes width:100% of the viewport (360px) but is offset right:24px, so toasts are clipped 24px off the left edge on 360px screens.

**Why it is a problem:** Notification text and toast messages (including submit success/failure feedback) are partially cut off and unreadable on common small devices; toasts also lack a left inset so they can cover the full screen width awkwardly.

**Steps to reproduce:** At 360px viewport: open the bell dropdown; trigger a toast (submit a worksheet offline). Observe horizontal clipping.

**Expected behavior:** Overlays clamp to viewport width minus margins

**Current behavior:** Fixed 360px/400px overlays overflow narrow viewports

**Root cause:** Fixed pixel widths and width:100% with a right offset, no max-width guard against small viewports.

**Suggested fix:** Use width:min(360px, calc(100vw - 32px)) for the dropdown and left:24px/right:24px + width:auto (or maxWidth:calc(100vw - 48px)) for the toast container.

**Example implementation:**

```
width: 'min(360px, calc(100vw - 32px))'
```

### L18 — Two different brand golds: hardcoded #D4A853 conflicts with --color-gold token #D4AF37

**Severity:** Low

**Location:** src/components/Navbar.tsx:117,128 and src/App.tsx:193 and public/favicon.svg (#D4A853) vs src/styles/index.css:13 (--color-gold: #D4AF37) used by lux-btn overlay, badges, star ratings, nav hover

**Description:** The rebranded logo mark, header wordmark 'NST', and footer use hardcoded #D4A853, while the rest of the UI (nav link hover at Navbar.tsx:153, gold badges, button overlays, star ratings) uses the token #D4AF37. Both golds appear simultaneously in the header on hover.

**Why it is a problem:** Subtle brand inconsistency across every page; future theming changes to --color-gold will silently miss the logo/footer, deepening drift.

**Expected behavior:** Single gold sourced from the token

**Current behavior:** #D4A853 (brand marks) and #D4AF37 (token) coexist

**Root cause:** Rebrand introduced a new gold hex inline instead of updating the design token.

**Suggested fix:** Pick one gold: either update --color-gold to #D4A853 or replace the hardcoded hexes with var(--color-gold); also align favicon.svg when regenerating icons.

### L19 — Installable standalone PWA has no service worker and depends on render-blocking Google Fonts CDN

**Severity:** Low

**Location:** public/manifest.json:7 (display: standalone); no service worker registration anywhere in src/ or public/ (verified — only manifest + icons shipped); index.html:11-13 (fonts.googleapis.com stylesheet); index.html head also lacks <meta name="theme-color"> and <meta name="description">

**Description:** The manifest invites installation as a standalone app, but no service worker exists, so an installed app launched offline shows a bare browser network error inside an app frame. Playfair Display/Inter load from Google CDN at runtime; if slow or blocked, the serif-heavy editorial design falls back to system fonts (visible FOUT). Head metadata for theme-color/description is missing despite manifest theme_color.

**Why it is a problem:** Poor first impression for installed users offline or on flaky campus networks; Lighthouse PWA/SEO checks fail; typography — the core of this design language — degrades unpredictably.

**Expected behavior:** Offline-capable install or non-standalone manifest; self-hosted fonts

**Current behavior:** Manifest-only PWA, CDN fonts, missing head meta

**Root cause:** PWA work stopped at manifest+icons; fonts were never self-hosted.

**Suggested fix:** Either add a minimal service worker (e.g. vite-plugin-pwa) with an offline fallback page, or drop display:standalone. Self-host the two font families (fontsource packages) and add theme-color/description meta tags.

### L20 — Toasts are not announced to assistive technology

**Severity:** Low

**Location:** src/components/Toast.tsx:104-136 (toast container and items have no role/aria-live)

**Description:** The toast stack — used for worksheet submission failures (useWorksheet.ts:213), phase promotion, and review actions — renders plain divs with no aria-live region, role="status", or role="alert". Only the dismiss button has an aria-label.

**Why it is a problem:** Screen-reader users receive no notification that a submission failed or succeeded; error toasts auto-dismiss, so critical feedback is silently lost for AT users.

**Expected behavior:** Toasts announced via ARIA live region

**Current behavior:** Visually-only toasts

**Root cause:** Toast system built without ARIA live-region semantics.

**Suggested fix:** Add aria-live="polite" (and role="alert" for error type) to the toast container or individual toast elements.

**Example implementation:**

```
<div role="status" aria-live="polite" ...>
```

## UX & Accessibility — score 58/100

The app has real UX polish in places (loading skeletons, toast system, autosave with retry, sign-out confirmation, role-context banners) but ships several production-blocking gaps: a dead "Forgot password" link with no reset flow, zero confirmation on irreversible one-click approvals that can trigger role promotion, an autosave indicator that is built but never rendered, and a manager workflow dead-end with no rejection path. Accessibility is thin (13 aria attributes app-wide, unassociated form labels on all 17 worksheets, mouse-only notification items, unannounced toasts).

**Done well:** Loading skeletons on Dashboard, PhaseReview, WorksheetReview instead of spinners (Dashboard.tsx:114-167, PhaseReview.tsx:189-215) · Sign-out has an inline two-step confirmation (Navbar.tsx:228-231, 342-348) · Autosave with conflict warning, retry/backoff, and error toast bridge for non-React code (useAutoSave.ts:63-189, utils/errorHandling.ts) · Clear role-context banners on review pages: read-only explanations for onboarding lead and manager (WorksheetReview.tsx:326-336, PhaseReview.tsx:251-255) · Good empty/edge states: 'Worksheet Not Submitted' with guidance (WorksheetReview.tsx:260-274), named-field validation errors (useWorksheet.ts:179-186), buddy pre-action state validation (WorksheetReview.tsx:99-102)

### H27 — Dead 'Forgot your password?' link — no password reset flow exists

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** src/pages/Login.tsx:125 (Link to="/forgot-password"); src/App.tsx:98-146 (no such route; falls to * -> NotFound at :146)

**Description:** Login renders a 'Forgot your password?' link to /forgot-password, but no route, page, or supabase.auth.resetPasswordForEmail call exists anywhere in src/. The link lands on the 404 page.

**Why it is a problem:** Any user who forgets their password hits a dead end at the front door and is locked out unless they have Google OAuth. This is the single most common auth recovery path and it is broken.

**Steps to reproduce:** Open /login, click 'Forgot your password?' -> NotFound page renders.

**Expected behavior:** Link opens a working email-based reset flow.

**Current behavior:** Link navigates to the 404 catch-all.

**Root cause:** Link was added without implementing the reset page/route.

**Suggested fix:** Add a /forgot-password page calling supabase.auth.resetPasswordForEmail(email, { redirectTo }) plus a /reset-password page for the recovery callback; or remove the link until built.

> Verifier evidence: src/pages/Login.tsx:125-130 renders Link to="/forgot-password"; src/App.tsx:98-146 has no such route, so it hits the catch-all NotFound (line 146). grep of src/ shows zero resetPasswordForEmail calls and no ForgotPassword page; email/password signup exists (Signup.tsx), so lockout is real absent Google OAuth.

### H28 — Manager has no rejection path — buddy-approved work can only be approved or silently stalled

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** src/pages/WorksheetReview.tsx:71 (canApprove = isBuddy only), :282 (canBuddyAct), :396 (action panel buddy-only); src/pages/PhaseReview.tsx:270-293 (only 'Approve Phase' action exists)

**Description:** Once a worksheet is buddy_approved, the manager (academic_head) can view it but has no UI to request revision or reject it — WorksheetReview's action panel is gated to buddies, and PhaseReview offers only bulk approve. The state machine supports needs_revision from any reviewer, but no manager-facing control emits it.

**Why it is a problem:** A manager who disagrees with a buddy approval has no in-app recourse: they must approve substandard work or leave the joinee stuck indefinitely with no feedback, defeating the two-tier review design.

**Steps to reproduce:** As academic_head open /admin/review/:userId/:worksheetId for a buddy_approved sheet — no Approve/Request Revision buttons render (canBuddyAct is false).

**Expected behavior:** Manager can send a buddy-approved worksheet back with a comment.

**Current behavior:** Manager's only action anywhere is bulk 'Approve Phase'.

**Suggested fix:** Add a 'Request Revision' (and optionally per-worksheet approve) action for academic_head on buddy_approved sheets in WorksheetReview, reusing handleBuddyRevision with manager identity; surface it in PhaseReview's per-worksheet rows too.

> Verifier evidence: WorksheetReview.tsx:71 (canApprove=isBuddy only), :282/:396 (action panel buddy-gated), :72/:334 (manager explicitly view-only). PhaseReview.tsx:180,270-293 (manager's sole action is bulk approve). Grep confirms needs_revision is written only at WorksheetReview.tsx:176 via the buddy panel; buddy_approved state is terminal even for the buddy (line 100 validation).

### M44 — No confirmation on irreversible one-click approvals (bulk phase approve, buddy approve, worksheet submit)

**Severity:** Medium _(adversarially verified: DOWNGRADED to this severity)_

**Location:** src/pages/PhaseReview.tsx:280-285 (Approve Phase button -> handleApprovePhase:83); src/pages/WorksheetReview.tsx:417-422 (Approve (Buddy)); src/config/worksheetComponents.tsx:190 (Submit for Review)

**Description:** The only confirmation in the app is sign-out (Navbar.tsx:228). 'Approve Phase N' bulk-approves every buddy_approved worksheet, fires notifications, and can auto-promote the user's role (checkAndPromote, PhaseReview.tsx:157) in one click. Buddy approve and worksheet submit (which locks the form) are equally single-click, and no un-approve/withdraw UI exists anywhere.

**Why it is a problem:** A single misclick permanently advances the review state machine — including changing a user's role — with no confirmation and no undo path in the UI. Recovering requires direct DB edits.

**Steps to reproduce:** As academic_head open /admin/review-phase/:userId/1 when all sheets are buddy_approved; click 'Approve Phase 1' once — all sheets become approved immediately.

**Expected behavior:** Irreversible actions require explicit confirmation.

**Current behavior:** One click commits; only sign-out is confirmed.

**Suggested fix:** Add a confirm dialog (native confirm() at minimum, ideally an accessible modal summarizing scope: 'Approve 8 worksheets for Jane? This may promote them.') before phase approve, buddy approve/revision, and worksheet submit.

**Example implementation:**

```
if (!window.confirm(`Approve all ${toApprove.length} worksheets for ${instructor?.full_name}? This cannot be undone.`)) return;
```

> Verifier evidence: PhaseReview.tsx:280/83/157 one-click bulk approve + role change confirmed, no confirm/undo UI (only Navbar.tsx:228). But WorksheetReview.tsx:97-103 state-validates buddy approve and manager gate backstops it; accidental submits are recoverable in-app via revision request (useWorksheet.ts:222-229 unlocks form on needs_revision). Only the gated, self-describing manager phase-approve is truly irreversible.

### M45 — Autosave status is invisible — SaveIndicator built but never rendered

**Severity:** Medium _(adversarially verified: DOWNGRADED to this severity)_

**Location:** src/config/worksheetComponents.tsx:103 (WorksheetHeader destructures only icon/title/subtitle/badge, drops saveStatus); :153 (SaveIndicator defined, zero usages per grep); src/components/WorksheetPage.tsx:128 (passes saveStatus into the prop that ignores it)

**Description:** WorksheetPage passes saveStatus to WorksheetHeader, but WorksheetHeader's destructuring omits it and SaveIndicator is dead code — grep shows no render site in the app. Users filling any of the 17+ worksheets get no 'Saving…/Saved' feedback; the 'error' state is only surfaced via a generic 'Auto-save failed:' toast (useAutoSave.ts:168).

**Why it is a problem:** Users cannot tell whether their work is persisted, so they either lose trust (re-typing, screenshotting) or close the tab within the 1.5s debounce window and silently lose the last edit — there is also no beforeunload guard (zero matches in src/).

**Steps to reproduce:** Open /phase-1/worksheet-1, type in a field — no save indicator ever appears in the header.

**Expected behavior:** Persistent, visible saving/saved/failed indicator on every autosaved form.

**Current behavior:** No indicator anywhere; save failures only appear as a transient toast.

**Root cause:** WorksheetHeader prop interface includes saveStatus (line 22) but the implementation never wired it to SaveIndicator.

**Suggested fix:** Render <SaveIndicator status={saveStatus} /> in WorksheetHeader next to the badge, and add a beforeunload listener while a debounced save is pending.

**Example implementation:**

```
export function WorksheetHeader({ icon: Icon, title, subtitle, badge, saveStatus }: WorksheetHeaderProps) { ... {badge && ...} <SaveIndicator status={saveStatus} /> }
```

> Verifier evidence: worksheetComponents.tsx:103 drops saveStatus; :153 SaveIndicator has zero usages; WorksheetPage.tsx:128 passes it into the void; no beforeunload in src/. But errors are NOT silent: useAutoSave.ts:168 toasts via notifyError (errorHandling.ts:32) and retries 2x (:174-180). Silent loss limited to one 1.5s debounce window (:201). UX defect, not data-integrity failure.

### M46 — Submitted/approved worksheets hide the user's own answers

**Severity:** Medium

**Location:** src/components/WorksheetPage.tsx:85-105 (early returns BuddyApprovedView/ApprovedView/SubmittedView); src/config/worksheetComponents.tsx:201-247 (views render only a message and a Back button)

**Description:** As soon as a worksheet is submitted (or approved), the page replaces the entire form with a status card containing only a message and a Back button. The new hire can never re-read what they wrote, and during needs_revision the reviewer's comment is shown but the joinee cannot compare against a prior submission snapshot.

**Why it is a problem:** Users lose access to their own work product for the rest of onboarding; when a revision request arrives days later, they cannot review what was originally submitted without asking a reviewer to screen-share.

**Steps to reproduce:** Submit any Phase 1 worksheet, revisit its URL — only 'Worksheet Submitted' text renders; form data is inaccessible.

**Expected behavior:** Submitted content remains viewable read-only.

**Current behavior:** Content is completely hidden after submission.

**Suggested fix:** Render the status banner above a read-only version of the form (or reuse ReviewContent, which already renders worksheet_data for reviewers) instead of replacing the page.

**Example implementation:**

```
if (isSubmitted) return <><SubmittedBanner/><ReviewContent data={data} worksheetId={worksheetId}/></>;
```

### M47 — Form labels not programmatically associated with inputs on any worksheet

**Severity:** Medium

**Location:** src/config/worksheetComponents.tsx:131-140 (FieldGroup: label htmlFor={id || undefined}, input rendered as sibling child); e.g. src/pages/worksheets/Phase2Worksheet1.tsx:30,57,58 (zero id= attributes in file)

**Description:** FieldGroup only sets htmlFor when an id prop is passed and does not wrap the control in the label. Worksheet pages pass no ids (grep shows 0 'id=' in e.g. Phase2Worksheet1.tsx), so every input/textarea across the 17 phase worksheets plus FTP sheets is unlabeled for assistive tech; required-ness is conveyed only by a visual red asterisk.

**Why it is a problem:** Screen-reader users hear 'edit text, blank' for every field — the core data-entry flow of the product is effectively unusable with AT; also breaks label-click focus, hurting all users on small targets.

**Expected behavior:** Every form control has an accessible name.

**Current behavior:** htmlFor is undefined everywhere; labels are decorative siblings.

**Suggested fix:** Make FieldGroup wrap children in the <label>, or auto-generate an id via useId() and clone it onto the child; add aria-required for required fields.

**Example implementation:**

```
const autoId = useId(); return <div><label htmlFor={id ?? autoId}>...</label>{cloneElement(child, { id: id ?? autoId, 'aria-required': required })}</div>
```

### M48 — 'Phase Locked' screen flashes for users who have legitimately unlocked the phase

**Severity:** Medium

**Location:** src/components/PhaseAccessGuard.tsx:54 (useState(false) for checking), :89-91 (locked view when canAccessPhase fails on empty submissions); contrast WeekAccessGuard.tsx:62 (correctly starts checking=true)

**Description:** PhaseAccessGuard initializes checking=false and submissions=[]; the first render (before the effect sets checking=true) evaluates canAccessPhase(user, phase, []) which returns false for phases 2-3 (worksheetConfigData.ts:703-712), so the full-screen 'Phase 2 Locked' view renders for a frame(s) before the query resolves. WeekAccessGuard already implements the correct pattern.

**Why it is a problem:** Every navigation into Phase 2/3 by an eligible user flashes a punitive 'Locked — complete Phase 1' screen, which reads as a data-loss/regression bug and erodes trust in the gating system.

**Steps to reproduce:** As a joinee with Phase 1 fully approved, navigate to /phase-2 — locked view flashes before content.

**Expected behavior:** Loading placeholder until access is known.

**Current behavior:** Locked screen renders first, then flips to content.

**Suggested fix:** Initialize checking based on whether a query is needed: useState(phaseNum > 1), matching WeekAccessGuard.

**Example implementation:**

```
const [checking, setChecking] = useState(phaseNum > 1);
```

### M49 — Toasts and notification dropdown are inaccessible: no aria-live, mouse-only notification items, no Escape/aria-expanded

**Severity:** Medium

**Location:** src/components/Toast.tsx:104-109 (toast container lacks role="status"/aria-live); src/components/NotificationBell.tsx:203-215 (notification rows are <div onClick> with no role/tabIndex/onKeyDown), :99-116 (trigger lacks aria-expanded/aria-haspopup)

**Description:** All success/error feedback is delivered via toasts that screen readers never announce (container has no live region). Notification list items are plain divs — unreachable and unactivatable by keyboard. Dropdowns (bell, user menu) close only on outside click, not Escape, and expose no expanded state. App-wide there are only 13 aria-* attributes.

**Why it is a problem:** Keyboard and AT users cannot perceive submit/approve outcomes or open their notifications — the primary feedback and workflow-routing channels of the app.

**Expected behavior:** Announcements for async feedback; full keyboard operability of menus.

**Current behavior:** Silent toasts; mouse-only notification items.

**Suggested fix:** Add role="status" aria-live="polite" to the toast container; render notification rows as <button>; add aria-expanded/aria-haspopup and Escape-to-close on bell and user menu.

**Example implementation:**

```
<div role="status" aria-live="polite" style={{position:'fixed',...}}>{toasts...}</div>
```

### M50 — Reviewers and admins land on the new-hire onboarding dashboard after login

**Severity:** Medium

**Location:** src/pages/Dashboard.tsx:169-431 (no role branching — renders 'Welcome to Your Onboarding Journey', phase roadmap, 'Start Phase 1' quick links for every role); src/pages/Login.tsx:29 (navigate to '/'); src/App.tsx:121

**Description:** The / route renders the same joinee-oriented dashboard for all five roles. An academic_head or onboarding_lead logs in and sees a personal 30-60-90 roadmap with their own (empty) progress, 'Start Phase 1' and 'Final Assessment' quick links; their actual work queue lives at /admin, /buddy or /onboarding-lead behind navbar links (Navbar.tsx:64-66).

**Why it is a problem:** The daily-driver screen for reviewers is irrelevant and misleading (implies they must do onboarding themselves); pending reviews — the time-sensitive queue — require an extra discovery step on every session.

**Expected behavior:** Post-login landing matches the user's primary job.

**Current behavior:** All roles see the new-hire journey page.

**Suggested fix:** In Dashboard, branch on profile.role and redirect (or render) the role's home: academic_head -> /admin, lead_instructor -> /buddy, onboarding_lead -> /onboarding-lead.

**Example implementation:**

```
if (profile?.role === 'academic_head') return <Navigate to="/admin" replace />;
```

### M51 — Contradictory progress signals: phase card can show 100% while the next phase stays locked

**Severity:** Medium

**Location:** src/pages/Dashboard.tsx:83-90 (getPhaseProgress counts buddy_approved as done), :92 (overall progress counts only approved), :99-111 (unlock requires isPhaseApproved = all 'approved', worksheetConfigData.ts:667-677)

**Description:** Three different completion definitions coexist on one screen: phase progress bars count buddy_approved as complete, the overall progress bar counts only manager-approved, and phase unlocking requires manager approval. A joinee whose Phase 1 is fully buddy-approved sees 'Phase 1: 8/8' at 100% while Phase 2 says 'Complete Phase 1 to unlock' and overall shows 0/17. Labels also drift: the same 'approved' state is 'Reviewed' on the dashboard (line 73) but 'Approved (Manager)' in reviews (WorksheetReview.tsx:285).

**Why it is a problem:** Users conclude the gate is broken and file support requests ('I finished Phase 1 but Phase 2 is locked'), because nothing explains the buddy-vs-manager distinction at the point of confusion.

**Expected behavior:** Progress, unlock state, and labels tell one consistent story.

**Current behavior:** 100% progress next to a locked next phase with no explanation.

**Suggested fix:** Use one completion definition (manager-approved) for both bars, or show a two-segment bar (buddy vs manager approved); when 100% buddy-approved but locked, show 'Awaiting manager phase approval' instead of the generic lock reason; unify status vocabulary.

### L21 — 'Approve Phase' panel copy and gating ignore needs_revision / not-submitted worksheets

**Severity:** Low

**Location:** src/pages/PhaseReview.tsx:179 (isAllBuddyApproved = buddyApproved>0 && pending===0 — excludes needs_revision and notSubmitted), :277-279 (copy: 'All N worksheet(s) in this phase have been buddy-approved')

**Description:** The manager approval panel appears when there are zero pending sheets, even if some are needs_revision or never submitted, and its copy claims 'All … buddy-approved. Approving will mark all worksheets in this phase as fully approved' — while handleApprovePhase only upgrades the buddy_approved subset. Error/success routing also relies on emoji/string matching ('✅', 'Error') at :287.

**Why it is a problem:** Managers can 'approve the phase' believing it is complete while sheets are missing or in revision, producing phases that are simultaneously 'approved' and unfinished — confusing joinees and corrupting progress displays downstream.

**Expected behavior:** Approval affordance appears only when the phase is genuinely complete, with accurate copy.

**Current behavior:** Panel shows and claims completeness with incomplete phases.

**Suggested fix:** Require buddyApproved.length + alreadyApproved.length === wsList.length before showing the panel, or change the copy to '{n} of {total} worksheets are buddy-approved; {m} outstanding' with an explicit warning.

### L22 — Cosmetic/copy defects: duplicated footer line and misleading 'Cancel' on autosaved forms

**Severity:** Low

**Location:** src/App.tsx:194-195 (identical 'Faculty Onboarding Programme' <p> twice); src/config/worksheetComponents.tsx:187-189 (Cancel button just navigates; data already autosaved)

**Description:** The global footer renders 'Faculty Onboarding Programme' twice on every page. On worksheet forms, a 'Cancel' button sits beside 'Submit for Review', implying edits will be discarded — but useAutoSave has already persisted them 1.5s after typing, so Cancel neither discards nor warns.

**Why it is a problem:** Footer duplication looks unfinished on every single page; the Cancel label misrepresents autosave semantics, causing users to believe they reverted changes they actually kept.

**Expected behavior:** Single footer tagline; button label matches actual behavior.

**Current behavior:** Duplicate line ships in the rebrand commit; Cancel silently keeps all edits.

**Suggested fix:** Delete the duplicate footer line; rename 'Cancel' to 'Back' (data is saved) or implement true discard-to-last-submitted behavior.

## React Patterns — score 52/100

The app has solid scaffolding — route-level ErrorBoundary with location-key reset, lazy+Suspense on admin pages, memoized AuthContext, and consistent effect cleanup. But the core data hooks are unsafe: useAutoSave fires a DB write on every page open with no dirty check, silently mutating the review state machine and firing false notifications; handleSubmit double-saves and double-notifies; and checkAndPromote corrupts the approving manager's own auth role. These are shipping-blocker state-management defects hiding behind clean-looking hook code.

**Done well:** Route-level ErrorBoundary (src/components/ErrorBoundary.tsx) that auto-resets on location.key change (App.tsx:97) · Lazy loading + Suspense for all 6 heavy admin/review pages (App.tsx:26-31, 105-118) · AuthContext value fully memoized with useCallback'd actions (AuthContext.tsx:243-253), limiting context re-render blast radius · Effects consistently use cleanup: cancelled flags (useWorksheet.ts:117-148), clearInterval (useNotifications.ts:95-98), timer refs (PhaseReview.tsx:51-53), mountedRef guards · StrictMode enabled (main.tsx:7) and shared useWorksheet hook removes ~60 lines of boilerplate per worksheet page

### H29 — Auto-save fires on every page open (no dirty check), mutating review state machine on mere view

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** src/hooks/useAutoSave.ts:88-94,127-131,191-203; src/hooks/useWorksheet.ts:115-149

**Description:** After hydration sets loaded=true, the debounce effect (useAutoSave.ts:191-203) sees hasRealData (the five _saved* keys alone exceed the >2-key threshold) and schedules save() 1.5s after mount with zero user edits. save() recomputes review_status: a 'needs_revision' worksheet flips to 'revision_submitted' (line 88-91) just by being opened, and 'revision_submitted' downgrades to 'pending_review' (falls through to line 91). isNewSubmission (127-131) excludes pending/approved/buddy_approved/revision_submitted but NOT needs_revision, so opening also fires a fake 'revision submitted' notification to reviewers. Buddy mode is worse: BuddyGatePass (BuddyGatePass.tsx:122 → useGateControl targetUserId → useWorksheet overrideUserId) writes to the JOINEE's row when the buddy merely views the gate page.

**Why it is a problem:** The review state machine advances without user action: joinees 'resubmit' by opening a page, 'Re-submitted' badges vanish, reviewers get phantom notifications, first visit to any worksheet creates a DB row (breaking 'Not Started' status), and every view bumps updated_at, defeating the last-write-wins conflict detection.

**Steps to reproduce:** Buddy marks worksheet needs_revision. Joinee opens the worksheet and touches nothing. After 1.5s the row's review_status = 'revision_submitted' and the buddy receives a 'ready for review' notification.

**Expected behavior:** Auto-save only after a user-initiated edit; review_status transitions only on explicit submit

**Current behavior:** save scheduled whenever data changes after load, including the hydration render

**Root cause:** The autosave effect keys off data identity + loaded, with no isDirty flag distinguishing hydration from user edits, and save() re-derives review_status on every write.

**Suggested fix:** Add a dirtyRef set only in updateField/updateArrayItem/setData-from-UI; skip the effect until dirty. Move review_status transition logic out of auto-save into flushSave/handleSubmit only. Disable auto-save entirely in overrideUserId (viewer) mode unless the buddy actually edits.

**Example implementation:**

```
const dirtyRef = useRef(false); // set true in updateField
if (!dirtyRef.current) return; // in autosave effect
```

> Verifier evidence: useAutoSave.ts:196-201 schedules save() post-hydration (five _saved keys always satisfy >2-key check, no dirty flag); :88-91 flips needs_revision→revision_submitted and revision_submitted→pending_review since WorksheetReview.tsx:175-195 never resets worksheet_data.status from 'submitted'; :127-131 omits needs_revision → phantom notification; useGateControl.ts:92 + useWorksheet.ts:105-111 make buddy views write the joinee's row.

### H30 — handleSubmit double-saves and sends duplicate reviewer notifications on every submission

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** src/hooks/useWorksheet.ts:191-217; src/hooks/useAutoSave.ts:126-157,191-203

**Description:** handleSubmit calls setData(submitData) then await flushSave(submitData). The setData re-render re-runs the autosave effect (deps include worksheetData), which schedules a second save() 1.5s later with the same submitData. In that second save, data._savedReviewStatus is still the stale pre-submit value (nothing updates it after flushSave), so isNewSubmission (useAutoSave.ts:127-131) evaluates true again and the reviewer-notification loop (148-156) runs a second time.

**Why it is a problem:** Every worksheet submission performs two upserts and notifies each reviewer twice (or more with retries), inflating the notifications table and training reviewers to ignore the bell. Combined with finding 2's phantom notifications, notification integrity is unreliable.

**Steps to reproduce:** Submit any worksheet while watching the network tab: one upsert immediately from flushSave, a second identical upsert ~1.5s later, and two INSERTs into notifications for the assigned reviewer.

**Expected behavior:** One write and one notification per submit

**Current behavior:** setData + flushSave both feed the same debounced pipeline; notification condition uses stale _savedReviewStatus

**Root cause:** flushSave clears the pending timer (line 206) but cannot prevent the effect from re-arming after the setData-triggered re-render; save() has no idempotency marker for the notification.

**Suggested fix:** After a successful flushSave, update data._savedReviewStatus to the computed newReviewStatus (setData) so the follow-up save is a no-op for notifications; or track lastSavedRef (serialized data) and skip the effect when unchanged since last save.

**Example implementation:**

```
// in handleSubmit after flushSave:
setData(prev => ({ ...prev, _savedReviewStatus: 'pending_review' }));
```

> Verifier evidence: useWorksheet.ts:202-203 setData then flushSave; useAutoSave.ts:191-203 effect re-runs on new worksheetData reference and schedules save(submitData) after flushSave already cleared the timer; nothing updates _savedReviewStatus post-flush, so isNewSubmission (useAutoSave.ts:127-131) is true again and the loop at 148-156 re-fires; triggerNotification (useNotifications.ts:154) is a bare insert with no dedup.

### M52 — checkAndPromote updates the MANAGER's own auth metadata role, not the joinee's

**Severity:** Medium _(adversarially verified: DOWNGRADED to this severity)_

**Location:** src/hooks/useAutoPromote.ts:69-71, called from src/pages/PhaseReview.tsx:157

**Description:** checkAndPromote(userId) promotes the joinee's user_profiles row, then calls supabase.auth.updateUser({ data: { role: 'lead_instructor' } }). auth.updateUser always operates on the CURRENT session — and the only caller is PhaseReview, run by the academic_head/onboarding_lead. So the approving manager's own user_metadata.role is overwritten to 'lead_instructor'.

**Why it is a problem:** get_user_role() in RLS (db/schema.sql:321-333) COALESCEs app_metadata then user_metadata role, and AuthContext's metadata fallback (AuthContext.tsx:80) reads the same field — the manager who approves the final phase silently loses admin privileges in both RLS and the client UI. Meanwhile the joinee's auth metadata is never updated, so their metadata-fallback role stays stale.

**Steps to reproduce:** As academic_head, approve the last buddy_approved phase for a joinee whose other phases are approved. Inspect the manager's JWT user_metadata: role is now lead_instructor. Refresh under RLS-recursion fallback: manager sees buddy UI.

**Expected behavior:** Role promotion in auth metadata done server-side (edge function / trigger with service role) for the target userId; never via the caller's session

**Current behavior:** supabase.auth.updateUser({ data: { role: 'lead_instructor' } }) inside manager-invoked flow

**Root cause:** checkAndPromote was written assuming the joinee's own session runs it, but the only call site is the manager's PhaseReview flow; supabase.auth.updateUser has no target-user parameter client-side.

**Suggested fix:** Remove the auth.updateUser call from checkAndPromote. Promote via a Postgres trigger on user_profiles.role change or a service-role edge function keyed to the target userId. Client-side, at most call refreshProfile() for the joinee on next login.

**Example implementation:**

```
// useAutoPromote.ts — delete lines 68-75; add DB trigger:
// CREATE TRIGGER sync_role AFTER UPDATE OF role ON user_profiles ... (service context)
```

> Verifier evidence: useAutoPromote.ts:69 does overwrite the manager's session metadata (sole caller PhaseReview.tsx:157, academic_head-gated at :56). But 'lead_instructor' is in every privileged RLS list (schema.sql:70,77,193,209,289), and AuthContext reads role from user_profiles (metadata fallback only on recursion errors, AuthContext.tsx:60-66) — so no admin privilege is actually lost; it is silent metadata corruption with latent risk.

### M53 — Auto-save wipes reviewed_by audit column because _savedReviewedBy is never hydrated

**Severity:** Medium

**Location:** src/hooks/useAutoSave.ts:103,116; src/hooks/useWorksheet.ts:123-132

**Description:** The upsert payload always includes reviewed_by: reviewedBy || null (useAutoSave.ts:116), where reviewedBy comes from data._savedReviewedBy. useWorksheet's hydration (123-132) restores _savedReviewStatus, _savedReviewerName, _savedReviewedAt, _savedUpdatedAt — but never _savedReviewedBy. So after a buddy approval writes reviewed_by (WorksheetReview.tsx:107-127), the next auto-save from the joinee's session (which fires on mere page open per finding 2) overwrites reviewed_by with null.

**Why it is a problem:** The reviewer-attribution audit trail in worksheet_submissions.reviewed_by is silently destroyed as soon as the joinee revisits the worksheet; any reporting, RLS logic, or dispute resolution relying on reviewed_by sees null.

**Steps to reproduce:** Buddy approves p1_w1 (reviewed_by set). Joinee opens /phase-1/worksheet-1, waits 2s. Row now has reviewed_by = null while review_status is still buddy_approved.

**Expected behavior:** Review-metadata columns untouched by joinee auto-saves

**Current behavior:** reviewed_by: reviewedBy || null unconditionally in every upsert

**Root cause:** Asymmetric round-trip: three review columns are mirrored into _saved* keys on load, the fourth (reviewed_by) is written but never read back, and the upsert coerces its absence to null instead of omitting the field.

**Suggested fix:** Hydrate _savedReviewedBy in useWorksheet's load effect, and/or omit reviewed_by/reviewed_at/reviewer_name keys from the upsert payload when undefined instead of sending null.

**Example implementation:**

```
if (reviewedBy !== undefined) payload.reviewed_by = reviewedBy; // omit, don't null
```

### M54 — Auto-save retry rethrows inside an un-awaited setTimeout, causing unhandled promise rejections

**Severity:** Medium

**Location:** src/hooks/useAutoSave.ts:174-186

**Description:** On failure, save() schedules save(data) inside setTimeout (line 176-180) without awaiting or catching it. When retries exhaust (retryCountRef > 2), the recursive call hits `throw err` (line 185) inside a promise nobody handles — an unhandled rejection. The comment claims callers can 'catch and show proper errors', but timer-initiated retries have no caller. The retry timers are also never stored in timerRef, so they can't be cancelled when the user navigates away mid-backoff (only mountedRef stops the invocation; the pending timer itself leaks).

**Why it is a problem:** In production, exhausted retries surface as console unhandled-rejection noise (crashing error-reporting budgets) while the UI silently shows a stale 'error' badge; the user gets no toast or actionable failure signal for persistent save failures.

**Steps to reproduce:** Block network, edit a worksheet field, wait ~9s for 3 failed saves. Browser logs 'Uncaught (in promise)' from useAutoSave.

**Expected behavior:** Retry chain fully handled; terminal failure surfaces via notifyError/toast, never as an unhandled rejection

**Current behavior:** setTimeout(() => { save(data); }, backoff) with terminal throw

**Root cause:** Fire-and-forget recursive retry mixed with a throw-based error contract designed for the awaited flushSave path.

**Suggested fix:** In the retry timeout, call save(data).catch(e => notifyError('Auto-save failed permanently:', e)); store the retry timer in a ref and clear it in the unmount cleanup; only rethrow when the call originated from flushSave (pass a flag).

**Example implementation:**

```
retryTimerRef.current = setTimeout(() => { void save(data).catch(err => notifyError('Save failed', err)); }, backoff);
```

### M55 — All 38+ worksheet page components are eagerly bundled via worksheetConfig; code splitting only covers admin pages

**Severity:** Medium

**Location:** src/config/worksheetConfig.tsx:38-80; src/App.tsx:33; src/hooks/useAutoSave.ts:3

**Description:** worksheetConfig.tsx statically imports every Phase1-3 worksheet, all gate controls, and all FTP week components (42 imports), plus the 802-line worksheetConfigData.ts (35KB). App.tsx imports ALL_WORKSHEETS/WORKSHEET_COMPONENTS from it at module scope, and even useAutoSave imports getReviewerType from the same module — so the entire worksheet suite lands in the initial bundle for every visitor, including reviewers/admins who can never open those routes (role-gated to new_joinee/lab_instructor at App.tsx:91). The lazy() treatment (App.tsx:26-31) covers only 6 admin pages.

**Why it is a problem:** Initial JS payload carries dozens of unreachable page components and a 35KB config for every role; login page users pay the full cost. Undermines the PWA/mobile goals of the recent manifest work.

**Expected behavior:** Route metadata separate from components; components loaded per-route via React.lazy

**Current behavior:** WORKSHEET_COMPONENTS: Record<string, FC> of statically imported components

**Root cause:** Route config (ids/titles/paths) and component references live in one module, forcing static imports of every page to build the route table.

**Suggested fix:** Split worksheetConfig into pure-data metadata (ids, titles, phases) and a lazy component map: WORKSHEET_COMPONENTS[id] = lazy(() => import(...)). Wrap dynamic worksheet routes in the existing Suspense fallback. Move getReviewerType's data dependency into a components-free module so useAutoSave stops pulling the page graph.

**Example implementation:**

```
const WORKSHEET_COMPONENTS = { p1_w1: lazy(() => import('../pages/worksheets/Phase1Worksheet1')), ... };
```

### L23 — PhaseAccessGuard flashes the 'Phase Locked' screen to authorized users on first render

**Severity:** Low

**Location:** src/components/PhaseAccessGuard.tsx:54,77-93 (contrast WeekAccessGuard.tsx:64)

**Description:** checking is initialized to false and allSubmissions to []. For phase 2/3, the first render (before the effect runs) evaluates canAccessPhase(user.id, phaseNum, []) which is false, so PhaseLockedView renders for one paint, then flips to 'Loading…', then to content. WeekAccessGuard gets this right by initializing checking=true.

**Why it is a problem:** Users with legitimate access see a 'Phase Locked — complete all worksheets' full-page flash on every navigation into phase 2/3 worksheets, which reads as a bug and erodes trust in the gating UI.

**Steps to reproduce:** As a joinee with Phase 1 approved, navigate to /phase-2/worksheet-1 on a throttled connection; the Locked view renders before the loading state.

**Expected behavior:** Guard renders loading until the access check resolves

**Current behavior:** const [checking, setChecking] = useState(false)

**Root cause:** Loading state defaults to 'not checking' so the deny branch is reachable before the async check starts.

**Suggested fix:** Initialize checking to phaseNum > 1 (mirroring WeekAccessGuard), or gate the locked view behind a 'checked' flag.

**Example implementation:**

```
const [checking, setChecking] = useState(phaseNum > 1);
```

### L24 — Toast context value recreated every render — all useToast consumers re-render on each toast lifecycle

**Severity:** Low

**Location:** src/components/Toast.tsx:102

**Description:** ToastContext.Provider receives an inline object ({ showToast, removeToast, clearToasts }) even though all three callbacks are stable useCallbacks. Every toasts state change (add, rAF entering-flip, exit, remove — 4 renders per toast) creates a new context value identity, re-rendering every component that calls useToast, which includes every worksheet page via useWorksheet (useWorksheet.ts:188) and dashboards.

**Why it is a problem:** Each toast triggers ~4 wasted re-renders of large form pages while the user may be typing; harmless at current scale but a needless blast radius for a provider wrapping the whole app (App.tsx:176).

**Expected behavior:** Stable context value; toast list state kept out of the consumer-facing context

**Current behavior:** value={{ showToast, removeToast, clearToasts }}

**Root cause:** Context value not memoized despite stable members.

**Suggested fix:** Wrap the value in useMemo (deps: the three callbacks). The toast list is already rendered inside the provider itself, so consumers never need re-rendering.

**Example implementation:**

```
const value = useMemo(() => ({ showToast, removeToast, clearToasts }), [showToast, removeToast, clearToasts]);
```

### L25 — Dead 'progressUpdate' event bus and duplicated footer line in App.tsx

**Severity:** Low

**Location:** src/App.tsx:155-171 (dead listener), src/App.tsx:194-195 (duplicate line)

**Description:** App.tsx maintains progress state fed by a window 'progressUpdate' CustomEvent listener, but no code anywhere in src dispatches that event (verified via grep: only the addEventListener/removeEventListener hits). Navbar's progress prop is therefore permanently whatever was in localStorage. Separately, the footer renders 'Faculty Onboarding Programme' twice on consecutive lines — a copy/paste render bug visible on every page.

**Why it is a problem:** Dead global-event state management misleads maintainers into thinking a progress pipeline exists; the duplicated footer text is a visible cosmetic defect on all pages.

**Expected behavior:** No dead event plumbing; footer line rendered once

**Current behavior:** Unused CustomEvent listener + <p>Faculty Onboarding Programme</p> rendered twice

**Root cause:** Progress feature's dispatch side was removed (or never built) while the listener remained; footer line duplicated during rebrand edit.

**Suggested fix:** Delete the progress state/effects and Navbar prop (or implement dispatching where progress actually changes), and remove the duplicated <p> at App.tsx:195.

**Example implementation:**

```
// delete App.tsx:155-171 and line 195
```

## Edge Cases & Race Conditions — score 32/100

The review pipeline is riddled with race conditions and state-corruption edge cases because every transition is a client-side read-modify-write with no DB-level guards. Worst: merely opening an approved or needs-revision worksheet silently rewrites its review_status via autosave, and auto-promotion mutates the wrong user's auth metadata (the manager's own session). Submission failures are reported as success, concurrent reviewers can regress each other's decisions, and multi-write operations are non-atomic with duplicate side effects on retry. Guards that do exist (submit guard, debounce cleanup, mounted refs) are good but cover the minor cases, not the dangerous ones.

**Done well:** useGateControl has a submitGuardRef preventing double-submit and React StrictMode double-invocation (src/hooks/useGateControl.ts:117-121) · Worksheet load effect uses a cancelled flag to prevent state updates after rapid navigation/unmount (src/hooks/useWorksheet.ts:117-148) · Gate prerequisite check fails CLOSED on query error, denying submission when prerequisites can't be verified (src/hooks/useGateControl.ts:51-55) · Autosave has retry-with-backoff, mountedRef guards, and debounce timer cleanup on unmount (src/hooks/useAutoSave.ts:57-61, 174-180, 202) · A conflict-detection read of server updated_at exists before each autosave write, and triggerNotification swallows its own errors so notification failures never block the primary write (src/hooks/useAutoSave.ts:68-84, src/hooks/useNotifications.ts:151-165)

### C10 — Opening an approved or needs-revision worksheet silently rewrites its review_status via autosave

**Severity:** Critical _(adversarially verified: CONFIRMED)_

**Location:** src/hooks/useAutoSave.ts:88-94 and 191-203; src/hooks/useWorksheet.ts:111; src/components/WorksheetPage.tsx:71-104; db/schema.sql:354-364

**Description:** useAutoSave's review_status derivation handles NEEDS_REVISION and BUDDY_APPROVED in the status==='submitted' branch but not APPROVED, so approved falls through to PENDING_REVIEW. The autosave effect fires ~1.5s after load with no user edit (hasRealData is true for any saved sheet). WorksheetPage's early-return ApprovedView only affects rendering — the hook still runs and upserts. RLS explicitly allows the owner to write 'pending_review' (schema.sql:362).

**Why it is a problem:** A joinee (or buddy via gate pages with overrideUserId) merely viewing a manager-approved worksheet for 1.5s demotes it to pending_review and nulls reviewed_by, breaking auto-promotion counts, phase gates, and dashboards. Viewing a needs_revision worksheet flips it to revision_submitted with zero changes AND fires a 'revision_submitted' notification to the buddy (savedRS===needs_revision is not in the isNewSubmission exclusion list at lines 127-131), so reviewers re-review untouched work.

**Steps to reproduce:** 1) Manager phase-approves p1_w1 (review_status='approved', worksheet_data.status='submitted'). 2) Joinee navigates to /phase-1/worksheet-1 and waits 2 seconds. 3) Query worksheet_submissions: review_status is now 'pending_review', reviewed_by NULL. Repeat with a needs_revision sheet: it becomes 'revision_submitted' and the buddy gets a re-review notification.

**Expected behavior:** Autosave never runs for terminal/reviewed states, never fires without a user edit, and never regresses review_status; transitions enforced by a DB trigger.

**Current behavior:** newReviewStatus for status==='submitted': needs_revision→revision_submitted, buddy_approved→buddy_approved, everything else (including 'approved')→pending_review; save scheduled on first render after load.

**Root cause:** Autosave fires on data load (not just on user edits) and recomputes review_status client-side from stale _saved* keys; the 'submitted' branch omits the APPROVED case despite the comment at line 86 claiming approved is preserved.

**Suggested fix:** Add APPROVED passthrough in the submitted branch; add a dirty-flag so autosave only fires after an actual updateField call; skip autosave entirely when _savedReviewStatus is approved/buddy_approved/needs_revision (until user edits); enforce legal transitions in a Postgres trigger.

**Example implementation:**

```
const savedRS = data._savedReviewStatus;
if (savedRS === REVIEW_STATUS.APPROVED) return; // never touch approved rows
// and: if (!dirtyRef.current) return; in the debounce effect
```

> Verifier evidence: useAutoSave.ts:88-91 maps saved 'approved' + status 'submitted' to pending_review; approval flows (PhaseReview.tsx:110-118) never clear worksheet_data.status='submitted'. Effect at useAutoSave.ts:196-201 saves 1.5s after load with no edit (hasRealData via _savedReviewStatus). schema.sql:362 lets owner write 'pending_review'. reviewed_by nulled (useWorksheet.ts:123-132 never sets _savedReviewedBy). needs_revision not excluded at lines 127-131 → spurious revision_submitted notification.

### H31 — checkAndPromote calls supabase.auth.updateUser in the manager's session — demotes the manager, never updates the promoted joinee

**Severity:** High _(adversarially verified: DOWNGRADED to this severity)_

**Location:** src/hooks/useAutoPromote.ts:61-75; caller src/pages/PhaseReview.tsx:157; db/schema.sql:321-333, 338-348, 366-374

**Description:** checkAndPromote runs in the manager's browser session (called from PhaseReview after phase approval). supabase.auth.updateUser({data:{role:'lead_instructor'}}) always mutates the CURRENTLY AUTHENTICATED user — the manager — not userId. So the manager's user_metadata.role becomes 'lead_instructor', while the joinee's auth metadata is never updated (only their user_profiles row).

**Why it is a problem:** get_user_role() (schema.sql:321-333) reads JWT metadata: after the first promotion, the manager's RLS role degrades to lead_instructor — losing academic_head-only rights, including the role-change WITH CHECK (schema.sql:346), so promoting the NEXT joinee fails. Meanwhile the promoted joinee's JWT still says new_joinee, so the 'Reviewers can update submissions' policy (schema.sql:366-374) rejects all their buddy approvals: UI shows them as buddy (profile.role) but every review write fails. Test at useAutoPromote.test.ts:114 codifies this partial failure as acceptable.

**Steps to reproduce:** As academic_head, approve the final phase for a joinee with all 17 worksheets buddy_approved. Inspect auth.users: the MANAGER's raw_user_meta_data.role is now 'lead_instructor'; the joinee's is unchanged. Log in as the joinee, open a mentee's worksheet as buddy, click Approve — RLS update silently matches 0 rows.

**Expected behavior:** Promotion is a single server-side atomic operation (edge function or SECURITY DEFINER RPC) updating both the profile row and the target user's app_metadata.

**Current behavior:** user_profiles.role updated for userId, auth metadata updated for whoever clicked the button; metadata failure only console.warned.

**Root cause:** auth.updateUser cannot target another user from the client; role promotion of a third party requires a service-role/edge function. Two sources of truth (profile row vs JWT metadata) updated by different actors.

**Suggested fix:** Move promotion to a Supabase Edge Function using the service-role key (admin.updateUserById), or a SECURITY DEFINER function; delete the client-side auth.updateUser call immediately — it is actively harmful.

> Verifier evidence: useAutoPromote.ts:69 does update the manager's user_metadata (no userId; caller PhaseReview.tsx:157, manager-gated at :56/:180). But legacy policies survive section 9: "Admin update profiles" (schema.sql:75-78) permits lead_instructor, so next promotions succeed; "Reviewers update submissions" (schema.sql:207-215) passes assigned buddies via assigned_buddy_id; AuthContext reads profile.role from user_profiles row, so manager UI is intact.

### H32 — Submit reports success even when the save failed — flushSave swallows errors via the retry path

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** src/hooks/useAutoSave.ts:167-188, 205-211; src/hooks/useWorksheet.ts:202-209

**Description:** save()'s catch block schedules a setTimeout retry and returns normally for the first two failures — it only rethrows on the 3rd. flushSave awaits save() once, so on any first failure it resolves successfully and handleSubmit shows the 'submitted for review' success toast. The eventual 3rd-failure throw happens inside a setTimeout callback nobody awaits — an unhandled promise rejection, invisible to handleSubmit.

**Why it is a problem:** A user on flaky/offline network clicks Submit, sees 'Your worksheet has been submitted for review', and closes the tab. Nothing was written; retries died with the page. The worksheet stays In Progress with no notification to reviewers, and the user believes they met their due date. Same applies to gate submissions via useGateControl.handleSubmit (useGateControl.ts:173).

**Steps to reproduce:** DevTools → Network → Offline. Fill a worksheet, click Submit for Review. Success toast appears; the tiny saveStatus indicator flips to 'error' but the toast and Submitted view claim success. Reload while offline-then-online: submission absent from DB.

**Expected behavior:** flushSave rejects if the write did not land (retries awaited inline), so handleSubmit shows the error path.

**Current behavior:** First/second failure: swallowed, background retry. Third: unhandled rejection in a timer. flushSave always resolves.

**Root cause:** Retry logic conflates background autosave (where deferred retry is fine) with explicit submit (where the caller must see the failure). The rethrow only happens on the retry chain, whose promise is detached.

**Suggested fix:** Give save() an options flag: for flushSave, retry inline with await/backoff and rethrow the final error; only use fire-and-forget setTimeout retries for debounced background saves.

**Example implementation:**

```
async function save(data, {throwOnError=false}) { ... catch (err) { if (throwOnError) throw err; scheduleRetry(); } }
const flushSave = (d) => save(d, {throwOnError:true});
```

> Verifier evidence: useAutoSave.ts:174-180 — catch schedules setTimeout retry and returns without throwing for retryCount<=2; flushSave (205-211) resets counter to 0 then awaits save once, so it always resolves on first failure. useWorksheet.ts:203-209 then shows success toast. 3rd-failure throw (185) happens in un-awaited setTimeout call (178); line 169 skips throw entirely if unmounted.

### H33 — Review actions validate against stale mount-time state and write unconditionally — concurrent reviewers regress status and corrupt review_history

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** src/pages/WorksheetReview.tsx:99-102, 121-127, 189-195

**Description:** handleBuddyApprove checks submission.review_status from state loaded at mount, then updates by (user_id, worksheet_id) with no WHERE guard on current status. review_history is rebuilt client-side as [...existingHistory, entry] from that same stale state — a classic lost-update read-modify-write on a JSONB column. handleBuddyRevision (lines 189-195) has the same pattern with no status precondition at all.

**Why it is a problem:** Two buddy tabs (or buddy + manager racing): (a) duplicate history entries or one reviewer's entry silently erased; (b) a buddy with a stale tab can overwrite a manager's 'approved' back to 'buddy_approved' or 'needs_revision', un-approving a completed phase after the joinee may already have been promoted; (c) an approved sheet knocked to needs_revision breaks PhaseAccessGuard/gate math downstream.

**Steps to reproduce:** Open the same worksheet review in two tabs as the assigned buddy. Tab 1: Request Revision. Tab 2 (stale, still shows pending): Approve — succeeds, overwriting needs_revision with buddy_approved and dropping Tab 1's history entry (history array was captured pre-Tab-1).

**Expected behavior:** Update matches only when review_status is still the expected value (check affected row count, refetch and warn on 0), history appended atomically server-side.

**Current behavior:** update(...).eq('user_id',userId).eq('worksheet_id',worksheetId) — no .eq('review_status', expected); history from mount-time snapshot.

**Root cause:** No optimistic concurrency (compare-and-swap on review_status/updated_at) and history appended in the client instead of the database.

**Suggested fix:** Add .eq('review_status', currentStatus) (or .eq('updated_at', loadedAt)) and .select() to detect 0-row updates, then reload and show 'this worksheet changed since you loaded it'. Append history via an RPC using review_history || $1 in SQL.

**Example implementation:**

```
const {data: rows} = await supabase.from('worksheet_submissions').update(update).eq('id', submission.id).eq('review_status', currentStatus).select();
if (!rows?.length) { await loadData(); setActionMessage('State changed — please re-review.'); return; }
```

> Verifier evidence: WorksheetReview.tsx:99-102 validates mount-time state; :123-127 and :191-195 update by (user_id, worksheet_id) with no status guard; :121,189 rebuild review_history from stale state. handleBuddyRevision has no status precondition. RLS (supabase_migration_fix_rls_security.sql:105-115) checks role only, no transition guard; useAutoPromote.ts:49 gates on 'approved', so regression breaks promotion/gating.

### M56 — Every submission triggers duplicate reviewer notifications: debounced autosave re-fires after flushSave with stale _savedReviewStatus

**Severity:** Medium

**Location:** src/hooks/useWorksheet.ts:202-203; src/hooks/useAutoSave.ts:127-157, 191-203

**Description:** handleSubmit calls setData(submitData) then flushSave(submitData). flushSave sends the 'ready for review' notification (isNewSubmission true since _savedReviewStatus is still ''/needs_revision). The setData also re-triggers the autosave effect ([worksheetData] dep), which schedules a second save of identical data 1.5s later. Nothing updates _savedReviewStatus in local state after the flush, so isNewSubmission evaluates true again and inserts a second notification row per reviewer; any further render/edit before leaving the page inserts more.

**Why it is a problem:** Reviewers receive 2+ duplicate notifications for every single submission (multiplied across the manager-fallback list when no assigned reviewer exists — getReviewerUserIds returns ALL users of the role). Notification inbox becomes noise; with the 50-row fetch limit in useNotifications, duplicates crowd out real items.

**Steps to reproduce:** Submit any worksheet, stay on the page 2 seconds, check the notifications table: two identical 'was submitted ... ready for review' rows per reviewer, ~1.5s apart.

**Expected behavior:** Exactly one notification per real ''→pending_review transition.

**Current behavior:** flushSave and the echoed debounce save both compute isNewSubmission=true.

**Root cause:** Post-write local state is never reconciled (_savedReviewStatus stays stale), and notification triggering is derived from that stale flag inside every save, not from an actual state transition.

**Suggested fix:** After a successful save, setData to reflect the new server review_status (e.g. _savedReviewStatus:'pending_review'); better, move notification creation into a DB trigger on review_status transition so it is exactly-once regardless of client behavior.

### M57 — Phase approval is non-atomic and re-clickable: partial failures split the phase, retries duplicate history and notifications

**Severity:** Medium

**Location:** src/pages/PhaseReview.tsx:83-172 (loop 106-134; reload deferred 164-166; actionLoading released 171)

**Description:** handleApprovePhase issues N sequential per-row updates with no transaction. On success, actionLoading is released immediately while loadData is deferred 1.5s, so canApprove (derived from stale submissions state, lines 179-180) keeps the button enabled — a second click, or a partial-failure retry, re-filters the stale array and re-updates rows already approved in the DB, appending duplicate 'phase_approved' history entries, re-sending per-worksheet notifications, and re-running checkAndPromote. If update k of N fails, the phase is left half approved/half buddy_approved with no rollback.

**Why it is a problem:** Double-click or two manager tabs produce duplicated review_history and notification spam; a mid-loop network failure strands the phase in a mixed state where auto-promotion never fires until a manual retry (which then duplicates side effects for the rows that had succeeded).

**Steps to reproduce:** Click 'Approve Phase', click again within 1.5s (button is re-enabled the moment the loop ends). Inspect review_history on any sheet: two 'phase_approved' entries; joinee has duplicate approval notifications.

**Expected behavior:** One atomic, idempotent operation; button stays disabled until state is refetched.

**Current behavior:** for-loop of individual updates; setActionLoading(false) before reload; no .eq('review_status','buddy_approved') guard on the update itself.

**Root cause:** Per-row client-side writes instead of one server-side operation; UI gate derived from state that is only refreshed 1.5s later; no idempotency check before writing.

**Suggested fix:** Replace the loop with a single RPC (UPDATE ... SET review_status='approved', review_history = review_history || $1 WHERE user_id=$2 AND worksheet_id = ANY($3) AND review_status='buddy_approved') and keep actionLoading true until loadData completes; at minimum add the review_status guard to each update.

### M58 — Multi-tab/multi-device autosave conflict is detected then ignored — last write wins with only a console.warn

**Severity:** Medium

**Location:** src/hooks/useAutoSave.ts:68-84 (detection), 123 (unconditional upsert)

**Description:** Before each save the hook fetches server updated_at and compares to the tab's _savedUpdatedAt; on mismatch it logs '[AutoSave] Conflict detected ... Saving anyway (last-write-wins)' and upserts anyway. The check-then-write is also a TOCTOU (another tab can write between the select and the upsert). _savedUpdatedAt is only refreshed on page load, so a long-lived tab always overwrites everything written since it loaded — including a buddy's concurrent edits on gate sheets edited via overrideUserId, where joinee and buddy legitimately share one row.

**Why it is a problem:** A joinee editing in two tabs (or laptop+phone) silently loses whole sections of worksheet_data — the JSONB blob is replaced wholesale, not merged. On gate worksheets, a buddy's milestone updates can be wiped by the joinee's stale tab autosaving 1.5s after any keystroke, with zero user-facing warning.

**Steps to reproduce:** Open the same worksheet in tabs A and B. Type paragraph X in A (autosaves). Type one character in B: B's payload (without X) overwrites the row; only the devtools console mentions the conflict.

**Expected behavior:** On mismatch: block the save, refetch, and surface a user-visible conflict prompt (or merge field-wise); pass updated_at as an optimistic-lock condition.

**Current behavior:** console.warn then upsert.

**Root cause:** Conflict resolution was stubbed as warn-and-proceed; whole-document JSONB upsert makes any concurrent edit destructive.

**Suggested fix:** Make the upsert conditional (RPC: UPDATE ... WHERE updated_at = $expected, insert if absent); on 0 rows, set saveStatus='conflict' and show a banner offering reload/overwrite. Refresh _savedUpdatedAt from every successful save response.

### L26 — Gate prerequisite check is check-then-act with no DB enforcement (TOCTOU) and is skipped entirely for week gates

**Severity:** Low

**Location:** src/hooks/useGateControl.ts:135-155 (check), 136 (parseInt), 30-71 (query); GateArtifact1-4 pass phase 'week-N' (src/pages/gate-controls/GateArtifact1.tsx:26)

**Description:** The 'all phase worksheets buddy_approved/approved' gate is verified client-side, then the submission is written seconds later — a reviewer setting a prerequisite to needs_revision in between (or a stale second tab that passed the check earlier) still lands the gate submit. For week gates, phase='week-1' makes parseInt NaN so the check is bypassed by design-accident. Nothing in RLS or triggers enforces gate prerequisites server-side.

**Why it is a problem:** Gates can be submitted against phases that are no longer complete (e.g., a prerequisite demoted between check and write — which the Critical autosave-demotion bug makes routine). Combined with the joinee's ability to set review_status freely under RLS (schema.sql:354-364), gate integrity is advisory only.

**Steps to reproduce:** Tab A: open gate control after all sheets buddy_approved. Tab B (buddy): request revision on one sheet. Tab A: click Submit — passes, gate recorded despite unmet prerequisite.

**Expected behavior:** Prerequisite validated atomically at write time in the database.

**Current behavior:** Client SELECT then unconditional flushSave; NaN phase skips the check silently.

**Root cause:** Business rule lives only in a client pre-check; window between SELECT and upsert; week-track branch silently no-ops on NaN.

**Suggested fix:** Enforce via a BEFORE INSERT/UPDATE trigger or RPC that re-verifies sibling worksheet statuses in the same transaction; log/deny explicitly (not silently) when phase parsing fails.

