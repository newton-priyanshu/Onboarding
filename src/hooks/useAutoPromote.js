import { supabase } from '../supabase';
import { PHASE_WORKSHEETS_MAP } from '../worksheetConfig.jsx';

/**
 * Auto-promote a joinee to lead_instructor (buddy) when ALL worksheets
 * across all 3 phases are fully approved by the manager.
 *
 * @param {string} userId - The joinee's user ID
 * @returns {Promise<{promoted: boolean, message: string}>}
 */
export async function checkAndPromote(userId) {
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

    // Collect all worksheet IDs across all phases
    const allWsIds = [
      ...PHASE_WORKSHEETS_MAP[1],
      ...PHASE_WORKSHEETS_MAP[2],
      ...PHASE_WORKSHEETS_MAP[3],
    ];

    // Check if ALL worksheets are fully approved
    const allApproved = allWsIds.every(wsId => {
      const sub = submissions.find(s => s.worksheet_id === wsId);
      return sub?.review_status === 'approved';
    });

    if (!allApproved) {
      const approved = allWsIds.filter(wsId => {
        const sub = submissions.find(s => s.worksheet_id === wsId);
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

    return { promoted: true, message: 'All 20 worksheets approved! User promoted to Buddy/Mentor (lead_instructor).' };
  } catch (err) {
    console.error('Auto-promote check failed:', err);
    return { promoted: false, message: `Error: ${err.message}` };
  }
}
