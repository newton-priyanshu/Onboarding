import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

/**
 * Default due date offsets (in days from phase start) for each worksheet.
 * Phase 1 starts at Day 1, Phase 2 at Day 31, Phase 3 at Day 61.
 */
const DEFAULT_DUE_OFFSETS = {
  // Phase 1 — Days 1-30
  p1_w1: 7,    p1_w2: 30,   p1_w3: 14,   p1_w4: 14,
  p1_w5: 14,   p1_w6: 28,   p1_w7: 28,   p1_w8: 28,
  gc1: 30,
  // Phase 2 — Days 31-60
  p2_w1: 45,   p2_w2: 50,   p2_w3: 55,   p2_w4: 55,
  gc2: 60,
  // Phase 3 — Days 61-90
  p3_w1: 75,   p3_w2: 75,   p3_w3: 80,   p3_w4: 80,   p3_w5: 85,
  gc3: 90,
};

const PHASE_2_START_DAY = 31;
const PHASE_3_START_DAY = 61;

/**
 * Calculate the due date for a worksheet based on a reference start date.
 * @param {string} worksheetId - e.g. 'p1_w1'
 * @param {Date} [startDate] - Joinee's start date (defaults to today - 30 days for demo)
 * @returns {Date|null}
 */
export function calculateDueDate(worksheetId, startDate = null) {
  const offset = DEFAULT_DUE_OFFSETS[worksheetId];
  if (!offset) return null;

  const base = startDate || getDefaultStartDate();
  const dueDate = new Date(base);
  dueDate.setDate(dueDate.getDate() + offset);
  return dueDate;
}

/**
 * Get the default start date for a new joinee.
 * For demo/simulation, this is 30 days ago.
 * In production, this would come from the joinee's profile/hire date.
 */
function getDefaultStartDate() {
  // Try localStorage for persisted start date, otherwise default to 30 days ago
  const stored = localStorage.getItem('onboarding_start_date');
  if (stored) return new Date(stored);
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}

/**
 * Get today's date at midnight (for comparison).
 */
function getToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the due status for a worksheet.
 * @returns {{ dueDate: Date|null, daysRemaining: number|null, isOverdue: boolean, isDueSoon: boolean, statusLabel: string, statusColor: string }}
 */
export function getDueDateInfo(worksheetId, startDate = null) {
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
export function useDueDates(userId, worksheetIds = []) {
  const [dueDates, setDueDates] = useState({});

  useEffect(() => {
    if (!userId) return;
    (async () => {
      // Try to fetch due_dates from worksheet_submissions
      const { data } = await supabase
        .from('worksheet_submissions')
        .select('worksheet_id, due_date')
        .eq('user_id', userId);

      const dateMap = {};
      if (data) {
        data.forEach(row => {
          if (row.due_date) dateMap[row.worksheet_id] = row.due_date;
        });
      }

      // Fill in defaults for worksheets without stored due dates
      worksheetIds.forEach(id => {
        if (!dateMap[id]) {
          const calc = calculateDueDate(id);
          if (calc) dateMap[id] = calc.toISOString().split('T')[0];
        }
      });

      setDueDates(dateMap);
    })();
  }, [userId, worksheetIds.join(',')]);

  return dueDates;
}

/**
 * Format a due date as a display string.
 */
export function formatDueDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
