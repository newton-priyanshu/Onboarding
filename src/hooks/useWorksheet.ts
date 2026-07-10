import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAutoSave, loadWorksheetData, getOAuthName } from './useAutoSave';
import { useToast } from '../components/Toast';
import { supabase } from '../api/supabase';
import { SUBMISSION_STATUS, REVIEW_STATUS } from '../constants/status';
import type { User } from '@supabase/supabase-js';

// ─── Types ──────────────────────────────────────────────

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface RequiredField {
  key: string;
  label: string;
}

interface UseWorksheetOpts {
  user: User | null;
  worksheetId: string;
  phase: string;
  defaultData?: Record<string, unknown>;
  requiredFields?: RequiredField[];
  redirectPath?: string;
  approvedMsg?: string;
  submittedMsg?: string;
  /** For buddy/manager mode — loads/saves data for this userId instead of user.id */
  overrideUserId?: string;
}

interface ReviewData {
  _savedReviewStatus: string;
  _savedReviewComment: string;
  _savedReviewerName: string;
  _savedReviewHistory: unknown[];
  _savedReviewedAt: string;
  dateSubmitted: string;
}

interface UseWorksheetResult {
  data: Record<string, unknown>;
  setData: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  loaded: boolean;
  /** Non-empty when the initial load from Supabase failed. While set, the hook
   *  deliberately never reaches loaded=true and autosave stays blocked, so a
   *  transient read failure can never result in defaults being upserted over
   *  a real saved row. Callers should surface this with a retry affordance
   *  (see retryLoad). */
  loadError: string;
  /** Re-attempts the initial load after a loadError. */
  retryLoad: () => void;
  submitting: boolean;
  submitError: string;
  saveStatus: SaveStatus;
  updateField: (field: string, value: unknown) => void;
  updateArrayItem: (field: string, index: number, subField: string) => (value: unknown) => void;
  updateArrayItemEvent: (field: string, index: number, subField: string) => (e: unknown) => void;
  handleSubmit: () => Promise<void>;
  setSubmitError: React.Dispatch<React.SetStateAction<string>>;
  setSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
  isApproved: boolean;
  isBuddyApproved: boolean;
  isSubmitted: boolean;
  reviewData: ReviewData;
  flushSave: (data: Record<string, unknown>) => Promise<void>;
  /** Marks the in-memory data as "clean" (no pending unsaved edits). Called
   *  after a successful explicit submit so the background autosave effect
   *  doesn't immediately re-fire and re-save/re-notify for the same payload
   *  (H30). */
  markClean: () => void;
}

// ─── Helper ─────────────────────────────────────────────

function extractEventValue(e: unknown): unknown {
  if (e && typeof e === 'object' && 'target' in e) {
    const target = (e as { target?: { value?: unknown } }).target;
    if (target && 'value' in target) return target.value;
  }
  return e;
}

// ─── Hook ───────────────────────────────────────────────

/**
 * useWorksheet — Eliminates ~60 lines of boilerplate per worksheet.
 *
 * Handles:
 *  - Data loading from Supabase with saved-data hydration
 *  - OAuth name prefill for new worksheets
 *  - Auto-save integration
 *  - Form submission with validation
 *  - View-state flags (approved / submitted / needs_revision)
 */
export function useWorksheet({
  user,
  worksheetId,
  phase,
  defaultData = {},
  requiredFields = [],
  redirectPath: _redirectPath = '/',
  approvedMsg: _approvedMsg = 'Your worksheet has been reviewed and approved.',
  submittedMsg: _submittedMsg = 'Your worksheet has been submitted for review.',
  overrideUserId,
}: UseWorksheetOpts): UseWorksheetResult {
  const [data, setDataRaw] = useState<Record<string, unknown>>(() => ({
    ...defaultData,
    _savedReviewStatus: '',
    _savedReviewComment: '',
    _savedReviewerName: '',
    _savedReviewHistory: [],
    _savedReviewedAt: '',
    _savedReviewedBy: '',
  }));
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  // True once a real, user-driven edit has occurred. Autosave must never fire
  // before this is true (H29) — hydration/prefill never sets it.
  const [dirty, setDirty] = useState(false);

  // Wrapped setter: any consumer-driven call marks the data dirty. Internal
  // hydration/prefill code below uses the raw `setDataRaw` instead, so it
  // never marks dirty.
  const setData = useCallback<React.Dispatch<React.SetStateAction<Record<string, unknown>>>>((update) => {
    setDirty(true);
    setDataRaw(update);
  }, []);

  const markClean = useCallback(() => setDirty(false), []);

  // In buddy mode (overrideUserId), use that id for autoSave instead of the current user's id
  const isBuddyMode = !!overrideUserId;
  const autoSaveUser = overrideUserId && user
    ? { ...user, id: overrideUserId, email: user.email } as User
    : overrideUserId && !user
      ? { id: overrideUserId, email: '', app_metadata: {}, user_metadata: {}, aud: '', created_at: '' } as User
      : user;

  const { saveStatus, flushSave } = useAutoSave(autoSaveUser, data, worksheetId, phase, loaded, dirty, isBuddyMode);

  // ── Load saved data from Supabase ───────────────────────────────
  const effectiveUserId = overrideUserId || user?.id;
  useEffect(() => {
    if (!effectiveUserId) return;
    let cancelled = false;
    setLoadError('');
    (async () => {
      const { data: saved, error } = await loadWorksheetData(effectiveUserId, worksheetId);
      if (cancelled) return;
      if (error) {
        console.error(`Load error [${worksheetId}]:`, error);
        // DO NOT setLoaded(true) here — that would unblock autosave and could
        // let a background save upsert defaults over a real saved row (C06/C09/C10).
        setLoadError('Unable to load your saved worksheet. Please check your connection and retry.');
        return;
      }
      if (saved?.worksheet_data) {
        setDataRaw(prev => ({
          ...prev,
          ...saved.worksheet_data,
          _savedReviewStatus: saved.review_status || '',
          _savedReviewComment: saved.review_comment || '',
          _savedReviewerName: saved.reviewer_name || '',
          _savedReviewHistory: saved.review_history || [],
          _savedReviewedAt: saved.reviewed_at || '',
          _savedReviewedBy: saved.reviewed_by || '',
          _savedUpdatedAt: saved.updated_at || '',
        }));
      } else {
        // In buddy mode, prefill with target user's profile name
        if (overrideUserId) {
          const { data: joinee, error: joineeError } = await supabase
            .from('user_profiles')
            .select('full_name')
            .eq('id', overrideUserId)
            .single();
          if (cancelled) return;
          if (joineeError) {
            console.error(`Failed to load joinee profile [${overrideUserId}]:`, joineeError);
          } else if (joinee?.full_name) {
            setDataRaw(prev => ({ ...prev, employeeName: joinee.full_name }));
          }
        } else {
          const name = await getOAuthName();
          if (!cancelled && name) setDataRaw(prev => ({ ...prev, employeeName: name }));
        }
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [effectiveUserId, worksheetId, overrideUserId, reloadKey]);

  const retryLoad = useCallback(() => {
    setLoadError('');
    setLoaded(false);
    setReloadKey(k => k + 1);
  }, []);

  // ── Helpers ─────────────────────────────────────────────────────
  const updateField = useCallback((field: string, value: unknown) => {
    setData(prev => ({ ...prev, [field]: value }));
  }, [setData]);

  const updateArrayItem = useCallback(
    (field: string, index: number, subField: string) => (value: unknown) => {
      setData(prev => {
        const arr = ((prev[field] as unknown[]) || []).slice();
        arr[index] = { ...((arr[index] as Record<string, unknown>) || {}), [subField]: value };
        return { ...prev, [field]: arr };
      });
    },
    [setData]
  );

  const updateArrayItemEvent = useCallback(
    (field: string, index: number, subField: string) => (e: unknown) => {
      const value = extractEventValue(e);
      setData(prev => {
        const arr = ((prev[field] as unknown[]) || []).slice();
        arr[index] = { ...((arr[index] as Record<string, unknown>) || {}), [subField]: value };
        return { ...prev, [field]: arr };
      });
    },
    [setData]
  );

  const validate = useCallback(() => {
    const missing = requiredFields.filter(f => !(data[f.key] as string)?.trim());
    if (missing.length > 0) {
      setSubmitError(`Please fill in: ${missing.map(f => f.label).join(', ')}`);
      return false;
    }
    return true;
  }, [data, requiredFields]);

  const showToast = useToast().showToast;

  // ── Submit ──────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    setSubmitError('');
    if (loadError) {
      setSubmitError('Unable to load your worksheet data. Please retry loading before submitting.');
      return;
    }
    if (!validate()) return;
    setSubmitting(true);
    try {
      const wasRevision = data._savedReviewStatus === REVIEW_STATUS.NEEDS_REVISION;
      const submitData = {
        ...data,
        status: SUBMISSION_STATUS.SUBMITTED,
        dateSubmitted: new Date().toLocaleDateString('en-IN'),
      };
      setData(submitData);
      await flushSave(submitData);
      // Fully in sync with the server now — clear dirty so the background
      // autosave effect doesn't immediately re-fire for the same payload (H30).
      markClean();
      showToast(
        wasRevision
          ? 'Your revised worksheet has been submitted for re-review.'
          : 'Your worksheet has been submitted for review.',
        'success'
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Submission failed';
      setSubmitError(message);
      showToast('Submission failed. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  }, [data, validate, flushSave, showToast, loadError, setData, markClean]);

  // ── Derived view states ─────────────────────────────────────────
  const isApproved = loaded && data._savedReviewStatus === 'approved';
  const isBuddyApproved = loaded && data._savedReviewStatus === 'buddy_approved';
  const isSubmitted = (
    data.status === SUBMISSION_STATUS.SUBMITTED
    && loaded
    && data._savedReviewStatus !== REVIEW_STATUS.NEEDS_REVISION
    && data._savedReviewStatus !== REVIEW_STATUS.REVISION_SUBMITTED
    && data._savedReviewStatus !== REVIEW_STATUS.BUDDY_APPROVED
    && data._savedReviewStatus !== REVIEW_STATUS.APPROVED
  );

  const reviewData = useMemo<ReviewData>(() => ({
    _savedReviewStatus: data._savedReviewStatus as string,
    _savedReviewComment: data._savedReviewComment as string,
    _savedReviewerName: data._savedReviewerName as string,
    _savedReviewHistory: (data._savedReviewHistory as unknown[]) || [],
    _savedReviewedAt: data._savedReviewedAt as string,
    dateSubmitted: data.dateSubmitted as string,
  }), [
    data._savedReviewStatus,
    data._savedReviewComment,
    data._savedReviewerName,
    data._savedReviewHistory,
    data._savedReviewedAt,
    data.dateSubmitted,
  ]);

  return {
    data,
    setData,
    loaded,
    loadError,
    retryLoad,
    submitting,
    submitError,
    saveStatus,
    updateField,
    updateArrayItem,
    updateArrayItemEvent,
    handleSubmit,
    setSubmitError,
    setSubmitting,
    isApproved,
    isBuddyApproved,
    isSubmitted,
    reviewData,
    flushSave,
    markClean,
  };
}
