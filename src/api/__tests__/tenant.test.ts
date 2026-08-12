import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getCurrentCampusFromPath,
  withCampusPath,
  validateCampusAccess,
  getCampusBySlug,
  getActiveCampuses,
  campusSlugExists,
} from '../tenant';

// getCurrentCampusFromPath reads window.location.pathname.
function setPath(path: string) {
  window.history.pushState({}, '', path);
}

describe('getCurrentCampusFromPath — path-based campus resolution', () => {
  afterEach(() => setPath('/'));

  it('returns null at the root path', () => {
    setPath('/');
    expect(getCurrentCampusFromPath()).toBeNull();
  });

  it('extracts the first path segment as the campus slug', () => {
    setPath('/campus-a/dashboard');
    expect(getCurrentCampusFromPath()).toBe('campus-a');
    setPath('/blr/week-2');
    expect(getCurrentCampusFromPath()).toBe('blr');
  });

  it('extracts the campus slug from deeply nested paths', () => {
    setPath('/campus-a/week-1/worksheet-p1-w1');
    expect(getCurrentCampusFromPath()).toBe('campus-a');
  });

  it('returns null for auth/account routes', () => {
    for (const p of ['/login', '/signup', '/forgot-password', '/reset-password', '/auth/callback']) {
      setPath(p);
      expect(getCurrentCampusFromPath()).toBeNull();
    }
  });

  it('returns null for legacy flat routes (pre-Phase 8 URLs)', () => {
    for (const p of ['/phase-1', '/phase-2', '/phase-3', '/week-1', '/week-2', '/week-3', '/week-4']) {
      setPath(p);
      expect(getCurrentCampusFromPath()).toBeNull();
    }
    for (const p of ['/admin', '/buddy', '/onboarding-lead', '/assessment', '/stakeholders']) {
      setPath(p);
      expect(getCurrentCampusFromPath()).toBeNull();
    }
  });

  it('returns null for super-admin routes (global, not campus-scoped)', () => {
    setPath('/super-admin/campuses');
    expect(getCurrentCampusFromPath()).toBeNull();
  });
});

describe('withCampusPath — URL building', () => {
  it('prefixes the campus slug onto a path', () => {
    expect(withCampusPath('default', '/dashboard')).toBe('/default/dashboard');
  });

  it('handles a path without a leading slash', () => {
    expect(withCampusPath('blr', 'week-2')).toBe('/blr/week-2');
  });

  it('strips slashes from around the slug', () => {
    expect(withCampusPath('/blr/', '/dashboard')).toBe('/blr/dashboard');
  });
});

describe('validateCampusAccess — cross-campus access control', () => {
  it('allows access when the user campus matches the target campus', () => {
    expect(validateCampusAccess('campus-a', 'campus-a', false)).toBe(true);
  });

  it('denies access when the user campus differs from the target (cross-campus isolation)', () => {
    expect(validateCampusAccess('campus-a', 'campus-b', false)).toBe(false);
  });

  it('denies access when the user has no campus assigned', () => {
    expect(validateCampusAccess(null, 'campus-a', false)).toBe(false);
    expect(validateCampusAccess(undefined, 'campus-a', false)).toBe(false);
  });

  it('grants super admins access to any campus', () => {
    expect(validateCampusAccess('campus-a', 'campus-b', true)).toBe(true);
    expect(validateCampusAccess(null, 'campus-b', true)).toBe(true);
  });
});

// ─── DB-backed helpers (mocked supabase) ────────────────
const mockRpc = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('../supabase', () => ({
  supabase: {
    rpc: mockRpc,
    from: mockFrom,
  },
}));

describe('getCampusBySlug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // NOTE: each test uses a UNIQUE slug because tenant.ts caches campus lookups
  // in-memory for 60s — reusing a slug across tests would hit the cache and
  // skip the mocked supabase call, polluting the assertions.

  it('returns the campus when found', async () => {
    const campus = { id: 'c1', name: 'Campus A', slug: 'campus-a', is_active: true };
    const maybeSingle = vi.fn().mockResolvedValue({ data: campus, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });

    const result = await getCampusBySlug('campus-a');
    expect(mockFrom).toHaveBeenCalledWith('campuses');
    expect(select).toHaveBeenCalledWith('*');
    expect(eq).toHaveBeenCalledWith('slug', 'campus-a');
    expect(result).toEqual(campus);
  });

  it('returns null when the query errors', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'RLS blocked' } });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });

    const result = await getCampusBySlug('campus-err');
    expect(result).toBeNull();
  });

  it('returns null when no campus matches', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });

    const result = await getCampusBySlug('does-not-exist');
    expect(result).toBeNull();
  });
});

describe('getActiveCampuses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the get_active_campuses RPC when available', async () => {
    const campuses = [{ id: 'c1', slug: 'campus-a' }, { id: 'c2', slug: 'campus-b' }];
    mockRpc.mockResolvedValue({ data: campuses, error: null });

    const result = await getActiveCampuses();
    expect(mockRpc).toHaveBeenCalledWith('get_active_campuses');
    expect(result).toEqual(campuses);
  });

  it('falls back to a direct table query when the RPC fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'function not found' } });

    const campuses = [{ id: 'c1', slug: 'campus-a', is_active: true }];
    const order = vi.fn().mockResolvedValue({ data: campuses, error: null });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });

    const result = await getActiveCampuses();
    expect(mockFrom).toHaveBeenCalledWith('campuses');
    expect(eq).toHaveBeenCalledWith('is_active', true);
    expect(result).toEqual(campuses);
  });

  it('returns an empty array when both RPC and fallback fail', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc failed' } });
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'table query failed' } });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });

    const result = await getActiveCampuses();
    expect(result).toEqual([]);
  });
});

describe('campusSlugExists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true for an existing active campus', async () => {
    const campus = { id: 'c1', slug: 'exists-camp', is_active: true };
    const maybeSingle = vi.fn().mockResolvedValue({ data: campus, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });

    expect(await campusSlugExists('exists-camp')).toBe(true);
  });

  it('returns false for an inactive campus', async () => {
    const campus = { id: 'c1', slug: 'inactive-camp', is_active: false };
    const maybeSingle = vi.fn().mockResolvedValue({ data: campus, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });

    expect(await campusSlugExists('inactive-camp')).toBe(false);
  });
});
