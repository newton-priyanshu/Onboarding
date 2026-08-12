/**
 * GAMIFICATION — client-side mirror of the canonical DB rules.
 *
 * ⚠️  The XP amounts here MUST stay in sync with the canonical trigger in
 * supabase/migrations/20260812000001_gamification.sql (award_xp_on_worksheet_event)
 * and the level formula (gamify_level). Unit tests pin the values — see
 * src/config/__tests__/gamification.test.ts.
 */

// ─── XP rules (mirrors DB trigger) ────────────────────────
export const XP_RULES = {
  /** First submission / re-submission after revision */
  submit: 25,
  /** Buddy approval of a worksheet */
  buddy_approved: 50,
  /** Manager (phase-level) approval */
  manager_approved: 50,
  /** One-time bonus when every worksheet in a phase is approved */
  phase_complete: 150,
  /** One-time bonus when all 3 phases are approved + certificate issued */
  onboarding_complete: 500,
} as const;

/** XP per level — mirrors SQL gamify_level(): floor(xp / 250) + 1 */
export const LEVEL_XP = 250;

// ─── Level titles (flavor — display only) ──────────────────
const LEVEL_TITLES = [
  'New Joinee',          // 1
  'Explorer',            // 2
  'Learner',             // 3
  'Builder',             // 4
  'Contributor',         // 5
  'Rising Star',         // 6
  'Team Player',         // 7
  'Campus Champion',     // 8
  'Faculty Star',        // 9
  'Onboarding Legend',   // 10+
];

// ─── Pure helpers ──────────────────────────────────────────

/** level = floor(xp / 250) + 1 — MUST match SQL gamify_level() */
export function levelFromXp(xp: number): number {
  return Math.floor(Math.max(0, xp) / LEVEL_XP) + 1;
}

/** XP progress within the current level (0..LEVEL_XP-1) */
export function xpIntoLevel(xp: number): number {
  return Math.max(0, xp) % LEVEL_XP;
}

/** Total XP needed to *complete* the given level's bar */
export function xpForNextLevel(level: number): number {
  return level * LEVEL_XP;
}

export interface LevelProgress {
  level: number;
  title: string;
  xp: number;
  intoLevel: number;
  needed: number;
  /** 0..100 */
  pct: number;
}

export function getLevelProgress(xp: number): LevelProgress {
  const level = levelFromXp(xp);
  const intoLevel = xpIntoLevel(xp);
  return {
    level,
    title: LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1] || 'Onboarding Legend',
    xp,
    intoLevel,
    needed: LEVEL_XP,
    pct: Math.round((intoLevel / LEVEL_XP) * 100),
  };
}

/** Streak emoji + suffix helper for display */
export function streakLabel(days: number): string {
  if (days <= 0) return 'Start your streak today';
  if (days === 1) return '1-day streak';
  return `${days}-day streak`;
}
