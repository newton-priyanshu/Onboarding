# E2E Full-Flow Test — Bug Report

**Date:** 2026-08-07
**Environment:** Live Supabase project (via `VITE_SUPABASE_URL`), dev server on `localhost:5173`
**Test users:** 10 created via `scripts/create-10-role-users.mjs` (all roles incl. `super_admin`, password `Test123!`)
**Automation:** `scripts/full-flow-test.mjs` (API-level) + browser automation (login → fill → approve → reject → resubmit)
**Coverage:** sign-in for every role · assignment · worksheet fill · buddy/manager approval · rejection cycle · negative tests (forge, privilege escalation, cross-campus) · campus creation · role management

---

## Fix Status (2026-08-07, follow-up)

| # | Sev | Status | Fix |
|---|-----|--------|-----|
| BUG-1 | 🔴 Critical | ✅ **Fully fixed — applied to live DB** | `supabase/migrations/20260807000000_fix_review_state_machine_trigger.sql` + `scripts/run_review_trigger_fix.cjs`. Applied via Management API (`SUPABASE_PAT`); function + trigger verified live (`pg_get_functiondef` shows owner-block + service-role bypass). Full-flow test now **28/28 ✅** (self-approve check passes). |
| BUG-2 | 🟠 High | ✅ **Fully fixed — applied to live DB** | Same root cause / same migration as BUG-1 — the canonical trigger now allows service-role/admin (auth.uid() IS NULL) updates through while still blocking illegal transitions. |
| BUG-3 | 🟡 Medium | ✅ Fixed | `getWorksheetPath()` helper in `src/utils/worksheetHelpers.ts`; `Dashboard.tsx` roadmap + Continue banner use it (gate checks render non-clickable) |
| BUG-4 | 🟢 Low | ✅ Fixed | `SelectCampus.tsx` surfaces visible errors instead of silent return; error banner now rendered on both steps |
| BUG-5 | 🟢 Low | ✅ Fixed (test coverage) | `full-flow-test.mjs` 8e now uses `campus_admin` (campus-scoped reviewer) with positive + negative assertions |

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical (security) | 1 |
| 🟠 High | 1 |
| 🟡 Medium | 1 |
| 🟢 Low | 2 |

Automated full-flow test: **26 passed / 1 failed** at report time (the failure is the critical security bug below). **After the fix was applied to the live DB: 28 passed / 0 failed ✅** — the self-approve check flips to ✅ and all negative tests (forge, privilege escalation, cross-campus) hold.

---

## 🔴 CRITICAL — BUG-1: Review state-machine trigger missing in live DB → owner can self-approve

**Severity:** Critical (security)
**Location:** `public.worksheet_submissions` — live DB trigger vs. migration files

### What happened
The migration `supabase/migrations/20260710000003_review_state_machine.sql` (and `20260727000000_multi_tenant_all_in_one.sql`) define a `validate_review_transition` trigger that:
- Blocks the **row owner** from ever setting `review_status` to a reviewer-only state (`approved` etc.)
- Enforces the buddy → manager approval chain (`pending_review` → `buddy_approved` → `approved`)

The **live database does not run that trigger**:

1. **Owner self-approval persisted.** The joinee (owner) signed in and updated their own submission to `review_status='approved'` with `reviewer_name='SELF-HACK'`. The update **succeeded** — the row now shows `approved` with the joinee as reviewer. (Verified via `.select()` read-back; the migration's trigger would have raised `Illegal review_status transition ... for the submission owner`.)
2. **Manager approved from `pending_review` (no buddy approval needed).** The manager updated a `pending_review` row directly to `approved` — no error. The documented state machine only allows `buddy_approved → approved`.

### Evidence
- `scripts/full-flow-test.mjs` check `joinee cannot self-approve (trigger must block)` → **FAIL: "SELF-APPROVAL PERSISTED — [review_status: 'approved', reviewer_name: 'Jaya New Joinee']"**
- Live DB error text on blocked transitions is `Invalid review_status transition: "X" → "Y"` — **this exact string exists in no migration file**. The repo's triggers use `Illegal review_status transition ...`. ⇒ the live DB is running a **different (older/weaker) trigger** than the migrations define.

### Impact
A joinee can mark their own onboarding worksheets as approved, bypassing buddy/manager review entirely. Any grade/completion data built on `review_status` is untrusted.

### Repro
1. Sign in as a `new_joinee`.
2. `supabase.from('worksheet_submissions').update({ review_status: 'approved', reviewer_name: '<own name>' }).eq('user_id', <own id>).eq('worksheet_id','p1_w1')`
3. Row updates to `approved` with no error.

### Suggested fix
Apply the canonical trigger from `supabase/migrations/20260710000003_review_state_machine.sql` (or the all_in_one equivalent) to the live DB, replacing the divergent trigger:
```sql
CREATE OR REPLACE FUNCTION public.validate_review_transition() ...  -- from migration
DROP TRIGGER IF EXISTS validate_review_transition ON public.worksheet_submissions;
CREATE TRIGGER validate_review_transition BEFORE UPDATE ON public.worksheet_submissions
  FOR EACH ROW EXECUTE FUNCTION public.validate_review_transition();
```
Then re-run `node scripts/full-flow-test.mjs` — the self-approve check must flip to ✅.

---

## 🟠 HIGH — BUG-2: Service role key cannot reset `approved` submissions (trigger blocks even admin corrections)

**Severity:** High (data-integrity / admin ops)
**Location:** live DB trigger on `worksheet_submissions`

### What happened
A script using the **service role key** (which bypasses RLS and — per the migration's trigger — is let through because `auth.uid()` is NULL) tried to reset two mistakenly-`approved` submissions back to `pending_review`. The update **did not take effect** for rows already at `approved`; only a non-approved row (`p1_w2` at `''`) reset successfully. Rows stuck at `approved` had to be **deleted and re-inserted** to restore a testable state.

### Impact
There is no way (even as super-admin/service-role, short of delete+reinsert) to correct a wrongly-approved worksheet. A mistaken approval is permanent.

### Repro
1. With the service role key: `UPDATE worksheet_submissions SET review_status='pending_review' WHERE worksheet_id='p1_w1' AND review_status='approved'` → 0 rows changed, no error.
2. Same for any other new status. Only DELETE+INSERT works.

### Suggested fix
Make the live trigger allow service-role/`auth.uid() IS NULL` updates through (the migration's trigger already does: `IF actor IS NULL THEN RETURN NEW`). This is the same root cause as BUG-1 — **re-applying the canonical trigger fixes both**.

---

## 🟡 MEDIUM — BUG-3: Dashboard worksheet links render `404` for `/phase-1/worksheet-` (empty worksheet ID)

**Severity:** Medium (UX / navigation)
**Location:** dashboard worksheet list → link builder (observed in browser)

### What happened
During browser testing, clicking through the dashboard generated requests to:
```
GET /phase-1/worksheet-   → 404 (Not Found)
```
repeatedly (4× in the console). The worksheet ID segment is empty, so the route builder produced a trailing-dash URL. Affected links are "incomplete worksheet" entries on the Phase 1 list.

### Impact
Users clicking those dashboard items land on the 404 page instead of the worksheet.

### Repro
1. Log in as a joinee.
2. Open the Phase 1 dashboard.
3. Click an incomplete worksheet row (or observe the network tab) → `GET /phase-1/worksheet-` → 404.

### Suggested fix
Find the dashboard/phase list link builder that concatenates the worksheet route and guard against an empty/undefined worksheet ID (skip rendering the link, or fall back to a safe default). Also verify the generated URL against `ALL_WORKSHEETS`/`WORKSHEET_COMPONENTS` keys so only real worksheets get links.

---

## 🟢 LOW — BUG-4: Unauthenticated / stale-session users can land on `/select-campus` with no way out except localStorage clearing

**Severity:** Low (first-run UX)
**Location:** `src/App.tsx` `HomeRoute` + `src/pages/SelectCampus.tsx`

### What happened
With a stale session (a previously signed-in user whose profile lacks `campus_id`), navigating to `/` redirects to `/select-campus`. On that screen, clicking a department advances to the campus step, but **clicking a campus card silently no-ops when the profile is incomplete** — `handleSubmit` returns early (`if (!profile?.id || !selectedDepartment) return;`) with no error, and if not authenticated at all, `ProtectedRoute` normally bounces to `/login` — but a stale in-app session with a profile that has no `campus_id` and no `department` (our e2e users created via the admin API) loops there with no recoverable UI path.

### Impact
Test/API-created users who log in via the app for the first time can get stuck on `/select-campus` (department + campus selection requires the profile row to be complete; our admin-created users had `campus_id` set so they bypassed it — but the no-department case loops).

### Repro
1. Create a user via `auth.admin.createUser` with a profile row that has `campus_id` but **no `department`**.
2. Sign in via the app → lands on `/select-campus`.
3. Pick a department → campus step; pick a campus → `window.location.href='/'` → `HomeRoute` → back to `/select-campus` (department still unset in profile? — campus selection writes both, so it should resolve; the loop is when `department` was set but the write fails, or on the empty-profile path).

### Suggested fix
In `SelectCampus.handleSubmit`, surface a visible error when `profile?.id` is missing instead of silently returning; and in `HomeRoute`, redirect users with no `department` (non-admin) to `/select-campus` **only once** (track "dismissed" in localStorage) or auto-assign a default department.

---

## 🟢 LOW — BUG-5: Cross-campus isolation assertion passed, but `campus_head` is not a reviewer role for submissions

**Severity:** Low (test-coverage nuance, not a product defect)
**Location:** RLS policy `Reviewers select submissions` (role list: `lead_instructor, academic_head, onboarding_lead, campus_admin`)

### What happened
The full-flow negative test moved `campus_head` to a second campus and verified they cannot read default-campus submissions. It passed — but partly because `campus_head` is **not** in the submissions reviewer role list at all, so they can only ever read their own rows (0 rows returned regardless of scoping).

### Impact
The stronger property ("campus_head CAN read own-campus submissions but NOT other-campus") is not exercised. Campus isolation itself holds (no leaks), so this is a coverage note, not a vulnerability.

### Suggested fix
Extend the negative test to use a role that *is* campus-scoped for reads (e.g. `campus_admin`) and assert: own-campus rows visible, other-campus rows invisible.

---

## Passed checks (what works)

API-level (`scripts/full-flow-test.mjs`, 26 ✅):
- Sign-in for all 10 roles
- Manager+buddy assignment
- Joinee worksheet submission (`pending_review`)
- Buddy approve → `buddy_approved`
- Manager approve → `approved`
- Rejection cycle: buddy request revision → `needs_revision`, joinee resubmit → `revision_submitted`, buddy re-approve → `buddy_approved`
- Forged submission for another user → blocked (RLS)
- Own-role escalation → blocked (RLS)
- Onboarding_lead update → blocked (0 rows)
- Cross-campus read blocked
- Super-admin global read works
- Forged notification for another user → blocked

Browser-level (all phases passed):
- Joinee login + worksheet fill + submit
- Buddy approve + request revision
- Manager approve
- Joinee resubmit after revision
- Onboarding-lead blocked from admin panel
- Super-admin dashboard + campus management loads

## Artifacts
- `scripts/create-10-role-users.mjs` — 10-role test-user provisioner (service key)
- `scripts/full-flow-test.mjs` — repeatable full-flow + negative test suite
- `supabase/migrations/20260730000002_notifications_realtime.sql` — unrelated (notifications Realtime; applied earlier)

## Related docs
- `docs/FULL_FLOW_TEST.md` — the living reference for this suite: `scripts/full-flow-test.mjs`'s 8 steps, the negative tests (8a–8g) in detail, and the *Full-flow vs browser-pass* division of labor. This report is the dated bug record from the original run.
- `docs/BROWSER_PASS.md` — UI-level counterpart: the Playwright all-roles browser pass (`scripts/browser-pass.mjs`), with the full step list, both rejection paths (buddy round-trip + manager H28), and the regressions it guards (incl. the resubmit RLS 403).
