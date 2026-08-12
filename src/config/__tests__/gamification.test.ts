/**
 * Gamification config — unit tests.
 *
 * Pins the XP amounts and the level formula that MUST stay in sync with the
 * canonical DB trigger (supabase/migrations/20260812000001_gamification.sql,
 * functions award_xp_on_worksheet_event / gamify_level). If either side drifts,
 * the joinee's displayed level stops matching what the DB records.
 */
import { describe, it, expect } from 'vitest';
import {
  XP_RULES,
  LEVEL_XP,
  levelFromXp,
  xpIntoLevel,
  xpForNextLevel,
  getLevelProgress,
  streakLabel,
} from '../gamification';
import { computeFallbackProfile } from '../../hooks/useGamification';
import { REVIEW_STATUS } from '../../constants/status';

describe('XP_RULES — mirrors the DB trigger amounts', () => {
  it('awards 25 XP on submit (pending_review and revision_submitted)', () => {
    expect(XP_RULES.submit).toBe(25);
  });

  it('awards 50 XP on buddy approval', () => {
    expect(XP_RULES.buddy_approved).toBe(50);
  });

  it('awards 50 XP on manager approval', () => {
    expect(XP_RULES.manager_approved).toBe(50);
  });

  it('awards 150 XP phase-completion bonus', () => {
    expect(XP_RULES.phase_complete).toBe(150);
  });

  it('awards 500 XP onboarding-completion bonus', () => {
    expect(XP_RULES.onboarding_complete).toBe(500);
  });

  it('uses 250 XP per level — matches SQL gamify_level()', () => {
    expect(LEVEL_XP).toBe(250);
  });
});

describe('levelFromXp — matches SQL gamify_level(): floor(xp/250) + 1', () => {
  it('starts at level 1', () => {
    expect(levelFromXp(0)).toBe(1);
  });

  it('levels up exactly at the boundary', () => {
    expect(levelFromXp(249)).toBe(1);
    expect(levelFromXp(250)).toBe(2);
    expect(levelFromXp(500)).toBe(3);
  });

  it('never goes below 1 for negative input', () => {
    expect(levelFromXp(-5)).toBe(1);
  });

  it('computes level progress within the bar', () => {
    expect(xpIntoLevel(260)).toBe(10);
    expect(xpForNextLevel(2)).toBe(500);
    expect(xpForNextLevel(3)).toBe(750);
  });

  it('returns a 0-100 pct for the current level bar', () => {
    const p = getLevelProgress(250); // exactly one full level
    expect(p.level).toBe(2);
    expect(p.intoLevel).toBe(0);
    expect(p.pct).toBe(0);
  });

  it('gives every level a display title', () => {
    for (let xp = 0; xp <= 3000; xp += 250) {
      const p = getLevelProgress(xp);
      expect(p.title.length, `title for level ${p.level}`).toBeGreaterThan(0);
    }
  });
});

describe('streakLabel', () => {
  it('encourages starting when 0', () => {
    expect(streakLabel(0)).toBe('Start your streak today');
  });

  it('handles singular and plural', () => {
    expect(streakLabel(1)).toBe('1-day streak');
    expect(streakLabel(4)).toBe('4-day streak');
  });
});

describe('computeFallbackProfile — client-side mirror of the DB trigger', () => {
  function sub(worksheet_id: string, review_status: string, updated_at: string) {
    return { worksheet_id, review_status, status: 'submitted', updated_at } as const;
  }

  it('counts 25 XP for a pending_review submission', () => {
    const p = computeFallbackProfile([sub('p1_w1', REVIEW_STATUS.PENDING_REVIEW, '2026-08-10T09:00:00Z')] as never[]);
    expect(p.total_xp).toBe(25);
    expect(p.level).toBe(1);
  });

  it('counts 25 + 50 for a buddy-approved worksheet', () => {
    const p = computeFallbackProfile([sub('p1_w1', REVIEW_STATUS.BUDDY_APPROVED, '2026-08-10T09:00:00Z')] as never[]);
    expect(p.total_xp).toBe(25 + 50);
  });

  it('counts 25 + 50 + 50 for a fully approved worksheet', () => {
    const p = computeFallbackProfile([sub('p1_w1', REVIEW_STATUS.APPROVED, '2026-08-10T09:00:00Z')] as never[]);
    expect(p.total_xp).toBe(25 + 50 + 50);
  });

  it('does not double-count a worksheet that passes through several states', () => {
    // Same worksheet appearing twice (once pending, once approved) counts once.
    const p = computeFallbackProfile([
      sub('p1_w1', REVIEW_STATUS.PENDING_REVIEW, '2026-08-09T09:00:00Z'),
      sub('p1_w1', REVIEW_STATUS.APPROVED, '2026-08-10T09:00:00Z'),
    ] as never[]);
    expect(p.total_xp).toBe(25 + 50 + 50);
  });

  it('computes a streak from consecutive activity days', () => {
    const p = computeFallbackProfile([
      sub('p1_w1', REVIEW_STATUS.PENDING_REVIEW, '2026-08-08T09:00:00Z'),
      sub('p1_w2', REVIEW_STATUS.PENDING_REVIEW, '2026-08-09T09:00:00Z'),
      sub('p1_w3', REVIEW_STATUS.PENDING_REVIEW, '2026-08-10T09:00:00Z'),
    ] as never[]);
    expect(p.current_streak).toBe(3);
    expect(p.longest_streak).toBe(3);
  });

  it('resets the streak when days are not consecutive', () => {
    const p = computeFallbackProfile([
      sub('p1_w1', REVIEW_STATUS.PENDING_REVIEW, '2026-08-08T09:00:00Z'),
      sub('p1_w2', REVIEW_STATUS.PENDING_REVIEW, '2026-08-10T09:00:00Z'),
    ] as never[]);
    expect(p.current_streak).toBe(1); // a gap resets the run
    expect(p.longest_streak).toBe(1);
  });
});
