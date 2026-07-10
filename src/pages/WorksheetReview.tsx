import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../api/supabase';
import { CheckCircle2, XCircle, ArrowLeft, Clock, AlertCircle, User, Send, RefreshCw, Eye, History, ThumbsUp, ThumbsDown, Shield } from 'lucide-react';
import { WORKSHEET_INFO, type WorksheetSubmission, type UserProfile } from '../config/worksheetConfig';
import { SUBMISSION_STATUS, REVIEW_STATUS } from '../constants/status';
import ReviewContent from '../components/ReviewContent';
import { triggerNotification, getReviewerUserIds, getAssignedReviewerIds } from '../hooks/useNotifications';
import { t } from '../config/theme';

interface ReviewParams {
  userId: string;
  worksheetId: string;
  [key: string]: string | undefined;
}

interface ReviewHistoryEntry {
  action: string;
  reviewer_name: string;
  reviewer_id: string;
  comment: string | null;
  timestamp: string;
}

export default function WorksheetReview() {
  const params = useParams<ReviewParams>();
  const userId = params.userId;
  const worksheetId = params.worksheetId;
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [submission, setSubmission] = useState<WorksheetSubmission | null>(null);
  const [instructor, setInstructor] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');

  const wsInfo = WORKSHEET_INFO[worksheetId || ''] || { title: worksheetId || '', phase: 'Unknown' };
  const data = submission?.worksheet_data || {};

  // ── Role-based access ──
  const isBuddy = profile?.role === 'lead_instructor';
  const isManager = profile?.role === 'academic_head';
  const isOnboardingLead = profile?.role === 'onboarding_lead';
  const isReviewer = isBuddy || isManager || isOnboardingLead;

  // ── Ownership check: buddy can only approve their assigned joinees ──
  const [isAssignedBuddy, setIsAssignedBuddy] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isBuddy || !userId) { setIsAssignedBuddy(true); return; }
    supabase
      .from('user_profiles')
      .select('assigned_buddy_id')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        const assigned = (data as { assigned_buddy_id: string | null } | null)?.assigned_buddy_id;
        // When no buddy is assigned, allow any buddy to act (fallback)
        if (assigned === null) { setIsAssignedBuddy(true); return; }
        // When another buddy is assigned, deny
        if (assigned && assigned !== profile?.id) { setIsAssignedBuddy(false); return; }
        // Same buddy or no assignment — allow
        setIsAssignedBuddy(true);
      }, () => setIsAssignedBuddy(true)); // On error, allow (fail open for safety)
  }, [isBuddy, userId, profile?.id]);

  // Buddy can approve their assigned joinees' worksheets → buddy_approved
  // Manager can only approve at phase-level (via PhaseReview page) but can VIEW individual worksheets
  // Onboarding Lead can only VIEW (read-only)
  const canApprove = isBuddy && isAssignedBuddy !== false;
  const isReadOnly = isOnboardingLead || (isManager && submission?.review_status !== 'buddy_approved') || (isBuddy && isAssignedBuddy === false);

  useEffect(() => {
    if (isReviewer && userId && worksheetId) loadData();
    // loadData intentionally omitted: closes over fresh userId/worksheetId each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReviewer, userId, worksheetId]);

  async function loadData() {
    setLoading(true);
    try {
      const [subRes, instrRes] = await Promise.all([
        supabase.from('worksheet_submissions').select('*').eq('user_id', userId).eq('worksheet_id', worksheetId).maybeSingle(),
        supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle(),
      ]);
      if (subRes.error) console.error('Error loading submission:', subRes.error);
      else if (subRes.data) setSubmission(subRes.data as unknown as WorksheetSubmission);
      if (instrRes.error) console.error('Error loading instructor:', instrRes.error);
      else if (instrRes.data) setInstructor(instrRes.data as unknown as UserProfile);
    } catch (err) {
      console.error('Failed to load worksheet review data:', err);
    }
    setLoading(false);
  }

  async function handleBuddyApprove() {
    // Validate current state
    const currentStatus = submission?.review_status;
    if (currentStatus !== 'pending_review' && currentStatus !== 'revision_submitted') {
      setActionMessage(`Cannot approve: worksheet is in "${currentStatus}" state. Only pending/re-submitted worksheets can be approved by the buddy.`);
      return;
    }

    setActionLoading(true);
    setActionMessage('');
    const update: Record<string, unknown> = {
      review_status: 'buddy_approved',
      reviewed_by: profile?.id,
      reviewed_at: new Date().toISOString(),
      reviewer_name: profile?.full_name || profile?.email || 'Buddy',
    };

    const historyEntry: ReviewHistoryEntry = {
      action: 'buddy_approved',
      reviewer_name: profile?.full_name || profile?.email || 'Buddy',
      reviewer_id: profile?.id || '',
      comment: comment.trim() || null,
      timestamp: update.reviewed_at as string,
    };
    const existingHistory = submission?.review_history || [];

    const { error } = await supabase
      .from('worksheet_submissions')
      .update({ ...update, review_history: [...existingHistory, historyEntry] })
      .eq('user_id', userId)
      .eq('worksheet_id', worksheetId);

    if (error) {
      setActionMessage('Error: ' + error.message);
    } else {
      setActionMessage('Worksheet approved by buddy. ✓');
      setSubmission(prev => prev ? {
        ...prev, ...update,
        review_history: [...(prev.review_history || []), historyEntry],
      } as unknown as WorksheetSubmission : null);
      setComment('');

      await triggerNotification({
        userId: userId || '',
        fromUserId: profile?.id,
        worksheetId: worksheetId || '',
        type: 'buddy_approved',
        message: `Your worksheet (${worksheetId}) has been approved by your buddy (${profile?.full_name || 'Buddy'}). It's now pending manager phase approval.`,
      });

      // Notify the ASSIGNED manager that a worksheet is now buddy-approved
      let managerIds = await getAssignedReviewerIds(userId || '', 'manager');
      // Fallback to all managers if no assigned manager found
      if (managerIds.length === 0) {
        managerIds = await getReviewerUserIds('manager');
      }
      for (const mgrId of managerIds) {
        await triggerNotification({
          userId: mgrId,
          fromUserId: profile?.id,
          worksheetId: worksheetId || '',
          type: 'buddy_approved',
          message: `Worksheet (${worksheetId}) for ${instructor?.full_name || 'joinee'} has been buddy-approved and is ready for phase-level review.`,
        });
      }

      setTimeout(() => navigate(-1), 2000);
    }
    setActionLoading(false);
  }

  async function handleBuddyRevision() {
    if (!comment.trim()) {
      setActionMessage('Please add a comment explaining what needs revision.');
      return;
    }
    setActionLoading(true);
    setActionMessage('');
    const update: Record<string, unknown> = {
      review_status: 'needs_revision',
      reviewed_by: profile?.id,
      reviewed_at: new Date().toISOString(),
      reviewer_name: profile?.full_name || profile?.email || 'Buddy',
      review_comment: comment.trim(),
    };
    const historyEntry: ReviewHistoryEntry = {
      action: 'needs_revision',
      reviewer_name: profile?.full_name || profile?.email || 'Buddy',
      reviewer_id: profile?.id || '',
      comment: comment.trim(),
      timestamp: update.reviewed_at as string,
    };
    const existingHistory = submission?.review_history || [];

    const { error } = await supabase
      .from('worksheet_submissions')
      .update({ ...update, review_history: [...existingHistory, historyEntry] })
      .eq('user_id', userId)
      .eq('worksheet_id', worksheetId);

    if (error) {
      setActionMessage('Error: ' + error.message);
    } else {
      setActionMessage('Revision requested.');
      setSubmission(prev => prev ? {
        ...prev, ...update,
        review_history: [...(prev.review_history || []), historyEntry],
      } as unknown as WorksheetSubmission : null);
      setComment('');

      await triggerNotification({
        userId: userId || '',
        fromUserId: profile?.id,
        worksheetId: worksheetId || '',
        type: 'needs_revision',
        message: `Your worksheet (${worksheetId}) needs revision. Comment: ${comment.trim()}`,
      });

      setTimeout(() => navigate(-1), 2000);
    }
    setActionLoading(false);
  }

  const reviewHistory: ReviewHistoryEntry[] = (submission?.review_history || []).slice().reverse();

  if (!isReviewer) {
    return (
      <div className="lux-section" style={{ textAlign: 'center' }}>
        <div className="lux-container">
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <h2 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, color: t.ch, marginBottom: '1rem' }}>Access Restricted</h2>
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg }}>You don't have permission to review worksheets.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="lux-section">
        <div className="lux-container" style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ marginBottom: '2rem' }}>
            <div className="lux-line lux-line-gold" style={{ marginBottom: '1.5rem' }} />
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ width: '48px', height: '48px', border: '1px solid var(--color-charcoal)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ width: '60%', height: '1.5rem', background: 'var(--color-taupe)', marginBottom: '0.5rem' }} />
                <div style={{ width: '40%', height: '0.8rem', background: 'var(--color-taupe)' }} />
              </div>
            </div>
          </div>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ borderTop: '1px solid var(--color-charcoal)', padding: '1.5rem 0' }}>
              <div style={{ width: '30%', height: '0.7rem', background: 'var(--color-taupe)', marginBottom: '1rem' }} />
              <div style={{ width: '100%', height: '0.9rem', background: 'var(--color-taupe)', marginBottom: '0.5rem' }} />
              <div style={{ width: '80%', height: '0.9rem', background: 'var(--color-taupe)' }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="lux-section" style={{ textAlign: 'center' }}>
        <div className="lux-container">
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <h2 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, color: t.ch, marginBottom: '1rem' }}>Worksheet Not Submitted</h2>
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, marginBottom: '0.5rem' }}>This worksheet hasn't been submitted yet by the instructor.</p>
          <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg, marginBottom: '1.5rem', lineHeight: 1.5 }}>
            The instructor may still be working on it. Check back later or contact them directly.
          </p>
          <button onClick={() => navigate(-1)} className="lux-btn lux-btn-secondary">Go Back</button>
        </div>
      </div>
    );
  }

  const reviewStatus = submission.review_status;
  const isBuddyApproved = reviewStatus === 'buddy_approved';
  const isApproved = reviewStatus === 'approved';
  const isPending = reviewStatus === 'pending_review' || reviewStatus === 'revision_submitted';
  const isNeedsRevision = reviewStatus === 'needs_revision';

  const canBuddyAct = canApprove && isPending && isAssignedBuddy !== null;

  function StatusBadge({ status }: { status: string }) {
    if (status === 'approved') return <span className="lux-badge" style={{ borderColor: t.success, color: t.success, fontSize: '0.6rem' }}><CheckCircle2 size={10} strokeWidth={2} /> Approved (Manager)</span>;
    if (status === 'buddy_approved') return <span className="lux-badge" style={{ borderColor: t.purple, color: t.purple, fontSize: '0.6rem' }}><Shield size={10} strokeWidth={2} /> Buddy Approved · Awaiting Manager</span>;
    // Support both legacy capital 'Submitted' (from gate controls before fix) and lowercase 'submitted'
    const subStatus = (submission!.status as string) || '';
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (status === REVIEW_STATUS.PENDING_REVIEW || (status === REVIEW_STATUS.EMPTY && (subStatus === SUBMISSION_STATUS.SUBMITTED || subStatus === 'Submitted'))) return <span className="lux-badge" style={{ borderColor: t.gd, color: t.gd, fontSize: '0.6rem' }}><Clock size={10} strokeWidth={2} /> Pending Review</span>;
    if (status === 'needs_revision') return <span className="lux-badge" style={{ borderColor: t.error, color: t.error, fontSize: '0.6rem' }}><XCircle size={10} strokeWidth={2} /> Needs Revision</span>;
    if (status === 'revision_submitted') return <span className="lux-badge" style={{ borderColor: t.pending, color: t.pending, fontSize: '0.6rem' }}><RefreshCw size={10} strokeWidth={2} /> Re-submitted</span>;
    return null;
  }

  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '900px', margin: '0 auto' }}>
        <button onClick={() => navigate(-1)} className="lux-btn lux-btn-ghost" style={{ marginBottom: '1rem' }}>
          <ArrowLeft size={14} strokeWidth={1.5} /> Back
        </button>

        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.5rem' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ width: '48px', height: '48px', border: '1px solid var(--color-charcoal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: t.body, fontSize: '1.1rem', fontWeight: 500, color: t.ch }}>
              {instructor?.full_name?.charAt(0) || '?'}
            </div>
            <div style={{ flex: 1, minWidth: '250px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
                <h1 style={{ fontFamily: t.heading, fontSize: '1.5rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, margin: 0 }}>
                  {wsInfo.title}
                </h1>
                <StatusBadge status={reviewStatus} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.wg, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <User size={12} strokeWidth={1.5} /> {instructor?.full_name || 'Unknown'}
                </span>
                <span style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.wg }}>{wsInfo.phase}</span>
                <span style={{ fontFamily: t.body, fontSize: '0.65rem', color: t.wg }}>ID: {worksheetId}</span>
              </div>

              {/* Role context banner */}
              {isReadOnly && (
                <div style={{
                  marginTop: '12px', padding: '8px 12px',
                  background: 'rgba(3, 105, 161, 0.06)', border: '1px solid #7DD3FC',
                  fontFamily: t.body, fontSize: '0.7rem', color: t.info,
                }}>
                  {isOnboardingLead
                    ? '🔍 Read-only view — Onboarding Leads can monitor but not approve submissions.'
                    : '👁️ View-only — Manager can review this worksheet but must approve the entire phase from the dashboard.'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Review History */}
        {reviewHistory.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(26, 26, 26, 0.12)', padding: '1.5rem 0', marginBottom: '1.5rem' }}>
            <h3 style={{ fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <History size={14} strokeWidth={1.5} /> Review History ({reviewHistory.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative' }}>
              <div style={{ position: 'absolute', left: '11px', top: '8px', bottom: '8px', width: '1px', background: 'rgba(26, 26, 26, 0.15)' }} />
              {reviewHistory.map((entry, idx) => {
                const isApprove = entry.action === 'approved' || entry.action === 'buddy_approved' || entry.action === 'phase_approved';
                const date = entry.timestamp ? new Date(entry.timestamp) : null;
                return (
                  <div key={idx} style={{ display: 'flex', gap: '12px', position: 'relative' }}>
                    <div style={{
                      width: '24px', height: '24px', border: '1px solid', flexShrink: 0, zIndex: 1,
                      borderColor: isApprove ? t.success : t.error,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'var(--color-alabaster)',
                    }}>
                      <div style={{ width: '8px', height: '8px', background: isApprove ? t.success : t.error }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '2px' }}>
                        <span style={{ fontFamily: t.body, fontSize: '0.8rem', fontWeight: 500, color: isApprove ? t.success : t.error }}>
                          {entry.action === 'buddy_approved' ? 'Buddy Approved' : isApprove ? 'Approved' : 'Revision Requested'}
                        </span>
                        {entry.reviewer_name && (
                          <span style={{ fontFamily: t.body, fontSize: '0.65rem', color: t.wg }}>by {entry.reviewer_name}</span>
                        )}
                        {date && (
                          <span style={{ fontFamily: t.body, fontSize: '0.6rem', color: t.wg }}>
                            {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      {entry.comment && (
                        <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.ch, marginTop: '2px', whiteSpace: 'pre-wrap' }}>{entry.comment}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Submitted Content */}
        <div style={{ borderTop: '1px solid rgba(26, 26, 26, 0.12)', padding: '1.5rem 0', marginBottom: '1.5rem' }}>
          <h3 style={{ fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Eye size={14} strokeWidth={1.5} /> Submitted Content
          </h3>
          <ReviewContent data={data as Record<string, unknown>} worksheetId={worksheetId || ''} />
        </div>

        {/* Review Actions — Buddy only */}
        {canBuddyAct && (
          <div style={{ borderTop: '2px solid var(--color-charcoal)', padding: '1.5rem 0' }}>
            <h3 style={{ fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.ch, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Send size={14} strokeWidth={1.5} /> Buddy Review Decision
            </h3>
            <p style={{ fontFamily: t.body, fontSize: '0.7rem', color: t.wg, marginBottom: '1rem' }}>
              As a buddy, you can approve this worksheet (it will be marked as "buddy approved" and await manager phase-level sign-off) or request revisions.
            </p>
            <div className="lux-form-group">
              <label className="lux-label" htmlFor="review-comment">Review Comments <span style={{ fontFamily: t.body, fontWeight: 400, color: t.wg }}>(optional for approval, required for revision)</span></label>
              <textarea id="review-comment" className="lux-textarea" rows={4} value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder={"• What was done well?\n• What needs improvement?\n• Specific suggestions for revision..."} />
            </div>
            {actionMessage && (
              <div className={`lux-alert ${actionMessage.includes('Error') ? 'lux-alert-error' : 'lux-alert-success'}`} style={{ marginBottom: '1rem' }}>
                {actionMessage.includes('Error') ? <AlertCircle size={16} strokeWidth={1.5} /> : <CheckCircle2 size={16} strokeWidth={1.5} />}
                <span>{actionMessage}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button onClick={handleBuddyApprove} disabled={actionLoading}
                className="lux-btn lux-btn-primary" style={{ minWidth: '200px' }}>
                <span className="gold-overlay" /><span className="btn-content">
                  {actionLoading ? 'Processing…' : <><ThumbsUp size={16} strokeWidth={1.5} /> Approve (Buddy)</>}
                </span>
              </button>
              <button onClick={handleBuddyRevision} disabled={actionLoading}
                className="lux-btn lux-btn-secondary" style={{ borderColor: t.error, color: t.error, minWidth: '200px' }}>
                {actionLoading ? 'Processing…' : <><ThumbsDown size={16} strokeWidth={1.5} /> Request Revision</>}
              </button>
            </div>
          </div>
        )}

        {/* Already buddy-approved — show info for buddy */}
        {isBuddyApproved && canApprove && (
          <div style={{ textAlign: 'center', padding: '2rem 0', borderTop: '1px solid rgba(26, 26, 26, 0.12)' }}>
            <div className="lux-line lux-line-gold" style={{ margin: '0 auto 1.5rem' }} />
            <h3 style={{ fontFamily: t.heading, fontSize: '1.25rem', fontWeight: 400, color: t.purple, marginBottom: '0.5rem' }}>✓ Buddy Approved</h3>
            <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg, marginBottom: '1.5rem' }}>
              This worksheet is ready for manager phase-level approval.
            </p>
            <button onClick={() => navigate(-1)} className="lux-btn lux-btn-secondary">Back</button>
          </div>
        )}

        {/* Final approval status */}
        {isApproved && (
          <div style={{ textAlign: 'center', padding: '2rem 0', borderTop: '1px solid rgba(26, 26, 26, 0.12)' }}>
            <div className="lux-line lux-line-gold" style={{ margin: '0 auto 1.5rem' }} />
            <h3 style={{ fontFamily: t.heading, fontSize: '1.25rem', fontWeight: 400, color: t.success, marginBottom: '0.5rem' }}>✓ Fully Approved (Manager)</h3>
            <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg, marginBottom: '1.5rem' }}>
              This worksheet has been approved at the phase level by {submission.reviewer_name || 'the manager'}.
            </p>
            <button onClick={() => navigate(-1)} className="lux-btn lux-btn-secondary">Back</button>
          </div>
        )}

        {/* Needs revision — show back button */}
        {isNeedsRevision && !canBuddyAct && (
          <div style={{ textAlign: 'center', padding: '2rem 0', borderTop: '1px solid rgba(26, 26, 26, 0.12)' }}>
            <button onClick={() => navigate(-1)} className="lux-btn lux-btn-secondary">Back</button>
          </div>
        )}
      </div>
    </div>
  );
}
