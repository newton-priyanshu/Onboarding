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
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  reviewer_name?: string | null;
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
  phase: string = 'phase-1',
  /** Skip auto-save until data is fully loaded from Supabase */
  loaded: boolean = true
): { saveStatus: SaveStatus; flushSave: (data: Record<string, unknown>) => Promise<void> } {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const initialSaveDoneRef = useRef(false);
  const dueDateSetRef = useRef(false);
  const errorShownRef = useRef(false);
  const retryCountRef = useRef(0);

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
      // ── Conflict detection ────────────────────────────────
      const savedAt = data._savedUpdatedAt as string | undefined;
      if (savedAt) {
        const { data: current } = await supabase
          .from('worksheet_submissions')
          .select('updated_at')
          .eq('user_id', user.id)
          .eq('worksheet_id', worksheetId)
          .maybeSingle();
        if (current && current.updated_at !== savedAt) {
          console.warn(
            `[AutoSave] Conflict detected for ${worksheetId}: ` +
            `local updated_at=${savedAt}, server updated_at=${current.updated_at}. ` +
            `Saving anyway (last-write-wins).`
          );
        }
      }

      // If the worksheet is already approved, do NOT overwrite review_status
      // If it's buddy_approved, preserve it (awaiting manager)
      const newReviewStatus = data.status === 'submitted'
        ? (data._savedReviewStatus === 'needs_revision' ? 'revision_submitted'
          : data._savedReviewStatus === 'buddy_approved' ? 'buddy_approved'
          : 'pending_review')
        : (data._savedReviewStatus === 'approved' ? 'approved'
          : data._savedReviewStatus === 'buddy_approved' ? 'buddy_approved'
          : '');
      // Calculate due_date ONLY once (tracked via dueDateSetRef).
      let dueDateValue: string | undefined;
      if (!dueDateSetRef.current && newReviewStatus !== 'approved' && newReviewStatus !== 'buddy_approved') {
        dueDateValue = calculateDueDate(worksheetId)?.toISOString().split('T')[0] || undefined;
        dueDateSetRef.current = true;
      }

      // Pass through buddy review fields if present in worksheet_data
      const reviewedBy = data._savedReviewedBy as string | null | undefined;
      const reviewedAt = data._savedReviewedAt as string | null | undefined;
      const reviewerName = data._savedReviewerName as string | null | undefined;

      const upsertPayload: UpsertPayload = {
        user_id: user.id,
        worksheet_id: worksheetId,
        worksheet_data: data,
        phase,
        reviewer_type: reviewerType,
        status: (data.status as string) || 'In Progress',
        review_status: newReviewStatus,
        updated_at: new Date().toISOString(),
        reviewed_by: reviewedBy || null,
        reviewed_at: reviewedAt || null,
        reviewer_name: reviewerName || null,
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
        const phaseNames: Record<string, string> = {
        'phase-1': 'Phase 1', 'phase-2': 'Phase 2', 'phase-3': 'Phase 3',
        'week-1': 'Week 1 — Anchor', 'week-2': 'Week 2 — Co-create',
        'week-3': 'Week 3 — Co-deliver', 'week-4': 'Week 4 — Independence Review',
      };
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
        errorShownRef.current = true;
        retryCountRef.current += 1;
        // Retry up to 2 times on failure (with backoff)
        if (retryCountRef.current <= 2) {
          const backoff = retryCountRef.current * 3000;
          setTimeout(() => {
            if (mountedRef.current) {
              save(data);
            }
          }, backoff);
        }
      }
    }
  }, [user?.id, worksheetId, phase]);

  useEffect(() => {
    if (!user?.id) return;
    // Skip auto-save until data is fully loaded from Supabase
    if (!loaded) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const hasRealData = Object.keys(worksheetData).length > 2 ||
      (worksheetData.employeeName as string)?.trim() ||
      worksheetData._savedReviewStatus;
    if (!hasRealData && !initialSaveDoneRef.current) return;
    initialSaveDoneRef.current = true;
    timerRef.current = setTimeout(() => save(worksheetData), 1500);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [worksheetData, save, user?.id, loaded]);

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
