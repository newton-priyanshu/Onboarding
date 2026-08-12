import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCampus } from '../context/CampusContext';
import { DEFAULT_CAMPUS_SLUG, LEGACY_TOP_LEVEL_ROUTES } from '../constants/campus';
import NotFound from '../pages/NotFound';

// ─── Legacy URL redirect (Phase 9 backward compatibility) ──────────
// Pre-migration URLs (e.g. /phase-1, /week-2, /admin, /progression/phase-1)
// had no campus prefix. When multi-tenant mode is enabled, redirect them to
// the campus-scoped equivalent so deep links and bookmarks keep working.

export function LegacyRedirect() {
  const location = useLocation();
  const { profile } = useAuth();
  const { campuses } = useCampus();

  // Prefer the user's assigned campus (from their profile) so multi-campus
  // users land on their own campus; fall back to the default campus slug.
  const userCampus = campuses.find(c => c.id === profile?.campus_id);
  const targetSlug = userCampus?.slug || DEFAULT_CAMPUS_SLUG;
  const target = `/${targetSlug}${location.pathname}${location.search}`;
  return <Navigate to={target} replace />;
}

/**
 * Smart 404 — if the URL's first segment is a known pre-migration route
 * (including nested paths like /progression/phase-1), redirect to the
 * campus-scoped equivalent; otherwise render NotFound.
 *
 * BUG-5 hardening: a bare `/worksheet` or `/worksheet/` path (no campus slug,
 * no worksheet ID) is treated as a stale emitter — redirect to the campus home
 * instead of 404ing, so residual console noise degrades into a harmless
 * navigation.
 */
export function LegacyRouteFallback() {
  const location = useLocation();
  const { profile } = useAuth();
  const { campuses } = useCampus();
  const segments = location.pathname.split('/').filter(Boolean);
  const firstSegment = segments[0] || '';
  // Bare worksheet path with no ID (e.g. `/worksheet` or `/worksheet/`) — stale
  // link/emitter. Redirect to the campus home instead of rendering a 404
  // (BUG-5). A path WITH an ID (`/worksheet/999999`) stays a 404 — it signals a
  // genuinely broken URL and is verified behavior in the QA plan (§8).
  if (firstSegment === 'worksheet' && segments.length === 1) {
    const userCampus = campuses.find(c => c.id === profile?.campus_id);
    const targetSlug = userCampus?.slug || DEFAULT_CAMPUS_SLUG;
    return <Navigate to={`/${targetSlug}/`} replace />;
  }
  if (LEGACY_TOP_LEVEL_ROUTES.has(firstSegment)) {
    return <LegacyRedirect />;
  }
  return <NotFound />;
}

