import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { useWorksheet } from '../useWorksheet';

const mockFrom = vi.hoisted(() => vi.fn());
const mockShowToast = vi.hoisted(() => vi.fn());

vi.mock('../../api/supabase', () => ({
  supabase: { from: mockFrom },
}));

vi.mock('../../components/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const user = { id: 'user-1', email: 'user@newton.edu' } as User;

function worksheetSubmissionsChain(loadError: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: loadError }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  };
}

function userProfilesChain() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

describe('useWorksheet — data-loss regression: a failed load must never trigger an autosave upsert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('leaves loaded=false and never calls upsert, even once the debounce window has elapsed', async () => {
    const worksheetChain = worksheetSubmissionsChain({ message: 'network down' });
    const profileChain = userProfilesChain();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'worksheet_submissions') return worksheetChain;
      if (table === 'user_profiles') return profileChain;
      throw new Error(`Unexpected table: ${table}`);
    });

    const { result } = renderHook(() =>
      useWorksheet({ user, worksheetId: 'p1_w1', phase: 'phase-1', defaultData: { employeeName: '' } })
    );

    // Let the failed load effect settle.
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.loaded).toBe(false);
    expect(result.current.loadError).not.toBe('');

    // Simulate the user still being able to type into the (unloaded) form —
    // this is exactly the scenario that could previously race a background
    // autosave against a load that never actually completed.
    act(() => {
      result.current.updateField('employeeName', 'Someone Typed This');
    });

    // Advance well past the 1500ms autosave debounce.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(result.current.loaded).toBe(false);
    expect(worksheetChain.upsert).not.toHaveBeenCalled();
  });

  it('control case: once load succeeds, an edit DOES eventually trigger an upsert', async () => {
    const worksheetChain = worksheetSubmissionsChain(null);
    const profileChain = userProfilesChain();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'worksheet_submissions') return worksheetChain;
      if (table === 'user_profiles') return profileChain;
      throw new Error(`Unexpected table: ${table}`);
    });

    const { result } = renderHook(() =>
      useWorksheet({ user, worksheetId: 'p1_w1', phase: 'phase-1', defaultData: { employeeName: '' } })
    );

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(result.current.loaded).toBe(true);
    expect(result.current.loadError).toBe('');

    act(() => {
      result.current.updateField('employeeName', 'Someone Typed This');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(worksheetChain.upsert).toHaveBeenCalledTimes(1);
  });
});
