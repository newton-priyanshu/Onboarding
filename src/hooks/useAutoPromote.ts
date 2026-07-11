import { supabase } from '../api/supabase';
import { PHASE_WORKSHEETS_MAP } from '../config/worksheetConfig';
import { REVIEW_STATUS } from '../constants/status';

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
      return sub?.review_status === REVIEW_STATUS.APPROVED;
    }).length;
      return { promoted: false, message: `${approved}/${allWsIds.length} worksheets approved — not yet complete` };
    }

    // All approved locally — ask the server to verify eligibility and promote.
    // SECURITY: role changes happen ONLY through this SECURITY DEFINER RPC. It
    // re-validates that every required worksheet is REVIEW_STATUS.APPROVED and then updates
    // user_profiles.role AND auth app_metadata for the CALLING user (auth.uid()).
    // Clients never write role directly (no table .update({role}) and no
    // supabase.auth.updateUser({ data: { role } })).
    const { error: rpcError } = await supabase.rpc('promote_user_if_eligible');

    if (rpcError) throw rpcError;

    // Notifications for the promoted user and for managers are now created
    // server-side by promote_user_if_eligible() itself, so no client-side
    // triggerNotification calls are needed here — doing so would both
    // duplicate the self-notify and silently no-op the manager-broadcast
    // under the tightened notifications INSERT policy.

    return { promoted: true, message: `All ${allWsIds.length} worksheets approved! User promoted to Buddy/Mentor (lead_instructor).` };
  } catch (err) {
    console.error('Auto-promote check failed:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return { promoted: false, message: `Error: ${errorMessage}` };
  }
}
