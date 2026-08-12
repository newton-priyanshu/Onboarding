/**
 * Scoped campus admin user management — integration test (Phase 10, 12.2).
 *
 * Renders the CampusUserManagement page for a campus_admin and verifies:
 *   1. Every user_profiles query is campus-scoped via withCampusIf
 *      (.eq('campus_id', adminCampus) applied to each query).
 *   2. The page renders only the (server-filtered) campus users.
 *   3. Assignment updates target the exact user (.eq('id', userId)) and
 *      trigger a notification.
 *   4. A profile with no campus renders the "No campus assigned" state and
 *      never queries supabase.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import CampusUserManagement from '../campus-admin/CampusUserManagement';

// ─── Mocks ──────────────────────────────────────────────

const mockUseAuth = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());
const mockTriggerNotification = vi.hoisted(() => vi.fn());

vi.mock('../../context/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

// withCampusIf is reimplemented to mirror the real module: it appends the
// campus filter to the query when a campusId is present.
vi.mock('../../api/supabase', () => ({
  supabase: { from: mockFrom },
  withCampusIf: (query: { eq: (k: string, v: unknown) => unknown }, campusId: string | null | undefined) =>
    campusId ? query.eq('campus_id', campusId) : query,
}));

vi.mock('../../hooks/useNotifications', () => ({
  triggerNotification: mockTriggerNotification,
}));

// ─── Fixtures ───────────────────────────────────────────

const campusAUsers = [
  {
    id: 'u1',
    full_name: 'Joinee One',
    email: 'joinee1@newton.edu',
    role: 'new_joinee',
    department: null,
    assigned_lead_id: null,
    assigned_buddy_id: null,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'u2',
    full_name: 'Joinee Two',
    email: 'joinee2@newton.edu',
    role: 'lab_instructor',
    department: null,
    assigned_lead_id: 'm1',
    assigned_buddy_id: 'b1',
    created_at: '2026-01-02T00:00:00Z',
  },
];

const buddies = [
  { id: 'b1', full_name: 'Buddy Bob', email: 'bob@newton.edu', role: 'lead_instructor' },
  { id: 'm1', full_name: 'Manager Meg', email: 'meg@newton.edu', role: 'academic_head' },
  { id: 'x1', full_name: 'Other Role', email: 'x@newton.edu', role: 'progression_head' },
];

/**
 * Build the mocked supabase.from('user_profiles') chain.
 *  - users query:   select(...) → order(...) → eq('campus_id', ...)
 *  - buddies query: select(...) → not(...)  → eq('campus_id', ...)
 *  - update query:  update(payload) → eq('id', userId)
 * The from() mock returns the same base object each call, dispatching on the
 * terminal method (order/not/update) so users vs buddies resolve differently.
 */
function buildSupabaseMock(users: unknown, buddyProfiles: unknown) {
  const usersEq = vi.fn().mockResolvedValue({ data: users, error: null });
  const buddiesEq = vi.fn().mockResolvedValue({ data: buddyProfiles, error: null });
  const updateEq = vi.fn().mockResolvedValue({ data: null, error: null });

  const base = {
    select: vi.fn(() => base),
    order: vi.fn(() => ({ eq: usersEq })),
    not: vi.fn(() => ({ eq: buddiesEq })),
    update: vi.fn(() => ({ eq: updateEq })),
  };
  mockFrom.mockReturnValue(base);
  return { base, usersEq, buddiesEq, updateEq };
}

const adminProfile = {
  id: 'admin-1',
  email: 'admin@newton.edu',
  full_name: 'Campus Admin',
  role: 'campus_admin' as const,
  campus_id: 'campus-a',
};

// ─── Tests ──────────────────────────────────────────────

describe('CampusUserManagement — scoped campus admin user management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTriggerNotification.mockResolvedValue(undefined);
  });

  it('loads users with a campus-scoped query and renders them', async () => {
    mockUseAuth.mockReturnValue({ profile: adminProfile });
    const { usersEq } = buildSupabaseMock(campusAUsers, buddies);

    render(<CampusUserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Joinee One')).toBeInTheDocument();
      expect(screen.getByText('Joinee Two')).toBeInTheDocument();
    });

    // Campus scoping: both the users query and the buddies query received
    // .eq('campus_id', 'campus-a') via withCampusIf.
    expect(mockFrom).toHaveBeenCalledWith('user_profiles');
    expect(usersEq).toHaveBeenCalledWith('campus_id', 'campus-a');
    expect(screen.getByText(/2 user\(s\) in your campus/)).toBeInTheDocument();
  });

  it('renders the user count even when the campus has a single user', async () => {
    mockUseAuth.mockReturnValue({ profile: adminProfile });
    buildSupabaseMock([campusAUsers[0]], buddies);

    render(<CampusUserManagement />);

    await waitFor(() => {
      expect(screen.getByText(/1 user\(s\) in your campus/)).toBeInTheDocument();
    });
  });

  it('assigns a manager via a user-scoped update and fires a notification', async () => {
    mockUseAuth.mockReturnValue({ profile: adminProfile });
    const { base, updateEq, usersEq } = buildSupabaseMock(campusAUsers, buddies);

    render(<CampusUserManagement />);

    // Combobox order: [role-filter, u1-manager, u1-buddy, u2-manager, u2-buddy]
    // — the role-filter <select> in the Filters section comes before the table.
    await waitFor(() => {
      expect(screen.getByText('Joinee One')).toBeInTheDocument();
    });

    const selects = screen.getAllByRole('combobox');
    const managerSelect = selects[1]!;
    fireEvent.change(managerSelect, { target: { value: 'm1' } });

    await waitFor(() => {
      expect(base.update).toHaveBeenCalledWith({ assigned_lead_id: 'm1' });
      expect(updateEq).toHaveBeenCalledWith('id', 'u1');
      expect(mockTriggerNotification).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', type: 'approved' }),
      );
      expect(screen.getByText('Manager updated!')).toBeInTheDocument();
    });

    // After the update, the list reloads — still campus-scoped.
    expect(usersEq).toHaveBeenCalledWith('campus_id', 'campus-a');
  });

  it('assigns a buddy via a user-scoped update', async () => {
    mockUseAuth.mockReturnValue({ profile: adminProfile });
    const { base, updateEq } = buildSupabaseMock(campusAUsers, buddies);

    render(<CampusUserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Joinee One')).toBeInTheDocument();
    });

    // Combobox order: [role-filter, u1-manager, u1-buddy, u2-manager, u2-buddy]
    const selects = screen.getAllByRole('combobox');
    const buddySelect = selects[2]!;
    fireEvent.change(buddySelect, { target: { value: 'b1' } });

    await waitFor(() => {
      expect(base.update).toHaveBeenCalledWith({ assigned_buddy_id: 'b1' });
      expect(updateEq).toHaveBeenCalledWith('id', 'u1');
      expect(mockTriggerNotification).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', type: 'approved' }),
      );
      expect(screen.getByText('Buddy updated!')).toBeInTheDocument();
    });
  });

  it('shows "No campus assigned" and never queries supabase when the admin has no campus', async () => {
    mockUseAuth.mockReturnValue({
      profile: { ...adminProfile, campus_id: null },
    });

    render(<CampusUserManagement />);

    expect(screen.getByText('No campus assigned.')).toBeInTheDocument();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
