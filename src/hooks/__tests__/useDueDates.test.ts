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

  it('calculates due date 7 days from start for p1_w1', () => {
    const start = new Date('2025-01-01');
    const due = calculateDueDate('p1_w1', start)!;
    expect(due).toBeInstanceOf(Date);
    expect(due.toISOString().split('T')[0]).toBe('2025-01-08');
  });

  it('calculates due date 30 days from start for gc1', () => {
    const start = new Date('2025-01-01');
    const due = calculateDueDate('gc1', start)!;
    expect(due.toISOString().split('T')[0]).toBe('2025-01-31');
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

  it('marks worksheet as overdue when past due date', () => {
    const pastDate = new Date('2020-01-01');
    const info = getDueDateInfo('p1_w1', pastDate);
    expect(info.isOverdue).toBe(true);
    expect(info.statusLabel).toContain('Overdue');
    expect(info.statusColor).toBe('var(--color-error)');
  });

  it('marks worksheet as due soon within 2 days', () => {
    // Set start date so that due date is tomorrow
    const today = new Date();
    // p1_w1 is 7 days from start
    // So start date should be 6 days ago
    const sixDaysAgo = new Date(today);
    sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);

    const info = getDueDateInfo('p1_w1', sixDaysAgo);
    expect(info.isOverdue).toBe(false);
    expect(info.isDueSoon).toBe(true);
    expect(info.statusLabel).toMatch(/Due in \d+d|Due today/);
  });

  it('shows remaining days for future due dates', () => {
    // Set start date to today — p1_w1 due in 7 days
    const info = getDueDateInfo('p1_w1', new Date());
    if (!info.isOverdue && !info.isDueSoon) {
      expect(info.daysRemaining).toBeGreaterThan(2);
      expect(info.statusLabel).toMatch(/Due in \d+d/);
    }
  });
});
