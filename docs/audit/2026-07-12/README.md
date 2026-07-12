# AARAMBH — Production Readiness Audit (2026-07-12)

**Application:** AARAMBH — NST Bengaluru Faculty Onboarding Portal
**Stack:** React 19 + React Router 7 + TypeScript 6 (strict) + Vite 8 + Tailwind 4 SPA; Supabase (Postgres + Auth + RLS + RPCs); Vercel.
**Commit audited:** `9b27db8` on `main` (pulled `--ff-only`, up to date).

## Verdict

### Can this application be safely deployed to production today? **No.**

Two **independent** audits were run in parallel and agreed on the answer and on the top blockers:

1. A **15-dimension multi-agent workflow** (one auditor agent per dimension reading the real source tree, then an adversarial verifier agent that tried to *refute* every CRITICAL/HIGH finding).
2. An **independent Codex CLI review** (separate model, read-only, no shared state with the workflow).

Both found the same release-blocking defects independently — the strongest possible signal that they are real and not artefacts of one model's reasoning.

## The blockers both audits found independently

| # | Blocker | Codex | Workflow | Effect |
|---|---------|:-----:|:--------:|--------|
| 1 | **Promotion is completely broken and reports false success.** `promote_user_if_eligible()` promotes `auth.uid()` — but it is only ever called from the *manager's* session, so it checks the manager, returns `promoted:false`, and never touches the joinee. The client ignores the return value and shows a "🎉 promoted" toast anyway. | C-03 | 4× CRITICAL (auth, journeys, react, contracts) | The core end-of-onboarding goal is unreachable; nobody notices because staff are told it worked. |
| 2 | **Buddy can self-approve and skip the manager tier.** `upsert_gate_submission()` accepts an arbitrary `p_worksheet_id` and arbitrary `p_status`, and inserts bypass the UPDATE-only state-machine trigger. An assigned buddy (`lead_instructor`) can stamp `approved` on any of their joinee's worksheets — including the promotion-gating `gc1/gc2/gc3`. | C-01 | CRITICAL (database) + HIGH (security, authz) | Two-tier review collapses to one; feeds a role grant to `lead_instructor`. |
| 3 | **Self-promotion chain.** A joinee can `update` their own `assigned_buddy_id` to their own UUID (the RLS profile-update policy blocks only `role`), then drive the gate RPC as their own "buddy". | C-01 | HIGH (authz) | A day-1 joinee can manufacture approvals and escalate role with no reviewer. |
| 4 | **`promotion_required_worksheets` has no RLS / no REVOKE.** The table that defines who gets promoted is writable via the Data API by any authenticated user. | C-02 | HIGH (authz) | Delete rows → self-promote once one approved row remains, or add rows → DoS all promotions. |
| 5 | **Manager "Request Revision" always fails.** Both manager UIs attempt `buddy_approved → needs_revision`; the trigger and manager RLS allow only `buddy_approved → approved`. | H-04 | HIGH (authz, contracts, journeys) | A manager cannot return deficient work — approve is the only action that works. |
| 6 | **`check_due_date_notifications()` is callable by anon.** `SECURITY DEFINER`, org-wide scan, no caller check / no REVOKE. | H-08 | (security) | Anonymous UUID/worksheet/due-date enumeration + forced DB work. |
| 7 | **Every worksheet load failure = infinite spinner.** `useWorksheet` exposes `loadError`/`retryLoad`; no page wires them in. All ~40 worksheets + gate controls hang forever on any transient error. | M-02 | HIGH ×4 (journeys, uiux, validation) | Product looks hung; users lose work / trust. |
| 8 | **Buddy-mode autosave always violates RLS.** Buddies filling gate passes get repeated "Auto-save failed" toasts and *nothing is persisted* until final submit. | H-03 | HIGH ×3 | Buddies silently lose in-progress gate reviews. |
| 9 | **Joinees get no review-outcome notifications.** Only `pending_review`/`revision_submitted` fire; approved / needs_revision / buddy_approved / phase_approved do not. | M-03 | HIGH ×2 (journeys, contracts) | The reject→notify→resubmit loop the product is built around does not close. |
| 10 | **Failed submit shows the "Submitted" success screen.** Local status flips before persistence; the error toast unmounts before it renders. | H-03 | HIGH (validation) | Joinee believes work was submitted; orphaned/limbo rows never reach a reviewer. |
| 11 | **Reused worksheet IDs collide.** `p1_w6` (Week 1 vs Week 2) and `p3_w5` (Week 3 vs Week 4) share one storage key per user. | H-06 | (architecture / contracts) | Completing the earlier occurrence locks the later distinct deliverable. |
| 12 | **Due dates from a fictional "30 days ago" fallback.** New joinees see "Overdue by 27d" on day one. | H-10 | HIGH (journeys) | Destroys trust in all deadline signals from the first screen. |
| 13 | **No server-side security tests; no build-time env validation.** CI mocks the data boundary — RLS/trigger/RPC regressions and the broken promotion flow all pass green. Vite builds and Vercel ships with missing/placeholder Supabase env. | H-11, H-13 | HIGH ×3 (testing) | Every blocker above can merge and deploy with a green pipeline. |

## Findings counts

Severities below reflect **adversarial verification** — every CRITICAL/HIGH claim was checked by a second agent instructed to refute it. Two originally-HIGH workflow findings were refuted and downgraded to LOW; those are marked in the detail file.

| Severity | Workflow (verifier-adjusted) | Codex (independent) |
|---|---:|---:|
| Critical | 5 | 3 |
| High | 29 | 13 |
| Medium | 93 | 16 |
| Low | 62 | 4 |
| **Total** | **189** | **36** |

The workflow surfaces a wider MEDIUM/LOW tail because it fielded 15 specialised agents; Codex is tighter and higher-precision. The two agree on every CRITICAL and on the substance of the HIGH list.

## Scorecard (0–100)

| Category | Workflow | Codex | Merged (rounded) |
|---|---:|---:|---:|
| Production Readiness | 55 | 24 | **~35** |
| Security | 70¹ | 20 | **~35** |
| Code Quality | 68 | 58 | ~62 |
| Maintainability | 62 | 52 | ~57 |
| Performance | 60 | 63 | ~61 |
| Scalability | 45 | 40 | ~42 |
| UI/UX | 64 | 47 | ~55 |
| Documentation | 68 | 54 | ~61 |
| Testing | 60 | 28 | **~44** |

¹ The workflow's per-dimension "security" agent scored 70, but its *authz* and *database* agents (which own the RLS/RPC surface) scored 52 and 56 and produced the actual CRITICALs — so the merged security score tracks the lower, cross-cutting reality closer to Codex's 20–35.

**Merged production readiness: ~30–35 / 100.** Architecture, tooling, and code organisation are genuinely decent post-remediation; the failure is concentrated in the **authorization / RPC / state-machine layer** and a handful of **broken core journeys**, which is exactly where a faculty-onboarding product cannot afford to be wrong.

## Prioritized fix checklist (highest impact first)

### P0 — must fix before *any* production deploy (all are CRITICAL or security-CRITICAL)
1. **Fix promotion.** Replace the caller-only RPC with `approve_phase_and_promote(target_user_id, phase)` (assigned-manager-only, one transaction that verifies the full required set and updates the *target*), or a server trigger. Make the client honour the returned `promoted`/`message` instead of assuming success. *(blockers 1)*
2. **Lock down `upsert_gate_submission`.** Whitelist `p_worksheet_id` to `gc1/gc2/gc3`, remove `p_status`, derive status server-side, reject non-gate IDs, enforce insert states. *(blocker 2)*
3. **Kill the self-promotion chain.** Revoke client writes to `assigned_buddy_id`/`assigned_lead_id`; move assignment to an audited admin-only RPC. *(blocker 3)*
4. **Protect `promotion_required_worksheets`.** `REVOKE ALL` from `PUBLIC/anon/authenticated`, enable RLS with no client policies, grant only the service/migration role. *(blocker 4)*
5. **Revoke anon execute on `check_due_date_notifications()`** (and audit every `SECURITY DEFINER` function's grants); return aggregate status only. *(blocker 6)*
6. **Scope buddy RLS to least privilege.** The "Admin update profiles" / "Admin read all profiles" policies must not grant every `lead_instructor` read+update over all profiles/worksheets; scope to `assigned_buddy_id = auth.uid()` and drop the NULL-assignment wildcard.
7. **Make reviewed snapshots + audit metadata immutable** (owner cannot rewrite `worksheet_data` on an approved row; derive reviewer identity/time from `auth.uid()`/`now()`).
8. **Apply the corrected migrations to a throwaway Supabase project and run an adversarial role-matrix test** before touching production. Verify the *live* project's actual ACLs, `pg_policies`, migration versions, and role metadata.

### P1 — before go-live approval
9. Align the manager **Request Revision** transition across client state machine, trigger, and RLS. *(blocker 5)*
10. Wire `loadError`/`retryLoad` into `WorksheetPage` and every gate page — no more infinite spinners. *(blocker 7)*
11. Make submit atomic + serialize/suspend autosave during submit; only flip local status after server success; fix buddy-mode autosave RLS. *(blockers 8, 10)*
12. Emit review-outcome notifications (approved / needs_revision / buddy_approved / phase_approved) to the joinee from trusted triggers/RPCs. *(blocker 9)*
13. Give each weekly curriculum occurrence a unique persistence identity; migrate colliding `p1_w6` / `p3_w5` data. *(blocker 11)*
14. Move start-date + due-date calculation to the server; remove the "30 days ago" fallback. *(blocker 12)*
15. Reconcile the `onboarding_lead`-as-reviewer / buddy config vs routes/RLS so no assignment can deadlock a joinee's pipeline.
16. Add build-time env validation (fail CI/Vercel on missing/placeholder Supabase config). *(blocker 13)*
17. Add CI coverage for the security boundary: spin up a disposable Supabase, apply migrations, run an RLS/RPC role-matrix (pgTAP or SQL) + Playwright journeys for auth, revision, phase approval, promotion.

### P2 — production hardening
18. Dashboard pagination / server aggregates; replace 15s polling with Realtime or visibility-aware backoff (silent 200/500/2000-row truncation today).
19. Observability: client error + performance telemetry, release SHA, hidden sourcemaps, alerts on save/auth failures, synthetic journey monitors.
20. Upgrade CI + Vercel + `engines` to Node 24 (Node 20 is EOL; Supabase dropped Node 20 support 2026-06-30).
21. Isolate/guard destructive test scripts (predictable `Test123!` accounts, delete-all) from ever pointing at production.
22. Keyboard accessibility on click-`div` controls, user-scoped cache keys + logout cache clear, WOFF2/subset fonts (~2 MiB TTF today), enforce a lint warning budget, correct the CHANGELOG's false "server-authoritative gating" / PWA claims.

## What is already good (post-remediation, both audits agree)
- Signup no longer trusts a client-selected role — the server forces `new_joinee`.
- `.env` untracked; `.env.example` uses placeholders (note: old `.env` remains in git history — verify the key was rotated).
- `SECURITY DEFINER` functions pin an empty `search_path`; FK delete behaviour and worksheet uniqueness constraints exist.
- CSP + security headers in `vercel.json`, an ErrorBoundary, Dependabot, CI, and 40+ code-split worksheet routes are all present.
- Dependencies are current and clean (workflow scored this 85): React 19.2.7, Supabase-js 2.108.2, Vite 8.0.16 (past the advisory fix). `tsc --noEmit` passes; lint passes with 27 warnings.

## Files in this audit
- `README.md` — this executive summary, merged verdict, and prioritized checklist.
- `FINDINGS-workflow.md` — all 189 workflow findings with location/impact/fix, per-dimension scores and assessments, and verifier verdicts.
- `FINDINGS-codex-independent.md` — the full independent Codex report (36 findings + its own scorecard and prior-audit cross-check).
- `METHODOLOGY.md` — how the two audits were run and how to reproduce them.
