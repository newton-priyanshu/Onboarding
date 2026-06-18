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
  p1_w1: 7,    p1_w2: 30,   p1_w3: 14,   p1_w4: 14,
  p1_w5: 14,   p1_w6: 28,   p1_w7: 28,   p1_w8: 28,
  gc1: 30,
  p2_w1: 45,   p2_w2: 50,   p2_w3: 55,   p2_w4: 55,
  gc2: 60,
  p3_w1: 75,   p3_w2: 75,   p3_w3: 80,   p3_w4: 80,   p3_w5: 85,
  gc3: 90,
};

// ─── Helpers ────────────────────────────────────────────

/**
 * Get the default start date for a new joinee.
 * For demo/simulation, this is 30 days ago.
 */
function getDefaultStartDate(): Date {
  const stored = localStorage.getItem('onboarding_start_date');
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
 */
export function calculateDueDate(worksheetId: string, startDate: Date | null = null): Date | null {
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

  let statusLabel = '';
  let statusColor = 'var(--color-charcoal)';

  if (isOverdue) {
    const overdueDays = Math.abs(daysRemaining);
    statusLabel = `Overdue by ${overdueDays}d`;
    statusColor = '#C62828';
  } else if (isDueSoon) {
    statusLabel = daysRemaining === 0 ? 'Due today' : `Due in ${daysRemaining}d`;
    statusColor = '#E65100';
  } else {
    statusLabel = `Due in ${daysRemaining}d`;
    statusColor = 'var(--color-warm-grey)';
  }

  return { dueDate, daysRemaining, isOverdue, isDueSoon, statusLabel, statusColor };
}

/**
 * useDueDates — Fetches/syncs due dates for a user's worksheets.
 */
export function useDueDates(userId: string | null, worksheetIds: string[] = []): DueDateMap {
  const [dueDates, setDueDates] = useState<DueDateMap>({});

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase
        .from('worksheet_submissions')
        .select('worksheet_id, due_date')
        .eq('user_id', userId);

      const dateMap: DueDateMap = {};
      if (data) {
        (data as Array<{ worksheet_id: string; due_date: string | null }>).forEach(row => {
          if (row.due_date) dateMap[row.worksheet_id] = row.due_date;
        });
      }

      // Fill in defaults for worksheets without stored due dates
      worksheetIds.forEach(id => {
        if (!dateMap[id]) {
          const calc = calculateDueDate(id);
          if (calc) dateMap[id] = calc.toISOString().split('T')[0] as string;
        }
      });

      setDueDates(dateMap);
    })();
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
