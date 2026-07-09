import { supabase } from '../api/supabase';
import { PHASE_WORKSHEETS_MAP } from '../config/worksheetConfig';
import { triggerNotification, getReviewerUserIds } from './useNotifications';

// ─── Types ──────────────────────────────────────────────

interface PromoteResult {
  promoted: boolean;
  message: string;
}

interface SubmissionRow {
  worksheet_id: string;
  review_status: string;
}

// ─── Hook ───────────────────────────────────────────────

/**
 * Auto-promote a joinee to lead_instructor (buddy) when ALL worksheets
 * across all 3 phases are fully approved by the manager.
 */
export async function checkAndPromote(userId: string | null): Promise<PromoteResult> {
  if (!userId) return { promoted: false, message: 'No user ID provided' };

  try {
    // Get all submissions for this user
    const { data: submissions, error } = await supabase
      .from('worksheet_submissions')
      .select('worksheet_id, review_status')
      .eq('user_id', userId);

    if (error) throw error;
    if (!submissions || submissions.length === 0) {
      return { promoted: false, message: 'No submissions found' };
    }

    const typedSubmissions = submissions as SubmissionRow[];

    // Collect all worksheet IDs across all phases
    const p1 = PHASE_WORKSHEETS_MAP[1] || [];
    const p2 = PHASE_WORKSHEETS_MAP[2] || [];
    const p3 = PHASE_WORKSHEETS_MAP[3] || [];
    const allWsIds: string[] = [...p1, ...p2, ...p3];

    // Check if ALL worksheets are fully approved
    const allApproved = allWsIds.every(wsId => {
      const sub = typedSubmissions.find(s => s.worksheet_id === wsId);
      return sub?.review_status === 'approved';
    });

    if (!allApproved) {
      const approved = allWsIds.filter(wsId => {
        const sub = typedSubmissions.find(s => s.worksheet_id === wsId);
        return sub?.review_status === 'approved';
      }).length;
      return { promoted: false, message: `${approved}/${allWsIds.length} worksheets approved — not yet complete` };
    }

    // All approved! Promote the user
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ role: 'lead_instructor' })
      .eq('id', userId);

    if (updateError) throw updateError;

    // Also update the user metadata in auth
    const { error: metaError } = await supabase.auth.updateUser({
      data: { role: 'lead_instructor' },
    });

    if (metaError) {
      console.warn('Could not update auth metadata role:', metaError);
    }

    // Notify the promoted user
    await triggerNotification({
      userId,
      fromUserId: null as unknown as string,
      worksheetId: '',
      type: 'approved',
      message: `🎉 Congratulations! All ${allWsIds.length} worksheets across all 3 phases have been approved. You have been promoted to Buddy/Mentor (lead_instructor)! You can now review other instructors' worksheets.`,
    });

    // Notify all managers about the promotion
    const managerIds = await getReviewerUserIds('manager');
    for (const mgrId of managerIds) {
      await triggerNotification({
        userId: mgrId,
        fromUserId: userId,
        worksheetId: '',
        type: 'approved',
        message: 'A joinee has completed all 3 phases and been promoted to lead_instructor. They can now serve as a buddy/mentor.',
      });
    }

    return { promoted: true, message: `All ${allWsIds.length} worksheets approved! User promoted to Buddy/Mentor (lead_instructor).` };
  } catch (err) {
    console.error('Auto-promote check failed:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return { promoted: false, message: `Error: ${errorMessage}` };
  }
}
