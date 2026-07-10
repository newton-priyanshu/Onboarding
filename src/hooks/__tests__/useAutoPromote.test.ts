import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.hoisted(() => vi.fn());
const mockRpc = vi.hoisted(() => vi.fn());

vi.mock('../../api/supabase', () => ({
  supabase: {
    from: mockFrom,
    rpc: mockRpc,
  },
}));

vi.mock('../useNotifications', () => ({
  triggerNotification: vi.fn().mockResolvedValue(undefined),
  getReviewerUserIds: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../config/worksheetConfig.jsx', () => ({
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
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: mockSubEq,
    };
    mockFrom.mockReturnValue(chain);
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await checkAndPromote(userId);
    expect(result.promoted).toBe(true);
    expect(result.message).toContain('promoted');
    expect(mockRpc).toHaveBeenCalledWith('promote_user_if_eligible');
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

  it('does not promote when the promote_user_if_eligible RPC fails', async () => {
    // Even if the worksheets look complete client-side, promotion is only ever
    // performed by the server-side SECURITY DEFINER RPC. If that RPC call
    // errors (e.g. the server-side re-check disagrees, or a network failure),
    // the client must NOT report the user as promoted and must NOT fall back
    // to any client-side role write.
    const submissions = allWsIds.map(id => ({
      worksheet_id: id,
      review_status: 'approved',
    }));

    const mockSubEq = vi.fn().mockResolvedValue({ data: submissions, error: null });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: mockSubEq,
    };
    mockFrom.mockReturnValue(chain);
    mockRpc.mockResolvedValue({ data: null, error: new Error('RPC failed') });

    const result = await checkAndPromote(userId);
    expect(result.promoted).toBe(false);
    expect(result.message).toContain('RPC failed');
  });
});
