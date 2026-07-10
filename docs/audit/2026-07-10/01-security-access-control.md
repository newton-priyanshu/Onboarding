# Production Readiness Audit — Security & Access Control

_Audit date: 2026-07-10 · Part of the [2026-07-10 audit](./README.md)_

## Security — score 33/100

The authorization model is fundamentally broken: the entire role system trusts client-writable auth user_metadata, so any authenticated user can self-promote to academic_head/admin and read/update all data. RLS also lets users self-approve their own onboarding submissions, defeating the review state machine. Secrets (.env) are git-tracked and seed scripts create live accounts with a public weak password. XSS surface is clean (no dangerouslySetInnerHTML) but the RLS trust model is a hard ship-blocker.

**Done well:** No dangerouslySetInnerHTML / innerHTML / eval usage anywhere in src — React default escaping is intact, XSS surface is low · Only the anon-class publishable key (sb_publishable_) is exposed, not a service_role key; scripts read keys from env rather than embedding them · A prior hardening pass added WITH CHECK clauses and a handle_new_user trigger forcing new_joinee, showing awareness of privilege-escalation risk · get_user_role() correctly prefers server-controlled app_metadata first (though it falls back to client-controlled user_metadata) · npm audit shows only 1 high vuln, and it is a transitive dev-only dependency (undici)

### C01 — Privilege escalation: authorization trusts client-writable user_metadata role

**Severity:** Critical _(adversarially verified: CONFIRMED)_

**Location:** db/schema.sql:68-79 (Admin read/update policies), db/schema.sql:321-333 (get_user_role), src/hooks/useAutoPromote.ts:68-70 (updateUser)

**Description:** The 'Admin read all profiles'/'Admin update profiles' RLS policies read auth.jwt()->'user_metadata'->>'role' directly, and get_user_role() COALESCEs into user_metadata role. user_metadata is fully client-writable: useAutoPromote.ts:68 already calls supabase.auth.updateUser({data:{role:...}}). Any authenticated user can call updateUser({data:{role:'academic_head'}}) and instantly gain read/update on ALL user_profiles and reviewer update on ALL worksheet_submissions.

**Why it is a problem:** Complete authorization bypass. Any signed-up new hire can become admin, read every employee's data, approve/alter any submission, and reassign roles. This is a full account/data takeover and an unconditional ship-blocker.

**Steps to reproduce:** Sign up as new_joinee, then in the browser console run supabase.auth.updateUser({data:{role:'academic_head'}}); refresh — Admin dashboard and all-profiles read/update now succeed.

**Root cause:** Role is stored in and read from client-mutable JWT user_metadata instead of a server-controlled source.

**Suggested fix:** Never trust user_metadata for authz. Base get_user_role() and all admin policies solely on app_metadata (server-set) or on the user_profiles.role column via a SECURITY DEFINER lookup. Remove the client updateUser role write; move promotion to a server-side/Edge Function using the service_role key.

> Verifier evidence: schema.sql:70,77 admin RLS policies test auth.jwt()->'user_metadata'->>'role' and are never dropped by section 9. schema.sql:330 get_user_role() falls back to user_metadata. useAutoPromote.ts:69 shows client can write role into user_metadata via supabase.auth.updateUser, which enters the JWT. Section 9b WITH CHECK only guards the table column, not the JWT metadata these policies read.

### C02 — Review state machine not enforced in DB: users can self-approve submissions

**Severity:** Critical _(adversarially verified: CONFIRMED)_

**Location:** db/schema.sql:354-364 ("Users can update own submissions" WITH CHECK)

**Description:** The own-row UPDATE policy's WITH CHECK permits review_status IN ('','pending_review','needs_revision','revision_submitted','buddy_approved','approved'). It enumerates allowed values but does NOT enforce transition ORDER or block the terminal 'approved' value for the submission owner. A new hire can PATCH their own worksheet_submissions row setting review_status='approved', skipping buddy_approved and reviewer approval entirely.

**Why it is a problem:** The core business control — buddy review then reviewer approval before phase gate/auto-promotion — is defeated. A user can self-complete onboarding, trip useAutoPromote, and get promoted to lead_instructor without any human review.

**Steps to reproduce:** As a new_joinee, PATCH /rest/v1/worksheet_submissions?id=eq.<own row> with {"review_status":"approved"}; it succeeds, then auto-promote fires when all 17 are so set.

**Root cause:** RLS validates the value domain but not the actor-vs-transition, leaving reviewer-only states writable by the owner.

**Suggested fix:** Restrict the owner WITH CHECK to only 'pending_review'/'revision_submitted' (submit/resubmit). Move buddy_approved/approved transitions exclusively to the reviewer policy, and enforce ordering with a BEFORE UPDATE trigger validating OLD.review_status -> NEW.review_status.

> Verifier evidence: schema.sql:358-364 own-row WITH CHECK allows review_status='approved' with no transition ordering; no DB trigger/function enforces order (grep of all db/*.sql). useAutoPromote.ts:47-50 promotes on that self-settable value. Additionally schema.sql:185-187 policy "Update own submissions" has no WITH CHECK.

### H01 — Signup lets the client choose its own role

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** src/context/AuthContext.tsx:170-189 (signUp writes options.data.role and inserts user_profiles with caller role)

**Description:** signUp(email,password,fullName,role) writes the caller-supplied role into auth user_metadata (options.data.role) and inserts a user_profiles row with that role. Although a handle_new_user trigger forces the table row to new_joinee, the user_metadata role persists — and per finding #1 user_metadata drives authorization. So a crafted signup call can bootstrap an elevated role from the very first request.

**Why it is a problem:** An attacker never even needs updateUser: signing up with role:'academic_head' seeds an admin-valued JWT metadata claim that the RLS policies trust.

**Steps to reproduce:** Call supabase.auth.signUp({email,password,options:{data:{role:'academic_head'}}}); the resulting JWT user_metadata.role='academic_head' satisfies the admin RLS policies.

**Root cause:** Role is a client-supplied parameter flowing into the trusted metadata claim.

**Suggested fix:** Do not accept a client role at signup. Ignore options.data.role for authz; set roles only server-side (invite flow / Edge Function with service_role). Remove the client-side user_profiles insert and rely on the trigger.

> Verifier evidence: AuthContext.tsx:174 writes caller role into signUp options.data → JWT user_metadata.role. schema.sql:70,77,111,193 RLS admin policies trust auth.jwt()->'user_metadata'->>'role' directly. handle_new_user (schema.sql:393 / migration:137) only forces the table row to new_joinee, never sanitizes metadata. Migration get_user_role (line 33) still falls back to user_metadata and doesn't drop those admin policies.

### M01 — Seed scripts create live accounts with a hardcoded public weak password

**Severity:** Medium _(adversarially verified: DOWNGRADED to this severity)_

**Location:** scripts/setup/__create_15_users.cjs:25, __seed_30_users.cjs:17, __seed_test_data.cjs:17 (const PASSWORD='Test123!'); confirmation printed at __seed_30_users.cjs:591

**Description:** Multiple seed scripts create real Supabase auth users (up to 30) with the hardcoded password 'Test123!', using the credentials from the git-tracked .env which points at the live project fuoqoryqndtdooujslee. The password is printed to console and committed in the repo.

**Why it is a problem:** If run against production (the default env), dozens of accounts — including reviewer/lead roles — exist with a publicly known password. Combined with the user_metadata privilege-escalation flaw, an attacker who reads this repo can log into a seeded account and then self-promote to admin.

**Steps to reproduce:** Read const PASSWORD in the seed scripts; run node __seed_30_users.cjs with the tracked .env and 30 live users are created with password Test123!.

**Root cause:** Test fixtures use a static weak credential against a production-configured client.

**Suggested fix:** Require an explicit non-production env guard, generate random per-user passwords, never print/commit them, and never point seed scripts at the production project. Delete/rotate any accounts already seeded in the live project.

> Verifier evidence: Password real: __create_15_users.cjs:25, __seed_30_users.cjs:16, __seed_test_data.cjs:17; print at __seed_30_users.cjs:591; git-tracked .env→live fuoqoryqndtdooujslee; repo PUBLIC. But schema.sql:392 trigger forces role='new_joinee' (no lead/reviewer from metadata), and __create_15_users.cjs:142 shows email confirmation is a manual SQL step (anon signUp doesn't confirm), so "loginable prod accounts exist" is conditional/unproven.

### M02 — No security response headers or CSP configured for the deployed SPA

**Severity:** Medium

**Location:** vercel.json (only a catch-all rewrite; no headers block)

**Description:** vercel.json contains only an SPA rewrite. There is no Content-Security-Policy, X-Frame-Options/frame-ancestors, X-Content-Type-Options, Referrer-Policy, or Strict-Transport-Security. No service worker is present either.

**Why it is a problem:** Absence of CSP and X-Frame-Options leaves the app open to clickjacking and gives no defense-in-depth against injected script if any XSS is later introduced; missing HSTS weakens transport hardening.

**Steps to reproduce:** curl -I the deployed URL — none of the standard security headers are returned.

**Root cause:** Deployment config never defined security headers.

**Suggested fix:** Add a headers block in vercel.json setting a strict CSP (default-src 'self'; connect-src the Supabase origin), frame-ancestors 'none', X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, and Strict-Transport-Security.

### L01 — .env with live Supabase project URL and key committed to git

**Severity:** Low _(adversarially verified: DOWNGRADED to this severity)_

**Location:** .env (tracked; git ls-files shows it), .gitignore (no .env entry)

**Description:** git ls-files lists .env; .gitignore does not exclude it. It contains VITE_SUPABASE_URL=https://fuoqoryqndtdooujslee.supabase.co and VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_1JTwEK8CgHC6PLtOOnYeSw_xaHwa-i9, present since the initial commit (7e5ca88).

**Why it is a problem:** The exact production project and its credentials live in history for anyone with repo access. While the publishable key is anon-class (also shipped in the JS bundle), tracking it removes any rotation boundary, and it directly identifies the live project targeted by the destructive seed/delete scripts. Any future service_role addition to this file would leak catastrophically.

**Steps to reproduce:** Run: git ls-files | grep env → shows .env; cat .env → prints URL + key.

**Root cause:** Environment file committed and never gitignored.

**Suggested fix:** git rm --cached .env, add .env to .gitignore, keep only .env.example with placeholders. Rotate the Supabase keys and, given the broken RLS above, treat the project as compromised until authz is fixed.

> Verifier evidence: .env tracked since 7e5ca88 with publishable key; .gitignore lacks .env. But key is anon-class and already public in dist/assets/index-C313OXve.js; no service_role/sb_secret key anywhere in history (git log -S empty; create-admin.cjs:5 reads it from env only). Hygiene issue, not credential leak.

### L02 — Transitive high-severity dependency vulnerability (undici)

**Severity:** Low

**Location:** package-lock.json (undici >=7.23.0 <7.28.0, GHSA-vmh5-mc38-953g, CVSS 7.4)

**Description:** npm audit reports 1 high vuln: undici TLS certificate validation bypass via dropped requestTls in SOCKS5 ProxyAgent. undici is a transitive/dev-tooling dependency, not shipped in the browser bundle.

**Why it is a problem:** Limited runtime exposure for a frontend SPA (undici is not used by browser code), but it can affect Node-based tooling/scripts and CI. Should be patched to keep the dependency tree clean.

**Steps to reproduce:** Run npm audit --json — one high finding for undici.

**Root cause:** Outdated transitive dependency; CI does not gate on npm audit.

**Suggested fix:** Run npm audit fix / bump the transitive undici to >=7.28.0 (or update the parent dependency), and add npm audit --audit-level=high to CI.

## Authentication — score 42/100

The Supabase email/password + Google OAuth flows are wired up and the listener is cleaned up correctly, but the design leans on client-writable auth.user_metadata for authorization, which is a privilege-escalation vector. A user-facing password-reset flow is entirely missing (the login link 404s), and several auth-state race and null-profile paths can bounce or break authenticated users. These are ship-blockers for a role-gated app.

**Done well:** Auth listener subscription is unsubscribed and guarded by a `mounted` flag on unmount (AuthContext.tsx:161-164), avoiding the classic setState-after-unmount leak. · ProtectedRoute correctly gates on loading before deciding, redirects unauthenticated users to /login preserving `from`, and role-mismatch to / (ProtectedRoute.tsx:14-40). · Supabase client is a throw-proxy when env vars are missing, giving loud, debuggable failures instead of silent undefined behavior (api/supabase.ts:32-56). · signUp detects the empty-identities 'already registered' case and surfaces a clear message (AuthContext.tsx:179-181). · RLS hardening exists: WITH CHECK blocks self role-change and handle_new_user trigger forces new_joinee on signup (schema.sql:335-403).

### C03 — Authorization trusts client-writable user_metadata.role — privilege escalation

**Severity:** Critical _(adversarially verified: CONFIRMED)_

**Location:** db/schema.sql:68-79, 191-209, 321-333; src/hooks/useAutoPromote.ts:69-71; src/context/AuthContext.tsx:71-92

**Description:** Admin/reviewer RLS policies gate on auth.jwt()->'user_metadata'->>'role' (schema.sql:70,77,193,209) and get_user_role() COALESCEs user_metadata (schema.sql:329-333). user_metadata is writable by the authenticated user via supabase.auth.updateUser({data:{role}}) — the app itself does exactly this at useAutoPromote.ts:69. The client-side buildProfileFromMetadata also trusts metadata role (AuthContext.tsx:81).

**Why it is a problem:** Any signed-in new_joinee can call supabase.auth.updateUser({data:{role:'academic_head'}}) from the browser console and immediately gain 'Admin read all profiles' / 'Admin update profiles' / reviewer read+update over every user's data. Complete authorization bypass.

**Steps to reproduce:** Log in as new_joinee; in console run supabase.auth.updateUser({data:{role:'academic_head'}}); refresh; admin RLS policies now grant read/update on all profiles and submissions.

**Root cause:** user_metadata is end-user-controlled by Supabase design; policies conflate identity metadata with server-controlled authorization claims.

**Suggested fix:** Never trust user_metadata for authorization. Move role into app_metadata (server/service-role only) or resolve role via a SECURITY DEFINER function reading the user_profiles table, and rewrite all RLS policies + get_user_role() to use only app_metadata or the DB row. Remove the client-side auth.updateUser role write in useAutoPromote.

> Verifier evidence: schema.sql:70,77,193,209 gate admin/reviewer RLS on auth.jwt()->'user_metadata'->>'role'; get_user_role() (328-333) falls back to user_metadata. useAutoPromote.ts:69 shows the app writes user_metadata via auth.updateUser — client-writable. 9b WITH CHECK only guards user_profiles.role column, not the JWT-forge path, so escalation is unmitigated.

### H02 — Password reset flow is completely missing — login link 404s

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** src/pages/Login.tsx:125; src/App.tsx:98-147

**Description:** Login renders <Link to="/forgot-password"> (Login.tsx:125) but no /forgot-password (or /reset-password) route is registered in App.tsx — it falls through to the * NotFound route. Grep confirms no resetPasswordForEmail, no PASSWORD_RECOVERY handler, and no reset page anywhere in src.

**Why it is a problem:** Users who forget their password have no self-service recovery path; the visible 'Forgot your password?' link leads to a 404. For email/password accounts this means permanent lockout without manual admin intervention.

**Steps to reproduce:** Go to /login, click 'Forgot your password?' → lands on NotFound (404).

**Root cause:** Link was added during UI work without implementing the backing route/pages.

**Suggested fix:** Add a ForgotPassword page calling supabase.auth.resetPasswordForEmail(email, {redirectTo}); add a ResetPassword page that handles the PASSWORD_RECOVERY event / recovery token and calls supabase.auth.updateUser({password}); register both routes in App.tsx.

> Verifier evidence: Login.tsx:125 renders <Link to="/forgot-password">; App.tsx:98-147 route table has no /forgot-password or /reset-password, so it hits the * NotFound route (App.tsx:146). Grep of src/ finds no resetPasswordForEmail, no PASSWORD_RECOVERY handler, no reset page; only auth.updateUser use is role promotion (useAutoPromote.ts:69). Google OAuth exists but doesn't recover email/password accounts.

### M03 — Post-login redirect to a role-gated page bounces to / due to profile race

**Severity:** Medium _(adversarially verified: DOWNGRADED to this severity)_

**Location:** src/context/AuthContext.tsx:147-159, 36-68; src/pages/Login.tsx:28-29; src/components/ProtectedRoute.tsx:35-40

**Description:** On SIGNED_IN the listener calls setUser then async fetchProfile, but fetchProfile never sets loading=true at start (AuthContext.tsx:36-68); loading is already false from the initial getSession. Login navigates to `from` immediately (Login.tsx:29). ProtectedRoute then evaluates with user set, profile still null, loading false → role check fails → redirect to / (ProtectedRoute.tsx:37-39).

**Why it is a problem:** A user who deep-links to a protected page (e.g. /admin) while logged out, then logs in, is redirected to /login with from=/admin, and after login is wrongly bounced to / instead of /admin because profile hasn't loaded yet.

**Steps to reproduce:** Log out; visit /admin; get redirected to /login; sign in as an academic_head → land on / not /admin.

**Root cause:** loading state does not cover the window between user set and profile fetched on auth-state change.

**Suggested fix:** Set loading=true at the start of fetchProfile, or in ProtectedRoute treat (user && !profile) as a loading state rather than an authorization failure.

> Verifier evidence: Mechanism confirmed: AuthContext.tsx:36-68 fetchProfile never sets loading=true; AuthContext.tsx:151-153 fires it un-awaited on SIGNED_IN; Login.tsx:28-29 navigates immediately; ProtectedRoute.tsx:35-39 bounces to / when profile null. But impact is fail-closed, transient (one wrong landing page, retry works), no security/data loss — Medium, not High.

### M04 — Profile fetch failure leaves user authenticated with null profile, no recovery UX

**Severity:** Medium

**Location:** src/context/AuthContext.tsx:44-68, 126-131; src/components/ProtectedRoute.tsx:31-42

**Description:** On a non-recursion fetch error, fetchProfile calls notifyError and the finally sets loading=false without ever setting profile (AuthContext.tsx:50,66-67). User is set, profile null, loading false. ProtectedRoute lets user onto '/' (no requiredRoles) with profile=null; Dashboard and hasRole() then operate on a null profile with no retry or sign-out prompt.

**Why it is a problem:** Transient network/RLS errors during profile load strand the user in a half-authenticated state: role-gated pages redirect to /, and the dashboard may render empty or crash on profile fields, with no visible way to recover except manual reload.

**Steps to reproduce:** Simulate a 500/network failure on the user_profiles select during initial load; observe authenticated-but-profileless UI.

**Root cause:** Error paths set loading=false but leave profile unset, and ProtectedRoute's non-role branch does not require a profile.

**Suggested fix:** On unrecoverable profile fetch failure, surface an error state and offer retry/sign-out; do not leave user set with profile null silently. Consider blocking render until profile resolves or session is cleared.

### M05 — Auth listener refetches profile only on SIGNED_IN — stale role after refresh/update

**Severity:** Medium

**Location:** src/context/AuthContext.tsx:147-159

**Description:** onAuthStateChange only calls fetchProfile when event==='SIGNED_IN' (AuthContext.tsx:151-153). For INITIAL_SESSION, TOKEN_REFRESHED, and USER_UPDATED events it sets user but never (re)loads the profile. INITIAL_SESSION with a session sets user but leaves profile null unless the parallel getSession path wins.

**Why it is a problem:** After a token refresh or a role change (e.g. auto-promotion updating metadata) the in-memory profile is stale until a full reload, so the UI may show wrong role/permissions. Combined with the INITIAL_SESSION gap it also creates ordering fragility between getSession and the listener.

**Steps to reproduce:** Leave the tab open past token lifetime; on TOKEN_REFRESHED the profile is not refreshed; trigger auto-promote and observe stale role until reload.

**Root cause:** Event handling special-cases only SIGNED_IN; other session-bearing events are ignored for profile state.

**Suggested fix:** Handle INITIAL_SESSION and TOKEN_REFRESHED/USER_UPDATED by refetching the profile (or drive the whole flow from onAuthStateChange and drop the separate getSession call to avoid double/racy paths).

### L03 — OAuth callback uses fixed 1s setTimeout instead of listening for session

**Severity:** Low

**Location:** src/pages/AuthCallback.tsx:22-33

**Description:** AuthCallback waits a hardcoded 1000ms then calls getSession once (AuthCallback.tsx:22-31). It does not subscribe to onAuthStateChange, so if detectSessionInUrl token exchange is slower than 1s (slow network/device), getSession returns null and the user is sent to /login as a failed sign-in despite valid credentials.

**Why it is a problem:** Flaky OAuth sign-in on slow connections: legitimate Google logins intermittently redirect to /login with 'Sign in failed'.

**Steps to reproduce:** Throttle network to Slow 3G and complete Google OAuth → callback frequently reports failure.

**Root cause:** Timing assumption substitutes for event-driven session detection.

**Suggested fix:** Subscribe to supabase.auth.onAuthStateChange for SIGNED_IN (with a timeout fallback) rather than a single delayed getSession, and unsubscribe on cleanup.

### L04 — .env with Supabase URL/key is tracked in git; .gitignore does not exclude it

**Severity:** Low

**Location:** .env (git-tracked); .gitignore (no env entry)

**Description:** git ls-files lists .env, and .gitignore contains no .env pattern (verified: only *.local is ignored). The committed key is sb_publishable_ (anon-class), which is designed to ship in the client bundle, so this is not a live secret leak — but the pattern means any future service_role/secret added to .env would be committed automatically.

**Why it is a problem:** No immediate credential exposure (publishable key is public by design), but the missing ignore rule is a latent leak: the next secret dropped into .env goes straight to the remote history.

**Steps to reproduce:** Run `git ls-files | grep '^.env$'` → returns .env; `grep env .gitignore` → no match.

**Root cause:** .gitignore was never configured to exclude environment files.

**Suggested fix:** Add `.env` and `.env*.local` to .gitignore, keep only .env.example tracked, and git rm --cached .env. Confirm no service_role key ever lives in a tracked file.

## Authorization & RLS — score 18/100

Authorization is effectively client-side only. Every server-side RLS policy that gates admin/reviewer access keys off `user_metadata.role`, which is client-writable via `supabase.auth.updateUser` and set from a caller-chosen value at signup — so any authenticated user can self-promote to `academic_head` and read/write every user's data. Worse, the "security fix" migration (schema.sql section 9) DROPs policies by names that were never created, leaving the original permissive UPDATE policies (no WITH CHECK) alive alongside the hardened ones; under Postgres OR semantics the weak policy wins. A new hire can self-approve worksheets and trigger auto-promotion. There is no DB enforcement of the review state machine, and reviewer sub-roles (buddy vs manager vs onboarding_lead) are not separated at the RLS layer. Not shippable.

**Done well:** RLS is ENABLE'd on all four tables (user_profiles, onboarding_submissions, worksheet_submissions, notifications) · CHECK constraints enumerate the legal role and review_status value sets · A handle_new_user trigger and hardened self-update WITH CHECK were authored (intent is right, wiring is broken) · get_user_role() is SECURITY DEFINER with SET search_path='' and prefers app_metadata first · Ownership (auth.uid()=user_id) is correctly required on the base SELECT/INSERT own-row policies

### C04 — Any authenticated user can self-promote to admin — RLS trusts client-writable user_metadata.role

**Severity:** Critical _(adversarially verified: CONFIRMED)_

**Location:** db/schema.sql:70,77,111,193,209,329-331; src/hooks/useAutoPromote.ts:69-71; src/context/AuthContext.tsx:174

**Description:** All privileged RLS policies gate on `auth.jwt() -> 'user_metadata' ->> 'role'`, and get_user_role() falls back to the same. user_metadata is fully client-writable: useAutoPromote already calls supabase.auth.updateUser({data:{role:'lead_instructor'}}). An attacker runs the same call with role:'academic_head' in the browser console (or sets it at signUp options.data) and instantly satisfies every admin/reviewer policy.

**Why it is a problem:** Complete privilege escalation. A new hire gains read/write over every other user's profiles, worksheets, and submissions, and can approve phases and reassign leads — full compromise of the authorization model.

**Steps to reproduce:** Log in as new_joinee; in console run supabase.auth.updateUser({data:{role:'academic_head'}}); re-request session; query worksheet_submissions for another user_id — rows return and updates succeed.

**Expected behavior:** app_metadata.role only, populated server-side

**Current behavior:** COALESCE(app_metadata.role, user_metadata.role, '')

**Root cause:** Role of record lives in client-writable JWT user_metadata; the one-time copy-to-app_metadata migration is commented out and unused.

**Suggested fix:** Resolve roles ONLY from app_metadata (server-controlled) in every policy and in get_user_role(); remove the user_metadata fallback. Set roles exclusively via a service-role backend/Edge Function or admin API. Never accept role from client signUp/updateUser.

**Example implementation:**

```
get_user_role := auth.jwt() -> 'app_metadata' ->> 'role' (no user_metadata COALESCE)
```

> Verifier evidence: schema.sql:70,77,111,193,209 gate on auth.jwt()->'user_metadata'->>'role'; Section 9's DROPs target different policy names so these survive unchanged. get_user_role() (329-331) falls back to user_metadata, and handle_new_user never sets app_metadata, so new users' JWT resolves to client-writable user_metadata. updateUser({data:{role}}) is client-callable (useAutoPromote.ts:69-71).

### C05 — Hardened UPDATE policies never replace the originals — policy-name mismatch leaves permissive policies live

**Severity:** Critical _(adversarially verified: CONFIRMED)_

**Location:** db/schema.sql:63 vs 336; 185 vs 351; 207 vs 352

**Description:** Section 9 does DROP POLICY IF EXISTS "Users can update own profile"/"Users can update own submissions"/"Reviewers can update submissions", but section 2/4 created them as "Update own profile"/"Update own submissions"/"Reviewers update submissions". The DROPs are no-ops, so the original permissive policies — which have USING(auth.uid()=id/user_id) and NO WITH CHECK — survive alongside the new ones. Postgres OR-combines permissive policies, and a missing WITH CHECK defaults to USING, so the weak policy authorizes the write.

**Why it is a problem:** The 'hardened' WITH CHECK clauses are dead. Users can update their own profile role and their own worksheet review_status to any value, defeating the entire section-9 remediation.

**Steps to reproduce:** Run schema.sql on a fresh DB; SELECT policyname,cmd FROM pg_policies WHERE tablename='user_profiles' — both 'Update own profile' and 'Users can update own profile' appear for UPDATE.

**Expected behavior:** Exactly one UPDATE policy with an enforced WITH CHECK

**Current behavior:** Two permissive UPDATE policies coexist; weakest wins

**Root cause:** Copy-paste of policy names that don't match the canonical schema's names; no post-deploy verification of pg_policies.

**Suggested fix:** Rename the DROP targets to the exact original policy names (or drop by the real names), verify with `SELECT policyname FROM pg_policies` that only one UPDATE policy per role-class remains, and add a CI check asserting no duplicate permissive UPDATE policies.

> Verifier evidence: schema.sql:63 "Update own profile" vs :336 DROP "Users can update own profile" (no-op); :185 vs :351 and :207 vs :352 same mismatch. Old policies lack WITH CHECK, so USING(auth.uid()=id) OR-authorizes writes. No trigger/REVOKE guards role; AuthContext.tsx:236 authorizes via profile.role. Line 75 policy independently permits self role update.

### H03 — Reviewer sub-roles not separated in RLS — buddy and onboarding_lead can final-approve any user

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** db/schema.sql:366-374; supabase_migration_add_buddy_approved.sql:42-48

**Description:** The 'Reviewers can update submissions' policy grants UPDATE to lead_instructor, academic_head AND onboarding_lead with WITH CHECK only re-checking the same role set — no restriction on which columns/values or which users. A buddy (lead_instructor) can set review_status='approved' (documented manager-only), onboarding_lead can update despite being documented read-only, and any reviewer can approve ANY joinee's worksheet with no assignment scoping in this variant.

**Why it is a problem:** UI-only role separation. Buddies can final-approve phases, onboarding_leads can mutate submissions, and reviewers can act on users not assigned to them — violating the stated review workflow and segregation of duties.

**Steps to reproduce:** As lead_instructor, update any joinee's worksheet_submissions SET review_status='approved' — succeeds; as onboarding_lead, same update succeeds despite read-only claim.

**Expected behavior:** Capability- and assignment-scoped reviewer policies

**Current behavior:** One policy: any reviewer role → any update

**Root cause:** A single coarse role-set policy stands in for four distinct reviewer capabilities.

**Suggested fix:** Split into per-transition policies: buddy may only pending_review→buddy_approved on assigned users; manager may only buddy_approved→approved; onboarding_lead SELECT-only. Scope WITH CHECK by assigned_lead_id/assigned_buddy_id and by the specific target review_status.

> Verifier evidence: db/schema.sql:366-374 and supabase_migration_fix_rls_security.sql:105-115: USING/WITH CHECK only test role IN ('lead_instructor','academic_head','onboarding_lead') — no assignment scoping or value limits, so buddies/onboarding_leads can set review_status='approved' on any row. Contradicts schema.sql:206 ("onboarding_lead: read-only"). No mitigating triggers; older scoped variants (setup_correct.sql:79-88) are superseded.

### H04 — No DB-level enforcement of review state-machine transition order

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** db/schema.sql:151 (CHECK), 358-364, 366-374; state transitions all client-side (WorksheetReview.tsx, PhaseReview.tsx, useGateControl.ts)

**Description:** The only server constraint on review_status is a CHECK enumerating the legal value SET; nothing enforces the legal transition ORDER (pending_review→buddy_approved→approved, or →needs_revision). No trigger compares OLD.review_status to NEW.review_status. Any principal with UPDATE rights can jump directly to any state, e.g. ''→'approved', skipping buddy and manager review entirely.

**Why it is a problem:** The documented state machine is unenforced. Gate controls, phase gating, and auto-promotion all trust a status that can be set out of order, undermining every downstream gate that reads review_status.

**Steps to reproduce:** Update a row from review_status='' directly to 'approved' — CHECK passes, update commits.

**Expected behavior:** Trigger enforcing role-gated transition edges

**Current behavior:** CHECK on value set only

**Root cause:** Transition logic lives entirely in React hooks; the DB validates values, not sequences.

**Suggested fix:** Add a BEFORE UPDATE trigger validating OLD→NEW transitions against an allowed-edges table keyed by the actor's role, rejecting illegal jumps. Keep client checks for UX only.

> Verifier evidence: db/schema.sql:358-364 — joinee's own UPDATE policy WITH CHECK explicitly allows review_status IN (...'buddy_approved','approved'); only value-set CHECK at :151; sole triggers are updated_at (:243-251) and handle_new_user (:377) — no OLD/NEW comparison, no RPCs in src/. A new_joinee can self-approve via PostgREST, bypassing both reviews.

### H05 — signUp writes a caller-chosen role into user_metadata and a client-side profile insert

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** src/context/AuthContext.tsx:169-189

**Description:** signUp(email,password,fullName,role) passes role into options.data (→user_metadata.role) and then does a client-side user_profiles.insert with that role. 'Insert own profile' WITH CHECK only verifies id=auth.uid(), not role. Signup.tsx exposes no role picker, but the API/console path accepts any UserRole including academic_head. The handle_new_user trigger only mitigates the profiles row (if deployed); user_metadata.role — which drives all RLS — is still attacker-set.

**Why it is a problem:** Account can be born with an elevated role in the JWT, giving immediate admin/reviewer RLS access without any approval step.

**Steps to reproduce:** Call supabase.auth.signUp with options.data.role='academic_head'; session JWT carries the elevated role and satisfies admin policies.

**Expected behavior:** role forced server-side to new_joinee

**Current behavior:** role accepted from client at signup

**Root cause:** Client is trusted to set its own role at account creation.

**Suggested fix:** Drop the role parameter and the client profile insert; rely solely on the handle_new_user trigger (forced new_joinee) and never write role from the client. Verify the trigger is actually deployed on the live project.

> Verifier evidence: AuthContext.tsx:169-189 sends caller role into user_metadata and inserts it client-side; db/schema.sql:59-60 WITH CHECK only id=auth.uid(); schema.sql:70,111,193 gate admin RLS on jwt user_metadata.role; get_user_role() (schema.sql:329-330) falls back to user_metadata, so the handle_new_user trigger and app_metadata fix do not stop fresh-signup escalation.

### M06 — New hire can self-approve their own worksheets and force auto-promotion

**Severity:** Medium _(adversarially verified: DOWNGRADED to this severity)_

**Location:** db/schema.sql:185,358-364; supabase_migration_fix_rls_security.sql:99-102; src/hooks/useAutoPromote.ts:47-64

**Description:** Even the intended 'hardened' WITH CHECK for own-submission updates explicitly permits review_status IN ('','pending_review','needs_revision','revision_submitted','buddy_approved','approved') (schema.sql:362). Combined with the surviving no-WITH-CHECK 'Update own submissions' policy, a new_joinee can set review_status='approved' on all 17 of their own worksheets. checkAndPromote then flips their user_profiles.role and user_metadata to lead_instructor.

**Why it is a problem:** The review state machine (buddy→manager approval) is bypassable by the reviewee. Self-approval yields promotion to a reviewer role, letting the user then review/approve others — cascading escalation.

**Steps to reproduce:** As new_joinee, upsert each own worksheet_submissions row with review_status='approved'; call checkAndPromote — returns promoted:true.

**Expected behavior:** Owner limited to draft/submit/resubmit states

**Current behavior:** Owner may write review_status='approved'

**Root cause:** WITH CHECK whitelists reviewer states for the submission owner 'to preserve draft saves'.

**Suggested fix:** Own-submission WITH CHECK must forbid reviewer-only states: allow only '', 'pending_review', 'revision_submitted' when auth.uid()=user_id. Move buddy_approved/approved transitions behind reviewer-only policies. Enforce role/state in DB, and have checkAndPromote run server-side.

> Verifier evidence: Self-approval is possible (schema.sql:185 no-CHECK policy survives; :362 lists 'approved'). But useAutoPromote.ts:61-64 writes user_profiles.role, blocked by hardened WITH CHECK (schema.sql:342-348) under the joinee's session; line 66 throw short-circuits before the user_metadata write (:69). No role escalation occurs — only a review-state integrity bug.

### M07 — 'Admin update profiles' policy has no WITH CHECK and keys off client-writable metadata

**Severity:** Medium

**Location:** db/schema.sql:75-79

**Description:** The admin profile-update policy authorizes UPDATE when user_metadata.role ∈ (academic_head, lead_instructor, onboarding_lead) OR id=auth.uid(), with NO WITH CHECK. A user who has self-elevated via metadata (finding 1) can then update ANY user_profiles row — including setting other users' roles or reassigning leads/buddies — with no column restriction.

**Why it is a problem:** Amplifies finding 1 into org-wide role administration: reassign buddies, demote managers, or promote confederates.

**Steps to reproduce:** After self-elevating, UPDATE user_profiles SET role='new_joinee' WHERE id=<any manager> — succeeds.

**Expected behavior:** app_metadata-gated, WITH CHECK column-scoped

**Current behavior:** USING-only admin update, metadata-gated

**Root cause:** USING-only policy plus metadata-based admin check.

**Suggested fix:** Resolve admin via app_metadata only; add a WITH CHECK restricting which columns/values admins may change; disallow arbitrary role writes except through an audited service-role path.

### M08 — get_user_role() and RLS-recursion fallback still trust client metadata; migration to app_metadata never ran

**Severity:** Medium

**Location:** db/schema.sql:328-332; supabase_migration_fix_rls_security.sql:31-58; src/context/AuthContext.tsx:71-92,103

**Description:** get_user_role() COALESCEs app_metadata then user_metadata; the one-time UPDATE that copies roles into app_metadata is commented out (migration:42-53) with no evidence it was executed, so the user_metadata branch is authoritative in practice. Client-side, buildProfileFromMetadata (AuthContext:71-91) and createProfileFromAuth (:103) derive profile.role from user_metadata, which drives hasRole() authorization.

**Why it is a problem:** The 'server-controlled role' fix is inert; both the DB helper and the client authz continue to trust attacker-controllable data, so no layer actually enforces role integrity.

**Steps to reproduce:** On the live DB, SELECT get_user_role() as a self-elevated user returns the client value; grep confirms no automation runs the backfill.

**Expected behavior:** backfill executed; user_metadata fallback removed

**Current behavior:** app_metadata backfill optional/commented

**Root cause:** Migration step left commented; fallback retained 'for existing users'.

**Suggested fix:** Run/automate the app_metadata backfill, then remove the user_metadata fallback from get_user_role and from the client profile builders; source role only from the user_profiles row (server-written).

