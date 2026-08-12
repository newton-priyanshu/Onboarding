// ─── Campus constants (Phase 9 backward compatibility) ─────────────────
// Kept dependency-free so both CampusContext and campusSlug can import it
// without circular imports.

/**
 * Default campus slug — used when no campus is present in the URL.
 * Configure via VITE_DEFAULT_CAMPUS_SLUG (defaults to 'default').
 */
export const DEFAULT_CAMPUS_SLUG = import.meta.env.VITE_DEFAULT_CAMPUS_SLUG || 'default';

/**
 * Top-level routes that existed before the /:campusSlug/ URL migration.
 * Visiting one of these redirects to /<defaultCampusSlug>/<route>.
 * Department routes (progression/operations) and campus-head are included
 * so flat deep links and the remaining flat-URL builders (GlobalCommandPalette,
 * NotificationBell) still redirect instead of 404ing on the catch-all.
 */
export const LEGACY_TOP_LEVEL_ROUTES = new Set([
  'phase-1', 'phase-2', 'phase-3',
  'week-1', 'week-2', 'week-3', 'week-4',
  'admin', 'buddy', 'onboarding-lead',
  'assessment', 'stakeholders', 'notifications',
  'progression', 'operations', 'campus-head',
]);
