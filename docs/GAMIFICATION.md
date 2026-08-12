# Gamification — XP, Levels, Streaks & Rewards

The onboarding loop used to end at "worksheet approved" — with no reason for a
joinee to keep momentum and no visibility for buddies/managers/campus heads.
Gamification closes that loop:

> fill worksheet → **+XP** → level up → **streaks** → unlock achievements
> (persisted) → buddy/manager approvals award **more XP** → phase bonuses →
> **certificate** on completion → campus **leaderboard** for leadership.

## How XP works (canonical rules)

| Event                              | XP   | Notes                                   |
| ---------------------------------- | ---- | --------------------------------------- |
| Worksheet submitted                | +25  | `pending_review` (and re-submission)    |
| Worksheet buddy-approved           | +50  | `buddy_approved`                        |
| Worksheet manager-approved         | +50  | `approved` (phase-level sign-off)       |
| Phase completion bonus             | +150 | Once per phase, all sheets approved     |
| Onboarding completion bonus        | +500 | All 3 phases + certificate issued       |

- **Level** = `floor(total_xp / 250) + 1` — every 250 XP is one level.
- **Streak** = consecutive calendar days with a submission; a gap resets it.
- **Certificate**: one per joinee, `NST-YYYY-XXXXXX`, issued automatically when
  all 3 phases are approved. Print-friendly modal on the dashboard.

## Where the rules live (keep in sync!)

| Concern                  | Canonical source                                        | Mirror                          |
| ------------------------ | ------------------------------------------------------- | ------------------------------- |
| XP amounts + trigger     | `supabase/migrations/20260812000001_gamification.sql`   | `src/config/gamification.ts`    |
| Level formula            | `public.gamify_level()` (same migration)                | `levelFromXp()` in the config   |
| Phase membership         | `public.gamify_phase_sheets()` (same migration)         | `PHASE_WORKSHEETS_MAP` in config |
| Achievements unlocked    | `user_achievements` table (via `sync_achievement_unlocks` RPC) | `src/hooks/useAchievements.ts` |

The DB is the source of truth. The frontend mirrors the numbers so the joinee
sees the *same* level the server records. Regression tests pin both sides:
`src/config/__tests__/gamification.test.ts` and
`src/api/__tests__/gamificationMigration.test.ts`.

## Applying the migration

```bash
SUPABASE_PAT=<token> node scripts/run_gamification_migration.cjs
```

- Idempotent — safe to re-run.
- Verify: 4 tables + 7 functions + trigger + ≥4 RLS policies.
- Until applied, the app **degrades gracefully**: the dashboard computes a
  client-side XP/level readout from submissions, achievements stay in
  localStorage, and the leaderboard shows "unavailable" — nothing crashes.

## What each role sees

- **Joinee** — level/XP/streak strip, "Next Up" pointer card, achievement-unlock
  celebration, XP chips on every worksheet footer, "+XP earned" on submit, and
  the certificate card once done.
- **Buddy / Manager** — per-joinee `L{level} · {XP} · 🔥streak` chips in the
  "My Instructors" tab of the buddy dashboard (assigned-joinee reads only).
- **Campus head / campus admin / super admin** — campus leaderboard on the
  Campus Head dashboard (`get_campus_leaderboard` RPC, server-gated).

## Security model

- Clients **cannot write** gamification tables — no INSERT/UPDATE policies.
  All writes go through the SECURITY DEFINER trigger and RPCs, so a client can
  never self-award XP.
- Reads are scoped by `can_view_user_gamification()`: self, assigned
  buddies/leads, campus head/admin of the same campus, and super admins.
- The leaderboard RPC raises for any role outside campus_head/campus_admin/
  super_admin.
