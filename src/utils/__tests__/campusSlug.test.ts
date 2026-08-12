import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { campusPath, useCampusPath } from '../campusSlug';
import { LEGACY_TOP_LEVEL_ROUTES } from '../../constants/campus';

// useCampusPath composes useCampus (CampusContext) + useAuth (AuthContext) —
// mock both providers so the hook can be tested in isolation.
const mockUseCampus = vi.hoisted(() => vi.fn());
const mockUseAuth = vi.hoisted(() => vi.fn());

vi.mock('../../context/CampusContext', () => ({
  useCampus: mockUseCampus,
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

describe('campusPath — campus-scoped URL building', () => {
  it('returns the path unchanged when no slug is present', () => {
    expect(campusPath(null, '/dashboard')).toBe('/dashboard');
    expect(campusPath(undefined, '/dashboard')).toBe('/dashboard');
    expect(campusPath('', '/dashboard')).toBe('/dashboard');
  });

  it('prefixes the campus slug onto a normal path', () => {
    expect(campusPath('campus-a', '/dashboard')).toBe('/campus-a/dashboard');
    expect(campusPath('blr', '/week-2')).toBe('/blr/week-2');
  });

  it('strips a leading slash before prefixing (path without leading slash)', () => {
    expect(campusPath('campus-a', 'dashboard')).toBe('/campus-a/dashboard');
  });

  it('preserves query strings and hash fragments when prefixing normal paths', () => {
    expect(campusPath('campus-a', '/dashboard?tab=reports')).toBe('/campus-a/dashboard?tab=reports');
    expect(campusPath('campus-a', '/week-2#top')).toBe('/campus-a/week-2#top');
  });

  it('keeps auth and account routes flat (never campus-prefixed)', () => {
    const flat = [
      '/login', '/signup', '/forgot-password', '/reset-password',
      '/auth/callback', '/select-campus',
    ];
    for (const path of flat) {
      expect(campusPath('campus-a', path)).toBe(path);
    }
    // Sub-paths of flat routes stay flat too
    expect(campusPath('campus-a', '/select-campus/xyz')).toBe('/select-campus/xyz');
    expect(campusPath('campus-a', '/auth/callback?code=123')).toBe('/auth/callback?code=123');
    // OAuth implicit flow returns the token in the hash fragment
    expect(campusPath('campus-a', '/auth/callback#access_token=abc')).toBe('/auth/callback#access_token=abc');
  });

  it('keeps super-admin routes flat (global, not campus-scoped)', () => {
    expect(campusPath('campus-a', '/super-admin')).toBe('/super-admin');
    expect(campusPath('campus-a', '/super-admin/campuses')).toBe('/super-admin/campuses');
  });
});

describe('LEGACY_TOP_LEVEL_ROUTES — flat-URL redirect allowlist', () => {
  it('covers every prefix that in-app navigation still builds flat (no campus slug)', () => {
    // Dept + campus-head pages navigate to flat URLs like /progression/phase-1 —
    // if a prefix drops out of the allowlist, those links 404 via the catch-all.
    for (const prefix of ['progression', 'operations', 'campus-head']) {
      expect(LEGACY_TOP_LEVEL_ROUTES.has(prefix), `${prefix} must be in the legacy allowlist`).toBe(true);
    }
  });

  it('keeps the original pre-migration top-level routes', () => {
    const original = ['phase-1', 'phase-2', 'phase-3', 'week-1', 'week-2', 'week-3', 'week-4', 'admin', 'buddy', 'onboarding-lead', 'assessment', 'stakeholders', 'notifications'];
    for (const route of original) {
      expect(LEGACY_TOP_LEVEL_ROUTES.has(route), `${route} must stay in the legacy allowlist`).toBe(true);
    }
  });
});

describe('useCampusPath — hook bound to active campus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCampus.mockReturnValue({ campusSlug: 'campus-a' });
    mockUseAuth.mockReturnValue({ profile: { role: 'new_joinee' } });
  });

  it('prefixes paths with the active campus slug', () => {
    const { result } = renderHook(() => useCampusPath());
    expect(result.current('/dashboard')).toBe('/campus-a/dashboard');
    expect(result.current('/week-1')).toBe('/campus-a/week-1');
  });

  it('keeps auth routes flat regardless of role', () => {
    mockUseAuth.mockReturnValue({ profile: { role: 'academic_head' } });
    const { result } = renderHook(() => useCampusPath());
    expect(result.current('/login')).toBe('/login');
    expect(result.current('/select-campus')).toBe('/select-campus');
  });

  it('keeps super-admin paths flat for a super_admin', () => {
    mockUseAuth.mockReturnValue({ profile: { role: 'super_admin' } });
    const { result } = renderHook(() => useCampusPath());
    expect(result.current('/super-admin')).toBe('/super-admin');
    expect(result.current('/super-admin/campuses')).toBe('/super-admin/campuses');
  });
});
