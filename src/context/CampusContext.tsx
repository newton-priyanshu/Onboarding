/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { getCurrentCampusFromPath, getCampusBySlug, getActiveCampuses } from '../api/tenant';
import type { Campus } from '../types/supabase';

// ─── Types ──────────────────────────────────────────────

interface CampusContextValue {
  /** The currently active campus object (null if not yet resolved) */
  currentCampus: Campus | null;
  /** The campus slug extracted from the URL path */
  campusSlug: string | null;
  /** All campuses the current user has access to (for campus switcher) */
  campuses: Campus[];
  /** Whether the campus context is still loading */
  isLoading: boolean;
  /** Error message if campus resolution failed */
  error: string | null;
  /** Switch to a different campus (updates URL and context) */
  switchCampus: (slug: string) => void;
}

// ─── Context ────────────────────────────────────────────

const CampusContext = createContext<CampusContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────

export function CampusProvider({ children }: { children: ReactNode }) {
  const [currentCampus, setCurrentCampus] = useState<Campus | null>(null);
  const [campusSlug, setCampusSlug] = useState<string | null>(null);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const location = useLocation();

  // ── Resolve campus on mount and on URL path change ─────────
  useEffect(() => {
    let cancelled = false;

    async function resolveCampus() {
      setIsLoading(true);
      setError(null);

      // 1. Try to extract campus slug from URL path
      let slug = getCurrentCampusFromPath();

      // 2. If no slug in URL, try localStorage cache
      if (!slug) {
        try {
          const cached = localStorage.getItem('campus_slug');
          if (cached) slug = cached;
        } catch { /* localStorage unavailable */ }
      }

      // 3. Default to 'default' if still nothing
      if (!slug) {
        slug = 'default';
      }

      // Store slug in state
      setCampusSlug(slug);

      // Save to localStorage for persistence
      try {
        localStorage.setItem('campus_slug', slug);
      } catch { /* localStorage unavailable */ }

      // 4. Fetch campus data from DB
      const campus = await getCampusBySlug(slug);
      if (cancelled) return;

      if (campus) {
        setCurrentCampus(campus);
        setError(null);
      } else {
        // Campus not found — set error but keep the slug
        // This can happen if the user is not authenticated (RLS blocks the query)
        // or if the campus doesn't exist
        setCurrentCampus(null);
        setError(`Campus "${slug}" could not be resolved. It may not exist or you may not have access.`);
      }

      // 5. Fetch all active campuses (for campus switcher)
      const allCampuses = await getActiveCampuses();
      if (!cancelled) {
        setCampuses(allCampuses);
      }

      if (!cancelled) setIsLoading(false);
    }

    resolveCampus();

    return () => { cancelled = true; };
  }, [location.pathname]);

  // ── Switch campus ─────────────────────────────────────────
  const switchCampus = useCallback((slug: string) => {
    // Update localStorage
    try {
      localStorage.setItem('campus_slug', slug);
    } catch { /* localStorage unavailable */ }

    // Update state immediately
    setCampusSlug(slug);
    setIsLoading(true);
    setError(null);

    // Fetch new campus data
    getCampusBySlug(slug).then((campus) => {
      if (campus) {
        setCurrentCampus(campus);
        setError(null);
      } else {
        setCurrentCampus(null);
        setError(`Campus "${slug}" could not be resolved.`);
      }
      setIsLoading(false);
    });
  }, []);

  // ── Memoized context value ────────────────────────────────
  const value = useMemo<CampusContextValue>(() => ({
    currentCampus,
    campusSlug,
    campuses,
    isLoading,
    error,
    switchCampus,
  }), [currentCampus, campusSlug, campuses, isLoading, error, switchCampus]);

  return (
    <CampusContext.Provider value={value}>
      {children}
    </CampusContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────

export function useCampus(): CampusContextValue {
  const context = useContext(CampusContext);
  if (!context) {
    throw new Error('useCampus must be used within a CampusProvider');
  }
  return context;
}
