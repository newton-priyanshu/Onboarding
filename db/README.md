# Database schema — apply order & layout

This directory used to be 15+ unordered, contradictory, paste-into-the-SQL-editor
scripts with no way to tell which subset had actually been run against the live
project (see `docs/audit/2026-07-10/02-backend-data.md`, finding H10). It is now:

```
db/
  schema.sql        <- canonical full snapshot of the current schema (see below)
  README.md         <- this file
  legacy/           <- every superseded ad-hoc script, kept for history only
  create_32_users.sql       <- seed data (optional, non-production)
  __setup_test_data.sql     <- seed data (optional, non-production)
  seed_worksheets.sql       <- seed data (optional, non-production)
  seed_ftp_worksheets.sql   <- seed data (optional, non-production)

supabase/
  migrations/        <- ordered, idempotent migrations (Supabase CLI)
```

## Which one do I run?

**New project / CI / local Postgres:** run the files in `supabase/migrations/`,
in filename order, via the Supabase CLI:

```
supabase db push
```

**Existing Supabase project managed via the SQL editor (no CLI):** paste the
entire `db/schema.sql` into the SQL editor and run it once. It is idempotent —
every `CREATE`/`ALTER`/policy/trigger statement is guarded (`IF NOT EXISTS`,
`DROP ... IF EXISTS` before `CREATE`, etc.), so running it again later (e.g.
after pulling this branch) is always safe and always converges to the same
end state, regardless of which of the old ad-hoc scripts had previously been
run against that project.

`db/schema.sql` and `supabase/migrations/*.sql` describe **the same schema** —
`schema.sql` is a single-file convenience snapshot; the migration files are
`schema.sql` mechanically split at its section boundaries (`1. TRIGGER
FUNCTION`, `2. TABLES`, … `13. ROW LEVEL SECURITY`) so the same statements
gain Supabase CLI migration-history tracking. If you change one, change the
other the same way, in the same session — see "Keeping schema.sql and the
migrations in sync" below.

### Migration order

| File | What it does |
|---|---|
| `20260710000001_initial_schema.sql` | Tables, foreign keys (with `ON DELETE` rules), check constraints, indexes, `updated_at` triggers |
| `20260710000002_role_resolution_and_signup.sql` | `get_user_role()` (app_metadata-only), the role↔app_metadata sync trigger, `handle_new_user` (forces `new_joinee` on signup) |
| `20260710000003_review_state_machine.sql` | `validate_review_transition()` — the BEFORE UPDATE trigger that enforces the buddy→manager review state machine and owns `review_history` |
| `20260710000004_server_side_notifications.sql` | Triggers that create reviewer/manager notifications server-side (submission, revision, new signup) |
| `20260710000005_promotion_rpc_and_due_dates.sql` | `promote_user_if_eligible()` RPC + the optional due-date notification utility function |
| `20260710000006_row_level_security.sql` | Enables RLS, drops every legacy policy name that has ever existed in this repo's history, creates the final policy set |

## Seed data (optional, never run against production)

- `db/create_32_users.sql` — 32 test users across every role
- `db/__setup_test_data.sql` — a small reviewer-flow test fixture
- `db/seed_worksheets.sql` / `db/seed_ftp_worksheets.sql` — realistic worksheet
  submissions for demo/QA accounts

These are referenced by `scripts/create-test-users.mjs`, `context.md`, and
console hints in the seed scripts (e.g. `scripts/__seed_test_data.cjs`). They
are **left in place** (not moved to `legacy/`) specifically so those existing
references keep working. They insert/update rows directly (bypassing RLS —
they're meant to be run with the service role or in the SQL editor, both of
which bypass RLS by default in Supabase) and are safe to re-run, but must
never be pointed at a production project.

## `db/legacy/`

Every ad-hoc schema/RLS migration script this repo accumulated before this
cleanup. **Do not run these.** They are mutually contradictory (see H10 in the
audit) and several reintroduce fixed vulnerabilities (client-writable
`user_metadata`-based role checks, RLS recursion, duplicate permissive UPDATE
policies with no `WITH CHECK`, etc.) if applied after `schema.sql`. Kept only
so the history of how the schema evolved isn't lost.

Two npm scripts still reference two of these archived files by path —
`scripts/run_migration.cjs` (`db/__migration_notifications_dates.sql`,
`db/__due_date_notifications.sql`) and `scripts/run_rls_migration.cjs`
(`supabase_migration_fix_rls_security.sql`, now
`db/legacy/supabase_migration_fix_rls_security.sql`). Both scripts already
did their one-time job against the live project historically; their content
now lives, corrected and unified, in `db/schema.sql` /
`supabase/migrations/`. If you try to re-run either script it will fail with
a "file not found" — that is the intended fail-safe (not a silent no-op);
just don't use them, use `db/schema.sql` / `supabase/migrations/` instead.

## Keeping `schema.sql` and the migrations in sync

There's no automation for this today. When you need to change the schema
going forward:

1. Add a new, idempotent, timestamp-prefixed file to `supabase/migrations/`
   (don't edit an already-applied migration file).
2. Apply the same change to `db/schema.sql` in the matching numbered section,
   so it stays an accurate "what does the schema look like right now"
   snapshot.
3. Re-run `db/schema.sql` (or `supabase db push`) against a scratch database
   and confirm it's still idempotent (safe to run twice) before merging.

## Known cross-stream assumption

`public.promotion_required_worksheets` (seeded in
`20260710000005_promotion_rpc_and_due_dates.sql`) is the server-side mirror of
`PHASE_WORKSHEETS_MAP` (phases 1–3) in
`src/config/worksheetConfigData.ts` — the DB has no way to import that TS
config. If that map's worksheet IDs change, update this table too, or
`promote_user_if_eligible()` will drift from what the UI considers "all
worksheets approved".
