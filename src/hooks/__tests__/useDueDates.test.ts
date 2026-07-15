import { describe, it, expect, vi } from 'vitest';

// Mock supabase to avoid Node.js WebSocket issues
vi.mock('../../api/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));

import { calculateDueDate, getDueDateInfo } from '../useDueDates';

describe('calculateDueDate', () => {
  it('returns null for unknown worksheet ID', () => {
    const result = calculateDueDate('unknown_ws', new Date('2025-01-01'));
    expect(result).toBeNull();
  });

  it('returns hardcoded Phase 1 deadline (2026-07-20) for p1_w1', () => {
    const start = new Date('2025-01-01');
    const due = calculateDueDate('p1_w1', start)!;
    expect(due).toBeInstanceOf(Date);
    expect(due.toISOString().split('T')[0]).toBe('2026-07-20');
  });

  it('returns hardcoded Phase 1 deadline (2026-07-20) for gc1', () => {
    const start = new Date('2025-01-01');
    const due = calculateDueDate('gc1', start)!;
    expect(due.toISOString().split('T')[0]).toBe('2026-07-20');
  });

  it('calculates due date 90 days from start for gc3', () => {
    const start = new Date('2025-01-01');
    const due = calculateDueDate('gc3', start)!;
    expect(due.toISOString().split('T')[0]).toBe('2025-04-01');
  });

  it('returns a date for all known worksheet IDs', () => {
    const allIds = [
      'p1_w1', 'p1_w2', 'p1_w3', 'p1_w4', 'p1_w5', 'p1_w6', 'p1_w7', 'p1_w8', 'gc1',
      'p2_w1', 'p2_w2', 'p2_w3', 'p2_w4', 'gc2',
      'p3_w1', 'p3_w2', 'p3_w3', 'p3_w4', 'p3_w5', 'gc3',
    ];
    const start = new Date('2025-06-01');
    allIds.forEach(id => {
      const due = calculateDueDate(id, start);
      expect(due).toBeInstanceOf(Date);
    });
  });
});

describe('getDueDateInfo', () => {
  it('returns neutral info for unknown worksheet', () => {
    const info = getDueDateInfo('unknown_ws');
    expect(info.dueDate).toBeNull();
    expect(info.daysRemaining).toBeNull();
    expect(info.isOverdue).toBe(false);
    expect(info.isDueSoon).toBe(false);
  });

  it('marks worksheet as overdue when past due date (using Phase 3 worksheet)', () => {
    const pastDate = new Date('2020-01-01');
    // gc3 has 90-day offset from start → due 2020-03-31 (in the past)
    const info = getDueDateInfo('gc3', pastDate);
    expect(info.isOverdue).toBe(true);
    expect(info.statusLabel).toContain('Overdue');
    expect(info.statusColor).toBe('var(--color-error)');
  });

  it('marks worksheet as due soon within 2 days (using Phase 2 worksheet)', () => {
    const today = new Date();
    // p2_w1 has 45-day offset — start 44 days ago → due tomorrow
    const fortyFourDaysAgo = new Date(today);
    fortyFourDaysAgo.setDate(fortyFourDaysAgo.getDate() - 44);

    const info = getDueDateInfo('p2_w1', fortyFourDaysAgo);
    expect(info.isOverdue).toBe(false);
    expect(info.isDueSoon).toBe(true);
    expect(info.statusLabel).toMatch(/Due in \d+d|Due today/);
  });

  it('shows remaining days for future due dates (using Phase 2 worksheet)', () => {
    // p2_w1 has 45-day offset from today
    const info = getDueDateInfo('p2_w1', new Date());
    if (!info.isOverdue && !info.isDueSoon) {
      expect(info.daysRemaining).toBeGreaterThan(2);
      expect(info.statusLabel).toMatch(/Due in \d+d/);
    }
  });
});
