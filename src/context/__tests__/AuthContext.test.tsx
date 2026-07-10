import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from '../AuthContext';

const mockGetSession = vi.hoisted(() => vi.fn());
const mockOnAuthStateChange = vi.hoisted(() => vi.fn());
const mockSignUp = vi.hoisted(() => vi.fn());
const mockGetUser = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('../../api/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
      signUp: mockSignUp,
      getUser: mockGetUser,
    },
    from: mockFrom,
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  });

  describe('signUp', () => {
    it('never sends a role to supabase.auth.signUp — role is server-assigned only', async () => {
      // No active session — provider settles to loading:false without a profile fetch.
      mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
      mockSignUp.mockResolvedValue({
        data: { user: { id: 'new-user-1', identities: [{ id: 'identity-1' }] } },
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await result.current.signUp('new@newton.edu', 'password123', 'New Person', 'academic_head');

      expect(mockSignUp).toHaveBeenCalledTimes(1);
      const callArg = mockSignUp.mock.calls[0]?.[0];
      expect(callArg).toEqual({
        email: 'new@newton.edu',
        password: 'password123',
        options: { data: { full_name: 'New Person' } },
      });
      // Explicitly assert no role/app_metadata/role-shaped key was smuggled in anywhere.
      expect(JSON.stringify(callArg)).not.toContain('role');
      expect(JSON.stringify(callArg)).not.toContain('academic_head');
    });

    it('throws when supabase reports the email is already registered (zero identities)', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
      mockSignUp.mockResolvedValue({
        data: { user: { id: 'existing-user', identities: [] } },
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await expect(
        result.current.signUp('existing@newton.edu', 'password123', 'Someone', 'new_joinee')
      ).rejects.toThrow(/already exists/i);
    });
  });

  describe('OAuth profile auto-creation — full name fallback chain', () => {
    async function setUpSessionWithNoProfileRow(authUser: {
      id: string;
      email: string;
      user_metadata?: Record<string, unknown>;
    }) {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: authUser.id, email: authUser.email } } },
        error: null,
      });

      // fetchProfile(): user_profiles select().eq().single() -> no row found (PGRST116)
      const selectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'no rows' } }),
      };
      // createProfileFromAuth(): insert(...).select().single() -> returns the new row
      const insertChain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn(),
      };
      mockFrom.mockImplementationOnce(() => selectChain).mockImplementationOnce(() => insertChain);

      mockGetUser.mockResolvedValue({
        data: { user: { id: authUser.id, email: authUser.email, user_metadata: authUser.user_metadata || {} } },
        error: null,
      });

      return { selectChain, insertChain };
    }

    it('uses user_metadata.full_name when present', async () => {
      const { insertChain } = await setUpSessionWithNoProfileRow({
        id: 'u1',
        email: 'jane@newton.edu',
        user_metadata: { full_name: 'Jane Smith' },
      });
      insertChain.single.mockResolvedValue({
        data: { id: 'u1', email: 'jane@newton.edu', full_name: 'Jane Smith', role: 'new_joinee' },
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.profile?.full_name).toBe('Jane Smith'));
      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'u1', email: 'jane@newton.edu', full_name: 'Jane Smith' })
      );
      // SECURITY: the client-side auto-create must never write a role column.
      expect(insertChain.insert.mock.calls[0]?.[0]).not.toHaveProperty('role');
    });

    it('falls back to user_metadata.name when full_name is absent', async () => {
      const { insertChain } = await setUpSessionWithNoProfileRow({
        id: 'u2',
        email: 'john@newton.edu',
        user_metadata: { name: 'John Doe' },
      });
      insertChain.single.mockResolvedValue({
        data: { id: 'u2', email: 'john@newton.edu', full_name: 'John Doe', role: 'new_joinee' },
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.profile?.full_name).toBe('John Doe'));
      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ full_name: 'John Doe' })
      );
    });

    it('falls back to the email prefix when neither full_name nor name is present', async () => {
      const { insertChain } = await setUpSessionWithNoProfileRow({
        id: 'u3',
        email: 'noname@newton.edu',
        user_metadata: {},
      });
      insertChain.single.mockResolvedValue({
        data: { id: 'u3', email: 'noname@newton.edu', full_name: 'noname', role: 'new_joinee' },
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.profile?.full_name).toBe('noname'));
      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ full_name: 'noname' })
      );
    });
  });
});
