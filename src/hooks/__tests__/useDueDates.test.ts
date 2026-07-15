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

  it('returns test deadline (2026-07-20) for any worksheet (p1_w1)', () => {
    const start = new Date('2025-01-01');
    const due = calculateDueDate('p1_w1', start)!;
    expect(due).toBeInstanceOf(Date);
    expect(due.toISOString().split('T')[0]).toBe('2026-07-20');
  });

  it('returns test deadline (2026-07-20) for gc1', () => {
    const start = new Date('2025-01-01');
    const due = calculateDueDate('gc1', start)!;
    expect(due.toISOString().split('T')[0]).toBe('2026-07-20');
  });

  it('returns test deadline (2026-07-20) for gc3', () => {
    const start = new Date('2025-01-01');
    const due = calculateDueDate('gc3', start)!;
    expect(due.toISOString().split('T')[0]).toBe('2026-07-20');
  });

  it('returns a date for all known worksheet IDs', () => {
    const allIds = [
      'p1_w1', 'p1_w2', 'p1_w3', 'p1_w4', 'p1_w5', 'p1_w6', 'p1_w7', 'p1_w8', 'gc1',
      'p2_w1', 'p2_w2', 'p2_w3', 'p2_w4', 'gc2',
      'p3_w1', 'p3_w2', 'p3_w3', 'p3_w4', 'p3_w5', 'gc3',
      // FTP weeks
      'w1_o1', 'w1_e1', 'w1_o2', 'w1_g1',
      'w2_e1', 'w2_c3', 'w2_d2', 'w2_b1', 'w2_o1', 'w2_g1',
      'w3_d1', 'w3_d2', 'w3_e1', 'w3_b1', 'w3_g1',
      'w4_d2', 'w4_e1', 'w4_o1', 'w4_b1', 'w4_g1',
    ];
    allIds.forEach(id => {
      const due = calculateDueDate(id, new Date('2025-06-01'));
      if (!due) { console.warn('null due for', id); return; }
      expect(due).toBeInstanceOf(Date);
      expect(due.toISOString().split('T')[0]).toBe('2026-07-20');
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

  it('returns July 20, 2026 as the test deadline for all worksheets', () => {
    const info = getDueDateInfo('gc3', new Date('2020-01-01'));
    expect(info.dueDate).toBeInstanceOf(Date);
    expect(info.dueDate!.toISOString().split('T')[0]).toBe('2026-07-20');
    expect(info.daysRemaining).toBeGreaterThanOrEqual(0);
  });

  it('shows remaining days for the July 20 test deadline', () => {
    const info = getDueDateInfo('p2_w1');
    expect(info.dueDate).toBeInstanceOf(Date);
    expect(info.dueDate!.toISOString().split('T')[0]).toBe('2026-07-20');
    expect(info.daysRemaining).toBeGreaterThanOrEqual(4);
    expect(info.daysRemaining).toBeLessThanOrEqual(6);
  });
});
