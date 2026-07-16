import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../Dashboard';

// ── Mock dependencies ───────────────────────────────────

const mockUseAuth = vi.hoisted(() => vi.fn());
const mockRpc = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('../../context/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('../../api/supabase', () => ({
  supabase: {
    rpc: mockRpc,
    from: mockFrom,
  },
}));

// ──── Helpers ───────────────────────────────────────────

function mockSubmissionsQuery(data: unknown, error: unknown = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data, error }),
  };
  mockFrom.mockReturnValue(chain);
  return chain;
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

const baseProfile = {
  id: 'joinee-1',
  email: 'joinee@newtonschool.co',
  full_name: 'Test Joinee',
  role: 'new_joinee' as const,
  department: null,
  assigned_lead_id: null,
  assigned_buddy_id: null,
  created_at: '',
  updated_at: '',
};

const buddyProfile = {
  id: 'buddy-1',
  full_name: 'Buddy Betty',
  email: 'buddy@newtonschool.co',
};

const managerProfile = {
  id: 'manager-1',
  full_name: 'Manager Mike',
  email: 'manager@newtonschool.co',
};

const academicHeadProfile = {
  id: 'ah-1',
  full_name: 'Academic Head',
  email: 'ah@newtonschool.co',
};

// ──── Tests ─────────────────────────────────────────────

describe('Dashboard — Support Team section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: signed-in user, no submissions, no auth loading
    mockUseAuth.mockReturnValue({
      user: { id: 'joinee-1' },
      profile: null,
    });
    mockRpc.mockResolvedValue({ data: [], error: null });
    mockSubmissionsQuery([]);
  });

  // ── No buddy/manager assigned ─────────────────────────

  it('hides the Support Team section when no buddy or manager is assigned', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'joinee-1' },
      profile: { ...baseProfile, assigned_lead_id: null, assigned_buddy_id: null },
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByText('Your Support Team')).not.toBeInTheDocument();
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // ── Only buddy assigned ───────────────────────────────

  it('shows only the Buddy card when only a buddy is assigned', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'joinee-1' },
      profile: { ...baseProfile, assigned_lead_id: null, assigned_buddy_id: 'buddy-1' },
    });
    mockRpc.mockResolvedValue({ data: [buddyProfile], error: null });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Your Support Team')).toBeInTheDocument();
      expect(screen.getByText('Buddy / Mentor')).toBeInTheDocument();
      expect(screen.getByText('Buddy Betty')).toBeInTheDocument();
      expect(screen.getByText('buddy@newtonschool.co')).toBeInTheDocument();
    });

    expect(screen.queryByText('Manager')).not.toBeInTheDocument();
    expect(mockRpc).toHaveBeenCalledWith('get_buddy_manager_names', {
      p_user_ids: ['buddy-1'],
    });
  });

  // ── Only manager assigned ─────────────────────────────

  it('shows only the Manager card when only a manager is assigned', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'joinee-1' },
      profile: { ...baseProfile, assigned_lead_id: 'manager-1', assigned_buddy_id: null },
    });
    mockRpc.mockResolvedValue({ data: [managerProfile], error: null });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Your Support Team')).toBeInTheDocument();
      expect(screen.getByText('Manager')).toBeInTheDocument();
      expect(screen.getByText('Manager Mike')).toBeInTheDocument();
      expect(screen.getByText('manager@newtonschool.co')).toBeInTheDocument();
    });

    expect(screen.queryByText('Buddy / Mentor')).not.toBeInTheDocument();
  });

  // ── Both buddy and manager assigned ───────────────────

  it('shows both Buddy and Manager cards when both are assigned', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'joinee-1' },
      profile: { ...baseProfile, assigned_lead_id: 'manager-1', assigned_buddy_id: 'buddy-1' },
    });
    mockRpc.mockResolvedValue({ data: [buddyProfile, managerProfile], error: null });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Your Support Team')).toBeInTheDocument();
      expect(screen.getByText('Buddy / Mentor')).toBeInTheDocument();
      expect(screen.getByText('Buddy Betty')).toBeInTheDocument();
      expect(screen.getByText('Manager')).toBeInTheDocument();
      expect(screen.getByText('Manager Mike')).toBeInTheDocument();
    });

    expect(mockRpc).toHaveBeenCalledWith('get_buddy_manager_names', {
      p_user_ids: ['buddy-1', 'manager-1'],
    });
  });

  // ── Buddy and manager are the same person ─────────────

  it('shows both cards when buddy and manager are the same person', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'joinee-1' },
      profile: {
        ...baseProfile,
        assigned_lead_id: 'ah-1',
        assigned_buddy_id: 'ah-1',
      },
    });
    mockRpc.mockResolvedValue({ data: [academicHeadProfile], error: null });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Your Support Team')).toBeInTheDocument();
      expect(screen.getByText('Buddy / Mentor')).toBeInTheDocument();
      expect(screen.getByText('Manager')).toBeInTheDocument();
      // Both cards reference the same name
      const nameElements = screen.getAllByText('Academic Head');
      expect(nameElements).toHaveLength(2);
    });
  });

  // ── RPC error ─────────────────────────────────────────

  it('gracefully handles an RPC error without showing the section', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'joinee-1' },
      profile: { ...baseProfile, assigned_lead_id: 'manager-1', assigned_buddy_id: 'buddy-1' },
    });
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Network error' } });

    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByText('Your Support Team')).not.toBeInTheDocument();
    });
  });

  // ── Loading state ─────────────────────────────────────

  it('does not show the section while the profile is still loading', async () => {
    // profile is null (still loading), user is set
    mockUseAuth.mockReturnValue({
      user: { id: 'joinee-1' },
      profile: null,
    });

    renderDashboard();

    // Section should not appear while profile is null
    expect(screen.queryByText('Your Support Team')).not.toBeInTheDocument();
  });
});
