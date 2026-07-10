# Production Readiness Audit — NST BLR · AARAMBH

**Audit date:** 2026-07-10
**Branch audited:** `audit/production-readiness-2026-07-10` (latest `main`, post-rebrand)
**Application:** Employee onboarding SPA — React 19 + TypeScript + Vite 8 + Tailwind 4, Supabase (Auth + Postgres + RLS), deployed on Vercel.
**Method:** 20 specialist auditors ran in parallel across the full codebase; every Critical/High finding was then handed to an independent adversarial verifier who read the current code and tried to refute it. 100 agents, 0 errors. Findings that survived verification are reported here.

> **Verdict: No — this application cannot be safely deployed to production today.**
> The authorization model is fundamentally broken: any authenticated user can promote themselves to admin and read/modify every other user's data. That single defect (reachable five different ways) is a hard blocker on its own, and it is joined by a verified data-loss path, an unrunnable database schema, and a missing password-reset flow.

---

## Scoreboard

### Overall

| Metric | Score |
|---|---|
| **Production Readiness** | **31 / 100** |
| Security | 28 / 100 |
| Code Quality | 48 / 100 |
| Maintainability | 40 / 100 |
| Performance | 64 / 100 |
| Scalability | 44 / 100 |
| UI / UX | 59 / 100 |
| Documentation | 32 / 100 |
| Testing | 40 / 100 |

### Issue counts (post-verification)

| Severity | Count |
|---|---|
| 🔴 Critical | 12 |
| 🟠 High | 40 |
| 🟡 Medium | 90 |
| 🟢 Low | 48 |
| **Total** | **190** |

No findings were refuted during adversarial verification; several High findings were confirmed at the stated severity, and the Critical cluster around authorization was independently re-confirmed by multiple auditors and verifiers.

### Per-dimension scores

| Dimension | Score | Dimension | Score |
|---|---|---|---|
| Dependencies | 78 | Error Handling | 38 |
| Performance | 64 | Security | 33 |
| UI | 60 | Documentation | 32 |
| UX & Accessibility | 58 | Edge Cases & Races | 32 |
| React Patterns | 52 | Database | 28 |
| Code Quality | 48 | Authorization & RLS | 18 |
| Feature Completeness | 46 | Authentication | 42 |
| Deployment | 54 | User Journeys | 42 |
| Testing | 40 | Architecture & Scale | 40 |
| API / Backend | 40 | Validation | 34 |

---

## The report is split across four files

Each finding has a stable ID (`C##` Critical, `H##` High, `M##` Medium, `L##` Low) used in the checklist below.

1. **[01 — Security & Access Control](./01-security-access-control.md)** — Security, Authentication, Authorization & RLS
2. **[02 — Backend & Data Layer](./02-backend-data.md)** — API/Backend, Database, Validation, Error Handling
3. **[03 — Frontend, Flows & UX](./03-frontend-flows-ux.md)** — User Journeys, Feature Completeness, UI, UX, React Patterns, Edge Cases
4. **[04 — Architecture, Operations & Quality](./04-architecture-operations-quality.md)** — Architecture, Performance, Deployment, Testing, Dependencies, Documentation, Code Quality

---

## The five root causes behind most Critical/High findings

Most of the 52 Critical/High findings collapse into five underlying defects. Fix these five and the risk profile changes categorically.

### 1. Authorization trusts client-writable data (the master blocker)
Every server-side RLS policy and `get_user_role()` resolves the caller's role from `auth.user_metadata.role` — which the browser can rewrite at will via `supabase.auth.updateUser`, and which is set from a **caller-chosen value at signup**. So any authenticated user can self-promote to `academic_head`/admin and read/write all data. `useAutoPromote.ts` even calls `updateUser({role})` from the client as normal app behavior.
*Findings: C01, C03, C04, H01, H05, H12, H14 — plus C11 (whole state machine runs untrusted in the browser).*

### 2. The review state machine has no server-side enforcement
All transitions (`submitted → pending_review → buddy_approved → approved`, `needs_revision`) are computed and written by the client. The owner UPDATE policy's `WITH CHECK` lets a user set their **own** `review_status` to `approved`. There is no trigger validating `old → new` transitions, and reviewer sub-roles (buddy vs manager vs onboarding_lead) are not separated in RLS.
*Findings: C02, C08, H04, H13, H24, H03.*

### 3. A failed worksheet load silently destroys saved data
`loadWorksheetData` discards its error, `useWorksheet` marks the form "loaded" anyway, and autosave then upserts default/empty values over the real submission — resetting an `approved` worksheet's review status. Autosave also fires on **mere page open** with no dirty check.
*Findings: C06, C09, C10, H06, H17, H29, H32.*

### 4. The database schema is unrunnable and untracked
`db/schema.sql` fails on a fresh database, silently drops the role `CHECK` on an existing one, and its "security hardening" section `DROP`s policies **by names that were never created** — leaving the original permissive policies alive (Postgres OR-semantics: the weak policy wins). There is no migration framework — 17 overlapping ad-hoc SQL files with contradictory definitions, so the live DB's actual state is unknowable from the repo.
*Findings: C05, C07, H08, H09, H10, H11.*

### 5. Supabase errors are systematically swallowed
supabase-js returns errors in the result object and never throws, yet ~19 call sites destructure only `{ data }`. Every `try/catch` around them is dead code; outages render as empty/"Not Started" UI instead of errors, and submits can report success on failure.
*Findings: H18, H06, H17 — pervasive across dashboards, phases, guards, hooks.*

---

## Prioritized pre-production checklist (highest impact first)

### Tier 0 — Must fix before any deployment (blockers)

1. **Move authorization off `user_metadata`.** Resolve roles only from server-controlled `app_metadata` or a `SECURITY DEFINER` lookup of `user_profiles.role`; rewrite every RLS policy and `get_user_role()`; run the (currently commented-out) `app_metadata` backfill. — *C01, C03, C04, H12*
2. **Remove client-side role writes.** Delete the `auth.updateUser({role})` call in `useAutoPromote`; move promotion to a service-role Edge Function / RPC that updates the **target** user. (It currently corrupts the *manager's* own session.) — *H21, H31, C11*
3. **Stop accepting a role from the client at signup.** Ignore `options.data.role`, drop the client-side `user_profiles` insert, rely on the `handle_new_user` trigger (and verify it's actually deployed). — *H01, H05, H14*
4. **Enforce the review state machine in Postgres.** Add a `BEFORE UPDATE` trigger validating `(old.review_status → new.review_status, actor role)` against an allowed-edges table; tighten the owner `WITH CHECK` to exclude `approved`/`buddy_approved`; split reviewer sub-role policies. — *C02, C08, H03, H04, H13, H24*
5. **Fix the data-loss path.** Propagate the load error; do **not** mark the form loaded on failure (show retry); never let autosave write `review_status` it didn't load from the server. — *C06, C09, C10*
6. **Add a dirty check to autosave.** Only write after an actual field edit; disable autosave entirely in viewer/override mode. — *H29, H30*
7. **Make the DB schema runnable and tracked.** Fix the policy-name mismatches so hardened policies actually replace the permissive ones; guard the `DROP CONSTRAINT`; make all `CREATE POLICY/TRIGGER` idempotent; adopt Supabase CLI migrations and snapshot the real live schema. — *C05, C07, H08, H09, H10*
8. **Rotate the leaked Supabase key and remove `.env` from git.** It is still tracked (`git ls-files` shows it) with no `.gitignore` entry. Rotate the key, purge from history, add `.env` to `.gitignore`. — *see 01-security / deployment*
9. **Fix `{ data }` error-swallowing on the critical read/write paths** (dashboards, phase pages, access guards, submit) so failures surface instead of rendering wrong data. — *H18, H06, H17*

### Tier 1 — Fix before real users (broken flows)

10. **Build the password-reset flow.** The login link 404s and no reset exists anywhere. Add `/forgot-password` + `/reset-password` using `resetPasswordForEmail` and the `PASSWORD_RECOVERY` event. — *H02, H19, H25, H27*
11. **Fix auto-promotion end state.** Promoted `lead_instructor` users are locked out of all content with dead dashboard cards; give them a role-appropriate landing. — *H20*
12. **Notifications actually fire.** Joinee→reviewer notification inserts are denied by RLS and silently swallowed; move creation to a DB trigger / `SECURITY DEFINER` RPC. — *H22*
13. **Fix due dates.** They're derived from a hardcoded "30 days ago" demo start date, so Phase 1 sheets are born overdue; add `start_date` to `user_profiles` and compute from it. — *H07, H23*
14. **Add the manager rejection path** (buddy-approved work can only be approved or silently stalled). — *H28*
15. **Make worksheet forms responsive** (fixed 3–5 column grids are unusable on mobile). — *H26*
16. **Fix concurrent-reviewer races** with optimistic-concurrency checks (`.eq('review_status', loadedStatus)` + 0-row detection). — *H33*

### Tier 2 — Before scale / handoff

17. Separate environments — seed/admin scripts with the published `Test123!` password point at the **production** project; stand up staging. — *H37*
18. Fix the dashboard queries that fetch the whole `worksheet_submissions` table (`limit(500)`, unordered, with JSONB) — wrong beyond ~14 hires and slow. — *H34, H36*
19. Introduce a data-access layer (25+ inline `supabase.from()` sites) + query caching. — *H35*
20. Repair the lint gate — 44 ESLint errors + 2 fatal config errors; CI has been red on `main` for 4+ runs while commits land. — *C12*
21. Add auth/authorization, state-machine, and component tests; get the E2E out of "manual against prod" and into CI against local Supabase. — *H38, H39, H40*
22. Replace the default Vite `README`, delete the stale 690 KB of prior-audit output and `100 KB context.md` from the repo root, and write real setup/DB-bootstrap/deploy docs. — *documentation dimension*
23. Add security & caching headers to `vercel.json`, wire up error monitoring, code-split the 768 KB single-chunk bundle. — *deployment / performance*

---

## What is genuinely solid (don't regress these)

- **Dependencies (78):** lockfile committed and in sync, tiny prod tree, current versions, only one transitive dev-only vuln.
- **Design system:** coherent "lux" tokens, skeletons, empty states, `focus-visible`, reduced-motion support, working mobile nav drawer.
- **Build & CI mechanics:** `npm run build` (tsc + vite) passes, 158/158 vitest tests pass, TypeScript is `strict` + `noUncheckedIndexedAccess` with zero `console.log`/`TODO`.
- **Resilience scaffolding exists:** route-level `ErrorBoundary`, toast bridge, autosave retry/backoff, env throw-proxy, fail-closed gate check, `Promise.all` fan-out — the bones are good; the wiring underneath is what's broken.

---

_Generated by a 20-dimension multi-agent audit with adversarial verification. Every finding cites current-tree `file:line` evidence; see the four detail files for full reproduction steps, root causes, and example fixes._
