import { useCampus } from '../context/CampusContext';
import { useAuth } from '../context/AuthContext';

/**
 * Prepend the campus slug to a path.
 * Auth routes, select-campus, and super-admin routes stay flat.
 */
export function campusPath(slug: string | null | undefined, path: string): string {
  // These paths should never have a campus prefix
  const FLAT_PATHS = [
    '/login', '/signup', '/forgot-password', '/reset-password',
    '/auth/callback', '/select-campus',
    '/super-admin',
  ];

  if (!slug) return path;

  // Compare only the path portion, preserving any query string or hash
  // fragment (e.g. /auth/callback?code=123 or /auth/callback#access_token=…
  // must stay flat AND keep their ?…/#… suffix).
  const suffixIdx = path.search(/[?#]/);
  const pathOnly = suffixIdx >= 0 ? path.slice(0, suffixIdx) : path;
  const suffix = suffixIdx >= 0 ? path.slice(suffixIdx) : '';

  if (FLAT_PATHS.some(p => pathOnly === p || pathOnly.startsWith(p + '/'))) return path;

  // Strip leading slash before adding prefix
  const cleanPath = pathOnly.startsWith('/') ? pathOnly.slice(1) : pathOnly;
  return `/${slug}/${cleanPath}${suffix}`;
}

/**
 * React hook: returns campusPath bound to the current campus slug.
 * Super admin routes stay flat (no campus prefix).
 */
export function useCampusPath(): (path: string) => string {
  const { campusSlug } = useCampus();
  const { profile } = useAuth();

  return (path: string) => {
    // Super admin paths stay flat
    if (profile?.role === 'super_admin' && path.startsWith('/super-admin')) {
      return path;
    }
    return campusPath(campusSlug, path);
  };
}
