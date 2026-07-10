# Production Readiness Audit — Backend & Data Layer

_Audit date: 2026-07-10 · Part of the [2026-07-10 audit](./README.md)_

## Backend / API Layer — score 40/100

The app talks to Supabase directly from the browser with no server tier, and the client data layer has systemic error-handling gaps: most reads destructure only .data and discard .error, so transient failures are indistinguishable from empty results. The worst consequence is a verified data-loss path where a failed load causes auto-save to overwrite a saved submission and reset its review state. Writes are non-atomic (bulk phase approval loops per row), submits can report success on failure, and the due-date contract writes wrong values for every user. Solid pieces exist (env throw-proxy, fail-closed gate check, parallel loads), but the read/write contract is not production-safe.

**Done well:** src/api/supabase.ts:13-56 throw-proxy gives clear, chain-aware errors when env vars are missing instead of undefined crashes · useGateControl.ts:51-55 fails CLOSED on prerequisite-check query error (denies gate submission when verification is impossible) · Page loads use Promise.all for parallel queries (PhaseReview.tsx:70-73, WorksheetReview.tsx:83-86, AdminDashboard.tsx:77-90) · useAutoSave has retry-with-backoff scaffolding and conflict detection intent (useAutoSave.ts:68-84, 172-186) · scripts/ (create-test-users.mjs:28-35, e2e-full-flow.mjs:39-45, run_migration.cjs:19) read credentials from env/.env rather than hardcoding keys

### C06 — Failed worksheet load is treated as 'no data' — auto-save then overwrites the saved submission and resets review_status

**Severity:** Critical _(adversarially verified: CONFIRMED)_

**Location:** src/hooks/useAutoSave.ts:218-230 (loadWorksheetData), src/hooks/useWorksheet.ts:115-149, src/hooks/useAutoSave.ts:88-94,123

**Description:** loadWorksheetData destructures only { data } and discards the Supabase error object, returning null on any query failure (network blip, RLS error, expired token). useWorksheet cannot distinguish this from a new worksheet: it prefills defaults, sets loaded=true (line 146) unconditionally, and useAutoSave's effect (lines 196-201, hasRealData is always true because initial data has 5 _saved* keys plus defaults) upserts after 1.5s.

**Why it is a problem:** A transient fetch failure silently replaces a user's saved worksheet_data with blank defaults AND downgrades review_status: with _savedReviewStatus lost, line 88-94 computes '' (or pending_review), wiping approved/buddy_approved state. Irreversible data loss plus review state-machine corruption, with no user-visible error.

**Steps to reproduce:** Open an approved worksheet while offline or with an RLS/401 failure on the initial select; regain connectivity; wait 1.5s for auto-save. The DB row's worksheet_data and review_status are overwritten.

**Expected behavior:** const { data, error } = ...; if (error) throw error; — and useWorksheet must keep loaded=false (blocking auto-save) when the load errored.

**Current behavior:** const { data } = await supabase.from('worksheet_submissions').select('*')...maybeSingle(); return data;

**Root cause:** loadWorksheetData swallows the error and returns null, the same sentinel used for 'row does not exist'; callers have no error channel.

**Suggested fix:** Return/propagate the error from loadWorksheetData; in useWorksheet's catch, do NOT setLoaded(true) — show a retry UI instead. Additionally, never let the client recompute review_status downward: the upsert should not include review_status when it wasn't loaded from the server.

**Example implementation:**

```
const { data, error } = await q; if (error) throw error; ... catch (err) { setLoadError(err); return; } // loaded stays false, autosave stays disabled
```

> Verifier evidence: useAutoSave.ts:223 discards error (postgrest-js dist index.cjs:328 converts even fetch rejections to {data:null}); useWorksheet.ts:146 sets loaded=true unconditionally; useAutoSave.ts:196-201 hasRealData always true (5 _saved* keys), auto-saves in 1.5s; lines 88-94,107-123 upsert blank defaults with review_status='' and null reviewer fields. No guard, silent, irreversible.

### H06 — Submit reports success while the write failed: save() swallows errors during retries, and the final rethrow is an unhandled rejection

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** src/hooks/useAutoSave.ts:167-188, src/hooks/useWorksheet.ts:191-217, src/hooks/useGateControl.ts:158-190

**Description:** On upsert failure, save()'s catch schedules a retry via setTimeout and returns normally for the first two attempts (retryCountRef <= 2, line 174-180). flushSave therefore resolves, so useWorksheet.handleSubmit shows the 'submitted for review' success toast even though nothing was written. When retries exhaust, the throw at line 185 happens inside a setTimeout-invoked async call whose promise nobody awaits — an unhandled promise rejection, never reaching handleSubmit's catch.

**Why it is a problem:** New hires see 'Your worksheet has been submitted for review' when the submission never persisted; reviewers never get the row or notification. The gate-control submit (useGateControl handleSubmit) has the same false-success path, including buddy approvals. Silent workflow stalls in production.

**Steps to reproduce:** Make the upsert fail once (e.g., drop network right before clicking Submit). handleSubmit's flushSave resolves, success toast appears; if the connection stays down, retries exhaust and throw into the void.

**Expected behavior:** flushSave must reject (or resolve only) according to the actual final outcome of the write.

**Current behavior:** catch { setTimeout(() => save(data), backoff); } // resolves successfully

**Root cause:** Retry logic is fire-and-forget inside catch instead of an awaited retry loop; error signal escapes the caller's promise chain.

**Suggested fix:** Implement retries as an awaited loop inside save (for attempt of [0..2] { try upsert; return } catch { await sleep(backoff) }) and rethrow after the loop so flushSave/handleSubmit see the failure. Keep background debounced saves non-throwing but surface saveStatus='error' persistently.

> Verifier evidence: useAutoSave.ts:174-180 — catch schedules retry and returns without rethrow when retryCountRef<=2, so flushSave (209-210, resets counter to 0) always resolves on first failure; useWorksheet.ts:203-209 and useGateControl.ts:173-182 then show success toasts. Line 176-179's setTimeout calls save(data) unawaited, so the line-185 throw is an unhandled rejection. notifyError (line 168) shows only a generic 'Auto-save failed' toast.

### H07 — due_date written to the database is wrong for every user: derived from a demo 'start date = 30 days ago' localStorage fallback that nothing ever sets

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** src/hooks/useDueDates.ts:52-57 (getDefaultStartDate), src/hooks/useAutoSave.ts:96-100,121

**Description:** calculateDueDate bases due dates on localStorage key 'onboarding_start_date', but no code in src/ or scripts/ ever writes that key (verified via repo-wide grep — only the read at useDueDates.ts:54 exists). The fallback is Date.now() minus 30 days, commented 'For demo/simulation'. useAutoSave persists this value into worksheet_submissions.due_date on the first save (lines 97-99, 121) and never corrects it ('Only include due_date on initial save — never overwrite').

**Why it is a problem:** Every new hire's Phase 1 worksheets get due_dates already 16-23 days in the past on day one (p1_w1 offset 7 => due 23 days ago). Dashboards show 'Overdue by Nd' everywhere, and the DB-side due-date notification job (db/__due_date_notifications.sql) would spam overdue alerts. The persisted contract value is wrong at the source and frozen.

**Steps to reproduce:** Fresh browser, new user, open any Phase 1 worksheet, type one character; row is upserted with due_date ≈ today - 23d.

**Expected behavior:** Due dates anchored to the user's actual joining date (a user_profiles.start_date column or created_at), computed server-side or at profile creation.

**Current behavior:** return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

**Root cause:** Demo/simulation default left in the production write path; joining date is not modeled server-side (user_profiles has no start_date used here).

**Suggested fix:** Add start_date to user_profiles (default now() at signup), compute due_date from it — ideally in a DB trigger/default — and stop writing client-calculated due_date from useAutoSave.

> Verifier evidence: useDueDates.ts:52-57 falls back to Date.now()-30d; only setItem calls in src/ are 'onboarding_progress' (App.tsx:167) and 'onboarding_employee_name' (useAutoSave.ts:246) — nothing writes 'onboarding_start_date'. useAutoSave.ts:98 calls calculateDueDate with no startDate, line 121 persists due_date on initial save only ("never overwrite"). p1_w1 offset 7 → due 23 days past at signup.

### M09 — Bulk phase approval is a non-atomic per-row loop — partial failure leaves the phase half-approved with no recovery

**Severity:** Medium _(adversarially verified: DOWNGRADED to this severity)_

**Location:** src/pages/PhaseReview.tsx:106-172 (handleApprovePhase)

**Description:** Manager approval iterates buddy_approved sheets, issuing one sequential UPDATE per row (line 108-118). Any single failure sets allSucceeded=false but already-updated rows stay approved; the user is told 'Some worksheets could not be approved. Check console for details' (line 168) with no retry, and checkAndPromote/buddy notifications are skipped. Each update also does an awaited notification insert in the loop (N+1, ~2 round-trips per sheet).

**Why it is a problem:** A phase can end up with a mix of approved and buddy_approved sheets. Downstream logic requires ALL sheets approved (isPhaseApproved, checkAndPromote in useAutoPromote.ts:47-49), so the joinee is stuck: PhaseAccessGuard keeps the next phase locked and promotion never fires, with only a console message for the manager.

**Steps to reproduce:** Have 4 buddy_approved sheets; make update #3 fail (RLS/network). Sheets 1-2 are approved, 3-4 are not; page shows warning and no path to reconcile besides re-clicking (button may no longer render since canApprove requires pending.length===0 and buddyApproved.length>0 — mixed state still qualifies, but a full failure mid-list has no rollback).

**Expected behavior:** One atomic statement: single .update().in('id', ids) or an approve_phase(user_id, phase) RPC running in a transaction.

**Current behavior:** for (const sub of toApprove) { await supabase.from('worksheet_submissions').update({...}).eq('id', sub.id); }

**Root cause:** No batch/atomic write; client loops single-row updates instead of one UPDATE ... IN or a Postgres RPC transaction.

**Suggested fix:** Create a SECURITY DEFINER RPC approve_phase that updates all buddy_approved rows for (user_id, phase) transactionally, appends history server-side, and returns the updated rows; move notifications after it succeeds.

**Example implementation:**

```
const { error } = await supabase.rpc('approve_phase', { p_user_id: userId, p_phase: phaseNumber });
```

> Verifier evidence: Non-atomic loop confirmed (PhaseReview.tsx:106-134), but "no recovery" is false: canApprove (lines 179-180) stays true since failed sheets remain buddy_approved, and re-clicking Approve (line 88 filters buddy_approved) retries them, then checkAndPromote fires. Only residual harm: stale-state retry duplicates history/notifications and error message omits retry guidance (line 168).

### M10 — Admin/lead dashboards silently truncate worksheet_submissions at 500 rows with no ordering or pagination

**Severity:** Medium

**Location:** src/pages/AdminDashboard.tsx:83, src/pages/OnboardingLeadDashboard.tsx:55, src/pages/BuddyDashboard.tsx:72, src/pages/Dashboard.tsx:61

**Description:** AdminDashboard and OnboardingLeadDashboard fetch ALL users' submissions with .limit(500) and no .order() or .range() pagination. A single user can accumulate ~40 rows (20 phase/gate + 20 FTP-week worksheets per useDueDates offsets), so the cap is hit at roughly 12-13 active users; without ORDER BY, which 500 rows Postgres returns is nondeterministic. BuddyDashboard caps at 200; Dashboard's own-user limit(50) is safe but hardcoded.

**Why it is a problem:** Beyond ~12 hires, admin progress stats, 'pending review' counts, and per-user phase status are computed from an arbitrary subset — worksheets appear 'Not Started' though submitted, review queues undercount, and the bug is invisible (no error, no truncation indicator).

**Steps to reproduce:** Seed 15 users completing all worksheets (scripts/create-test-users.mjs + e2e-full-flow.mjs), open /admin: aggregate counts no longer match per-user reality.

**Expected behavior:** Paginated fetch (.range in a loop) or a server-side aggregate (view/RPC returning per-user counts) so dashboards scale with cohort size.

**Current behavior:** supabase.from('worksheet_submissions').select('user_id, worksheet_id, review_status, status, updated_at, review_history').limit(500)

**Root cause:** Row cap used as a safety valve instead of pagination or server-side aggregation.

**Suggested fix:** Create a Postgres view/RPC returning per-user status counts for the dashboard grid, and only fetch full rows per-user on drill-in; at minimum, page with .range() until fewer than page-size rows return.

### M11 — review_history append and state transitions are client-side read-modify-write with no concurrency guard

**Severity:** Medium

**Location:** src/pages/WorksheetReview.tsx:121-127,189-195, src/pages/PhaseReview.tsx:107-118, src/hooks/useAutoSave.ts:107-123

**Description:** 'Append-only' review_history is implemented as: read history into React state at page load, spread it with a new entry, and UPDATE the whole array. There is no WHERE guard on the current review_status (the buddy-approve precondition check at WorksheetReview.tsx:99-103 reads stale local state) and no JSONB || append or version column. useAutoSave's upsert (line 110, worksheet_data: data) also writes the full row last-write-wins.

**Why it is a problem:** Two concurrent reviewers (or a reviewer plus the joinee's auto-save 1.5s debounce) silently drop history entries or resurrect stale review_status. Example: buddy approves from a tab opened before the manager's phase approval — the UPDATE overwrites 'approved' back to 'buddy_approved' and truncates history. The audit trail the schema calls append-only is not trustworthy.

**Steps to reproduce:** Open the same worksheet review in two tabs, approve in tab A, request revision in tab B: B's write replaces A's history entry and final state.

**Expected behavior:** Transition-guarded update (.in('review_status', ['pending_review','revision_submitted']) in the WHERE) plus server-side history append via trigger or jsonb concat, checking affected row count.

**Current behavior:** .update({ ...update, review_history: [...existingHistory, historyEntry] }).eq('user_id', userId).eq('worksheet_id', worksheetId)

**Root cause:** No DB-level enforcement (trigger appending history, or transition CHECK) and no optimistic concurrency in client updates.

**Suggested fix:** Add .in('review_status', validPredecessors) to every transition UPDATE and treat 0 affected rows as a conflict; move review_history appending into a BEFORE UPDATE trigger so it is genuinely append-only.

### M12 — queryCache caches failed queries as null for 30s and fetchers discard the Supabase error object

**Severity:** Medium

**Location:** src/utils/queryCache.ts:51-67 (fetchWithCache), src/pages/AdminDashboard.tsx:78-89

**Description:** AdminDashboard fetchers map results with .then(r => r.data ...) — r.error is never inspected, so an errored query yields null. fetchWithCache stores whatever the fetcher returns (line 64-65) including that null, and serves it for the full 30s TTL. There is also no in-flight request dedup, so concurrent mounts fire duplicate queries before the first resolves.

**Why it is a problem:** One transient failure blanks the admin dashboard (instructors/worksheets lists empty) for 30 seconds with loading=false and no error UI; refresh within the TTL returns the cached null, making the outage look longer and confusing operators.

**Steps to reproduce:** Cause the worksheet_submissions select to fail once (kill network), open /admin, restore network, click refresh within 30s — still empty.

**Expected behavior:** Errors propagate (throw) and are never cached; only successful results enter the cache.

**Current behavior:** const data = await fetcher(); store.set(key, { data, expiresAt: now + ttl });

**Root cause:** Error channel dropped at the fetcher boundary; cache has no failure semantics.

**Suggested fix:** In fetchers: .then(r => { if (r.error) throw r.error; return r.data; }). In fetchWithCache: only store.set after a non-throwing fetcher, and keep a pending-promise map for dedup.

**Example implementation:**

```
const p = inflight.get(key) ?? fetcher(); try { const d = await p; store.set(key,{data:d,...}); return d; } finally { inflight.delete(key); }
```

### M13 — Reads across pages/hooks ignore the Supabase error object, producing misleading UI states

**Severity:** Medium

**Location:** src/pages/PhaseReview.tsx:70-75 & 217-226, src/components/PhaseAccessGuard.tsx:62-72, src/hooks/useDueDates.ts:126-134, src/hooks/useNotifications.ts:61-71, src/hooks/useAutoSave.ts:71-77

**Description:** Supabase-js resolves (never rejects) with { data, error }, so try/catch alone catches nothing. PhaseReview.loadData checks only .data: on error, instructor stays null and the page renders 'User Not Found' for a real user; submissions render 'Not Started'. PhaseAccessGuard's .then has no error branch or rejection handler — on error it silently locks Phase 2/3 ('fail closed' by accident, with a misleading 'complete Phase N-1' message). useDueDates and useNotifications likewise treat error as empty.

**Why it is a problem:** Reviewers see 'User Not Found' or all-Not-Started phases during transient failures and may take wrong actions (chasing joinees for 'missing' work). Joinees get locked out of phases they earned with instructions to redo the prior phase. No path distinguishes outage from truth anywhere in the read layer.

**Steps to reproduce:** Throttle to offline, navigate to /admin/review-phase/<id>/2 — 'User Not Found' renders for an existing user.

**Expected behavior:** Every query checks .error and routes to a distinct error state with retry, separate from 'row absent'.

**Current behavior:** if (instrRes.data) setInstructor(...); // error path falls through to 'User Not Found'

**Root cause:** Codebase-wide convention of destructuring only { data }; no shared query helper that throws or returns a typed error.

**Suggested fix:** Introduce one helper (e.g., unwrap<T>(res): T that throws on res.error) and adopt it in all ~14 files using the client; add an error+retry render branch to PhaseReview, PhaseAccessGuard, and dashboards.

### M14 — Concurrent-edit handling is last-write-wins: conflict detection only console.warns, and its own read ignores errors

**Severity:** Medium

**Location:** src/hooks/useAutoSave.ts:68-84 (conflict check), src/hooks/useWorksheet.ts:104-111 (overrideUserId shares the row)

**Description:** Before upserting, useAutoSave compares the locally captured updated_at with the server's, but on mismatch it logs '[AutoSave] Conflict detected ... Saving anyway (last-write-wins)' and proceeds. The read itself discards .error, so a failed check is treated as no conflict. Buddy gate-pass mode (useWorksheet overrideUserId, used by BuddyGatePass/useGateControl) writes to the joinee's row from the buddy's session, making cross-user concurrent edits routine, not exotic.

**Why it is a problem:** Two tabs, or buddy + joinee editing the same gate worksheet, silently clobber each other's worksheet_data and review metadata. The whole JSONB blob is replaced per save (line 110), so even non-overlapping field edits are lost. Users get a 'saved' indicator while their peer's data disappears.

**Steps to reproduce:** Joinee edits gc1 while buddy opens /buddy/gate-pass for the same gate and saves; earlier writer's fields vanish on next load.

**Expected behavior:** On conflict: block the save, refetch, and prompt the user (or merge field-wise); at minimum gate the upsert with .eq('updated_at', savedAt) and detect 0 rows affected.

**Current behavior:** if (current && current.updated_at !== savedAt) { console.warn(...); } // then upsert anyway

**Root cause:** Conflict signal detected but deliberately not acted on; no version column or merge strategy.

**Suggested fix:** Switch the write to update ... .eq('updated_at', savedAt).select() when a row exists; if it returns no rows, surface a 'worksheet changed elsewhere — reload' state instead of overwriting.

### L05 — Notification fan-out is sequential awaited inserts with swallowed failures inside critical workflow paths

**Severity:** Low

**Location:** src/hooks/useNotifications.ts:151-165 (triggerNotification), src/hooks/useAutoSave.ts:148-156, src/pages/PhaseReview.tsx:126-133 & 146-154, src/pages/WorksheetReview.tsx:153-161, src/hooks/useAutoPromote.ts:87-96

**Description:** triggerNotification catches and console.errors every insert failure, returning void — callers cannot tell notifications failed. Callers loop recipients with sequential awaits (one round-trip each) inside submit/approve flows, adding latency to the user-facing action; useAutoSave does this inside the auto-save path itself. useAutoPromote.ts:80 also passes fromUserId: null cast as string into a column typed UUID (works only because null survives the cast).

**Why it is a problem:** Reviewer notification is the primary submit signal (dashboards poll only every 15s and truncate at scale — see finding 5); silently dropped inserts mean submissions sit unreviewed. Sequential awaits make phase approval latency scale linearly with recipients. No retry, no dead-letter, no user feedback.

**Steps to reproduce:** Make notifications insert fail (violate the type CHECK or RLS); submit a worksheet — success toast shows, buddy never notified, nothing in the UI indicates it.

**Expected behavior:** Batch insert (single .insert(rows)) with the error surfaced to the caller, or DB triggers on worksheet_submissions transitions so notifications cannot be skipped by the client.

**Current behavior:** catch (err) { console.error('Error creating notification:', err); }

**Root cause:** Fire-and-forget error swallowing plus per-recipient awaits; notifications created client-side rather than by DB trigger on status change.

**Suggested fix:** Move notification creation into an AFTER UPDATE trigger on worksheet_submissions keyed on review_status transitions; until then, batch inserts into one call and report failures via toast.

**Example implementation:**

```
await supabase.from('notifications').insert(recipients.map(id => ({ user_id: id, ... })));
```

### L06 — Cross-account data bleed: employee name cached in a global localStorage key that is never cleared on sign-out

**Severity:** Low

**Location:** src/hooks/useAutoSave.ts:232-252 (getOAuthName)

**Description:** getOAuthName returns localStorage 'onboarding_employee_name' before consulting supabase.auth.getUser(), and the key is not namespaced by user id. Repo-wide grep confirms no removeItem for it anywhere (including AuthContext sign-out). On a shared machine, user B's first worksheet is prefilled with user A's full name, and auto-save persists it into B's worksheet_submissions row within 1.5s.

**Why it is a problem:** Wrong employee names written into submissions in shared-computer environments (labs/instructor workstations are the stated user base); reviewers see mismatched names, and it is a minor PII leak between accounts.

**Steps to reproduce:** Sign in as A, open a worksheet (name cached), sign out, sign in as B on the same browser, open a new worksheet — A's name is prefilled and auto-saved.

**Expected behavior:** Cache keyed by user id (e.g., onboarding_employee_name:<uid>) or cleared in signOut.

**Current behavior:** const cached = localStorage.getItem('onboarding_employee_name'); if (cached) return cached;

**Root cause:** Cache key ignores identity and has no invalidation hook.

**Suggested fix:** Key the cache by the authenticated user id and remove it in AuthContext signOut; simplest safe fix is dropping the cache — supabase.auth.getUser() reads the local session and is cheap.

### L07 — Buddy assignment check fails OPEN: on query error any buddy can approve any joinee's worksheet

**Severity:** Low

**Location:** src/pages/WorksheetReview.tsx:49-66 (isAssignedBuddy effect), db/schema.sql:366-374 (reviewer update policy)

**Description:** The client-side ownership check resolves setIsAssignedBuddy(true) in its rejection handler with the comment 'On error, allow (fail open for safety)' (line 65), and also allows when assigned_buddy_id is null. Because the DB reviewer-update RLS policy is role-based only (any lead_instructor can update any submission), this client check is the ONLY assignment enforcement, and it is designed to disable itself on failure.

**Why it is a problem:** Any buddy who hits a transient error (or crafts the request directly with the anon key — this is a browser-only client) can buddy-approve or send-to-revision worksheets of joinees not assigned to them, corrupting the review workflow's accountability. Severity limited to workflow integrity rather than data exposure, and the deeper fix belongs in RLS (security dimension), but the fail-open branch is an API-layer defect.

**Steps to reproduce:** As buddy X, open /buddy/review/<joinee-of-Y>/<ws> with the user_profiles select failing (or joinee has assigned_buddy_id null): approve button is active and the update succeeds under role-based RLS.

**Expected behavior:** Fail closed on error, and enforce assignment in the RLS WITH CHECK (reviewed_by must match user_profiles.assigned_buddy_id of the row's user_id).

**Current behavior:** }, () => setIsAssignedBuddy(true)); // On error, allow (fail open for safety)

**Root cause:** Authorization decision made client-side with a fail-open default; RLS does not encode assignment.

**Suggested fix:** Change the rejection/error branch to setIsAssignedBuddy(false) with a retry affordance, and add assignment enforcement to the worksheet_submissions reviewer update policy.

## Database — score 28/100

The "definitive" db/schema.sql is not actually runnable: it fails on a fresh database, silently destroys the role CHECK constraint on an existing one, and its security-hardening section drops policies by the wrong names, leaving the original permissive policies active. There is no migration framework — 17 overlapping paste-into-SQL-editor files with contradictory notifications schemas and RLS policies, so what the live DB actually contains is unknowable from the repo. Review state-machine transitions, role integrity, and cascade behavior all lack DB-level enforcement.

**Done well:** RLS is enabled on all four tables and every table has policies (db/schema.sql:52,105,173,273) · CHECK constraints exist for enum-like columns: role, review_status, reviewer_type, notification type, overall_status · UNIQUE(user_id, worksheet_id) on worksheet_submissions (schema.sql:170) correctly supports the app's upsert-based autosave · updated_at maintained by triggers on all three core tables (schema.sql:243-253) rather than trusting the client · handle_new_user trigger forcing role='new_joinee' on signup (schema.sql:377-403) is the right server-side design

### C07 — Security-hardening section drops RLS policies by wrong names — permissive originals remain active

**Severity:** Critical _(adversarially verified: CONFIRMED)_

**Location:** db/schema.sql:336 vs :63; :351-352 vs :185 and :207

**Description:** Section 9b drops "Users can update own profile" but section 2c created "Update own profile"; section 9c drops "Users can update own submissions"/"Reviewers can update submissions" but section 4 created "Update own submissions"/"Reviewers update submissions". The DROPs are no-ops, so both policy generations coexist. Permissive policies OR together, and a FOR UPDATE policy without WITH CHECK reuses its USING expression, so the old policies (auth.uid()=id / auth.uid()=user_id, no column restrictions) satisfy any write.

**Why it is a problem:** The hardened WITH CHECK at :342-348 (blocks self role change) and :358-364 is fully bypassed: a user can UPDATE their own role to academic_head, and 'Admin update profiles' (:75-79, keyed on client-writable user_metadata) lets a self-promoted user edit every profile. The entire section-9 audit fix is inert if schema.sql was run as written.

**Steps to reproduce:** Run schema.sql on a DB, then SELECT policyname FROM pg_policies WHERE tablename='user_profiles' AND cmd='UPDATE' — both 'Update own profile' (no WITH CHECK) and 'Users can update own profile' exist. As a new_joinee: supabase.from('user_profiles').update({role:'academic_head'}).eq('id', uid) succeeds.

**Expected behavior:** Exactly one UPDATE policy per actor per table, each with a WITH CHECK.

**Current behavior:** Old unrestricted UPDATE policies coexist with hardened ones; hardening has no effect.

**Root cause:** Policy names in the merged security migration (copied from supabase_migration_fix_rls_security.sql:65,83-84) never matched the names schema.sql itself creates.

**Suggested fix:** Drop the actual policy names ('Update own profile', 'Admin update profiles', 'Update own submissions', 'Reviewers update submissions') before creating the hardened versions; add a pg_policies assertion at the end of the script.

> Verifier evidence: schema.sql:63 creates "Update own profile" (USING only, no WITH CHECK); :336 drops "Users can update own profile" (never created) → no-op. :185/:207 create "Update own submissions"/"Reviewers update submissions"; :351-352 drop differently-named policies → no-ops. Permissive policies OR their WITH CHECK; a no-WITH-CHECK policy reuses USING (id=auth.uid()), so hardened checks at :342-348/:358-364 are bypassed. profile.role is trusted by ProtectedRoute.tsx:36.

### C08 — No DB-level enforcement of review state-machine transitions — users can self-approve

**Severity:** Critical _(adversarially verified: CONFIRMED)_

**Location:** db/schema.sql:354-364 (Users can update own submissions WITH CHECK), :366-374 (Reviewers can update submissions), :164 (review_history)

**Description:** Even the hardened owner-update policy WITH CHECK enumerates every review_status value including 'approved' and 'buddy_approved', so a new hire can set their own worksheet to approved. No trigger validates transition order (e.g. pending_review→approved only by reviewer). review_history is 'append-only' only in app code — owners can rewrite/erase it. Additionally, the reviewer policy grants onboarding_lead UPDATE, contradicting the read-only intent documented at schema.sql:206 and supabase_migration_add_buddy_approved.sql:43-48.

**Why it is a problem:** The core business invariant (3-phase gated approval, auto-promotion to lead_instructor at 17 approvals — useAutoPromote.ts) rests entirely on client code. One PostgREST call approves all 17 worksheets and triggers self-promotion.

**Steps to reproduce:** As the owning user: supabase.from('worksheet_submissions').update({review_status:'approved'}).eq('user_id', uid) — passes WITH CHECK at schema.sql:362.

**Expected behavior:** Transitions enforced server-side per role; owner limited to draft/submit/resubmit.

**Current behavior:** Any allowed enum value writable by the row owner; transition order unenforced; onboarding_lead can write despite documented read-only role.

**Root cause:** CHECK constraint validates set membership of values, not transitions; all workflow logic lives client-side with anon-key writes.

**Suggested fix:** Add a BEFORE UPDATE trigger that validates (old.review_status, new.review_status, get_user_role()) against an allowed-transition table; restrict owner WITH CHECK to ('','pending_review','revision_submitted'); make the trigger append to review_history server-side; remove onboarding_lead from the update policy.

**Example implementation:**

```
IF auth.uid() = NEW.user_id AND NEW.review_status IN ('approved','buddy_approved','needs_revision') AND NEW.review_status IS DISTINCT FROM OLD.review_status THEN RAISE EXCEPTION 'reviewer-only transition'; END IF;
```

> Verifier evidence: schema.sql:354-364 owner WITH CHECK permits review_status='approved'; no state-machine trigger exists (grep). Self-promotion is also reachable: the hardened DROP (:336) targets "Users can update own profile" but the original permissive "Update own profile" (:63, USING id=auth.uid(), no WITH CHECK) is never dropped and OR-combines, plus "Admin update profiles" (:75) has OR id=auth.uid(). onboarding_lead granted UPDATE at :370-373 contradicts :206.

### H08 — Canonical schema.sql is unrunnable on fresh DB and destroys the role CHECK on an existing DB

**Severity:** High _(adversarially verified: DOWNGRADED to this severity)_

**Location:** db/schema.sql:37 (ALTER TABLE ... DROP CONSTRAINT), :39-50 (CREATE TABLE IF NOT EXISTS), :55-79 and :243-253 (non-idempotent CREATE POLICY/TRIGGER)

**Description:** Line 37 runs ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS before the table exists — on a fresh database the whole script aborts. On an existing database, the DROP succeeds, CREATE TABLE IF NOT EXISTS is a no-op, and no ADD CONSTRAINT follows, so user_profiles_role_check is permanently removed. Re-running also fails at the first duplicate CREATE POLICY/CREATE TRIGGER (no IF NOT EXISTS / DROP-first).

**Why it is a problem:** The file the header calls 'the ONE FILE you need to run' (lines 3-17) cannot bootstrap a new environment, and running it against the live DB removes role validation, allowing arbitrary role strings into user_profiles.

**Steps to reproduce:** Run db/schema.sql in a fresh Postgres/Supabase project: error 'relation user_profiles does not exist'. Run it against an existing project, then \d user_profiles: role CHECK is gone.

**Expected behavior:** One idempotent script that converges any environment to the canonical schema.

**Current behavior:** Script errors on fresh DB; drops and never re-adds role CHECK on existing DB; fails on re-run.

**Root cause:** Hand-merged migrations concatenated into one file without testing against either a fresh or an existing database.

**Suggested fix:** Guard the DROP with a DO block or move it after CREATE TABLE, then explicitly ADD CONSTRAINT user_profiles_role_check; make every CREATE POLICY/TRIGGER idempotent (DROP ... IF EXISTS first).

**Example implementation:**

```
CREATE TABLE IF NOT EXISTS user_profiles (...);
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check CHECK (role IN (...));
```

> Verifier evidence: db/schema.sql:37 DROP CONSTRAINT precedes CREATE TABLE (line 39) — fresh-DB run aborts; no ADD CONSTRAINT anywhere in file; policies (lines 55-79) lack IF NOT EXISTS. But via the documented SQL-editor run (lines 14-16), the duplicate-policy error rolls back the whole implicit transaction, so the live constraint drop is not persisted; RLS role checks use JWT (lines 321-348), not the CHECK, so no escalation.

### H09 — Conflicting notifications table definitions — due-date cron function violates the canonical CHECK constraint

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** db/schema.sql:261-271 vs db/__migration_notifications_dates.sql:9-26; db/__due_date_notifications.sql:48-59, 81-99; src/types/supabase.ts:145-152

**Description:** schema.sql's notifications CHECK allows ('submitted','buddy_approved','approved','needs_revision','revision_submitted','phase_approved','promoted'); the older migration's CHECK allows ('submitted','revision_submitted','approved','buddy_approved','needs_revision','due_soon','overdue') and makes user_id/worksheet_id NOT NULL where schema.sql leaves both nullable. Both use CREATE TABLE IF NOT EXISTS, so whichever ran first wins silently. check_due_date_notifications() inserts type 'overdue'/'due_soon', which violate schema.sql's CHECK. TS NotificationType includes due_soon/overdue but not phase_approved/promoted; NotificationBell.tsx:28-29 renders types the canonical schema forbids.

**Why it is a problem:** If the schema.sql table is live, the pg_cron due-date job fails with a check_violation on every overdue/due-soon worksheet — the entire due-date notification feature silently never fires. If the older table is live, worksheet_id NOT NULL and the missing types diverge from what the app assumes.

**Steps to reproduce:** On a schema.sql-created DB: SELECT * FROM check_due_date_notifications() with any past-due submission → ERROR new row violates check constraint "notifications_type_check".

**Expected behavior:** Single table definition whose CHECK is a superset of every value written by app code and DB functions.

**Current behavior:** Two incompatible CHECK constraints in the repo; cron insert values illegal under the canonical one.

**Root cause:** Two independent definitions of the same table across un-ordered migration files, with the enum extended in different directions in each.

**Suggested fix:** Define one canonical CHECK as the union ('submitted','revision_submitted','approved','buddy_approved','needs_revision','phase_approved','promoted','due_soon','overdue'), migrate via DROP CONSTRAINT/ADD CONSTRAINT, delete the stale definition, and align src/types/supabase.ts NotificationType.

> Verifier evidence: db/schema.sql:266-267 CHECK lacks due_soon/overdue; db/__due_date_notifications.sql:53,86 inserts exactly those types → check_violation on schema.sql-first deploys; both tables use CREATE TABLE IF NOT EXISTS (schema.sql:261, __migration_notifications_dates.sql:9) so ordering silently decides; no reconciling ALTER in db/; supabase.ts:146-152 and NotificationBell.tsx:28-29 confirm TS/UI drift.

### H10 — No migration framework: 17 overlapping ad-hoc SQL files with contradictory RLS, live-DB state unknowable

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** db/ (15 files) + supabase_migration_fix_rls_security.sql, supabase_migration_add_buddy_approved.sql at repo root; no supabase/migrations/ directory

**Description:** Every file is a paste-into-SQL-editor script with no ordering, versioning, or applied-state tracking. They contradict each other: db/__setup_supabase.sql:72-85 creates the self-referencing user_profiles policies that cause the RLS recursion later files fix; db/setup_correct.sql:29-41 recreates user_metadata-JWT policies that undo supabase_migration_fix_rls_security.sql; three files redefine worksheet_submissions_review_status_check. Which subset ran against project fuoqoryqndtdooujslee is undocumented.

**Why it is a problem:** No reproducible environments, no rollback, and any teammate re-running an older file (several say 'RUN THIS ENTIRE SCRIPT') silently reintroduces the recursion bug or reverts security fixes. Disaster recovery would be guesswork.

**Expected behavior:** Versioned migration chain applied identically in dev/CI/prod, verifiable with supabase db diff.

**Current behavior:** Unordered mutually-contradictory scripts; canonical file itself broken (see finding 1).

**Root cause:** Schema evolved through Supabase SQL editor sessions; files were kept as informal history instead of adopting supabase db migrations.

**Suggested fix:** Adopt Supabase CLI migrations: supabase db pull to snapshot the real live schema as migration 0001, convert schema.sql into ordered idempotent migrations, delete or archive the 15 legacy scripts, and add supabase db push/diff to CI.

> Verifier evidence: db/__setup_supabase.sql:72-85 self-referencing user_profiles subquery policies; db/setup_correct.sql:11-41 drops policies and recreates client-writable user_metadata JWT role checks that supabase_migration_fix_rls_security.sql:6,21-23 calls a privilege-escalation path; review_status_check redefined in __migration_notifications_dates.sql:49, supabase_migration_add_buddy_approved.sql:13, plus conflicting inline checks (schema.sql:151 vs supabase_schema.sql:100); no supabase/migrations/ dir; "RUN THIS ENTIRE SCRIPT" at __setup_supabase.sql:2.

### H11 — No ON DELETE rules on any foreign key — user deletion fails with FK violations

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** db/schema.sql:40,46,47,88,131,158,263,264 (all FK definitions); grep 'ON DELETE' across db/*.sql and root *.sql returns zero matches

**Description:** Every FK (user_profiles.id→auth.users, assigned_lead_id→user_profiles, assigned_buddy_id→auth.users, worksheet_submissions.user_id and reviewed_by→auth.users, notifications.user_id/from_user_id→auth.users, onboarding_submissions.user_id→auth.users) uses the default NO ACTION.

**Why it is a problem:** Deleting an auth user via the Supabase dashboard or admin API (offboarding, GDPR erasure, or scripts/setup/delete_all_users.mjs) throws foreign_key_violation until every dependent row across 4+ tables is manually deleted in dependency order. db/__setup_supabase.sql:12-37 already has to hand-order its deletes to work around this.

**Expected behavior:** Explicit CASCADE/SET NULL per relationship so offboarding is one delete.

**Current behavior:** All FKs NO ACTION; user deletion blocked.

**Root cause:** Cascade semantics never specified when tables were created.

**Suggested fix:** ON DELETE CASCADE for user-owned data (user_profiles.id, worksheet_submissions.user_id, notifications.user_id, onboarding_submissions.user_id) and ON DELETE SET NULL for reference-only columns (reviewed_by, from_user_id, assigned_lead_id, assigned_buddy_id).

**Example implementation:**

```
ALTER TABLE worksheet_submissions DROP CONSTRAINT worksheet_submissions_user_id_fkey, ADD CONSTRAINT worksheet_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
```

> Verifier evidence: db/schema.sql:40,46,47,88,131,158,263,264 all use bare REFERENCES (NO ACTION); repo-wide grep finds zero ON DELETE. schema.sql:399-401 trigger auto-creates a user_profiles row per auth user, so every deletion FK-violates. Workarounds (__setup_supabase.sql:12-37, scripts/delete_all_users.mjs) hand-order deletes but skip notifications and onboarding_submissions, so they still fail.

### H12 — get_user_role() trusts client-writable user_metadata; the app_metadata backfill was never enabled

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** db/schema.sql:321-333 (COALESCE fallback at :329-330); supabase_migration_fix_rls_security.sql:42-53 (backfill commented out); src/hooks/useAutoPromote.ts:60-72

**Description:** The role-resolution function every hardened policy depends on falls back to auth.jwt()->'user_metadata'->>'role' when app_metadata.role is empty. user_metadata is settable by any authenticated user via supabase.auth.updateUser — the app itself does exactly this in useAutoPromote. The one-time migration copying roles into server-only app_metadata is commented out, and nothing in the repo sets app_metadata, so in practice every JWT resolves role from the client-writable field.

**Why it is a problem:** All role-gated DB policies (reviewer updates :366-374, notification inserts :282-291, the role-change escape hatch :346) are satisfiable by any user after one updateUser call — DB-level authorization is forgeable even where the policies themselves are correct.

**Steps to reproduce:** As new_joinee: await supabase.auth.updateUser({data:{role:'academic_head'}}); refresh session; reviewer UPDATE on any worksheet_submissions row now passes get_user_role() checks.

**Expected behavior:** role read exclusively from server-controlled app_metadata (or from user_profiles via SECURITY DEFINER lookup).

**Current behavior:** role := COALESCE(app_metadata.role, user_metadata.role, '') with user_metadata client-writable.

**Root cause:** Defense-in-depth migration shipped with its critical data step disabled 'for later' and no follow-up.

**Suggested fix:** Run the app_metadata backfill, remove the user_metadata fallback from get_user_role(), and manage role changes via a SECURITY DEFINER RPC or service-role edge function that writes app_metadata.

> Verifier evidence: db/schema.sql:329-330 COALESCE falls back to auth.jwt()->'user_metadata'->>'role'; supabase_migration_fix_rls_security.sql:42-56 backfill fully commented out, and no code repo-wide writes raw_app_meta_data or uses the admin API; useAutoPromote.ts:69-71 proves client-side updateUser sets user_metadata.role. All get_user_role()-gated policies (reviewer updates, notifications insert, user_profiles role escape hatch) are thus forgeable by any authenticated user.

### M15 — Nullable user_id and unconstrained status/phase/worksheet_id on worksheet_submissions

**Severity:** Medium

**Location:** db/schema.sql:131 (user_id no NOT NULL), :138 (phase, no CHECK), :141 (status, no CHECK), :132 (worksheet_id free text), :170 (UNIQUE)

**Description:** user_id lacks NOT NULL, and under default NULLS DISTINCT semantics the UNIQUE(user_id, worksheet_id) constraint permits unlimited NULL-user rows, so orphan/duplicate submissions are representable. status has no CHECK — mixed-case values ('Not Started','In Progress','submitted') are stored free-form, and TS adds a 'Reviewed' value (src/types/supabase.ts:65) that nothing writes. phase and worksheet_id accept any string despite fixed known sets (phase-1..3, ~30 worksheet IDs in src/types/supabase.ts:30-49).

**Why it is a problem:** Data-quality drift the DB cannot catch: a typo'd worksheet_id or casing variant of status silently creates rows invisible to dashboards, gate logic (isCompleteReviewStatus) and phase-progress counts.

**Expected behavior:** NOT NULL identity column and CHECK-constrained enums matching src/constants/status.ts.

**Current behavior:** user_id nullable; status/phase/worksheet_id unvalidated text.

**Root cause:** Columns added incrementally without tightening constraints once value sets stabilized.

**Suggested fix:** SET NOT NULL on user_id (after cleaning NULLs); add CHECK constraints for status ('Not Started','In Progress','submitted') and phase ('phase-1','phase-2','phase-3','week-1'..'week-4' as applicable); reconcile TS 'Reviewed'.

### M16 — handle_new_user trigger conflicts with client-side profile INSERT at signup

**Severity:** Medium

**Location:** db/schema.sql:377-403 (trigger); src/context/AuthContext.tsx:184-190 (insert)

**Description:** The AFTER INSERT trigger on auth.users creates the user_profiles row (role forced to 'new_joinee'). The app then unconditionally INSERTs the same primary key with the signup form's role; with the trigger live this always fails with 23505 duplicate-key, which is only console-logged (notifyError). The two creation paths disagree on role and neither upserts.

**Why it is a problem:** Every email/password signup produces a swallowed DB error; users who selected lead_instructor/academic_head/onboarding_lead at signup silently become new_joinee with no surfaced explanation — support burden and confusion over whether the trigger is even deployed (drift unknown per finding 5).

**Steps to reproduce:** Sign up with role 'onboarding_lead'; observe 'Profile creation error: duplicate key value violates unique constraint user_profiles_pkey' in console; profile row has role new_joinee.

**Expected behavior:** Single server-side creation path; client only updates its own non-privileged profile fields.

**Current behavior:** Client INSERT races the trigger and always fails; chosen role silently ignored.

**Root cause:** Server-side profile creation added by the security migration without removing/adapting the pre-existing client-side insert.

**Suggested fix:** Remove the client insert (or convert to an UPDATE of non-privileged fields like department); handle privileged role assignment via an admin flow; surface the intended-role request to admins instead of dropping it.

### L08 — Duplicate/redundant indexes and missing notifications indexes in canonical schema

**Severity:** Low

**Location:** db/schema.sql:228,236 vs :410-415; :170 (UNIQUE implicit index); db/__migration_notifications_dates.sql:45-46

**Description:** idx_profiles_buddy (:236) and idx_user_profiles_assigned_buddy (:414) index the same column; idx_worksheets_user (:228) and idx_worksheet_submissions_user_worksheet (:410) are both leading-prefix redundant with the implicit UNIQUE(user_id, worksheet_id) index. Meanwhile the (user_id, read) and created_at DESC indexes on notifications exist only in the older migration, not in schema.sql (:412 indexes user_id alone), so a schema.sql-built DB lacks the unread-count/ordering indexes useNotifications relies on.

**Why it is a problem:** Wasted write amplification and storage on hot tables; notifications unread queries degrade as the table grows (client inserts one row per reviewer per event).

**Expected behavior:** One index per access path; notifications indexed for unread-count and recency queries.

**Current behavior:** Three redundant indexes; unread/recency indexes missing from canonical file.

**Root cause:** Index sections appended per-migration into schema.sql without deduplication against constraint-backed indexes.

**Suggested fix:** Drop idx_profiles_buddy, idx_worksheets_user, and idx_worksheet_submissions_user_worksheet; add idx_notifications_user_read (user_id, read) and idx_notifications_created (created_at DESC) to schema.sql.

### L09 — Legacy onboarding_submissions table allows duplicate rows per user and unchecked updates

**Severity:** Low

**Location:** db/schema.sql:86-122; src/pages/Assessment.tsx (still queries the table)

**Description:** onboarding_submissions has nullable user_id, no UNIQUE(user_id) or (email), and its UPDATE policy (:120-122) has USING only — no WITH CHECK — so a user can update rows into arbitrary states (overall_status 'assessed', all phases complete). Nothing keeps its phaseN_completed flags consistent with worksheet_submissions reality.

**Why it is a problem:** The still-routed /assessment page can create multiple contradictory assessment rows per user, and self-attested completion flags can diverge from the actual worksheet review states.

**Expected behavior:** One assessment row per user or table removed.

**Current behavior:** Duplicate rows possible; UPDATE unchecked.

**Root cause:** Table predates the worksheet_submissions workflow and was never constrained or retired.

**Suggested fix:** Either drop the table and the /assessment route, or add UNIQUE(user_id), NOT NULL user_id, and a WITH CHECK mirroring the SELECT/INSERT ownership rule.

## Input Validation — score 34/100

Nearly all validation is client-side and trivially bypassable via direct PostgREST calls with the committed anon key. The review state machine, reviewer identity metadata, and signup role are all client-computed values the DB accepts without transition or authorship checks. Form-level validation is thin (most worksheets require one field, no length limits anywhere, no validation library), and the legacy Assessment form is functionally broken against its own RLS policies. XSS surface is small thanks to consistent JSX rendering, which is the main saving grace.

**Done well:** No HTML injection sinks: zero dangerouslySetInnerHTML/innerHTML uses and no dynamic user-controlled hrefs in src/ — all user text renders through JSX escaping · DB CHECK constraints enumerate review_status, reviewer_type, notification type, and role values (db/schema.sql:44,151,155,267), and UNIQUE(user_id, worksheet_id) at schema.sql:170 prevents duplicate worksheet rows and enables safe upsert · Revision requests require a non-empty trimmed comment (WorksheetReview.tsx:169-171) and buddy approval checks current state before acting (WorksheetReview.tsx:99-103) · Gate control prerequisite check fails closed on query error (useGateControl.ts:51-55) and re-verifies phase worksheet approvals server-side data at submit time · handle_new_user trigger (db/schema.sql:377-403) forces profile role to new_joinee regardless of client-supplied metadata

### H13 — Review state machine is client-computed; DB lets users set their own review_status to 'approved'

**Severity:** High _(adversarially verified: DOWNGRADED to this severity)_

**Location:** db/schema.sql:354-364 (own-update WITH CHECK), db/schema.sql:151 (value-only CHECK), src/hooks/useAutoSave.ts:88-94,114 (client computes review_status)

**Description:** review_status transitions are computed entirely in the browser (useAutoSave.ts:88-94) and the 'Users can update own submissions' policy WITH CHECK enumerates ALL values including 'approved' and 'buddy_approved'. No trigger or policy validates transition order or that only reviewers may set approval states.

**Why it is a problem:** A new hire can PATCH their own worksheet_submissions rows to review_status='approved' via PostgREST using the anon key committed in .env. Since useAutoPromote promotes to lead_instructor when all 17 sheets are approved, this forges the entire onboarding outcome.

**Steps to reproduce:** As a new_joinee, call supabase.from('worksheet_submissions').update({review_status:'approved'}).eq('user_id', myId) from the browser console — RLS accepts it.

**Root cause:** State machine validation exists only in client hooks; DB CHECK validates value membership, not transitions or actor role.

**Suggested fix:** Add a BEFORE UPDATE trigger validating (old.review_status -> new.review_status) transitions and restricting approval states to reviewer roles; tighten the own-update WITH CHECK to exclude 'approved'/'buddy_approved'.

**Example implementation:**

```
WITH CHECK (auth.uid() = user_id AND review_status IN ('', 'pending_review', 'revision_submitted'))
```

> Verifier evidence: schema.sql:151,354-364 + un-dropped 185-187 policy let a user PATCH own review_status='approved' (no trigger; client-computed useAutoSave.ts:88-94,114). But the claimed lead_instructor promotion is blocked: useAutoPromote.ts:61-64 role update fails schema.sql:338-348 (9b) WITH CHECK for a new_joinee. Self-approval real; role escalation mitigated.

### H14 — Signup role accepted from client and trusted by get_user_role() via user_metadata

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** src/context/AuthContext.tsx:169-189 (signUp role param into options.data and profile insert), db/schema.sql:321-333 (get_user_role reads user_metadata)

**Description:** signUp(email, password, fullName, role) passes a caller-chosen role into auth user_metadata and inserts it into user_profiles. Nothing server-side validates the role input: handle_new_user forces the profile row to new_joinee, but get_user_role() — which gates reviewer RLS policies on worksheet_submissions and notifications — COALESCEs client-writable user_metadata.

**Why it is a problem:** Anyone can call supabase.auth.signUp with data:{role:'academic_head'} against the public anon key and immediately receive reviewer/admin-class RLS privileges (read all submissions, update any submission).

**Steps to reproduce:** supabase.auth.signUp({email, password, options:{data:{role:'academic_head'}}}) then query worksheet_submissions of other users — the reviewer SELECT policy at schema.sql:191-201 passes.

**Root cause:** Role, a privileged enum, is treated as ordinary client input; RLS trusts JWT user_metadata instead of server-only app_metadata.

**Suggested fix:** Switch get_user_role() and JWT-based policies to app_metadata only (the fix already drafted in supabase_migration_fix_rls_security.sql is not in db/schema.sql); ignore client-supplied role at signup.

> Verifier evidence: AuthContext.tsx:174 writes caller role into user_metadata; schema.sql:328-332 get_user_role falls back to client-writable user_metadata; policies at schema.sql:193,209,289 read user_metadata directly (read/update all submissions). handle_new_user:393 only fixes profile-table role, not JWT. updateUser also rewrites user_metadata anytime.

### H15 — Reviewer identity columns written from client-controlled worksheet_data keys; reviewed_by wiped on every joinee autosave

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** src/hooks/useAutoSave.ts:103-118 (reviewed_by/reviewed_at/reviewer_name from data._saved*), src/hooks/useWorksheet.ts:123-131 (_savedReviewedBy never hydrated)

**Description:** useAutoSave copies data._savedReviewedBy/_savedReviewedAt/_savedReviewerName — plain keys in the client form-state object — into the reviewed_by, reviewed_at, reviewer_name DB columns on the owner's own upsert. A joinee can forge reviewer identity by injecting these keys. Worse, useWorksheet never loads _savedReviewedBy from the DB, so every joinee autosave after a review sets reviewed_by = null.

**Why it is a problem:** Reviewer audit trail is both forgeable (joinee can stamp any reviewer name) and silently destroyed (reviewed_by nulled on any post-review edit, e.g. the needs_revision resubmit flow), making review provenance unreliable.

**Steps to reproduce:** Buddy approves via WorksheetReview (sets reviewed_by); joinee reopens the worksheet after needs_revision and types one character — autosave upserts reviewed_by: null (useAutoSave.ts:116).

**Root cause:** Server-authoritative reviewer columns are round-tripped through untrusted client form state instead of being written only by reviewer actions.

**Suggested fix:** Never write reviewed_by/reviewed_at/reviewer_name from the owner's autosave path (omit them from the upsert payload unless in buddy mode), and add a trigger rejecting reviewer-column changes where auth.uid() = user_id.

> Verifier evidence: useAutoSave.ts:103-118 upserts reviewed_by/reviewer_name from client keys; useWorksheet.ts:123-131 never hydrates _savedReviewedBy, so autosave (fires on mere open, useAutoSave.ts:196-201) nulls reviewed_by. RLS (supabase_migration_fix_rls_security.sql:88-102) WITH CHECK guards only review_status — reviewer columns and review_history are joinee-writable, so provenance is forgeable.

### H16 — Assessment form violates its own RLS (missing user_id), reports false success, and has no unique-email constraint

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** src/pages/Assessment.tsx:53-70, db/schema.sql:86-122

**Description:** The insert at Assessment.tsx:63 omits user_id, so the INSERT policy WITH CHECK (auth.uid() = user_id) at schema.sql:115-117 evaluates NULL and rejects every insert. The update branch filters by id but RLS USING (auth.uid() = user_id) matches 0 rows on user_id-null rows, and supabase returns no error for 0-row updates — the UI shows 'Assessment Submitted' with nothing saved. Additionally onboarding_submissions.email has no UNIQUE constraint, and the select-then-insert at line 53 is a TOCTOU race; duplicate emails would then make .maybeSingle() error permanently.

**Why it is a problem:** The final readiness assessment — the program's terminal output — either hard-fails with an RLS error or silently succeeds with zero rows written; assessors believe assessments are recorded when they are not.

**Steps to reproduce:** Log in as any role, open /assessment, fill required fields, submit — insert returns RLS violation (or 0-row update path shows success screen).

**Root cause:** Legacy form never updated when RLS was added; missing NOT NULL on user_id and missing UNIQUE(email) let the mismatch go unnoticed.

**Suggested fix:** Include user_id: auth user id in the insert, add UNIQUE(email) (or key on user_id) and use upsert with onConflict, and treat 0-affected-row updates as errors. Restrict the route/policy to assessor roles.

> Verifier evidence: Assessment.tsx:63 inserts without user_id; schema.sql:115-117 WITH CHECK (auth.uid()=user_id) rejects every insert (no default/trigger sets user_id; anon-key client, supabase.ts:48). Update branch (Assessment.tsx:61) silently matches 0 rows under schema.sql:120-122. schema.sql:91: email has no UNIQUE. Feature is fully broken, though insert failures surface visibly (Assessment.tsx:65-68), so false-success is the rarer path.

### M17 — Notification inserts from new joinees contradict the schema's INSERT policy; failures swallowed silently

**Severity:** Medium

**Location:** db/schema.sql:282-291 vs src/hooks/useAutoSave.ts:148-156, src/context/AuthContext.tsx:191-203, src/hooks/useNotifications.ts:151-165; db/__migration_notifications_dates.sql:35-37

**Description:** The canonical policy only permits inserting notifications where user_id = auth.uid() or the inserter has a reviewer role. But the app's core flow has new_joinee users inserting notifications FOR reviewers (worksheet submitted, new signup). triggerNotification catches and console.errors all failures. An older migration file instead grants WITH CHECK (true) — allowing anyone to forge notifications to any user — and it is unknown which policy is live.

**Why it is a problem:** Under the canonical schema, reviewers are never notified of submissions or new joiners (silent workflow breakage); under the legacy policy, any authenticated user can spam/spoof notifications (e.g. fake 'approved' messages) to anyone. Either state is a production defect.

**Steps to reproduce:** Apply db/schema.sql fresh, submit a worksheet as new_joinee — the notifications insert at useAutoSave.ts:149 is RLS-rejected and only logged to console.

**Root cause:** Client-side fan-out inserts to other users' notification rows cannot be validated by RLS without trusting the sender; schema drift across three SQL sources.

**Suggested fix:** Move notification creation into a SECURITY DEFINER function or DB trigger on worksheet_submissions status changes; surface insert failures; reconcile schema.sql with the root migration files.

### M18 — Worksheet content validation is one field deep, client-only, and DB accepts any JSONB shape and any status string

**Severity:** Medium

**Location:** src/hooks/useWorksheet.ts:179-186 (validate), src/pages/worksheets/Phase1Worksheet4.tsx:21 (and 12 similar files requiring only employeeName), db/schema.sql:135,141

**Description:** 13 of 17 worksheets list only employeeName as a required field, so entire submissions can go to review with every domain field empty. validate() runs only in the browser; the upsert path (useAutoSave.ts:107-123) writes whatever object is in memory — including all _saved* metadata duplicated into worksheet_data (line 110) — and the status column has no CHECK constraint, accepting any string.

**Why it is a problem:** Reviewers receive structurally empty or garbage submissions; direct API writes can store arbitrary keys, spoofed _savedReviewComment text shown nowhere near truth, or invalid status values that break dashboard filters; worksheet_data doubles as an unvalidated dumping ground.

**Root cause:** Validation config was stubbed to the single common field; no server-side schema layer exists (no zod/yup in package.json).

**Suggested fix:** Define per-worksheet required-field lists matching the actual form sections; add a CHECK on status ('Not Started','In Progress','submitted'); strip _saved* keys before persisting; optionally validate worksheet_data server-side with a jsonschema CHECK or trigger.

### M19 — No maximum length limits on any input, client or database

**Severity:** Medium

**Location:** src/ (zero maxLength attributes repo-wide), src/pages/WorksheetReview.tsx:406 (review comment textarea), db/schema.sql:132-164,268 (unbounded TEXT/JSONB)

**Description:** Not a single input or textarea in src/ sets maxLength, and every DB column is unbounded TEXT or JSONB. Review comments, notification messages, full names, and worksheet fields accept arbitrarily large strings; autosave persists the full payload every 1.5s (useAutoSave.ts:201).

**Why it is a problem:** A multi-megabyte paste into any worksheet field is round-tripped on every keystroke debounce, bloats worksheet_data rows, inflates notification messages (needs_revision message embeds the full comment, WorksheetReview.tsx:212), and can degrade dashboards that fetch select('*').

**Suggested fix:** Add maxLength to inputs (e.g. 200 for names, 5000 for textareas), enforce with CHECK (char_length(...)) or a size trigger on worksheet_data (e.g. pg_column_size < 100KB).

**Example implementation:**

```
ALTER TABLE worksheet_submissions ADD CONSTRAINT ws_data_size CHECK (pg_column_size(worksheet_data) < 102400);
```

### M20 — review_history 'append-only' guarantee exists only in client read-modify-write code

**Severity:** Medium

**Location:** src/pages/WorksheetReview.tsx:114-127 and 183-197 (existingHistory spread + update), db/schema.sql:164

**Description:** Review history is appended by reading the current array into React state and writing back [...existingHistory, entry]. Nothing in the DB prevents replacement: concurrent reviewer actions (buddy and manager reviewing simultaneously) last-write-wins and drop entries, and the owner's update policy allows a joinee to rewrite or empty their own review_history via direct API.

**Why it is a problem:** The audit timeline shown to managers (WorksheetReview.tsx:342) can silently lose or be scrubbed of needs_revision entries, undermining the review trail the feature exists to provide.

**Root cause:** JSONB array treated as client-managed state rather than a server-appended log.

**Suggested fix:** Append server-side: update via SQL 'review_history = review_history || $1::jsonb' through an RPC, and add a trigger rejecting updates where the new array is not a superset/prefix-extension of the old one.

### L10 — Date fields unvalidated: 'must be by Day 3' rule unchecked, dateSubmitted stored as locale string

**Severity:** Low

**Location:** src/pages/worksheets/Phase1Worksheet1.tsx:24,85 (buddyAssignmentDate), src/hooks/useWorksheet.ts:200 (dateSubmitted = toLocaleDateString('en-IN'))

**Description:** The required-field label asserts the buddy assignment date 'must be by Day 3' but validation only checks non-emptiness; any past/future date passes. dateSubmitted is persisted as an en-IN locale string (dd/mm/yyyy) inside JSONB while every other timestamp is ISO, making submissions unsortable and ambiguous for reviewers or future reporting.

**Why it is a problem:** Policy deadlines shown in the UI are not enforced, and mixed date formats in stored data will break any later sorting, SLA, or export logic.

**Suggested fix:** Validate date ranges in validate() (compare against profile created_at + 3 days), store dateSubmitted as new Date().toISOString() and format for display only.

### L11 — Review-status string literals hardcoded in 18 files despite constants module; status casing mixed with no DB backstop

**Severity:** Low

**Location:** src/constants/status.ts (canonical), 18 non-test src files with literals incl. src/hooks/useWorksheet.ts:220-221, src/hooks/useGateControl.ts:159-162, src/pages/WorksheetReview.tsx:100-108, src/pages/PhaseReview.tsx

**Description:** constants/status.ts exists precisely to prevent casing drift, yet 18 source files still compare/write raw literals ('approved', 'buddy_approved', 'needs_revision', etc.). The status column mixes casing conventions ('In Progress'/'Not Started' vs 'submitted') and has no CHECK constraint, so a single typo'd literal writes silently and breaks equality-based dashboard filters.

**Why it is a problem:** Refactors of the state machine (e.g. adding a state) must touch 18 files; one missed or misspelled literal produces silent data corruption rather than an error.

**Suggested fix:** Sweep remaining literals to REVIEW_STATUS/SUBMISSION_STATUS imports (lint rule: no-restricted-syntax on these strings) and add the missing CHECK on status.

### L12 — Password policy is 6 chars client-side only; email format relies solely on browser type=email

**Severity:** Low

**Location:** src/pages/Signup.tsx:21-28, src/pages/Assessment.tsx:47,130

**Description:** Signup enforces only length >= 6 in the browser (mirroring the Supabase default) with no complexity or breach checks, and email validation everywhere is just the HTML type attribute — programmatic calls bypass both. The Assessment form's email field feeds a lookup key with no normalization (case/whitespace), so 'Jane@x.com' and 'jane@x.com' create distinct records.

**Why it is a problem:** Weak credentials for accounts that hold review/approval power, and email-keyed assessment records fragment on trivial input variations.

**Suggested fix:** Raise the minimum password requirements in Supabase Auth settings (server-enforced), and normalize emails (trim + lowercase) before lookups/inserts.

## Error Handling & Resilience — score 38/100

The app has real scaffolding (route-level ErrorBoundary, toast bridge, autosave retry with backoff), but error handling is systematically undermined by one pattern: supabase-js returns errors in the result object and never throws, yet ~19 call sites destructure only { data }, making most try/catch blocks dead code and turning outages into silently-wrong UI. One path (failed worksheet load then autosave upsert) can destroy saved/approved worksheet data. There is no timeout handling, no global rejection handler, and no error telemetry, so production failures are invisible to both users and operators.

**Done well:** Route-level ErrorBoundary that auto-resets on navigation (src/App.tsx:97, src/components/ErrorBoundary.tsx:31-35) with a polished fallback UI and reload/retry actions · Central toast event bridge (src/utils/errorHandling.ts) correctly wired into ToastProvider (src/components/Toast.tsx:92-95), allowing non-React code to surface errors · Autosave has retry with linear backoff (2 retries, useAutoSave.ts:172-186) plus a last-write-wins conflict detection probe (useAutoSave.ts:68-84) · Missing-env Supabase client is replaced by a recursive throw-proxy with actionable messages instead of undefined-method crashes (src/api/supabase.ts:13-56) · Submit paths (useWorksheet.ts:210-216, useGateControl.ts:183-190) set submitError state and show a user-facing error toast rather than failing silently

### C09 — Silent worksheet-load failure lets autosave overwrite saved data with defaults (data loss)

**Severity:** Critical _(adversarially verified: CONFIRMED)_

**Location:** src/hooks/useAutoSave.ts:218-230 (loadWorksheetData), src/hooks/useWorksheet.ts:115-149, src/hooks/useAutoSave.ts:191-203

**Description:** loadWorksheetData destructures only { data } and discards the Supabase error field; supabase-js does not throw on query errors, so a failed load returns null and useWorksheet treats it as a brand-new worksheet (console.error only at useWorksheet.ts:144 covers a path that rarely fires). setLoaded(true) still runs (line 146), and the autosave effect's hasRealData check (Object.keys > 2) passes because defaultData plus five _saved* keys always exceed 2, so 1.5s later save() upserts default data.

**Why it is a problem:** A transient network blip or RLS error while opening a worksheet silently replaces the server's worksheet_data with defaults and recomputes review_status from empty _savedReviewStatus to '' (useAutoSave.ts:88-94) — even an approved worksheet is wiped back to empty, destroying the employee's work and review state with no warning.

**Steps to reproduce:** 1) Save and submit a worksheet. 2) Reopen it while the worksheet_submissions SELECT fails (block the request in devtools). 3) Page renders a blank form, network recovers, autosave fires after 1.5s. 4) Row now contains default worksheet_data and review_status ''.

**Expected behavior:** Load failure blocks autosave and shows 'Could not load your worksheet — retry'.

**Current behavior:** Load failure renders an empty form and autosave overwrites the server row.

**Root cause:** Error field discarded from Supabase result; 'no data' and 'load failed' are conflated, and autosave is gated only on loaded, not on load success.

**Suggested fix:** Return { data, error } from loadWorksheetData; on error, set a loadError state, keep loaded=false (blocking autosave), and show a retry UI instead of an empty form.

**Example implementation:**

```
const { data, error } = await supabase...; if (error) throw error; // in useWorksheet: catch → setLoadError(err); return; // never setLoaded(true)
```

> Verifier evidence: useAutoSave.ts:223 discards Supabase error (v2.108.2 never throws); useWorksheet.ts:133-146 treats null as new worksheet and sets loaded=true; useAutoSave.ts:196 hasRealData passes (5 _saved* keys > 2) so save fires in 1.5s; lines 92-94 recompute review_status to '' and line 123 upserts defaults, nulling reviewed_by/at/name. Conflict check (69-84) skipped since _savedUpdatedAt undefined.

### H17 — flushSave resolves successfully on failed save — user sees 'submitted' success toast for a failed submission

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** src/hooks/useAutoSave.ts:167-188 (catch block), src/hooks/useWorksheet.ts:203-209

**Description:** In save()'s catch, when retryCountRef <= 2 the retry is scheduled via setTimeout and the function returns normally without rethrowing; only the third consecutive failure throws. flushSave awaits only the first attempt, so handleSubmit's await flushSave(submitData) resolves, and the success toast 'Your worksheet has been submitted for review.' is shown even though nothing was persisted.

**Why it is a problem:** On a flaky connection the employee sees a success confirmation (plus a contradictory 'Auto-save failed' error toast from notifyError at line 168) and navigates away; if the two background retries also fail, the submission is silently lost and the reviewer is never notified.

**Steps to reproduce:** Go offline, click Submit on any worksheet: success toast appears immediately while the upsert failed; retries fire at 3s/6s in the background and may also fail.

**Expected behavior:** Submit shows an error and keeps the form editable until a save actually succeeds.

**Current behavior:** Submit shows success on the first failed attempt; persistence depends on invisible background retries.

**Root cause:** Retry scheduling swallows the error instead of propagating a promise that settles after retries complete.

**Suggested fix:** Make save() return a promise that only resolves after a successful attempt (loop with await + backoff instead of setTimeout fire-and-forget), or have flushSave bypass the swallow-and-retry path and rethrow on first failure.

**Example implementation:**

```
for (let a=0; a<=2; a++){ try { await doUpsert(); return; } catch(e){ if(a===2) throw e; await sleep((a+1)*3000);} }
```

> Verifier evidence: useAutoSave.ts:174-186: catch schedules retry and returns normally when retryCountRef<=2; throw at 185 only on 3rd failure inside setTimeout (uncatchable). flushSave (205-211) resets counter then awaits save, so useWorksheet.ts:203 resolves and success toast (204-209) fires on failed upsert; notifyError (168) simultaneously shows error toast. No offline backup; retries die on unmount (177).

### H18 — Supabase query errors systematically discarded via '{ data }' destructuring — try/catch blocks are dead code, outages render wrong data

**Severity:** High _(adversarially verified: CONFIRMED)_

**Location:** ~19 sites: src/pages/Dashboard.tsx:57-62, Phase1.tsx:69, Phase2.tsx:75, Phase3.tsx:76, Week1-4.tsx:23-25, BuddyGatePass.tsx:42, src/pages/PhaseReview.tsx:70-75, WorksheetReview.tsx:87-89 (console only), src/hooks/useNotifications.ts:61, useDueDates.ts:126, src/components/PhaseAccessGuard.tsx (then(({data})...))

**Description:** supabase-js resolves with { data, error } and never throws on query/RLS/HTTP failures, so the surrounding try/catch blocks (e.g. Dashboard.tsx:63, PhaseReview.tsx:76) almost never execute. On failure, data is null and code takes the 'empty' branch: Dashboard shows every worksheet as 'Not Started' (Dashboard.tsx:71), PhaseReview shows sheets as not submitted, PhaseAccessGuard locks users out of phases they earned access to. No component has an error state, message, or retry.

**Why it is a problem:** During a Supabase outage or RLS misconfiguration every dashboard silently renders a false 'nothing submitted / Not Started' state — new hires believe their work vanished, managers see wrong review queues, and phase guards incorrectly lock users out, all with zero error indication.

**Steps to reproduce:** Block *.supabase.co/rest/* in devtools and load /: dashboard renders all 17 worksheets as 'Not Started' with no error banner; /phase-2 shows the Locked view.

**Expected behavior:** Failed queries surface an error banner with retry; empty state only shown for genuinely empty data.

**Current behavior:** Failed queries are indistinguishable from empty data; catch blocks never fire.

**Root cause:** Misunderstanding of supabase-js error contract; no shared query wrapper enforcing error checks.

**Suggested fix:** Introduce a small helper (e.g. unwrap(res) that throws res.error) or a data-layer function per query; add error + retry states to dashboards and guards, distinguishing 'no rows' from 'query failed'.

**Example implementation:**

```
export function unwrap<T>(r:{data:T|null,error:PostgrestError|null}):T{ if(r.error) throw r.error; return r.data as T; }
```

> Verifier evidence: Dashboard.tsx:57-62 destructures only {data}; error unread, catch at :63 dead (no throwOnError anywhere; supabase-js ^2.108 resolves {data,error}). PhaseAccessGuard.tsx:66-72 leaves submissions [] on error → canAccessPhase (worksheetConfigData.ts:709-710) false → PhaseLockedView. Same pattern at 19+ sites incl. WeekAccessGuard.tsx:90, useAutoSave.ts:223. No error state/retry in any component.

### M21 — AuthContext bootstrap has no rejection handling — stuck infinite spinner app-wide, plus white-screen on missing env

**Severity:** Medium _(adversarially verified: DOWNGRADED to this severity)_

**Location:** src/context/AuthContext.tsx:137-145

**Description:** supabase.auth.getSession().then(...) has no .catch. If the promise rejects, loading stays true forever and every ProtectedRoute (src/components/ProtectedRoute.tsx:14-29) renders a permanent 'Loading…' spinner, plus an unhandled promise rejection. Separately, when env vars are missing the throw-proxy (api/supabase.ts:19) makes getSession() throw synchronously inside this effect; AuthProvider sits above the ErrorBoundary (App.tsx:175 vs 97), so the app dies to a blank white screen.

**Why it is a problem:** Any auth-bootstrap failure bricks the entire SPA behind an eternal spinner with no message or recovery; a deployment with misconfigured env vars produces a raw white screen for every user.

**Steps to reproduce:** Deploy without VITE_SUPABASE_URL (white screen), or make getSession reject (stuck 'Loading…' on every route).

**Expected behavior:** Auth bootstrap failure lands the user on /login or an error screen.

**Current behavior:** Permanent spinner or white screen with only a console message.

**Root cause:** Missing .catch/try around auth bootstrap; provider tree not covered by any error boundary.

**Suggested fix:** Wrap the effect body in try/catch, add .catch(() => { setUser(null); setLoading(false); }) so failure degrades to the login screen, and add a top-level ErrorBoundary around AuthProvider in App.tsx.

**Example implementation:**

```
supabase.auth.getSession().then(...).catch(err => { console.error(err); if (mounted) setLoading(false); });
```

> Verifier evidence: AuthContext.tsx:137-145 has no .catch and App.tsx:175 AuthProvider sits above the only ErrorBoundary (App.tsx:97), but supabase-js 2.108.2 getSession (GoTrueClient.js:2333) resolves AuthErrors as {session:null,error} → else branch clears loading; typical auth failures redirect to login, not spinner. White screen needs missing env vars — deploy-time misconfig, instantly caught.

### M22 — ErrorBoundary covers only routed pages — Navbar, ToastProvider, AuthProvider, footer are unprotected

**Severity:** Medium _(adversarially verified: DOWNGRADED to this severity)_

**Location:** src/App.tsx:97-148 (boundary inside AppRoutes) vs src/App.tsx:173-201 (App tree); src/components/Navbar.tsx (20KB, notifications logic)

**Description:** The single ErrorBoundary wraps <Routes> inside AppRoutes. Navbar (which runs useNotifications polling and heavy rendering logic), the footer, ToastProvider, and AuthProvider render outside it. A render/effect throw in any of these unmounts the whole React tree to a white screen. There is also no chunk-load recovery: after a redeploy, stale lazy-import URLs (App.tsx:26-31) throw 'Failed to fetch dynamically imported module', which at least hits the boundary but shows that raw message with no auto-reload.

**Why it is a problem:** A single rendering bug in the always-mounted Navbar takes down every page with an unstyled blank screen; post-deploy stale chunks show users a cryptic module-fetch error instead of auto-recovering.

**Steps to reproduce:** Throw in Navbar render (e.g. malformed notification record) → white screen. Deploy a new build while a tab is open, then navigate to /admin → boundary shows raw 'Failed to fetch dynamically imported module' text.

**Expected behavior:** Any component crash shows the branded fallback; stale-chunk errors self-heal via reload.

**Current behavior:** Crashes outside Routes yield a white screen; stale chunks show a raw module error.

**Root cause:** Boundary placed too low in the tree; no chunk-error detection.

**Suggested fix:** Add a second top-level <ErrorBoundary> directly inside BrowserRouter wrapping AuthProvider/Navbar; in componentDidCatch, detect dynamic-import fetch errors and trigger one automatic window.location.reload().

**Example implementation:**

```
<BrowserRouter><ErrorBoundary><AuthProvider>... and: if(/dynamically imported module/.test(error.message)) location.reload();
```

> Verifier evidence: App.tsx:97 boundary wraps only Routes; main.tsx:6-10 has no root boundary — structure claim true. But Navbar's cited risk (useNotifications) is async and try/caught (useNotifications.ts:72,113); async errors never trip boundaries. Stale-chunk errors hit the boundary, which offers a working Refresh button (ErrorBoundary.tsx:92-101). Safety-net gap, no demonstrated trigger.

### M23 — Buddy assignment check fails open on error — network failure grants approval rights

**Severity:** Medium _(adversarially verified: DOWNGRADED to this severity)_

**Location:** src/pages/WorksheetReview.tsx:50-66 (rejection handler at line 65)

**Description:** The query that checks whether the current buddy is assigned to the joinee uses .then(onSuccess, () => setIsAssignedBuddy(true)) — the rejection handler, commented 'On error, allow (fail open for safety)', grants approval capability (canApprove at line 71) whenever the check errors. Combined with finding 3's pattern, a null-data result also falls through to 'allow' (line 60 treats missing assignment as allow-any-buddy).

**Why it is a problem:** Any transient error, RLS denial, or deliberately blocked request during the assignment lookup lets an unassigned buddy approve another joinee's worksheets (buddy_approved feeds the manager phase-approval and ultimately auto-promotion), silently weakening the review chain. Client-side enforcement is already weak; failing open makes the error path itself an authorization bypass.

**Steps to reproduce:** As buddy B not assigned to joinee J, open /buddy/review/J/ws1 and block the user_profiles request in devtools: approve buttons become enabled.

**Expected behavior:** Verification failure blocks approval actions and offers retry.

**Current behavior:** Verification failure enables approval actions.

**Root cause:** Deliberate fail-open on error in an authorization check.

**Suggested fix:** Fail closed: on error set isAssignedBuddy(null) and render a 'Could not verify assignment — retry' state; enforce assignment server-side (RLS/trigger) so client errors cannot change outcomes.

**Example implementation:**

```
.then(onData, () => setIsAssignedBuddy(false)) plus a visible verification-failed banner
```

> Verifier evidence: WorksheetReview.tsx:65 fail-open handler and :71 canApprove exist as claimed. But supabase_migration_fix_rls_security.sql:104-115 shows RLS 'Reviewers can update submissions' checks only role, never assigned_buddy_id — any buddy can already approve any joinee server-side. The fail-open is a defense-in-depth/workflow defect, not the authorization bypass; the RLS gap is the real High issue.

### M24 — Phase bulk approval is non-atomic; partial failure tells manager to 'Check console'

**Severity:** Medium

**Location:** src/pages/PhaseReview.tsx:106-134 (sequential updates), 167-169 (failure message)

**Description:** handleApprovePhase loops over buddy_approved rows issuing independent UPDATEs. Individual failures are console.error'd (line 121) and the only user feedback is 'Some worksheets could not be approved. Check console for details.' — no list of failed sheets, no retry, no rollback. Notifications for succeeded rows are already sent, and on the partial-failure branch data is not reloaded, so the UI's state diverges from the DB.

**Why it is a problem:** A mid-loop network failure leaves the phase half-approved: some worksheets 'approved', others 'buddy_approved'. Auto-promotion (which requires all 17 approved) silently stalls, and the manager — a non-technical user — is told to open the browser console.

**Steps to reproduce:** Approve a phase with 4 buddy_approved sheets while dropping the connection after the second UPDATE: 2 approved, 2 not, message says to check console.

**Expected behavior:** Phase approval is all-or-nothing, with actionable retry on failure.

**Current behavior:** Per-row best-effort loop with console-only diagnostics and stale UI on partial failure.

**Root cause:** No transactional primitive (RPC) for bulk state change; console used as the error channel for end users.

**Suggested fix:** Move phase approval into a single Postgres RPC (one transaction). Short term: collect failed worksheet_ids, display them with a 'Retry failed' button, and reload data on partial failure too.

**Example implementation:**

```
const failed=[]; ...; if(failed.length) showToast(`Failed: ${failed.join(', ')} — retry`, 'error'); loadData();
```

### M25 — checkAndPromote errors are swallowed at the call site — failed promotions are invisible

**Severity:** Medium

**Location:** src/hooks/useAutoPromote.ts:99-103; call site src/pages/PhaseReview.tsx:157-161

**Description:** checkAndPromote catches everything and returns { promoted: false, message: 'Error: ...' }. PhaseReview only checks result.promoted for the success toast; there is no else branch, so an error result is indistinguishable from 'not yet complete' and the message is dropped. The role-update failure path (updateError, line 66) and the metadata update (console.warn, line 74) never reach the user.

**Why it is a problem:** After the final phase is approved, a failed user_profiles role update means the joinee is never promoted to lead_instructor — the terminal step of the entire onboarding flow — and neither the manager nor the joinee gets any signal; it surfaces only as a support ticket later.

**Steps to reproduce:** Approve the last phase while the user_profiles UPDATE fails (RLS or network): success toast for the phase shows, promotion silently does not happen.

**Expected behavior:** Failed promotion shows an error toast to the approving manager.

**Current behavior:** Failed promotion looks identical to 'not yet complete' and is silent.

**Root cause:** Error collapsed into a success-shaped return value that the caller does not inspect.

**Suggested fix:** Return a discriminated result ({ status: 'promoted' | 'incomplete' | 'error' }); in PhaseReview, toast the error variant and offer a manual 'Retry promotion' action.

**Example implementation:**

```
if(result.status==='error') showToast(`Phase approved, but promotion failed: ${result.message}`, 'error');
```

### M26 — No timeout or cancellation on any network operation — hung requests mean permanent spinners

**Severity:** Medium

**Location:** src/api/supabase.ts:48 (createClient with defaults); repo-wide grep: zero AbortController/signal usages in src/

**Description:** The Supabase client is created with default options (no custom fetch with timeout) and no query anywhere passes abortSignal. Loading states (Dashboard loading, WorksheetReview loading, ProtectedRoute loading, PhaseAccessGuard checking) are cleared only when the request settles; a stalled TCP connection or slow proxy leaves the corresponding spinner up indefinitely with no timeout, message, or retry affordance.

**Why it is a problem:** On flaky corporate/mobile networks, users get indefinite 'Loading…' screens with no recovery path except a manual full-page refresh; combined with the missing error states (finding 3) there is no degraded-mode UX at all.

**Steps to reproduce:** Throttle to 'Offline after connect' / blackhole *.supabase.co: dashboard spinner never resolves.

**Expected behavior:** Requests fail within ~15s and surface a retryable error.

**Current behavior:** Requests can hang forever; spinners never resolve.

**Root cause:** No timeout policy at the client or call-site level.

**Suggested fix:** Provide a custom fetch with an AbortSignal.timeout (e.g. 15s) in createClient options so every REST call fails fast into the (to-be-added) error states.

**Example implementation:**

```
createClient(url, key, { global: { fetch: (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(15000) }) } })
```

### M27 — Notification delivery is fire-and-forget with console-only failure handling

**Severity:** Medium

**Location:** src/hooks/useNotifications.ts:151-165 (triggerNotification), 171-185 (getReviewerUserIds), 190-213 (getAssignedReviewerIds); consumers useAutoSave.ts:148-156, WorksheetReview.tsx:139-161, PhaseReview.tsx:126-154

**Description:** triggerNotification catches its own errors and console.error's them; getReviewerUserIds/getAssignedReviewerIds return [] on error (and getReviewerUserIds also ignores the error field per finding 3, returning [] on query failure). The review workflow has no other signaling channel — a submission whose notification insert fails simply never appears in any reviewer's bell, and the sender is told nothing.

**Why it is a problem:** The submitted→reviewed pipeline stalls silently: joinee thinks work is under review, buddy/manager never learns it exists. With 15s polling as the only delivery mechanism and no retry/outbox, every notification failure is permanent and invisible.

**Steps to reproduce:** Submit a worksheet while the notifications INSERT is blocked or RLS-denied: submission saves, zero notifications created, no error shown.

**Expected behavior:** Notification failure is either impossible (DB trigger) or visibly reported.

**Current behavior:** Failures logged to console only; workflow silently stalls.

**Root cause:** Best-effort side effect treated as guaranteed workflow signal; errors terminated at console.

**Suggested fix:** Create notifications server-side via a Postgres trigger on worksheet_submissions status changes (atomic with the write). Short term: surface a warning toast ('Saved, but reviewer notification failed') when triggerNotification errors.

**Example implementation:**

```
return {ok:false as const, error} from triggerNotification and toast a warning at call sites
```

### M28 — No error telemetry: no monitoring SDK, no window.onerror/unhandledrejection handlers — production errors are unobservable

**Severity:** Medium

**Location:** repo-wide: grep for Sentry/unhandledrejection/window.onerror across src/ and index.html returns nothing; 24 files rely on console.error (e.g. ErrorBoundary.tsx:27, useNotifications.ts:73)

**Description:** Every error path in the app terminates in console.error/console.warn. There is no error-reporting service, no global window.addEventListener('unhandledrejection'/'error') to catch the fire-and-forget promises (e.g. loadSubmissions() calls at Dashboard.tsx:49, loadData() at PhaseReview.tsx:62, background autosave retries), and ErrorBoundary.componentDidCatch only logs locally.

**Why it is a problem:** The team has zero visibility into production failures: the data-loss bug in finding 1, failed promotions, and notification losses would all occur without any operator-side evidence — first signal is a user complaint. For a workflow app gating real employees' onboarding, undiagnosable silent failure is a launch blocker in aggregate with the findings above.

**Steps to reproduce:** Trigger any error in a deployed build; verify no external report is emitted (network tab shows nothing).

**Expected behavior:** Errors are captured centrally with user/worksheet context.

**Current behavior:** All errors die in the user's browser console.

**Root cause:** No observability strategy for the frontend.

**Suggested fix:** Add Sentry (or equivalent) initialized in main.tsx, wire ErrorBoundary.componentDidCatch and a global unhandledrejection handler to it, and route notifyError through it with context (userId, worksheetId).

**Example implementation:**

```
window.addEventListener('unhandledrejection', e => report(e.reason)); Sentry.init({dsn, release});
```

### L13 — Raw internal error messages rendered to end users

**Severity:** Low

**Location:** src/components/ErrorBoundary.tsx:80-88 (error.message in fallback), src/pages/WorksheetReview.tsx:130 and 198 ('Error: ' + error.message), src/pages/Login.tsx:50, src/pages/Signup.tsx:34/111, src/hooks/useWorksheet.ts:211-212 (err.message into submitError)

**Description:** Several surfaces render unfiltered error strings: the ErrorBoundary fallback prints error.message (which for chunk failures or library throws is developer-oriented), and review/auth pages concatenate raw Supabase/PostgREST messages (e.g. RLS policy violations mentioning table/policy names) directly into the UI.

**Why it is a problem:** Confusing UX for non-technical staff and minor information disclosure — PostgREST errors can leak table names, constraint names, and policy details to any user who triggers them.

**Steps to reproduce:** Trigger an RLS-denied update in WorksheetReview: banner shows the raw PostgREST message including policy/relation wording.

**Expected behavior:** Users see friendly, actionable messages; details go to telemetry.

**Current behavior:** Raw error.message strings shown in banners and the crash fallback.

**Root cause:** No mapping layer from internal errors to user-facing copy.

**Suggested fix:** Add a toUserMessage(error) helper mapping known Supabase/PostgREST codes to friendly copy with a generic fallback; show error.message details only in dev builds (import.meta.env.DEV).

**Example implementation:**

```
{import.meta.env.DEV && this.state.error?.message} in ErrorBoundary; setActionMessage(toUserMessage(error))
```

