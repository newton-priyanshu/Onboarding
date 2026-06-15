import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.hoisted(() => vi.fn());
const mockAuthUpdateUser = vi.hoisted(() => vi.fn());

vi.mock('../../supabase', () => ({
  supabase: {
    from: mockFrom,
    auth: {
      updateUser: mockAuthUpdateUser,
    },
  },
}));

vi.mock('../../worksheetConfig.jsx', () => ({
  PHASE_WORKSHEETS_MAP: {
    1: ['p1_w1', 'p1_w2', 'p1_w3', 'p1_w4', 'p1_w5', 'p1_w6', 'p1_w7', 'p1_w8', 'gc1'],
    2: ['p2_w1', 'p2_w2', 'p2_w3', 'p2_w4', 'gc2'],
    3: ['p3_w1', 'p3_w2', 'p3_w3', 'p3_w4', 'p3_w5', 'gc3'],
  },
}));

import { checkAndPromote } from '../useAutoPromote';

describe('checkAndPromote', () => {
  const userId = 'test-user-123';
  const allWsIds = [
    'p1_w1', 'p1_w2', 'p1_w3', 'p1_w4', 'p1_w5', 'p1_w6', 'p1_w7', 'p1_w8', 'gc1',
    'p2_w1', 'p2_w2', 'p2_w3', 'p2_w4', 'gc2',
    'p3_w1', 'p3_w2', 'p3_w3', 'p3_w4', 'p3_w5', 'gc3',
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early when no userId provided', async () => {
    const result = await checkAndPromote(null);
    expect(result.promoted).toBe(false);
    expect(result.message).toContain('No user ID');
  });

  it('returns early when no submissions found', async () => {
    const mockEq = vi.fn().mockResolvedValue({ data: [], error: null });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: mockEq,
    };
    mockFrom.mockReturnValue(chain);

    const result = await checkAndPromote(userId);
    expect(result.promoted).toBe(false);
    expect(result.message).toContain('No submissions found');
  });

  it('returns promoted: false when only some worksheets are approved', async () => {
    const submissions = allWsIds.map((id, i) => ({
      worksheet_id: id,
      review_status: i < 5 ? 'approved' : 'pending_review',
    }));

    const mockEq = vi.fn().mockResolvedValue({ data: submissions, error: null });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: mockEq,
    };
    mockFrom.mockReturnValue(chain);

    const result = await checkAndPromote(userId);
    expect(result.promoted).toBe(false);
    expect(result.message).toContain('5/20 worksheets approved');
  });

  it('promotes user when ALL 20 worksheets are approved', async () => {
    const submissions = allWsIds.map(id => ({
      worksheet_id: id,
      review_status: 'approved',
    }));

    // Submissions query mock
    const mockSubEq = vi.fn().mockResolvedValue({ data: submissions, error: null });
    // Update query mock
    const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: mockSubEq,
      update: vi.fn().mockReturnValue({ eq: mockUpdateEq }),
    };
    mockFrom.mockReturnValue(chain);
    mockAuthUpdateUser.mockResolvedValue({ error: null });

    const result = await checkAndPromote(userId);
    expect(result.promoted).toBe(true);
    expect(result.message).toContain('promoted');
    expect(mockAuthUpdateUser).toHaveBeenCalledWith({
      data: { role: 'lead_instructor' },
    });
  });

  it('handles API errors gracefully', async () => {
    const mockEq = vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: mockEq,
    };
    mockFrom.mockReturnValue(chain);

    const result = await checkAndPromote(userId);
    expect(result.promoted).toBe(false);
    expect(result.message).toContain('DB error');
  });

  it('still promotes even if auth.updateUser fails', async () => {
    const submissions = allWsIds.map(id => ({
      worksheet_id: id,
      review_status: 'approved',
    }));

    const mockSubEq = vi.fn().mockResolvedValue({ data: submissions, error: null });
    const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: mockSubEq,
      update: vi.fn().mockReturnValue({ eq: mockUpdateEq }),
    };
    mockFrom.mockReturnValue(chain);
    mockAuthUpdateUser.mockResolvedValue({ error: new Error('Auth update failed') });

    const result = await checkAndPromote(userId);
    expect(result.promoted).toBe(true);
    expect(result.message).toContain('promoted');
  });
});
