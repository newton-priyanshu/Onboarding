import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../api/supabase';
import { CheckCircle2, XCircle, ArrowLeft, Clock, AlertCircle, User, Send, RefreshCw, Eye, History, ThumbsUp, ThumbsDown, Shield } from 'lucide-react';
import { WORKSHEET_INFO, type WorksheetSubmission, type UserProfile } from '../config/worksheetConfig';
import { SUBMISSION_STATUS, REVIEW_STATUS } from '../constants/status';
import { computeReviewTransition } from '../utils/reviewStateMachine';
import ReviewContent from '../components/ReviewContent';
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

function StatusBadge({ status, submissionStatus }: { status: string; submissionStatus: string }) {
  if (status === REVIEW_STATUS.APPROVED) return <span className="lux-badge" style={{ borderColor: t.success, color: t.success, fontSize: '0.6rem' }}><CheckCircle2 size={10} strokeWidth={2} /> Approved (Manager)</span>;
  if (status === REVIEW_STATUS.BUDDY_APPROVED) return <span className="lux-badge" style={{ borderColor: t.purple, color: t.purple, fontSize: '0.6rem' }}><Shield size={10} strokeWidth={2} /> Buddy Approved · Awaiting Manager</span>;
  // Support both legacy capital 'Submitted' (from gate controls before fix) and lowercase 'submitted'
  if (status === REVIEW_STATUS.PENDING_REVIEW || (status === REVIEW_STATUS.EMPTY && (submissionStatus === SUBMISSION_STATUS.SUBMITTED || submissionStatus === 'Submitted'))) return <span className="lux-badge" style={{ borderColor: t.gd, color: t.gd, fontSize: '0.6rem' }}><Clock size={10} strokeWidth={2} /> Pending Review</span>;
  if (status === REVIEW_STATUS.NEEDS_REVISION) return <span className="lux-badge" style={{ borderColor: t.error, color: t.error, fontSize: '0.6rem' }}><XCircle size={10} strokeWidth={2} /> Needs Revision</span>;
  if (status === REVIEW_STATUS.REVISION_SUBMITTED) return <span className="lux-badge" style={{ borderColor: t.pending, color: t.pending, fontSize: '0.6rem' }}><RefreshCw size={10} strokeWidth={2} /> Re-submitted</span>;
  return null;
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
  const [loadError, setLoadError] = useState<string | null>(null);
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
  const [assignedBuddyError, setAssignedBuddyError] = useState<string | null>(null);

  const checkAssignedBuddy = useCallback(async () => {
    if (!isBuddy || !userId) { setIsAssignedBuddy(true); setAssignedBuddyError(null); return; }
    const { data: profileRow, error } = await supabase
      .from('user_profiles')
      .select('assigned_buddy_id')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error checking buddy assignment:', error);
      // Fail CLOSED: an error verifying assignment must never be treated as "allowed".
      setIsAssignedBuddy(false);
      setAssignedBuddyError('Could not verify your buddy assignment for this joinee. Please retry.');
      return;
    }

    setAssignedBuddyError(null);
    const assigned = (profileRow as { assigned_buddy_id: string | null } | null)?.assigned_buddy_id;
    // When no buddy is assigned, allow any buddy to act (fallback)
    if (assigned === null || assigned === undefined) { setIsAssignedBuddy(true); return; }
    // When another buddy is assigned, deny
    if (assigned !== profile?.id) { setIsAssignedBuddy(false); return; }
    // Same buddy — allow
    setIsAssignedBuddy(true);
  }, [isBuddy, userId, profile?.id]);

  useEffect(() => {
    checkAssignedBuddy();
  }, [checkAssignedBuddy]);

  // Buddy can approve their assigned joinees' worksheets → buddy_approved
  // Manager can only approve at phase-level (via PhaseReview page) but can VIEW individual worksheets
  // and request revision on a buddy-approved worksheet directly from this page.
  // Onboarding Lead can only VIEW (read-only)
  const canApprove = isBuddy && isAssignedBuddy !== false;
  const isReadOnly = isOnboardingLead || (isManager && submission?.review_status !== REVIEW_STATUS.BUDDY_APPROVED) || (isBuddy && isAssignedBuddy === false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [subRes, instrRes] = await Promise.all([
        supabase.from('worksheet_submissions').select('*').eq('user_id', userId).eq('worksheet_id', worksheetId).maybeSingle(),
        supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle(),
      ]);
      if (subRes.error) {
        console.error('Error loading submission:', subRes.error);
        setLoadError('Failed to load this worksheet: ' + subRes.error.message);
        setLoading(false);
        return;
      }
      setSubmission(subRes.data ? (subRes.data as unknown as WorksheetSubmission) : null);

      if (instrRes.error) {
        console.error('Error loading instructor:', instrRes.error);
        setLoadError('Failed to load the instructor profile: ' + instrRes.error.message);
        setLoading(false);
        return;
      }
      setInstructor(instrRes.data ? (instrRes.data as unknown as UserProfile) : null);
    } catch (err) {
      console.error('Failed to load worksheet review data:', err);
      setLoadError(err instanceof Error ? err.message : 'Failed to load worksheet review data.');
    }
    setLoading(false);
  }, [userId, worksheetId]);

  useEffect(() => {
    if (isReviewer && userId && worksheetId) loadData();
  }, [isReviewer, userId, worksheetId, loadData]);

  function handleRetry() {
    loadData();
    if (isBuddy) checkAssignedBuddy();
  }

  async function handleBuddyApprove() {
    // Validate current state — reviewStateMachine is the single source of
    // truth for who may transition from what (see src/utils/reviewStateMachine.ts).
    const loadedStatus = submission?.review_status;
    const transition = computeReviewTransition('approve', loadedStatus || '', profile?.role || 'new_joinee');
    if (!transition.allowed) {
      setActionMessage(`Cannot approve: worksheet is in "${loadedStatus}" state. Only pending/re-submitted worksheets can be approved by the buddy.`);
      return;
    }

    setActionLoading(true);
    setActionMessage('');
    const nowIso = new Date().toISOString();
    const reviewerName = profile?.full_name || profile?.email || 'Buddy';

    // Optimistic-concurrency guard: only apply the transition if the row is still
    // in the state we loaded it in. review_history is appended server-side by the
    // BEFORE UPDATE trigger — the client never writes to it directly.
    const { data: rows, error } = await supabase
      .from('worksheet_submissions')
      .update({
        review_status: transition.nextStatus,
        reviewed_by: profile?.id,
        reviewed_at: nowIso,
        reviewer_name: reviewerName,
        review_comment: comment.trim() || null,
      })
      .eq('user_id', userId)
      .eq('worksheet_id', worksheetId)
      .eq('review_status', loadedStatus)
      .select();

    if (error) {
      setActionMessage('Error: ' + error.message);
      setActionLoading(false);
      return;
    }

    if (!rows || rows.length === 0) {
      setActionMessage('This worksheet changed since you loaded it. Reloading the latest version…');
      await loadData();
      setActionLoading(false);
      return;
    }

    setActionMessage('Worksheet approved by buddy. ✓');
    setSubmission(rows[0] as unknown as WorksheetSubmission);
    setComment('');
    setTimeout(() => navigate(-1), 2000);
    setActionLoading(false);
  }

  async function handleBuddyRevision() {
    if (!comment.trim()) {
      setActionMessage('Please add a comment explaining what needs revision.');
      return;
    }
    const loadedStatus = submission?.review_status;
    const transition = computeReviewTransition('request_revision', loadedStatus || '', profile?.role || 'new_joinee');
    if (!transition.allowed) {
      setActionMessage(`Cannot request revision: worksheet is in "${loadedStatus}" state.`);
      return;
    }

    setActionLoading(true);
    setActionMessage('');
    const nowIso = new Date().toISOString();
    const reviewerName = profile?.full_name || profile?.email || 'Buddy';

    const { data: rows, error } = await supabase
      .from('worksheet_submissions')
      .update({
        review_status: transition.nextStatus,
        reviewed_by: profile?.id,
        reviewed_at: nowIso,
        reviewer_name: reviewerName,
        review_comment: comment.trim(),
      })
      .eq('user_id', userId)
      .eq('worksheet_id', worksheetId)
      .eq('review_status', loadedStatus)
      .select();

    if (error) {
      setActionMessage('Error: ' + error.message);
      setActionLoading(false);
      return;
    }

    if (!rows || rows.length === 0) {
      setActionMessage('This worksheet changed since you loaded it. Reloading the latest version…');
      await loadData();
      setActionLoading(false);
      return;
    }

    setActionMessage('Revision requested.');
    setSubmission(rows[0] as unknown as WorksheetSubmission);
    setComment('');
    setTimeout(() => navigate(-1), 2000);
    setActionLoading(false);
  }

  // ── Manager rejection path (H28): academic_head can send a buddy-approved
  // worksheet back for revision directly from this page. ──
  async function handleManagerRevision() {
    if (!comment.trim()) {
      setActionMessage('Please add a comment explaining what needs revision.');
      return;
    }
    const loadedStatus = submission?.review_status;
    const transition = computeReviewTransition('request_revision', loadedStatus || '', profile?.role || 'new_joinee');
    if (!transition.allowed) {
      setActionMessage(`Cannot request revision: worksheet is in "${loadedStatus}" state.`);
      return;
    }

    setActionLoading(true);
    setActionMessage('');
    const nowIso = new Date().toISOString();
    const reviewerName = profile?.full_name || profile?.email || 'Manager';

    const { data: rows, error } = await supabase
      .from('worksheet_submissions')
      .update({
        review_status: transition.nextStatus,
        reviewed_by: profile?.id,
        reviewed_at: nowIso,
        reviewer_name: reviewerName,
        review_comment: comment.trim(),
      })
      .eq('user_id', userId)
      .eq('worksheet_id', worksheetId)
      .eq('review_status', loadedStatus)
      .select();

    if (error) {
      setActionMessage('Error: ' + error.message);
      setActionLoading(false);
      return;
    }

    if (!rows || rows.length === 0) {
      setActionMessage('This worksheet changed since you loaded it. Reloading the latest version…');
      await loadData();
      setActionLoading(false);
      return;
    }

    setActionMessage('Revision requested by manager.');
    setSubmission(rows[0] as unknown as WorksheetSubmission);
    setComment('');
    setTimeout(() => navigate(-1), 2000);
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

  if (loadError) {
    return (
      <div className="lux-section" style={{ textAlign: 'center' }}>
        <div className="lux-container">
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <h2 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, color: t.error, marginBottom: '1rem' }}>Couldn't Load Worksheet</h2>
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, marginBottom: '1.5rem' }}>{loadError}</p>
          <button onClick={handleRetry} className="lux-btn lux-btn-primary" style={{ marginRight: '0.75rem' }}>
            <span className="gold-overlay" /><span className="btn-content"><RefreshCw size={14} strokeWidth={1.5} /> Retry</span>
          </button>
          <button onClick={() => navigate(-1)} className="lux-btn lux-btn-secondary">Go Back</button>
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

  if (assignedBuddyError) {
    return (
      <div className="lux-section" style={{ textAlign: 'center' }}>
        <div className="lux-container">
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <h2 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, color: t.error, marginBottom: '1rem' }}>Couldn't Verify Access</h2>
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, marginBottom: '1.5rem' }}>{assignedBuddyError}</p>
          <button onClick={handleRetry} className="lux-btn lux-btn-primary" style={{ marginRight: '0.75rem' }}>
            <span className="gold-overlay" /><span className="btn-content"><RefreshCw size={14} strokeWidth={1.5} /> Retry</span>
          </button>
          <button onClick={() => navigate(-1)} className="lux-btn lux-btn-secondary">Go Back</button>
        </div>
      </div>
    );
  }

  const reviewStatus = submission.review_status;
  const isBuddyApproved = reviewStatus === REVIEW_STATUS.BUDDY_APPROVED;
  const isApproved = reviewStatus === REVIEW_STATUS.APPROVED;
  const isPending = reviewStatus === REVIEW_STATUS.PENDING_REVIEW || reviewStatus === REVIEW_STATUS.REVISION_SUBMITTED;
  const isNeedsRevision = reviewStatus === REVIEW_STATUS.NEEDS_REVISION;

  const canBuddyAct = canApprove && isPending && isAssignedBuddy !== null;
  const canManagerRequestRevision = isManager && isBuddyApproved;

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
                <StatusBadge status={reviewStatus} submissionStatus={(submission?.status as string) || ''} />
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
                const isApprove = entry.action === REVIEW_STATUS.APPROVED || entry.action === REVIEW_STATUS.BUDDY_APPROVED || entry.action === 'phase_approved';
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

        {/* Review Actions — Manager rejection path on a buddy-approved worksheet (H28) */}
        {canManagerRequestRevision && (
          <div style={{ borderTop: '2px solid var(--color-charcoal)', padding: '1.5rem 0' }}>
            <h3 style={{ fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.ch, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Send size={14} strokeWidth={1.5} /> Manager Review Decision
            </h3>
            <p style={{ fontFamily: t.body, fontSize: '0.7rem', color: t.wg, marginBottom: '1rem' }}>
              This worksheet has been buddy-approved. As academic head, you can send it back for revision here, or approve the full phase from the dashboard once every worksheet in the phase is buddy-approved.
            </p>
            <div className="lux-form-group">
              <label className="lux-label" htmlFor="manager-review-comment">Revision Comments <span style={{ fontFamily: t.body, fontWeight: 400, color: t.wg }}>(required)</span></label>
              <textarea id="manager-review-comment" className="lux-textarea" rows={4} value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder={"• What needs to change before this can be approved?"} />
            </div>
            {actionMessage && (
              <div className={`lux-alert ${actionMessage.includes('Error') ? 'lux-alert-error' : 'lux-alert-success'}`} style={{ marginBottom: '1rem' }}>
                {actionMessage.includes('Error') ? <AlertCircle size={16} strokeWidth={1.5} /> : <CheckCircle2 size={16} strokeWidth={1.5} />}
                <span>{actionMessage}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button onClick={handleManagerRevision} disabled={actionLoading}
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
