import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PhaseAccessGuard from '../PhaseAccessGuard';
import { PHASE_WORKSHEETS_MAP } from '../../config/worksheetConfigData';

const mockUseAuth = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('../../context/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('../../api/supabase', () => ({
  supabase: { from: mockFrom },
}));

const userId = 'joinee-1';

function renderGuard(phaseNum: number) {
  return render(
    <MemoryRouter>
      <PhaseAccessGuard phaseNum={phaseNum}>
        <div>Protected Phase Content</div>
      </PhaseAccessGuard>
    </MemoryRouter>
  );
}

function mockSubmissionsQuery(data: unknown, error: unknown = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data, error }),
  };
  mockFrom.mockReturnValue(chain);
  return chain;
}

describe('PhaseAccessGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: userId } });
  });

  it('phase 1 is always accessible and never queries the database', () => {
    renderGuard(1);
    expect(screen.getByText('Protected Phase Content')).toBeInTheDocument();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('blocks phase 2 while phase 1 has no approved submissions', async () => {
    mockSubmissionsQuery([]);
    renderGuard(2);
    await waitFor(() => {
      expect(screen.getByText(/Phase 2: Contribution Locked/)).toBeInTheDocument();
    });
    expect(screen.queryByText('Protected Phase Content')).not.toBeInTheDocument();
  });

  it('blocks phase 2 when phase 1 worksheets are only partially approved', async () => {
    const phase1Ids = PHASE_WORKSHEETS_MAP[1] || [];
    const submissions = phase1Ids.map((id, i) => ({
      worksheet_id: id,
      user_id: userId,
      review_status: i === 0 ? 'approved' : 'buddy_approved',
    }));
    mockSubmissionsQuery(submissions);
    renderGuard(2);
    await waitFor(() => {
      expect(screen.getByText(/Phase 2: Contribution Locked/)).toBeInTheDocument();
    });
  });

  it('unlocks phase 2 once every phase 1 worksheet is approved', async () => {
    const phase1Ids = PHASE_WORKSHEETS_MAP[1] || [];
    const submissions = phase1Ids.map(id => ({
      worksheet_id: id,
      user_id: userId,
      review_status: 'approved',
    }));
    mockSubmissionsQuery(submissions);
    renderGuard(2);
    await waitFor(() => {
      expect(screen.getByText('Protected Phase Content')).toBeInTheDocument();
    });
  });

  it('fails CLOSED on a query error — never unlocks the phase, shows a retry view instead of the locked view', async () => {
    mockSubmissionsQuery(null, { message: 'network down' });
    renderGuard(2);
    await waitFor(() => {
      expect(screen.getByText("Couldn't Verify Access")).toBeInTheDocument();
    });
    expect(screen.queryByText('Protected Phase Content')).not.toBeInTheDocument();
    expect(screen.queryByText(/Phase 2: Contribution Locked/)).not.toBeInTheDocument();
  });
});
