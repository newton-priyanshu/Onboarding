import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WeekAccessGuard from '../WeekAccessGuard';
import { WK_WORKSHEETS_MAP } from '../../config/worksheetConfigData';

const mockUseAuth = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('../../context/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('../../api/supabase', () => ({
  supabase: { from: mockFrom },
}));

const userId = 'joinee-1';

function renderGuard(weekNum: number) {
  return render(
    <MemoryRouter>
      <WeekAccessGuard weekNum={weekNum}>
        <div>Protected Week Content</div>
      </WeekAccessGuard>
    </MemoryRouter>
  );
}

function mockSubmissionsQuery(data: unknown, error: unknown = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data, error }),
  };
  mockFrom.mockReturnValue(chain);
  return chain;
}

describe('WeekAccessGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: userId } });
  });

  it('week 1 is always accessible and never queries the database', () => {
    renderGuard(1);
    expect(screen.getByText('Protected Week Content')).toBeInTheDocument();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('blocks week 2 while week 1 worksheets are not yet submitted/approved', async () => {
    const week1Ids = WK_WORKSHEETS_MAP[1] || [];
    const submissions = week1Ids.map(id => ({ worksheet_id: id, status: 'In Progress', review_status: '' }));
    mockSubmissionsQuery(submissions);
    renderGuard(2);
    await waitFor(() => {
      expect(screen.getByText(/Week 2: Co-create Locked/)).toBeInTheDocument();
    });
    expect(screen.queryByText('Protected Week Content')).not.toBeInTheDocument();
  });

  it('blocks week 2 when only some week 1 worksheets are complete', async () => {
    const week1Ids = WK_WORKSHEETS_MAP[1] || [];
    const submissions = week1Ids.map((id, i) => ({
      worksheet_id: id,
      status: i === 0 ? 'submitted' : 'In Progress',
      review_status: '',
    }));
    mockSubmissionsQuery(submissions);
    renderGuard(2);
    await waitFor(() => {
      expect(screen.getByText(/Week 2: Co-create Locked/)).toBeInTheDocument();
    });
  });

  it('unlocks week 2 once every week 1 worksheet is at least submitted', async () => {
    const week1Ids = WK_WORKSHEETS_MAP[1] || [];
    const submissions = week1Ids.map(id => ({ worksheet_id: id, status: 'submitted', review_status: '' }));
    mockSubmissionsQuery(submissions);
    renderGuard(2);
    await waitFor(() => {
      expect(screen.getByText('Protected Week Content')).toBeInTheDocument();
    });
  });

  it('also unlocks week 2 when week 1 worksheets are buddy_approved/approved (even if status lags)', async () => {
    const week1Ids = WK_WORKSHEETS_MAP[1] || [];
    const submissions = week1Ids.map((id, i) => ({
      worksheet_id: id,
      status: 'In Progress',
      review_status: i % 2 === 0 ? 'buddy_approved' : 'approved',
    }));
    mockSubmissionsQuery(submissions);
    renderGuard(2);
    await waitFor(() => {
      expect(screen.getByText('Protected Week Content')).toBeInTheDocument();
    });
  });

  it('fails CLOSED on a query error — never unlocks the week, shows a retry view', async () => {
    mockSubmissionsQuery(null, { message: 'network down' });
    renderGuard(2);
    await waitFor(() => {
      expect(screen.getByText("Couldn't Verify Access")).toBeInTheDocument();
    });
    expect(screen.queryByText('Protected Week Content')).not.toBeInTheDocument();
    expect(screen.queryByText(/Week 2: Co-create Locked/)).not.toBeInTheDocument();
  });

  it('fails CLOSED when the query resolves with no data and no error', async () => {
    mockSubmissionsQuery(null, null);
    renderGuard(2);
    await waitFor(() => {
      expect(screen.getByText("Couldn't Verify Access")).toBeInTheDocument();
    });
    expect(screen.queryByText('Protected Week Content')).not.toBeInTheDocument();
  });
});
