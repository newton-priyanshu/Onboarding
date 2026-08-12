import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { CampusProvider, useCampus } from '../CampusContext';
import type { Campus } from '../../types/supabase';

// CampusContext calls these from ../api/tenant — mock them.
const mockGetCurrentCampusFromPath = vi.hoisted(() => vi.fn());
const mockGetCampusBySlug = vi.hoisted(() => vi.fn());
const mockGetActiveCampuses = vi.hoisted(() => vi.fn());

vi.mock('../../api/tenant', () => ({
  getCurrentCampusFromPath: mockGetCurrentCampusFromPath,
  getCampusBySlug: mockGetCampusBySlug,
  getActiveCampuses: mockGetActiveCampuses,
}));

function makeCampus(overrides: Partial<Campus>): Campus {
  return {
    id: 'c1',
    name: 'Campus A',
    slug: 'campus-a',
    domain: null,
    is_active: true,
    branding: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const campusA = makeCampus({ id: 'c1', name: 'Campus A', slug: 'campus-a' });
const campusB = makeCampus({ id: 'c2', name: 'Campus B', slug: 'campus-b' });

// Exposes the router's navigate() so tests can drive real URL changes
// (rerender alone cannot change MemoryRouter's internal location).
// Uses a window event so no module-scope state is mutated from inside the
// component (keeps react-hooks/globals + react-hooks/immutability clean).
function NavigationProbe() {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (e: Event) => {
      navigate((e as CustomEvent<string>).detail);
    };
    window.addEventListener('campus-test-navigate', handler);
    return () => window.removeEventListener('campus-test-navigate', handler);
  }, [navigate]);
  return null;
}

function navigateInTest(to: string) {
  act(() => {
    window.dispatchEvent(new CustomEvent<string>('campus-test-navigate', { detail: to }));
  });
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/campus-a/dashboard']}>
      <NavigationProbe />
      <CampusProvider>{children}</CampusProvider>
    </MemoryRouter>
  );
}

describe('CampusProvider — campus resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockGetActiveCampuses.mockResolvedValue([campusA, campusB]);
    mockGetCampusBySlug.mockResolvedValue(campusA);
    mockGetCurrentCampusFromPath.mockReturnValue('campus-a');
  });

  it('resolves the campus slug from the URL path and loads the campus', async () => {
    const { result } = renderHook(() => useCampus(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.campusSlug).toBe('campus-a');
    expect(result.current.currentCampus?.id).toBe('c1');
    expect(result.current.error).toBeNull();
    expect(mockGetCampusBySlug).toHaveBeenCalledWith('campus-a');
  });

  it('falls back to the localStorage cache when the URL has no campus slug', async () => {
    mockGetCurrentCampusFromPath.mockReturnValue(null);
    localStorage.setItem('campus_slug', 'campus-b');
    mockGetCampusBySlug.mockResolvedValue(campusB);

    const { result } = renderHook(() => useCampus(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.campusSlug).toBe('campus-b');
    expect(result.current.currentCampus?.id).toBe('c2');
  });

  it('falls back to the DEFAULT_CAMPUS_SLUG when neither URL nor cache has a slug', async () => {
    mockGetCurrentCampusFromPath.mockReturnValue(null);
    const defaultCampus = makeCampus({ id: 'c9', name: 'Default Campus', slug: 'default' });
    mockGetCampusBySlug.mockResolvedValue(defaultCampus);

    const { result } = renderHook(() => useCampus(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.campusSlug).toBe('default');
    expect(result.current.currentCampus?.id).toBe('c9');
  });

  it('persists the resolved slug to localStorage', async () => {
    const { result } = renderHook(() => useCampus(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(localStorage.getItem('campus_slug')).toBe('campus-a');
  });

  it('sets an error when the campus cannot be resolved', async () => {
    mockGetCampusBySlug.mockResolvedValue(null);

    const { result } = renderHook(() => useCampus(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.currentCampus).toBeNull();
    expect(result.current.error).toContain('could not be resolved');
  });

  it('loads the list of active campuses for the campus switcher', async () => {
    const { result } = renderHook(() => useCampus(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.campuses).toHaveLength(2);
    expect(mockGetActiveCampuses).toHaveBeenCalled();
  });

  it('re-resolves when the URL path changes', async () => {
    mockGetCampusBySlug.mockImplementation((slug: string) =>
      Promise.resolve(slug === 'campus-b' ? campusB : campusA)
    );

    const { result } = renderHook(() => useCampus(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.campusSlug).toBe('campus-a');

    mockGetCurrentCampusFromPath.mockReturnValue('campus-b');
    navigateInTest('/campus-b/dashboard');

    await waitFor(() => expect(result.current.campusSlug).toBe('campus-b'));
  });
});

describe('CampusProvider — switchCampus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockGetActiveCampuses.mockResolvedValue([campusA, campusB]);
    mockGetCampusBySlug.mockResolvedValue(campusA);
    mockGetCurrentCampusFromPath.mockReturnValue('campus-a');
  });

  it('switches to the requested campus and persists it', async () => {
    mockGetCampusBySlug.mockResolvedValue(campusB);
    const { result } = renderHook(() => useCampus(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.switchCampus('campus-b');
    });

    await waitFor(() => expect(result.current.campusSlug).toBe('campus-b'));
    expect(result.current.currentCampus?.id).toBe('c2');
    expect(localStorage.getItem('campus_slug')).toBe('campus-b');
  });

  it('sets an error when switching to an unresolvable campus', async () => {
    mockGetCampusBySlug.mockResolvedValue(null);
    const { result } = renderHook(() => useCampus(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.switchCampus('does-not-exist');
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.currentCampus).toBeNull();
    expect(result.current.error).toContain('could not be resolved');
  });
});

describe('useCampus — provider boundary', () => {
  it('throws when used outside a CampusProvider', () => {
    // renderHook without the provider wrapper
    expect(() => renderHook(() => useCampus())).toThrow(/must be used within a CampusProvider/);
  });
});
