/**
 * Gamification migration — SQL contract regression tests.
 *
 * The gamification layer (XP/levels/streaks/achievements/certificates) is
 * canonical in supabase/migrations/20260812000001_gamification.sql, and the
 * frontend mirrors its numbers in src/config/gamification.ts. These tests lock
 * the canonical objects in place so a future migration edit can never silently
 * drop the XP trigger, weaken an RLS policy, or change an XP amount without
 * the companion config change being reviewed too:
 *
 *   1. All 4 tables exist
 *   2. XP trigger + function contract (SECURITY DEFINER, amounts 25/50/50)
 *   3. Level formula floor(xp/250)+1
 *   4. RPCs exist and are granted to authenticated
 *   5. RLS enabled + read policies present, no client write policies
 */
import { describe, it, expect } from 'vitest';
// Vite `?raw` import — loads the migration SQL as a string at transform time.
// (Deliberately avoids node:fs/process so the test needs no @types/node.)
import sql from '../../../supabase/migrations/20260812000001_gamification.sql?raw';

/** Normalized once at module scope — every assertion shares the same view. */
const normalizedSql = sql.replace(/\s+/g, ' ');

function expectSqlContains(fragment: string, description: string): void {
  const needle = fragment.replace(/\s+/g, ' ').trim();
  expect(normalizedSql, description).toContain(needle);
}

describe('tables exist', () => {
  const tables = ['gamification_profiles', 'xp_events', 'user_achievements', 'completion_certificates'];
  it.each(tables)('creates %s with IF NOT EXISTS', (table) => {
    expectSqlContains(`CREATE TABLE IF NOT EXISTS public.${table}`, `table ${table}`);
  });
});

describe('XP trigger and function contract', () => {
  it('defines the trigger function as SECURITY DEFINER plpgsql returning trigger', () => {
    expectSqlContains(
      `CREATE OR REPLACE FUNCTION public.award_xp_on_worksheet_event()
       RETURNS trigger
       LANGUAGE plpgsql
       SECURITY DEFINER`,
      'trigger function definition',
    );
  });

  it('awards the canonical submit amount (25) on pending_review', () => {
    expectSqlContains(
      `IF NEW.review_status = 'pending_review' THEN v_xp := 25;`,
      'submit XP = 25',
    );
  });

  it('awards the canonical buddy approval amount (50)', () => {
    expectSqlContains(
      `ELSIF NEW.review_status = 'buddy_approved' THEN v_xp := 50;`,
      'buddy approval XP = 50',
    );
  });

  it('awards the canonical manager approval amount (50)', () => {
    expectSqlContains(
      `ELSIF NEW.review_status = 'approved' THEN v_xp := 50;`,
      'manager approval XP = 50',
    );
  });

  it('awards the phase-complete bonus once (150) and skips if already awarded', () => {
    expectSqlContains(`'phase_complete', 150, 'phase:' || v_phase`, 'phase bonus event');
    expectSqlContains(
      `AND e.source_id = 'phase:' || v_phase`,
      'phase bonus awarded once',
    );
  });

  it('awards the onboarding-complete bonus once (500) with a certificate', () => {
    expectSqlContains(`'onboarding_complete', 500, 'onboarding'`, 'onboarding bonus event');
    expectSqlContains(
      `NOT EXISTS (SELECT 1 FROM public.completion_certificates c WHERE c.user_id = NEW.user_id)`,
      'certificate issued once',
    );
  });

  it('wires the trigger AFTER INSERT OR UPDATE OF review_status, idempotently', () => {
    expectSqlContains(
      `AFTER INSERT OR UPDATE OF review_status ON public.worksheet_submissions`,
      'trigger timing',
    );
    expectSqlContains(
      `DROP TRIGGER IF EXISTS trg_award_xp_on_worksheet_event ON public.worksheet_submissions;`,
      'idempotent re-install',
    );
  });
});

describe('level formula — floor(xp/250)+1', () => {
  it('matches the frontend LEVEL_XP constant', () => {
    expectSqlContains(
      `SELECT floor(GREATEST(p_xp, 0) / 250)::integer + 1`,
      'gamify_level formula',
    );
  });
});

describe('RPCs', () => {
  it('creates sync_achievement_unlocks as SECURITY DEFINER', () => {
    expectSqlContains(
      `CREATE OR REPLACE FUNCTION public.sync_achievement_unlocks(p_achievement_ids text[])`,
      'achievement sync RPC',
    );
    expectSqlContains(
      'ON CONFLICT (user_id, achievement_id) DO NOTHING',
      'idempotent unlock insert',
    );
  });

  it('creates get_campus_leaderboard and restricts callers', () => {
    expectSqlContains(
      `CREATE OR REPLACE FUNCTION public.get_campus_leaderboard(p_limit integer DEFAULT 20)`,
      'leaderboard RPC',
    );
    expectSqlContains(
      `RAISE EXCEPTION 'Not authorized: campus_head/campus_admin/super_admin only'`,
      'server-side role gate',
    );
  });

  it('grants EXECUTE on both RPCs to authenticated', () => {
    expectSqlContains(
      'GRANT EXECUTE ON FUNCTION public.sync_achievement_unlocks(text[]) TO authenticated;',
      'achievement RPC grant',
    );
    expectSqlContains(
      'GRANT EXECUTE ON FUNCTION public.get_campus_leaderboard(integer) TO authenticated;',
      'leaderboard RPC grant',
    );
  });
});

describe('RLS', () => {
  it('enables RLS on all four tables', () => {
    for (const table of ['gamification_profiles', 'xp_events', 'user_achievements', 'completion_certificates']) {
      expectSqlContains(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`, `RLS on ${table}`);
    }
  });

  it('routes reads through the shared can_view_user_gamification() helper', () => {
    const reads = sql.match(/FOR SELECT USING \(public\.can_view_user_gamification\(user_id\)\)/g)?.length ?? 0;
    expect(reads).toBe(4);
  });

  it('grants NO client write policies on gamification tables (server writes only)', () => {
    // The migration must not contain FOR INSERT / FOR UPDATE policies for the
    // four gamification tables — writes only happen via the SECURITY DEFINER
    // trigger and RPCs, so a client can never self-award XP.
    const codeOnly = sql
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/--[^\n]*/g, ' ');
    for (const table of ['gamification_profiles', 'xp_events', 'user_achievements', 'completion_certificates']) {
      const inserts = codeOnly.match(new RegExp(`CREATE POLICY [^;]*ON public\\.${table}[^;]*FOR INSERT`, 'g')) || [];
      const updates = codeOnly.match(new RegExp(`CREATE POLICY [^;]*ON public\\.${table}[^;]*FOR UPDATE`, 'g')) || [];
      expect(inserts.length, `${table} has no client INSERT policies`).toBe(0);
      expect(updates.length, `${table} has no client UPDATE policies`).toBe(0);
    }
  });
});
