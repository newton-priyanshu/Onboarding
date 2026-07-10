import { useCallback, useRef } from 'react';
import { useWorksheet } from './useWorksheet';
import { useToast } from '../components/Toast';
import { supabase } from '../api/supabase';
import { PHASE_WORKSHEETS_MAP } from '../config/worksheetConfig';
import { SUBMISSION_STATUS } from '../constants/status';
import type { User } from '@supabase/supabase-js';
import type { UserProfile } from '../config/worksheetConfig';

// ─── Types ──────────────────────────────────────────────

interface GateControlOpts {
  user: User | null;
  profile: UserProfile | null;
  worksheetId: string;
  phase: string;
  defaultData: Record<string, unknown>;
  requiredFields?: Array<{ key: string; label: string }>;
  /** For buddy/manager mode — loads/saves data for this userId instead of user.id */
  targetUserId?: string;
}

// ─── Helpers ────────────────────────────────────────────

/**
 * Query worksheets in a phase and check if they're ready for gate control.
 * Excludes the gate control's own worksheet ID (can't require itself to be approved).
 * A worksheet is "ready" if its review_status is 'buddy_approved' or 'approved'.
 */
async function checkPhaseWorksheetsComplete(
  userId: string,
  phaseNum: number,
  excludeWorksheetId: string
): Promise<{ complete: boolean; missing: string[] }> {
  const allIds = PHASE_WORKSHEETS_MAP[phaseNum];
  if (!allIds || allIds.length === 0) {
    return { complete: true, missing: [] };
  }
  // Filter out the gate control itself — it can't require itself to be approved
  const worksheetIds = allIds.filter(id => id !== excludeWorksheetId);
  if (worksheetIds.length === 0) {
    return { complete: true, missing: [] };
  }

  const { data, error } = await supabase
    .from('worksheet_submissions')
    .select('worksheet_id, review_status')
    .eq('user_id', userId)
    .in('worksheet_id', worksheetIds);

  if (error) {
    console.error('[GateControl] Failed to check phase worksheets:', error);
    // Fail CLOSED on query error — deny submission if we can't verify prerequisites
    return { complete: false, missing: worksheetIds };
  }

  const completeIds = new Set(
    (data || [])
      .filter((row: { review_status: string }) =>
        row.review_status === 'buddy_approved' || row.review_status === 'approved'
      )
      .map((row: { worksheet_id: string }) => row.worksheet_id)
  );

  const missing = worksheetIds.filter(id => !completeIds.has(id));

  return {
    complete: missing.length === 0,
    missing,
  };
}

// ─── Hook ───────────────────────────────────────────────

export function useGateControl({
  user,
  profile,
  worksheetId,
  phase,
  defaultData,
  requiredFields = [],
  targetUserId,
}: GateControlOpts) {
  const isBuddyMode = !!targetUserId;

  const ws = useWorksheet({
    user,
    worksheetId,
    phase,
    defaultData,
    requiredFields,
    overrideUserId: targetUserId,
  });

  const {
    data, setData, loaded, submitting, setSubmitting,
    submitError, setSubmitError, updateField, flushSave,
    isBuddyApproved, isApproved, isSubmitted,
  } = ws;

  const showToast = useToast().showToast;

  // ── Toggle milestone (shared across all gate controls) ──
  const toggleMilestone = useCallback((index: number) => {
    setData(prev => {
      const arr = [...(prev.milestones as string[])];
      const cycle: string[] = ['Not Met', 'Partial', 'Met'];
      const idx = cycle.indexOf(arr[index]!);
      arr[index] = cycle[(idx + 1) % cycle.length]!;
      return { ...prev, milestones: arr };
    });
  }, [setData]);

  // ── Submission (shared across all gate controls) ───────
  // Track whether the completion check has been done once per submit attempt
  // to prevent duplicate checks from React StrictMode double-invocation
  const submitGuardRef = useRef(false);

  const handleSubmit = useCallback(async () => {
    if (submitGuardRef.current) return;
    submitGuardRef.current = true;

    setSubmitError('');

    // Validate required fields
    const missing = requiredFields.filter(f => !(data[f.key] as string)?.trim());
    if (missing.length > 0) {
      setSubmitError(`Please fill in: ${missing.map(f => f.label).join(', ')}`);
      submitGuardRef.current = false;
      return;
    }

    // Gate completion check: verify phase worksheets are buddy_approved/approved
    // Skip this check in buddy mode (buddy doesn't need to submit worksheets first)
    if (!isBuddyMode && user?.id) {
      const phaseNum = parseInt(phase.replace('phase', ''), 10);
      if (!isNaN(phaseNum)) {
        const { complete, missing: missingWorksheets } = await checkPhaseWorksheetsComplete(
          targetUserId || user.id,
          phaseNum,
          worksheetId
        );
        if (!complete) {
          const missingLabels = missingWorksheets.map(id => {
            if (id.startsWith('p')) return id.replace('p', '').replace('_w', '.').toUpperCase();
            return id.toUpperCase();
          });
          setSubmitError(
            `Cannot submit gate control — the following worksheets need buddy or manager approval first: ${missingLabels.join(', ')}`
          );
          submitGuardRef.current = false;
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const isRevision = data._savedReviewStatus === 'needs_revision';
      const review_status = isBuddyMode
        ? 'buddy_approved'
        : (isRevision ? 'revision_submitted' : '');
      const d = {
        ...data,
        status: SUBMISSION_STATUS.SUBMITTED,
        submittedAt: new Date().toISOString(),
        _savedReviewStatus: review_status,
        _savedReviewedBy: isBuddyMode ? user?.id : null,
        _savedReviewedAt: isBuddyMode ? new Date().toISOString() : null,
        _savedReviewerName: isBuddyMode ? ((profile?.full_name as string) || 'Buddy') : null,
      };
      setData(d);
      await flushSave(d);

      showToast(
        isBuddyMode
          ? 'Worksheet approved! The joinee will be notified.'
          : isRevision
            ? 'Your revisions have been submitted for re-review.'
            : 'Gate submitted for review.',
        'success'
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Submission failed';
      setSubmitError(message);
      showToast('Submission failed. Please try again.', 'error');
    } finally {
      submitGuardRef.current = false;
      setSubmitting(false);
    }
  }, [data, requiredFields, isBuddyMode, user?.id, profile?.full_name, targetUserId, phase, showToast, setData, setSubmitError, setSubmitting, flushSave]);

  return {
    data,
    setData,
    loaded,
    submitting,
    setSubmitting,
    submitError,
    setSubmitError,
    updateField,
    flushSave,
    isBuddyApproved,
    isApproved,
    isSubmitted,
    toggleMilestone,
    handleSubmit,
  };
}
