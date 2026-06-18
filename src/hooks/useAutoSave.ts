import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../api/supabase';
import { getReviewerType } from '../config/worksheetConfig';
import { notifyError } from '../utils/errorHandling';
import { triggerNotification, getReviewerUserIds, getAssignedReviewerIds } from './useNotifications';
import { calculateDueDate } from './useDueDates';
import type { User } from '@supabase/supabase-js';

// ─── Types ──────────────────────────────────────────────

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UpsertPayload {
  user_id: string;
  worksheet_id: string;
  worksheet_data: Record<string, unknown>;
  phase: string;
  reviewer_type: string;
  status: string;
  review_status: string;
  updated_at: string;
  due_date?: string;
}

interface SavedWorksheetData {
  worksheet_data: Record<string, unknown> | null;
  review_status?: string;
  review_comment?: string | null;
  reviewer_name?: string | null;
  review_history?: unknown[];
  reviewed_at?: string | null;
  [key: string]: unknown;
}

// ─── Hook ───────────────────────────────────────────────

export function useAutoSave(
  user: User | null,
  worksheetData: Record<string, unknown>,
  worksheetId: string,
  phase: string = 'phase-1'
): { saveStatus: SaveStatus; flushSave: (data: Record<string, unknown>) => Promise<void> } {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const initialSaveDoneRef = useRef(false);
  const dueDateSetRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    initialSaveDoneRef.current = false;
    return () => { mountedRef.current = false; };
  }, [worksheetId]);

  const save = useCallback(async (data: Record<string, unknown>) => {
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
      let dueDateValue: string | undefined;
      if (!dueDateSetRef.current && newReviewStatus !== 'approved' && newReviewStatus !== 'buddy_approved') {
        dueDateValue = calculateDueDate(worksheetId)?.toISOString().split('T')[0] || undefined;
        dueDateSetRef.current = true;
      }

      const upsertPayload: UpsertPayload = {
        user_id: user.id,
        worksheet_id: worksheetId,
        worksheet_data: data,
        phase,
        reviewer_type: reviewerType,
        status: (data.status as string) || 'In Progress',
        review_status: newReviewStatus,
        updated_at: new Date().toISOString(),
      };
      // Only include due_date on initial save — never overwrite persisted value
      if (dueDateValue !== undefined) upsertPayload.due_date = dueDateValue;

      const { error } = await supabase.from('worksheet_submissions').upsert(upsertPayload, { onConflict: 'user_id,worksheet_id' });
      if (error) throw error;

      // Trigger notification on first-time submission only
      const isNewSubmission = data.status === 'submitted'
        && data._savedReviewStatus !== 'approved'
        && data._savedReviewStatus !== 'buddy_approved'
        && data._savedReviewStatus !== 'pending_review'
        && data._savedReviewStatus !== 'revision_submitted';
      if (isNewSubmission) {
        // Notify the ASSIGNED reviewer, not all users with that role
        let reviewerUserIds: string[] = [];
        if (reviewerType === 'buddy' || reviewerType === 'manager') {
          reviewerUserIds = await getAssignedReviewerIds(user.id, reviewerType);
        }
        // Fallback to all role users for non-assigned types (onboarding_lead)
        if (reviewerUserIds.length === 0) {
          reviewerUserIds = await getReviewerUserIds(reviewerType);
        }
        const phaseNames: Record<string, string> = { 'phase-1': 'Phase 1', 'phase-2': 'Phase 2', 'phase-3': 'Phase 3' };
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
          if (mountedRef.current) setSaveStatus((p: SaveStatus) => p === 'saved' ? 'idle' : p);
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
    const hasRealData = Object.keys(worksheetData).length > 2 ||
      (worksheetData.employeeName as string)?.trim() ||
      worksheetData._savedReviewStatus;
    if (!hasRealData && !initialSaveDoneRef.current) return;
    initialSaveDoneRef.current = true;
    timerRef.current = setTimeout(() => save(worksheetData), 1500);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [worksheetData, save, user?.id]);

  const flushSave = useCallback(async (data: Record<string, unknown>) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    initialSaveDoneRef.current = true;
    await save(data);
  }, [save]);

  return { saveStatus, flushSave };
}

// ─── Standalone Helpers ────────────────────────────────

export async function loadWorksheetData(
  userId: string | null,
  worksheetId: string | null
): Promise<SavedWorksheetData | null> {
  if (!userId || !worksheetId) return null;
  const { data } = await supabase
    .from('worksheet_submissions')
    .select('*')
    .eq('user_id', userId)
    .eq('worksheet_id', worksheetId)
    .maybeSingle();
  return data as SavedWorksheetData | null;
}

export async function getOAuthName(): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return (user?.user_metadata?.full_name as string) ||
      (user?.user_metadata?.name as string) ||
      (user?.email?.split('@')[0]) || '';
  } catch {
    return '';
  }
}
