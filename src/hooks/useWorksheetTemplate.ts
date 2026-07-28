/**
 * useWorksheetTemplate — React hook to fetch and cache the onboarding template
 * for the current user's campus.
 *
 * The returned `template` can be passed to template-aware bridge functions in
 * worksheetConfigData.ts (getWorksheetName, getReviewerType, getPhaseWorksheetIds,
 * etc.) to read worksheet metadata from the campus template instead of the
 * hardcoded config, with automatic fallback when no template exists.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getCampusTemplate } from '../api/templates';
import type { OnboardingTemplate } from '../types/supabase';

// ─── Session-level cache ───────────────────────────────
// Shared across all component instances so multiple pages don't
// trigger concurrent network requests for the same campus.
let sessionCache: {
  campusId: string;
  template: OnboardingTemplate | null;
  promise: Promise<OnboardingTemplate | null> | null;
} | null = null;

// ─── Types ──────────────────────────────────────────────

export interface UseWorksheetTemplateResult {
  /** The fetched template, or null if none exists / not yet loaded */
  template: OnboardingTemplate | null;
  /** Whether the template is currently being fetched */
  loading: boolean;
  /** Error message if the fetch failed */
  error: string | null;
}

// ─── Hook ───────────────────────────────────────────────

export function useWorksheetTemplate(): UseWorksheetTemplateResult {
  const { profile } = useAuth();
  const campusId = profile?.campus_id || null;

  const [template, setTemplate] = useState<OnboardingTemplate | null>(
    // Hydrate from cache on initial render so the component doesn't flash
    // loading state when navigating between pages on the same campus
    sessionCache?.campusId === campusId ? sessionCache.template : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // No campus → no template (super admin, unassigned users)
    if (!campusId) {
      setTemplate(null);
      setLoading(false);
      setError(null);
      return;
    }

    // Narrow type: campusId is definitely `string` after the !campusId check
    const campus: string = campusId;

    // Cache hit — skip the fetch
    if (sessionCache?.campusId === campus) {
      setTemplate(sessionCache.template);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;

    async function fetchTemplate() {
      setLoading(true);
      setError(null);

      try {
        // Deduplicate: if another component is already fetching for this campus,
        // reuse its in-flight promise so we don't fire duplicate requests.
        if (sessionCache?.campusId === campus && sessionCache.promise) {
          const result = await sessionCache.promise;
          if (!active) return;
          sessionCache = { campusId: campus, template: result, promise: null };
          setTemplate(result);
          setError(null);
          setLoading(false);
          return;
        }

        // Start new fetch
        const promise = getCampusTemplate(campus);
        sessionCache = { campusId: campus, template: null, promise };

        const result = await promise;
        if (!active) return;

        sessionCache = { campusId: campus, template: result, promise: null };
        setTemplate(result);
        setError(null);
      } catch (err) {
        if (!active) return;
        const msg = err instanceof Error ? err.message : 'Failed to load worksheet template';
        console.error('[useWorksheetTemplate]', msg);
        setError(msg);
        setTemplate(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchTemplate();

    return () => {
      active = false;
    };
  }, [campusId]);

  return { template, loading, error };
}
