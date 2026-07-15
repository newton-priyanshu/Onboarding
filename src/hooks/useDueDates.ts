import { t } from '../config/theme';
import { useState, useEffect } from 'react';
import { supabase } from '../api/supabase';

// ─── Types ──────────────────────────────────────────────

interface DueDateInfo {
  dueDate: Date | null;
  daysRemaining: number | null;
  isOverdue: boolean;
  isDueSoon: boolean;
  statusLabel: string;
  statusColor: string;
}

type DueDateMap = Record<string, string>;

// ─── Constants ──────────────────────────────────────────

/**
 * Default due date offsets (in days from phase start) for each worksheet.
 * Phase 1 starts at Day 1, Phase 2 at Day 31, Phase 3 at Day 61.
 */
const DEFAULT_DUE_OFFSETS: Record<string, number> = {
  // Phase 1 — offsets IGNORED; all Phase 1 worksheets use a hardcoded
  // test deadline (July 20, 2026) — see calculateDueDate below.
  p1_w1: 7,    p1_w2: 30,   p1_w3: 14,   p1_w4: 14,
  p1_w5: 14,   p1_w6: 28,   p1_w7: 28,   p1_w8: 28,
  gc1: 30,
  p2_w1: 45,   p2_w2: 50,   p2_w3: 55,   p2_w4: 55,
  gc2: 60,
  p3_w1: 75,   p3_w2: 75,   p3_w3: 80,   p3_w4: 80,   p3_w5: 85,
  gc3: 90,
  // FTP Week 1 (due within Week 1 = days 1-7)
  w1_o1: 3,    w1_e1: 5,    w1_o2: 6,
  w1_g1: 7,
  // FTP Week 2 (due within Week 2 = days 8-14)
  w2_e1: 10,   w2_c3: 12,   w2_d2: 13,   w2_b1: 13,   w2_o1: 14,
  w2_g1: 14,
  // FTP Week 3 (due within Week 3 = days 15-21)
  w3_d1: 16,   w3_d2: 17,   w3_e1: 19,   w3_b1: 20,
  w3_g1: 21,
  // FTP Week 4 (due within Week 4 = days 22-28)
  w4_d2: 24,   w4_e1: 25,   w4_o1: 27,   w4_b1: 28,
  w4_g1: 28,
};

// ─── Temporary Hardcoded Phase 1 Deadline (July 15–20 test window) ───────
// All Phase 1 worksheets share a single deadline of July 20, 2026.
// This is a TEST override — revert this block and the early-return in
// calculateDueDate when the real phase-based offset logic is needed again.
const PHASE1_DEADLINE = new Date('2026-07-20');
const PHASE1_WS_IDS = new Set([
  'p1_w1', 'p1_w2', 'p1_w3', 'p1_w4', 'p1_w5', 'p1_w6', 'p1_w7', 'p1_w8',
  'gc1',
  'w1_o1', 'w1_e1', 'w1_o2', 'w1_g1',
]);

// ─── Helpers ────────────────────────────────────────────

/**
 * Get the default start date for a new joinee.
 * For demo/simulation, this is 30 days ago.
 */
function getDefaultStartDate(): Date {
  let stored: string | null = null;
  try { stored = localStorage.getItem('onboarding_start_date'); } catch { /* localStorage unavailable */ }
  if (stored) return new Date(stored);
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}

/**
 * Get today's date at midnight (for comparison).
 */
function getToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ─── Public API ─────────────────────────────────────────

/**
 * Calculate the due date for a worksheet based on a reference start date.
 *
 * TEMP (July 2026): All Phase 1 worksheets return July 20, 2026 —
 * a hardcoded test deadline for the 20-person pilot. Revert as soon
 * as real phase-based offset logic is needed.
 */
export function calculateDueDate(worksheetId: string, startDate: Date | null = null): Date | null {
  // TEMP: Phase 1 hardcoded deadline (July 20, 2026)
  if (PHASE1_WS_IDS.has(worksheetId)) {
    return new Date(PHASE1_DEADLINE);
  }

  const offset = DEFAULT_DUE_OFFSETS[worksheetId];
  if (!offset) return null;

  const base = startDate || getDefaultStartDate();
  const dueDate = new Date(base);
  dueDate.setDate(dueDate.getDate() + offset);
  return dueDate;
}

/**
 * Get the due status for a worksheet.
 */
export function getDueDateInfo(worksheetId: string, startDate: Date | null = null): DueDateInfo {
  const dueDate = calculateDueDate(worksheetId, startDate);
  if (!dueDate) {
    return { dueDate: null, daysRemaining: null, isOverdue: false, isDueSoon: false, statusLabel: '', statusColor: 'var(--color-warm-grey)' };
  }

  const today = getToday();
  const diffTime = dueDate.getTime() - today.getTime();
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const isOverdue = daysRemaining < 0;
  const isDueSoon = daysRemaining >= 0 && daysRemaining <= 2;

  let statusLabel: string;
  let statusColor: string;

  if (isOverdue) {
    const overdueDays = Math.abs(daysRemaining);
    statusLabel = `Overdue by ${overdueDays}d`;
    statusColor = 'var(--color-error)';
  } else if (isDueSoon) {
    statusLabel = daysRemaining === 0 ? 'Due today' : `Due in ${daysRemaining}d`;
    statusColor = t.warning;
  } else {
    statusLabel = `Due in ${daysRemaining}d`;
    statusColor = 'var(--color-warm-grey)';
  }

  return { dueDate, daysRemaining, isOverdue, isDueSoon, statusLabel, statusColor };
}

/**
 * useDueDates — Fetches/syncs due dates for a user's worksheets.
 *
 * Never overwrites a persisted due_date (only fills gaps). For worksheets
 * without a stored due_date, computes a default from the user's REAL
 * onboarding start_date (falling back to created_at) — never from a rolling
 * "N days ago" guess (H07/H23).
 */
export function useDueDates(userId: string | null, worksheetIds: string[] = []): DueDateMap {
  const [dueDates, setDueDates] = useState<DueDateMap>({});

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const [subsRes, profileRes] = await Promise.all([
        supabase
          .from('worksheet_submissions')
          .select('worksheet_id, due_date')
          .eq('user_id', userId),
        supabase
          .from('user_profiles')
          .select('start_date, created_at')
          .eq('id', userId)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      if (subsRes.error) {
        console.error('[useDueDates] Failed to load worksheet due dates:', subsRes.error);
      }
      if (profileRes.error) {
        console.error('[useDueDates] Failed to load start date for due-date calc:', profileRes.error);
      }

      const dateMap: DueDateMap = {};
      const subs = subsRes.data as Array<{ worksheet_id: string; due_date: string | null }> | null;
      (subs || []).forEach(row => {
        if (row.due_date) dateMap[row.worksheet_id] = row.due_date;
      });

      const profile = profileRes.data as { start_date?: string | null; created_at?: string | null } | null;
      const startDateStr = profile?.start_date || profile?.created_at || null;
      const startDate = startDateStr ? new Date(startDateStr) : null;

      // Fill in defaults (from the real onboarding start date) for
      // worksheets without a stored due_date. Never overwrites a persisted one.
      worksheetIds.forEach(id => {
        if (!dateMap[id]) {
          const calc = calculateDueDate(id, startDate);
          if (calc) dateMap[id] = calc.toISOString().split('T')[0] as string;
        }
      });

      setDueDates(dateMap);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, worksheetIds.join(',')]);

  return dueDates;
}

/**
 * Format a due date as a display string.
 */
export function formatDueDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
