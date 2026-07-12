# Audit Methodology (2026-07-12)

Two independent production-readiness audits were run in parallel against commit `9b27db8` on `main` (repo pulled `--ff-only` first; already up to date).

## Audit A — 15-dimension multi-agent workflow

A background orchestration workflow dispatched one specialist auditor agent per dimension, each reading the real source tree (not summaries) and citing `file:line` for every finding:

architecture · authentication · authorization & RLS · database schema · security · React correctness · user journeys · input validation · API contracts · performance · UI/UX & accessibility · deployment & ops · testing · dependencies · documentation.

Each auditor returned structured findings (severity, location, description, root cause, impact, reproduction, fix) plus a 0–100 dimension score.

**Adversarial verification.** Every CRITICAL and HIGH finding was then handed to a *separate* verifier agent whose job was to **refute** it — read the cited code and anything it depends on (the guarding RLS policy, the upstream RPC), and confirm only if the issue is real *and* not already mitigated elsewhere. Findings carry the verifier's verdict and, where it disagreed, an adjusted severity. Two originally-HIGH findings were refuted and downgraded to LOW.

- 60 agents total (45 auditors/verifiers pipelined + fan-out), 0 errors.
- ~3.9M tokens, 1019 tool calls, ~38 min wall-clock.
- Raw per-agent output: `subagents/workflows/wf_6346228f-885/journal.jsonl`.

## Audit B — independent Codex CLI review

Run concurrently and with no shared state:

```
codex exec --sandbox read-only --output-last-message codex-review.md - < codex-prompt.md
```

A different model (codex-cli 0.144.1), read-only, given the same charter (senior architect + security + QA + devops sign-off). It independently verified the build (`tsc --noEmit` pass, lint 27 warnings, `vite build` 1905 modules / 323 KB main JS), enumerated 36 findings, produced its own scorecard, and cross-checked the prior July-10 audit.

Codex noted environment limits it could not verify from a read-only sandbox: it could not run the test suite (`EROFS` on `.vite-temp`), could not reach the npm registry for `npm audit`, and had no live Supabase/Vercel access (so applied migrations, key rotation, SMTP/OAuth/redirect config, and backups remain externally unverified).

## Why two audits

Independent agreement is the point. When a separate model, run separately, surfaces the *same* release blockers (broken promotion, gate-RPC self-approval, unprotected promotion table, over-broad buddy RLS, dead manager-revision path, infinite-loading worksheets), the confidence that they are real — not one model's hallucination — is far higher than any single pass. The workflow's adversarial verifier adds a second layer: it demoted two findings that did not survive scrutiny.

## Reproduce

- Workflow: re-run the saved script under `.claude/.../workflows/scripts/production-readiness-audit-*.js`.
- Codex: `codex exec --sandbox read-only - < docs/audit/2026-07-12/../codex-prompt.md` (prompt preserved in the session scratchpad).
- Both are read-only; neither modifies the repo or any live system.
