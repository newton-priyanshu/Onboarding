# AARAMBH — NST Bengaluru Faculty Onboarding Portal

A React 19 + TypeScript + Vite single-page app for onboarding new faculty at
Newton School of Technology, Bengaluru. Joinees work through phase/week
worksheets; buddies, managers, and onboarding leads review and approve
submissions; the app promotes users to full access once their required
worksheets are approved. Backed by Supabase (Postgres + Auth + Row Level
Security).

## Stack

- React 19, React Router 7
- TypeScript 6 (strict mode, `noUncheckedIndexedAccess`)
- Vite 8, Tailwind CSS 4
- Supabase (`@supabase/supabase-js`) for auth, data, and RLS-enforced access
- Vitest + Testing Library for tests
- ESLint 10 (flat config) for linting
- Deployed on Vercel

## Prerequisites

- Node.js >= 20 (see `engines` in `package.json`)
- npm (ships with Node)
- A Supabase project (or access to the shared one) with the schema in `db/`
  applied

## Getting started

```bash
npm install
cp .env.example .env   # then fill in your Supabase project's URL + anon key
npm run dev
```

### Environment variables

Copy `.env.example` to `.env` and fill in the two required values:

| Variable | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase dashboard → Settings → API → Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase dashboard → Settings → API → "anon" / "publishable" key |

Only the **anon/publishable** key belongs here — it's safe to ship to the
browser because access is enforced by Postgres Row Level Security (RLS), not
by keeping this key secret. The `service_role` key must never be used in
frontend code or committed anywhere.

`.env` is git-ignored (see `.gitignore`). If you ever need to add a new
`VITE_*` variable, add it to `.env.example` (with a placeholder value) too, so
this table and the example file stay the source of truth for what the app
needs.

> **Security handoff — action required:** an earlier commit in this repo's
> history tracked a real `.env` file. That Supabase anon key must be treated
> as compromised. See "Security handoff runbook" below.

### Database bootstrap

The Postgres schema, RLS policies, and seed data live under [`db/`](./db).
Start with `db/README.md` if present — it's the authoritative source for
which file(s) to run against a fresh Supabase project and in what order. If
`db/README.md` doesn't exist yet, treat `db/schema.sql` as the base schema and
check the other files in that directory (RLS fixes, seed data, migrations)
for anything applied on top of it.

If a `supabase/migrations/` directory exists in this repo, prefer applying
schema changes through the Supabase CLI (`supabase db push` /
`supabase migration up`) against that directory instead of running loose
`.sql` files by hand — it gives you an ordered, versioned migration history.
As of this writing there are also some numbered `supabase_migration_*.sql`
files at the repo root; check with whoever owns `db/` before running those,
since the repo has had more than one schema/migration convention in flight.

## Common commands

```bash
npm run dev       # start the Vite dev server
npm run build     # tsc --noEmit type-check, then production build
npm run preview   # preview a production build locally
npm test          # run the Vitest suite (unit/hook tests)
npm run lint      # ESLint over the whole repo
```

`npm run build` type-checks with `tsc --noEmit` before bundling, so a type
error fails the build, not just CI.

## Deployment

This app deploys to **Vercel** as a static SPA:

- `vercel.json` rewrites all routes to `/index.html` (client-side routing via
  React Router) and sets security headers (`X-Content-Type-Options`,
  `X-Frame-Options` / `frame-ancestors`, `Referrer-Policy`,
  `Permissions-Policy`, and a baseline `Content-Security-Policy`) plus
  long-lived immutable caching for hashed `/assets/*` build output.
- The CSP currently allows `'unsafe-inline'` for `style-src` because the app
  makes heavy use of inline `style={{ ... }}` props throughout its
  components. Tightening this further would require migrating those to
  Tailwind classes or CSS modules — tracked as a follow-up, not done here.
- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as Vercel
  Environment Variables (Project Settings → Environment Variables) — Vercel
  does not read `.env` files from the repo at build time.

### CI

`.github/workflows/ci.yml` runs on every push/PR to `main`: type-check
(`tsc --noEmit`), lint, tests, then build. Lint was previously fatally broken
by a misconfigured type-aware ESLint setup that errored on every non-`src`
file (config files, scripts) — see `eslint.config.js` for the fix. Now that
`npm run lint` reliably exits non-zero only on real problems, this CI job
meaningfully gates merges on lint again; treat any new lint failure in CI as
a real regression, not noise.

## Security handoff runbook

The following items came out of a production-readiness audit
(`docs/audit/2026-07-10/`) and require actions that can't be done from within
this repo/PR — flagging them explicitly so they aren't lost:

1. **Rotate the Supabase anon key.** A `.env` file containing a real
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` pair was committed to
   this repository's history. It has now been removed from tracking and is
   `.gitignore`d going forward, but **the key itself must be rotated in the
   Supabase dashboard** (Settings → API) — removing it from the current tree
   does not invalidate it, and it remains readable in git history.
2. **Purge it from git history.** Because the key was committed, it's
   recoverable from any clone via `git log`/`git show` even after this fix.
   Once rotated, consider whether history rewriting (`git filter-repo` or
   BFG Repo-Cleaner) plus a force-push and re-clone by all collaborators is
   warranted — this is a destructive, team-wide operation and should be a
   deliberate decision, not done silently in an automated pass.
3. **Audit the Supabase project for anything created with the exposed key**,
   or with any hardcoded seed-script credentials (see
   `docs/audit/2026-07-10/` for specifics called out by the audit, e.g.
   scripts that create accounts with a hardcoded password). Rotate/delete any
   such accounts.
4. Longer term, consider a separate staging Supabase project for
   seed/e2e/dev scripts so they never run against the same project as
   production data.

None of the above can be completed by editing files in this repo — they
require dashboard/account-level action by someone with access to the
Supabase project (and, for history purging, coordination with everyone who
has a clone).

## Project docs

- [`docs/audit/2026-07-10/`](./docs/audit/2026-07-10/) — current production-readiness audit
- [`docs/archive/`](./docs/archive/) — superseded/historical docs, kept for reference only (see its own README)
- [`db/`](./db) — schema, RLS, and seed SQL
