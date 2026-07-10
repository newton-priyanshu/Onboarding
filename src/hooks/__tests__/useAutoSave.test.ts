import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFrom, mockGetUser } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetUser: vi.fn(),
}));

vi.mock('../../api/supabase', () => ({
  supabase: {
    from: mockFrom,
    auth: { getUser: mockGetUser },
  },
}));

import { loadWorksheetData, getOAuthName } from '../useAutoSave';

describe('loadWorksheetData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns { data: null, error: null } when no userId provided', async () => {
    const result = await loadWorksheetData(null, 'p1_w1');
    expect(result).toEqual({ data: null, error: null });
  });

  it('returns { data: null, error: null } when no worksheetId provided', async () => {
    const result = await loadWorksheetData('user-1', null);
    expect(result).toEqual({ data: null, error: null });
  });

  it('fetches worksheet data from supabase', async () => {
    const mockData = {
      id: 1,
      user_id: 'user-1',
      worksheet_id: 'p1_w1',
      worksheet_data: { employeeName: 'Test User' },
      status: 'submitted',
      review_status: 'pending_review',
    };

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: mockData, error: null }),
    };
    mockFrom.mockReturnValue(chain);

    const result = await loadWorksheetData('user-1', 'p1_w1');

    expect(mockFrom).toHaveBeenCalledWith('worksheet_submissions');
    expect(result.error).toBeNull();
    expect(result.data).toEqual(mockData);
    expect((result.data as { worksheet_data: { employeeName: string } }).worksheet_data.employeeName).toBe('Test User');
  });

  it('propagates supabase errors instead of swallowing them as "no rows"', async () => {
    const dbError = { message: 'Error' };
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: dbError }),
    };
    mockFrom.mockReturnValue(chain);

    const result = await loadWorksheetData('user-1', 'p1_w1');
    expect(result.data).toBeNull();
    expect(result.error).toEqual(dbError);
  });
});

describe('getOAuthName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // getOAuthName caches its result in localStorage (real in the jsdom test
    // environment, unlike under plain 'node'). Clear it so each case exercises
    // the code path it's actually testing instead of a previous case's cache.
    localStorage.clear();
  });

  it('returns full name from user_metadata', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { user_metadata: { full_name: 'Jane Smith' }, email: 'jane@newton.edu' } },
    });
    const name = await getOAuthName();
    expect(name).toBe('Jane Smith');
  });

  it('falls back to name from user_metadata', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { user_metadata: { name: 'John Doe' }, email: 'john@newton.edu' } },
    });
    const name = await getOAuthName();
    expect(name).toBe('John Doe');
  });

  it('falls back to email prefix when no name available', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { user_metadata: {}, email: 'testuser@newton.edu' } },
    });
    const name = await getOAuthName();
    expect(name).toBe('testuser');
  });

  it('returns empty string on error', async () => {
    mockGetUser.mockRejectedValue(new Error('Auth error'));
    const name = await getOAuthName();
    expect(name).toBe('');
  });

  it('returns empty string when no user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const name = await getOAuthName();
    expect(name).toBe('');
  });
});
