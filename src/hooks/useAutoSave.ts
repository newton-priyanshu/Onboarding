import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../api/supabase';
import { getReviewerType } from '../config/worksheetConfig';
import { REVIEW_STATUS } from '../constants/status';
import { computeSubmitReviewStatus } from '../utils/reviewStateMachine';
import { notifyError } from '../utils/errorHandling';
import { calculateDueDate } from './useDueDates';
import type { User } from '@supabase/supabase-js';

// ─── Types ──────────────────────────────────────────────

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface SaveOpts {
  /** True only when this save is triggered by an explicit user submit/resubmit
   *  action (via flushSave). Background debounced saves must NEVER transition
   *  review_status — the DB trigger is the sole guard for that state machine,
   *  and resending it on every keystroke risks re-triggering a transition
   *  (e.g. needs_revision -> revision_submitted) before the user has actually
   *  resubmitted. */
  isSubmit?: boolean;
}

interface UpsertPayload {
  user_id: string;
  worksheet_id: string;
  worksheet_data: Record<string, unknown>;
  phase: string;
  reviewer_type: string;
  status: string;
  review_status?: string;
  updated_at: string;
  due_date?: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  reviewer_name?: string | null;
}

interface SavedWorksheetData {
  worksheet_data: Record<string, unknown> | null;
  review_status?: string;
  review_comment?: string | null;
  reviewer_name?: string | null;
  reviewed_by?: string | null;
  review_history?: unknown[];
  reviewed_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

interface UserProfileStartDate {
  start_date?: string | null;
  created_at?: string | null;
}

const MAX_SAVE_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Hook ───────────────────────────────────────────────

export function useAutoSave(
  user: User | null,
  worksheetData: Record<string, unknown>,
  worksheetId: string,
  phase: string = 'phase-1',
  /** Skip auto-save until data is fully loaded from Supabase */
  loaded: boolean = true,
  /** True only after a real, user-driven field edit has occurred. Background
   *  autosave never fires until this is true — this both prevents autosave
   *  from firing on hydration/prefill alone (H29), and naturally disables
   *  autosave in buddy/viewer (overrideUserId) mode unless the buddy actually
   *  edits something, since hydration never marks the data dirty. */
  dirty: boolean = false,
  /** True when this hook instance is saving on behalf of another user
   *  (buddy/manager reviewing a joinee's worksheet). Only in this mode may
   *  reviewer columns (reviewed_by/reviewed_at/reviewer_name) be written —
   *  the worksheet owner's own autosave path must never touch them. */
  isBuddyMode: boolean = false
): { saveStatus: SaveStatus; flushSave: (data: Record<string, unknown>) => Promise<void> } {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const dueDateSetRef = useRef(false);
  const lastSavedJsonRef = useRef<string | null>(null);
  const startDateRef = useRef<Date | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, [worksheetId]);

  // ── Fetch the real onboarding start date for due-date calculation ───────
  // Never derive due dates from a rolling "N days ago" guess (H07/H23) —
  // read the joinee's actual start_date (falling back to created_at).
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: profile, error } = await supabase
          .from('user_profiles')
          .select('start_date, created_at')
          .eq('id', user.id)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          console.error('[AutoSave] Failed to load start date for due-date calc:', error);
          return;
        }
        const p = profile as UserProfileStartDate | null;
        const raw = p?.start_date || p?.created_at || null;
        startDateRef.current = raw ? new Date(raw) : null;
      } catch (err) {
        if (!cancelled) console.error('[AutoSave] Failed to load start date for due-date calc:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const save = useCallback(async (data: Record<string, unknown>, opts: SaveOpts = {}) => {
    if (!user?.id) return;
    const isSubmit = opts.isSubmit === true;
    setSaveStatus('saving');
    const reviewerType = getReviewerType(worksheetId);

    // ── Conflict detection ────────────────────────────────
    const savedAt = data._savedUpdatedAt as string | undefined;
    if (savedAt) {
      try {
        const { data: current, error: conflictError } = await supabase
          .from('worksheet_submissions')
          .select('updated_at')
          .eq('user_id', user.id)
          .eq('worksheet_id', worksheetId)
          .maybeSingle();
        if (conflictError) {
          console.error('[AutoSave] Conflict check failed:', conflictError);
        } else if (current && current.updated_at !== savedAt) {
          console.warn(
            `[AutoSave] Conflict detected for ${worksheetId}: ` +
            `local updated_at=${savedAt}, server updated_at=${current.updated_at}. ` +
            `Saving anyway (last-write-wins).`
          );
        }
      } catch (err) {
        console.error('[AutoSave] Conflict check threw:', err);
      }
    }

    // Only an explicit submit/resubmit may transition review_status. The
    // transition itself is the single shared reviewStateMachine calculation
    // (see src/utils/reviewStateMachine.ts) so this can't drift from the
    // reviewer-side transitions in WorksheetReview.tsx.
    let newReviewStatus: string | undefined;
    if (isSubmit) {
      newReviewStatus = computeSubmitReviewStatus(
        data.status as string,
        data._savedReviewStatus as string
      );
    }

    // Calculate due_date ONLY once (tracked via dueDateSetRef), based on the
    // joinee's real onboarding start date — never overwrite a persisted value.
    let dueDateValue: string | undefined;
    const currentReviewStatus = data._savedReviewStatus as string | undefined;
    if (
      !dueDateSetRef.current &&
      currentReviewStatus !== REVIEW_STATUS.APPROVED &&
      currentReviewStatus !== REVIEW_STATUS.BUDDY_APPROVED
    ) {
      dueDateValue = calculateDueDate(worksheetId, startDateRef.current)?.toISOString().split('T')[0] || undefined;
      dueDateSetRef.current = true;
    }

    const upsertPayload: UpsertPayload = {
      user_id: user.id,
      worksheet_id: worksheetId,
      worksheet_data: data,
      phase,
      reviewer_type: reviewerType,
      status: (data.status as string) || 'In Progress',
      updated_at: new Date().toISOString(),
    };
    // Only send review_status on an explicit submit/resubmit (see above).
    if (newReviewStatus !== undefined) upsertPayload.review_status = newReviewStatus;
    // Only include due_date on initial save — never overwrite persisted value
    if (dueDateValue !== undefined) upsertPayload.due_date = dueDateValue;
    // Reviewer columns: only the buddy/manager save path may write these —
    // the worksheet owner's own autosave path must never touch them (H15).
    if (isBuddyMode) {
      upsertPayload.reviewed_by = (data._savedReviewedBy as string | null | undefined) || null;
      upsertPayload.reviewed_at = (data._savedReviewedAt as string | null | undefined) || null;
      upsertPayload.reviewer_name = (data._savedReviewerName as string | null | undefined) || null;
    }

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= MAX_SAVE_ATTEMPTS; attempt++) {
      let error: unknown = null;
      try {
        const res = await supabase
          .from('worksheet_submissions')
          .upsert(upsertPayload, { onConflict: 'user_id,worksheet_id' });
        error = res.error;
      } catch (thrown) {
        error = thrown;
      }

      if (!error) {
        lastSavedJsonRef.current = JSON.stringify(data);
        if (mountedRef.current) {
          setSaveStatus('saved');
          setTimeout(() => {
            if (mountedRef.current) setSaveStatus((p: SaveStatus) => p === 'saved' ? 'idle' : p);
          }, 2000);
        }
        return;
      }

      lastError = error;
      notifyError('Auto-save failed:', error);
      if (!mountedRef.current) break;
      if (attempt < MAX_SAVE_ATTEMPTS) {
        await sleep(attempt * RETRY_BACKOFF_MS);
        if (!mountedRef.current) break;
      }
    }

    // Exhausted retries (or unmounted mid-retry) — surface a persistent error
    // state and rethrow so callers (flushSave -> handleSubmit) see the failure
    // and do NOT report success on a failed write (H06/H17/H32).
    if (mountedRef.current) setSaveStatus('error');
    throw lastError;
  }, [user?.id, worksheetId, phase, isBuddyMode]);

  useEffect(() => {
    if (!user?.id) return;
    // Skip auto-save until data is fully loaded from Supabase
    if (!loaded) return;
    // Skip auto-save until a real, user-driven edit has happened (H29).
    if (!dirty) return;
    // Skip redundant re-saves of data that's already persisted — e.g. right
    // after an explicit submit already flushed this exact payload (H30).
    const dataJson = JSON.stringify(worksheetData);
    if (dataJson === lastSavedJsonRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      // Background saves are fire-and-forget from the caller's perspective —
      // save() already sets a persistent saveStatus='error' on failure, so we
      // just swallow the rejection here to avoid an unhandled promise error.
      save(worksheetData, { isSubmit: false }).catch(() => { /* saveStatus already reflects the error */ });
    }, 1500);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [worksheetData, save, user?.id, loaded, dirty]);

  const flushSave = useCallback(async (data: Record<string, unknown>): Promise<void> => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // flushSave is only ever invoked from an explicit submit/resubmit action
    // (handleSubmit). It awaits the full retry loop and rethrows on failure
    // so the caller never reports success on a failed write.
    await save(data, { isSubmit: true });
  }, [save]);

  return { saveStatus, flushSave };
}

// ─── Standalone Helpers ────────────────────────────────

export async function loadWorksheetData(
  userId: string | null,
  worksheetId: string | null
): Promise<{ data: SavedWorksheetData | null; error: unknown }> {
  if (!userId || !worksheetId) return { data: null, error: null };
  try {
    const { data, error } = await supabase
      .from('worksheet_submissions')
      .select('*')
      .eq('user_id', userId)
      .eq('worksheet_id', worksheetId)
      .maybeSingle();
    if (error) return { data: null, error };
    return { data: data as SavedWorksheetData | null, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function getOAuthName(): Promise<string> {
  // Check localStorage cache first for instant return
  try {
    const cached = localStorage.getItem('onboarding_employee_name');
    if (cached) return cached;
  } catch { /* localStorage unavailable */ }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    const name = (user?.user_metadata?.full_name as string) ||
      (user?.user_metadata?.name as string) ||
      (user?.email?.split('@')[0]) || '';
    // Cache the result for subsequent loads
    if (name) {
      try { localStorage.setItem('onboarding_employee_name', name); } catch { /* ignore */ }
    }
    return name;
  } catch {
    return '';
  }
}
