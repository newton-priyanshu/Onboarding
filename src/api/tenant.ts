/**
 * tenant.ts — Campus/tenant resolution helpers.
 *
 * Provides utilities for extracting the current campus from the URL path,
 * fetching campus metadata, and validating campus access.
 *
 * The application uses path-based tenancy: /campus-slug/route.
 */

import { supabase } from './supabase';
import type { Campus } from '../types/supabase';

// ─── Cache ──────────────────────────────────────────────

const campusCache = new Map<string, { campus: Campus; expiresAt: number }>();
const CACHE_TTL = 60_000; // 1 minute

function getCached(slug: string): Campus | undefined {
  const entry = campusCache.get(slug);
  if (entry && Date.now() < entry.expiresAt) return entry.campus;
  campusCache.delete(slug);
  return undefined;
}

function setCache(slug: string, campus: Campus): void {
  campusCache.set(slug, { campus, expiresAt: Date.now() + CACHE_TTL });
}

// ─── URL Path Parsing ───────────────────────────────────

/**
 * Extract the campus slug from the current URL path.
 * The URL format is: /campus-slug/rest/of/path
 * Returns null if no campus slug is present (e.g. at root / or /super-admin/*).
 */
export function getCurrentCampusFromPath(): string | null {
  // In a browser environment, parse window.location.pathname
  if (typeof window === 'undefined') return null;

  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length === 0) return null;

  const firstSegment: string = parts[0]!;

  // Super admin routes are NOT campus-scoped
  if (firstSegment === 'super-admin') return null;

  // The first path segment is the campus slug (unless it's a known non-campus route)
  const knownRoutes = new Set([
    // Auth / account
    'login', 'signup', 'forgot-password', 'reset-password', 'auth',
    // Dashboards
    'dashboard', 'admin', 'buddy', 'onboarding-lead',
    // Legacy phases
    'phase-1', 'phase-2', 'phase-3',
    // FTP weeks
    'week-1', 'week-2', 'week-3', 'week-4',
    // Other pages
    'assessment', 'stakeholders',
  ]);
  if (knownRoutes.has(firstSegment)) return null;

  return firstSegment;
}

/**
 * Build a campus-scoped URL path.
 * @example withCampusPath('default', '/dashboard') → '/default/dashboard'
 */
export function withCampusPath(campusSlug: string, path: string): string {
  const cleanSlug = campusSlug.replace(/^\/|\/$/g, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `/${cleanSlug}${cleanPath}`;
}

// ─── Campus Resolution ──────────────────────────────────

/**
 * Fetch a campus by its slug from the database.
 * Results are cached in-memory for CACHE_TTL milliseconds.
 */
export async function getCampusBySlug(slug: string): Promise<Campus | null> {
  const cached = getCached(slug);
  if (cached) return cached;

  try {
    const { data, error } = await supabase
      .from('campuses')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      console.error(`[Tenant] Failed to fetch campus by slug "${slug}":`, error?.message || error);
      return null;
    }

    if (data) {
      const campus = data as Campus;
      setCache(slug, campus);
      return campus;
    }

    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Tenant] Failed to fetch campus by slug "${slug}":`, msg);
    return null;
  }
}

/**
 * Check if a campus slug exists and is active.
 */
export async function campusSlugExists(slug: string): Promise<boolean> {
  const campus = await getCampusBySlug(slug);
  return campus !== null && campus.is_active;
}

/**
 * Fetch all active campuses (for campus selection UI).
 *
 * Uses the get_active_campuses() SECURITY DEFINER RPC function so that
 * anonymous users (signup page) can read the campus list.
 * Falls back to direct table query if the RPC is not available.
 */
export async function getActiveCampuses(): Promise<Campus[]> {
  try {
    // Try the RPC first (bypasses RLS for anonymous users)
    const { data, error } = await supabase
      .rpc('get_active_campuses');

    if (!error && data != null) {
      const campuses = Array.isArray(data) ? data : (typeof data === 'string' ? JSON.parse(data) : []);
      return campuses as Campus[];
    }

    // Fallback: direct table query (works for authenticated users)
    console.warn('[Tenant] RPC get_active_campuses failed, falling back to direct query:', error?.message || error);
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('campuses')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (fallbackError) {
      console.error('[Tenant] Failed to fetch active campuses:', fallbackError?.message || fallbackError);
      return [];
    }

    return (fallbackData as Campus[]) || [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Tenant] Failed to fetch active campuses:', msg);
    return [];
  }
}

/**
 * Validate that a user has access to a given campus.
 * Returns true if the user's campus_id matches the target campus, or if the user
 * is a super_admin (who has access to all campuses).
 */
export function validateCampusAccess(
  userCampusId: string | null | undefined,
  targetCampusId: string,
  isSuperAdmin: boolean
): boolean {
  if (isSuperAdmin) return true;
  if (!userCampusId) return false;
  return userCampusId === targetCampusId;
}

// Kept for future Phase 8 route migration.
