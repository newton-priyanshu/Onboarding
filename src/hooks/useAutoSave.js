import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../api/supabase';
import { getReviewerType } from '../config/worksheetConfig.jsx';
import { notifyError } from '../utils/errorHandling';
import { triggerNotification, getReviewerUserIds, getAssignedReviewerIds } from './useNotifications';
import { calculateDueDate } from './useDueDates';

export function useAutoSave(user, worksheetData, worksheetId, phase = 'phase-1') {
  const [saveStatus, setSaveStatus] = useState('idle');
  const timerRef = useRef(null);
  const mountedRef = useRef(true);
  const initialSaveDoneRef = useRef(false);
  const dueDateSetRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    initialSaveDoneRef.current = false;
    return () => { mountedRef.current = false; };
  }, [worksheetId]);

  const save = useCallback(async (data) => {
    if (!user?.id) return;
    setSaveStatus('saving');
    const reviewerType = getReviewerType(worksheetId);
    try {
      // If the worksheet is already approved, do NOT overwrite review_status
      // If it's buddy_approved, preserve it (awaiting manager)
      const newReviewStatus = data.status === 'submitted'
        ? (data._savedReviewStatus === 'needs_revision' ? 'revision_submitted' : 'pending_review')
        : (data._savedReviewStatus === 'approved' ? 'approved'
          : data._savedReviewStatus === 'buddy_approved' ? 'buddy_approved'
          : '');
      // Calculate due_date ONLY once (tracked via dueDateSetRef).
      // This prevents date drift — calculateDueDate uses Date.now()-30 as a fallback
      // which shifts daily, so we must persist the first calculation and never overwrite.
      let dueDateValue;
      if (!dueDateSetRef.current && newReviewStatus !== 'approved' && newReviewStatus !== 'buddy_approved') {
        dueDateValue = calculateDueDate(worksheetId)?.toISOString().split('T')[0] || null;
        dueDateSetRef.current = true;
      }

      const upsertPayload = {
        user_id: user.id,
        worksheet_id: worksheetId,
        worksheet_data: data,
        phase,
        reviewer_type: reviewerType,
        status: data.status || 'In Progress',
        review_status: newReviewStatus,
        updated_at: new Date().toISOString(),
      };
      // Only include due_date on initial save — never overwrite persisted value
      if (dueDateValue !== undefined) upsertPayload.due_date = dueDateValue;

      const { error } = await supabase.from('worksheet_submissions').upsert(upsertPayload, { onConflict: 'user_id,worksheet_id' });
      if (error) throw error;

      // Trigger notification on first-time submission only
      // Guard: Only send notification when transitioning FROM a non-submitted state
      // (not on page reload when data is re-hydrated from Supabase)
      const isNewSubmission = data.status === 'submitted'
        && data._savedReviewStatus !== 'approved'
        && data._savedReviewStatus !== 'buddy_approved'
        && data._savedReviewStatus !== 'pending_review'
        && data._savedReviewStatus !== 'revision_submitted';
      if (isNewSubmission) {
        // Notify the ASSIGNED reviewer, not all users with that role
        let reviewerUserIds = [];
        if (reviewerType === 'buddy' || reviewerType === 'manager') {
          reviewerUserIds = await getAssignedReviewerIds(user.id, reviewerType);
        }
        // Fallback to all role users for non-assigned types (onboarding_lead)
        if (reviewerUserIds.length === 0) {
          reviewerUserIds = await getReviewerUserIds(reviewerType);
        }
        const phaseNames = { 'phase-1': 'Phase 1', 'phase-2': 'Phase 2', 'phase-3': 'Phase 3' };
        const phaseName = phaseNames[phase] || phase;
        for (const reviewerId of reviewerUserIds) {
          await triggerNotification({
            userId: reviewerId,
            fromUserId: user.id,
            worksheetId,
            type: data._savedReviewStatus === 'needs_revision' ? 'revision_submitted' : 'submitted',
            message: `A worksheet (${worksheetId}) was submitted in ${phaseName} and is ready for review.`,
          });
        }
      }

      if (mountedRef.current) {
        setSaveStatus('saved');
        setTimeout(() => {
          if (mountedRef.current) setSaveStatus((p) => p === 'saved' ? 'idle' : p);
        }, 2000);
      }
    } catch (err) {
      notifyError('Auto-save failed:', err);
      if (mountedRef.current) {
        setSaveStatus('error');
        // Retry once after 5 seconds on failure
        setTimeout(() => {
          if (mountedRef.current && !initialSaveDoneRef.current) {
            save(data);
          }
        }, 5000);
      }
    }
  }, [user?.id, worksheetId, phase]);

  useEffect(() => {
    if (!user?.id) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    // BUG-02 FIX: Skip auto-save if worksheetData contains only initial/empty values
    // (before loadWorksheetData completes). The loaded check ensures we don't
    // overwrite saved data with empty initial state.
    const hasRealData = Object.keys(worksheetData).length > 2 ||
      worksheetData.employeeName?.trim() ||
      worksheetData._savedReviewStatus;
    if (!hasRealData && !initialSaveDoneRef.current) return;
    initialSaveDoneRef.current = true;
    timerRef.current = setTimeout(() => save(worksheetData), 1500);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [worksheetData, save, user?.id]);

  const flushSave = useCallback(async (data) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    initialSaveDoneRef.current = true;
    await save(data);
  }, [save]);

  return { saveStatus, flushSave };
}

export async function loadWorksheetData(userId, worksheetId) {
  if (!userId || !worksheetId) return null;
  const { data } = await supabase
    .from('worksheet_submissions')
    .select('*')
    .eq('user_id', userId)
    .eq('worksheet_id', worksheetId)
    .maybeSingle();
  return data;
}

export async function getOAuthName() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      user?.email?.split('@')[0] || '';
  } catch {
    return '';
  }
}

