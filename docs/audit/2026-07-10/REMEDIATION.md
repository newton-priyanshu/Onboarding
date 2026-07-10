# Remediation — Production Readiness Fixes (2026-07-10)

This documents the fixes applied on branch `audit/production-readiness-2026-07-10` in response to the [audit](./README.md) and the [independent Codex review](./05-codex-independent-review.md). Both reviews reached the same verdict (not deployable) and the same top-5 criticals; this remediation closes them.

**Gate status at time of writing:** `npm run build` ✅ · `npx vitest run` → **281 passed / 0 failed** ✅ · `npm run lint` → **0 errors** (81 warnings) ✅

> ⚠️ **The code fix is inert until you migrate the live database.** RLS and the state-machine trigger are what actually enforce security; they must be applied to your Supabase project. See the **Handoff runbook** at the bottom — this is the difference between "code merged" and "actually safe in production."

---

## What was fixed (by root cause)

### 1. Authorization no longer trusts client-writable data — *the master blocker*
- `get_user_role()` and every RLS policy now resolve role **only** from server-controlled `app_metadata` (and the `user_profiles.role` column). The `user_metadata` fallback is gone. (`db/schema.sql` §7)
- A `sync_role_to_app_metadata` trigger keeps `user_profiles.role` and `app_metadata` from ever drifting.
- The client never writes role anywhere: `signUp` no longer sends a role (server `handle_new_user` trigger forces `new_joinee`); `useAutoPromote` no longer calls `auth.updateUser`.
- Promotion now happens only through the `promote_user_if_eligible()` SECURITY DEFINER RPC, which re-verifies every required worksheet is `approved` and acts **only on the caller** (fixing the bug where it corrupted the reviewing manager's own session).
- The profile-UPDATE policies pin the `role` column to its existing value, closing the direct `user_profiles.role` self-escalation Codex flagged.

### 2. Review state machine is now enforced in the database
- A `validate_review_transition()` `BEFORE UPDATE` trigger validates every `review_status` transition against allowed edges keyed by `get_user_role()`. The owner can move a sheet only to `pending_review`/`revision_submitted` and can **never** self-approve; buddy does `pending_review → buddy_approved` on assigned hires; manager does `buddy_approved → approved`; `onboarding_lead` is SELECT-only. `review_history` is appended server-side; the client's copy is discarded. Reviewer identity columns can't be forged or self-nulled.

### 3. The data-loss path is closed
- `loadWorksheetData` now propagates its error; on a failed load the form stays unloaded and shows a retry state instead of letting autosave overwrite a saved/approved row with defaults.
- Autosave now has a **dirty guard** (fires only after a real edit) and no longer transitions review state on mere page open. Submit/flush awaits its writes and surfaces real failures (no more "success" toast on a failed save).

### 4. The database schema is runnable and tracked
- `db/schema.sql` rewritten to be idempotent (verified on a Postgres 16 container: fresh-run + re-run, both clean). The RLS section drops **every** policy name that ever existed in this repo's history before creating the final set, so no stale permissive policy can survive a name mismatch.
- Real ordered migrations added under `supabase/migrations/` (7 files). Notifications table/CHECK unified; FK `ON DELETE` rules added on every relation; 11 legacy ad-hoc SQL files moved to `db/legacy/` with deprecation banners; `db/README.md` documents apply order.

### 5. Errors surface instead of being swallowed
- New `src/api/db.ts` `unwrap()` helper; read paths across dashboards, phase pages, and access guards now distinguish "no rows" from "query failed" and **fail closed** on error. Dashboard queries scoped by visible-hire ids (no more whole-table `limit(500)`).

### Broken flows & other fixes
- **Password reset** built end-to-end (`/forgot-password` + `/reset-password`).
- **Buddy gate-pass creation** rerouted through a new assigned-buddy-only `upsert_gate_submission()` RPC (the client INSERT was silently rejected by RLS and reported as success).
- **Week-URL gating bypass** closed — `WeekWorksheetPage` validates the worksheet belongs to the current week before rendering.
- **Notifications** moved server-side (triggers); client no longer inserts them. Duplicate promotion notifications removed.
- **Assessment** route restricted to reviewer roles; insert includes `user_id`.
- **Promoted users** get a role-appropriate landing instead of dead phase cards.
- **Responsive + a11y**: all worksheet forms wrapped for mobile (overflow/stacking), 44px tap targets, `label`/`htmlFor` associations.
- **Ops**: `.env` untracked + `.gitignore`; Vercel security headers; lint gate repaired (config no longer fatally errors; 0 errors); `ws`/`dotenv`/`tslib` reclassified; real `README.md`; stale root docs archived to `docs/archive/`.
- **Tests**: added auth/authz (`ProtectedRoute`, `PhaseAccessGuard`, `WeekAccessGuard`, `AuthContext`), an exhaustive review state-machine transition matrix (`src/utils/reviewStateMachine.ts` extracted as single source of truth), and a data-loss regression test. 158 → **281 tests**.

---

## Handoff runbook — you must do these against your live Supabase project

These cannot be done from application code. **Do them in this order.** Until step 1 is done, the deployed app is still vulnerable regardless of this merge.

1. **Apply the database migrations.** From the repo root, against your project (`fuoqoryqndtdooujslee`):
   ```bash
   supabase link --project-ref fuoqoryqndtdooujslee
   supabase db push          # applies supabase/migrations/*.sql
   ```
   (Or paste `db/schema.sql` into the Supabase SQL editor — it is idempotent.) Then verify:
   ```sql
   -- exactly one UPDATE policy per actor-class, none permissive-legacy:
   select tablename, policyname, cmd from pg_policies where schemaname='public' order by tablename, cmd;
   -- get_user_role must reference app_metadata, not user_metadata:
   select prosrc from pg_proc where proname='get_user_role';
   ```

2. **Backfill `app_metadata` for existing users** (they currently have roles only in `user_metadata`/the profile). Run the backfill statement in `db/schema.sql` §7, then confirm each existing user has `app_metadata.role` set. New role changes stay in sync automatically via the trigger.

3. **Delete / reset the seeded privileged accounts.** `db/create_32_users.sql`, `scripts/clean_setup.mjs`, and `fix-assignments.cjs` created `academic_head`/`onboarding_lead`/reviewer accounts with the committed password `Test123!`. If those ever ran against this project, **delete or reset them and revoke their sessions now**, and move all seeding to a separate non-production project with generated credentials.

4. **Fix the E2E seeding.** `scripts/e2e-full-flow.mjs` creates its privileged test accounts via `signUp({ options: { data: { role } } })`. Under the new contract signup always yields `new_joinee`, so those steps will (correctly) fail RLS. Switch the script to seed privileged roles via the service-role admin API before relying on it in CI.

5. **Git hygiene (low urgency).** `.env` is now untracked, but it remains in git *history*. Note (per the Codex review) the committed `sb_publishable_` key is the **public browser anon key — not a secret**; rotation is optional. If you still want history clean, purge it with `git filter-repo --path .env --invert-paths` and force-push (coordinate — it rewrites shared history).

6. **Deploy config.** Confirm the Supabase Auth redirect allow-list includes your `/reset-password` URL so password recovery links work in production.

Once steps 1–3 are done and verified, the application is safe to deploy.
