import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFrom, mockGetUser } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetUser: vi.fn(),
}));

vi.mock('../../supabase', () => ({
  supabase: {
    from: mockFrom,
    auth: { getUser: mockGetUser },
  },
}));

import { triggerNotification, getReviewerUserIds, getAssignedReviewerIds } from '../useNotifications';

describe('triggerNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when no userId provided', async () => {
    await triggerNotification({
      userId: null,
      fromUserId: 'reviewer-1',
      worksheetId: 'p1_w1',
      type: 'submitted',
      message: 'Test message',
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('inserts a notification into the database', async () => {
    const chain = { insert: vi.fn().mockResolvedValue({ error: null }) };
    mockFrom.mockReturnValue(chain);

    await triggerNotification({
      userId: 'joinee-1',
      fromUserId: 'reviewer-1',
      worksheetId: 'p1_w1',
      type: 'approved',
      message: 'Your worksheet was approved!',
    });

    expect(mockFrom).toHaveBeenCalledWith('notifications');
    expect(chain.insert).toHaveBeenCalledWith({
      user_id: 'joinee-1',
      from_user_id: 'reviewer-1',
      worksheet_id: 'p1_w1',
      type: 'approved',
      message: 'Your worksheet was approved!',
    });
  });

  it('handles insert errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const chain = { insert: vi.fn().mockResolvedValue({ error: { message: 'DB error' } }) };
    mockFrom.mockReturnValue(chain);

    await triggerNotification({
      userId: 'joinee-1',
      fromUserId: 'reviewer-1',
      worksheetId: 'p1_w1',
      type: 'submitted',
      message: 'Test',
    });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('creates notification with revision_submitted type', async () => {
    const chain = { insert: vi.fn().mockResolvedValue({ error: null }) };
    mockFrom.mockReturnValue(chain);

    await triggerNotification({
      userId: 'joinee-1',
      fromUserId: 'reviewer-1',
      worksheetId: 'p1_w2',
      type: 'revision_submitted',
      message: 'Resubmitted for review.',
    });

    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
      type: 'revision_submitted',
      worksheet_id: 'p1_w2',
    }));
  });
});

describe('getReviewerUserIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array for unknown reviewer type', async () => {
    const result = await getReviewerUserIds('unknown_type');
    expect(result).toEqual([]);
  });

  it('fetches users with lead_instructor role for buddy type', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [{ id: 'buddy-1' }, { id: 'buddy-2' }],
        error: null,
      }),
    };
    mockFrom.mockReturnValue(chain);

    const result = await getReviewerUserIds('buddy');
    expect(result).toEqual(['buddy-1', 'buddy-2']);
    expect(chain.eq).toHaveBeenCalledWith('role', 'lead_instructor');
  });

  it('fetches users with academic_head role for manager type', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [{ id: 'mgr-1' }], error: null }),
    };
    mockFrom.mockReturnValue(chain);

    const result = await getReviewerUserIds('manager');
    expect(result).toEqual(['mgr-1']);
    expect(chain.eq).toHaveBeenCalledWith('role', 'academic_head');
  });

  it('returns empty array on error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockRejectedValue(new Error('Network error')),
    };
    mockFrom.mockReturnValue(chain);

    const result = await getReviewerUserIds('manager');
    expect(result).toEqual([]);
    consoleSpy.mockRestore();
  });
});

describe('getAssignedReviewerIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns assigned_buddy_id for buddy type', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { assigned_lead_id: 'lead-1', assigned_buddy_id: 'buddy-1' },
        error: null,
      }),
    };
    mockFrom.mockReturnValue(chain);

    const result = await getAssignedReviewerIds('joinee-1', 'buddy');
    expect(result).toEqual(['buddy-1']);
  });

  it('returns assigned_lead_id for manager type', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { assigned_lead_id: 'lead-1', assigned_buddy_id: 'buddy-1' },
        error: null,
      }),
    };
    mockFrom.mockReturnValue(chain);

    const result = await getAssignedReviewerIds('joinee-1', 'manager');
    expect(result).toEqual(['lead-1']);
  });

  it('returns empty array when no data', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    mockFrom.mockReturnValue(chain);

    const result = await getAssignedReviewerIds('joinee-1', 'buddy');
    expect(result).toEqual([]);
  });

  it('returns empty array when no matching reviewer exists', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { assigned_lead_id: null, assigned_buddy_id: null },
        error: null,
      }),
    };
    mockFrom.mockReturnValue(chain);

    const result = await getAssignedReviewerIds('joinee-1', 'buddy');
    expect(result).toEqual([]);
  });
});
