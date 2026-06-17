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

  it('returns null when no userId provided', async () => {
    const result = await loadWorksheetData(null, 'p1_w1');
    expect(result).toBeNull();
  });

  it('returns null when no worksheetId provided', async () => {
    const result = await loadWorksheetData('user-1', null);
    expect(result).toBeNull();
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
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: mockData, error: null }),
    };
    mockFrom.mockReturnValue(chain);

    const result = await loadWorksheetData('user-1', 'p1_w1');

    expect(mockFrom).toHaveBeenCalledWith('worksheet_submissions');
    expect(result).toEqual(mockData);
    expect(result.worksheet_data.employeeName).toBe('Test User');
  });

  it('handles supabase errors gracefully', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'Error' } }),
    };
    mockFrom.mockReturnValue(chain);

    const result = await loadWorksheetData('user-1', 'p1_w1');
    expect(result).toBeNull();
  });
});

describe('getOAuthName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
