import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase';
import { CheckCircle2, XCircle, MessageSquare, ArrowLeft, Clock, AlertCircle, User, Send, RefreshCw, Eye, History, ThumbsUp, ThumbsDown } from 'lucide-react';
import { WORKSHEET_REVIEWER, REVIEWER_LABELS, REVIEWER_STYLES } from '../worksheetConfig.jsx';
import ReviewContent from '../components/ReviewContent.jsx';

const WORKSHEET_INFO = {
  p1_w1: { title: 'Team Introduction & Stakeholder Mapping Log', phase: 'Phase 1' },
  p1_w2: { title: 'Faculty Mentor Alignment & Weekly Sync Tracker', phase: 'Phase 1' },
  p1_w3: { title: 'Organisational Culture & Teaching Philosophy Reflection', phase: 'Phase 1' },
  p1_w4: { title: 'Partner University Governance & Semester Architecture Map', phase: 'Phase 1' },
  p1_w5: { title: 'Core Learning Portal Practical Walkthrough', phase: 'Phase 1' },
  p1_w6: { title: 'Classroom & Laboratory Live Observation Journal', phase: 'Phase 1' },
  p1_w7: { title: 'Existing Courseware & Question Bank Review Matrix', phase: 'Phase 1' },
  p1_w8: { title: 'Slack Historical Context & Student Bottleneck Audit', phase: 'Phase 1' },
  gc1: { title: 'Gate Control 1 — 30-Day Milestone Review', phase: 'Phase 1' },
  p2_w1: { title: 'Student Doubt Resolution & Common Errors Diagnostic Log', phase: 'Phase 2' },
  p2_w2: { title: 'Independent Lab Facilitation Scorecard', phase: 'Phase 2' },
  p2_w3: { title: 'Courseware Content Creation Ledger', phase: 'Phase 2' },
  p2_w4: { title: 'Advanced Portal Operations & Quiz Configuration Check', phase: 'Phase 2' },
  gc2: { title: 'Gate Control 2 — 60-Day Milestone Review', phase: 'Phase 2' },
  p3_w1: { title: 'Independent Lecture Delivery Log & Pacing Post-Mortem', phase: 'Phase 3' },
  p3_w2: { title: 'Student Cohort Profiling & High/Low Performer Mapping', phase: 'Phase 3' },
  p3_w3: { title: 'Assessment Design Blueprint & Bloom\'s Taxonomy Grid', phase: 'Phase 3' },
  p3_w4: { title: 'Pedagogical Frameworks Application Journal', phase: 'Phase 3' },
  p3_w5: { title: 'Continuous Course Improvement Proposal', phase: 'Phase 3' },
  gc3: { title: 'Gate Control 3 — 90-Day Final Readiness Assessment', phase: 'Phase 3' },
};

const t = {
  body: 'var(--font-body)', heading: 'var(--font-heading)',
  ch: 'var(--color-charcoal)', wg: 'var(--color-warm-grey)', gd: 'var(--color-gold)',
  ease: 'var(--ease-lux)',
};

export default function WorksheetReview() {
  const { userId, worksheetId } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [submission, setSubmission] = useState(null);
  const [instructor, setInstructor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');

  const wsInfo = WORKSHEET_INFO[worksheetId] || { title: worksheetId, phase: 'Unknown' };
  const data = submission?.worksheet_data || {};
  const reviewerType = WORKSHEET_REVIEWER[worksheetId] || 'manager';
  const reviewerStyle = REVIEWER_STYLES[reviewerType];
  const reviewerLabel = REVIEWER_LABELS[reviewerType];

  // Role-based review permission:
  // - academic_head (Manager) can review EVERYTHING
  // - lead_instructor (Buddy) can only review buddy-type worksheets
  // - onboarding_lead can only review onboarding_lead-type worksheets
  const isReviewer = ['lead_instructor', 'academic_head', 'onboarding_lead'].includes(profile?.role);
  const canReviewThisWorksheet =
    profile?.role === 'academic_head' ||
    (reviewerType === 'buddy' && profile?.role === 'lead_instructor') ||
    (reviewerType === 'onboarding_lead' && profile?.role === 'onboarding_lead');

  const hasAccess = isReviewer && canReviewThisWorksheet;

  useEffect(() => {
    if (hasAccess && userId && worksheetId) loadData();
  }, [hasAccess, userId, worksheetId]);

  async function loadData() {
    setLoading(true);
    try {
      const [subRes, instrRes] = await Promise.all([
        supabase.from('worksheet_submissions').select('*').eq('user_id', userId).eq('worksheet_id', worksheetId).maybeSingle(),
        supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle(),
      ]);
      if (subRes.error) console.error('Error loading submission:', subRes.error);
      else if (subRes.data) setSubmission(subRes.data);
      if (instrRes.error) console.error('Error loading instructor:', instrRes.error);
      else if (instrRes.data) setInstructor(instrRes.data);
    } catch (err) {
      console.error('Failed to load worksheet review data:', err);
    }
    setLoading(false);
  }

  async function handleReview(action) {
    if (action === 'revision' && !comment.trim()) {
      setActionMessage('Please add a comment explaining what needs revision.');
      return;
    }
    setActionLoading(true);
    setActionMessage('');
    const update = {
      review_status: action === 'approve' ? 'approved' : 'needs_revision',
      reviewed_by: profile?.id,
      reviewed_at: new Date().toISOString(),
      reviewer_name: profile?.full_name || profile?.email || 'Unknown',
    };
    update.review_comment = comment.trim() || null;
    if (action === 'approve' && submission?.worksheet_data) {
      update.worksheet_data = { ...submission.worksheet_data, status: 'Reviewed' };
    }
    const historyEntry = {
      action: action === 'approve' ? 'approved' : 'needs_revision',
      reviewer_name: profile?.full_name || profile?.email || 'Unknown',
      reviewer_id: profile?.id,
      comment: update.review_comment,
      timestamp: update.reviewed_at,
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
      setActionMessage(action === 'approve'
        ? 'Worksheet approved.'
        : 'Revision requested.');
      setSubmission(prev => ({
        ...prev,
        ...update,
        review_history: [...(prev?.review_history || []), historyEntry],
      }));
      setComment('');
      setTimeout(() => navigate(-1), 2000);
    }
    setActionLoading(false);
  }

  const reviewHistory = (submission?.review_history || []).slice().reverse();

  if (!hasAccess) {
    return (
      <div className="lux-section" style={{ textAlign: 'center' }}>
        <div className="lux-container">
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <h2 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, color: t.ch, marginBottom: '1rem' }}>Access Restricted</h2>
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg }}>
            {profile?.role === 'lead_instructor' && reviewerType !== 'buddy'
              ? 'This worksheet is not assigned to your role. As a Buddy/Mentor, you can only review buddy-assigned worksheets (team introductions, mentor syncs, observations, etc.).'
              : profile?.role === 'onboarding_lead' && reviewerType !== 'onboarding_lead'
                ? 'This worksheet is not assigned to your role. As an Onboarding Lead, you can only review procedural worksheets (governance, portal ops, etc.).'
                : "You don't have permission to review this worksheet."}
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="lux-section" style={{ textAlign: 'center' }}>
        <div className="lux-container">
          <p style={{ fontFamily: t.body, color: t.wg }}>Loading worksheet…</p>
        </div>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="lux-section" style={{ textAlign: 'center' }}>
        <div className="lux-container">
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <h2 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, color: t.ch, marginBottom: '1rem' }}>Worksheet Not Found</h2>
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, marginBottom: '1.5rem' }}>This worksheet hasn't been submitted yet.</p>
          <button onClick={() => navigate(-1)} className="lux-btn lux-btn-secondary">Go Back</button>
        </div>
      </div>
    );
  }

  const reviewStatus = submission.review_status;
  const canReview = reviewStatus === 'pending_review' || reviewStatus === 'revision_submitted';

  const StatusBadge = ({ status }) => {
    if (status === 'approved') return <span className="lux-badge" style={{ borderColor: '#1B5E20', color: '#1B5E20', fontSize: '0.6rem' }}><CheckCircle2 size={10} strokeWidth={2} /> Approved</span>;
    if (status === 'pending_review' || (!status && submission.status === 'submitted')) return <span className="lux-badge" style={{ borderColor: t.gd, color: t.gd, fontSize: '0.6rem' }}><Clock size={10} strokeWidth={2} /> Pending</span>;
    if (status === 'needs_revision') return <span className="lux-badge" style={{ borderColor: '#C62828', color: '#C62828', fontSize: '0.6rem' }}><XCircle size={10} strokeWidth={2} /> Revise</span>;
    if (status === 'revision_submitted') return <span className="lux-badge" style={{ borderColor: '#7D5260', color: '#7D5260', fontSize: '0.6rem' }}><RefreshCw size={10} strokeWidth={2} /> Re-submitted</span>;
    return null;
  };

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
                <span className="lux-badge lux-badge-light" style={{ fontSize: '0.55rem', borderColor: reviewerStyle.color, color: reviewerStyle.color }}>
                  {reviewerLabel}
                </span>
                <StatusBadge status={reviewStatus} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.wg, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <User size={12} strokeWidth={1.5} /> {instructor?.full_name || 'Unknown'}
                </span>
                <span style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.wg }}>{wsInfo.phase}</span>
                <span style={{ fontFamily: t.body, fontSize: '0.65rem', color: t.wg }}>ID: {worksheetId}</span>
              </div>
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
                const isApprove = entry.action === 'approved';
                const date = entry.timestamp ? new Date(entry.timestamp) : null;
                return (
                  <div key={idx} style={{ display: 'flex', gap: '12px', position: 'relative' }}>
                    <div style={{
                      width: '24px', height: '24px', border: '1px solid', flexShrink: 0, zIndex: 1,
                      borderColor: isApprove ? '#1B5E20' : '#C62828',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'var(--color-alabaster)',
                    }}>
                      <div style={{ width: '8px', height: '8px', background: isApprove ? '#1B5E20' : '#C62828' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '2px' }}>
                        <span style={{ fontFamily: t.body, fontSize: '0.8rem', fontWeight: 500, color: isApprove ? '#1B5E20' : '#C62828' }}>
                          {isApprove ? 'Approved' : 'Revision Requested'}
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
            {/* Legacy comment fallback */}
            {!submission?.review_history && submission.review_comment && (
              <div className="lux-alert lux-alert-info" style={{ marginTop: '1rem' }}>
                <MessageSquare size={14} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: '1px' }} />
                <div>
                  <span style={{ fontFamily: t.body, fontSize: '0.7rem', fontWeight: 500 }}>Latest Feedback by {submission.reviewer_name}</span>
                  <p style={{ fontFamily: t.body, fontSize: '0.8rem', marginTop: '4px' }}>{submission.review_comment}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Submitted Content */}
        <div style={{ borderTop: '1px solid rgba(26, 26, 26, 0.12)', padding: '1.5rem 0', marginBottom: '1.5rem' }}>
          <h3 style={{ fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Eye size={14} strokeWidth={1.5} /> Submitted Content
          </h3>
          <ReviewContent data={data} worksheetId={worksheetId} />
        </div>

        {/* Review Actions */}
        {canReview ? (
          <div style={{ borderTop: '2px solid var(--color-charcoal)', padding: '1.5rem 0' }}>
            <h3 style={{ fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.ch, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Send size={14} strokeWidth={1.5} /> Your Review Decision
            </h3>
            <div className="lux-form-group">
              <label className="lux-label" htmlFor="review-comment">Review Comments <span style={{ fontFamily: t.body, fontWeight: 400, color: t.wg }}>(optional but recommended)</span></label>
              <textarea id="review-comment" className="lux-textarea" rows={4} value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="• What was done well?\n• What needs improvement?\n• Specific suggestions for revision (if requesting changes)..." />
            </div>
            {actionMessage && (
              <div className={`lux-alert ${actionMessage.includes('Error') ? 'lux-alert-error' : 'lux-alert-success'}`} style={{ marginBottom: '1rem' }}>
                {actionMessage.includes('Error') ? <AlertCircle size={16} strokeWidth={1.5} /> : <CheckCircle2 size={16} strokeWidth={1.5} />}
                <span>{actionMessage}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button onClick={() => handleReview('approve')} disabled={actionLoading}
                className="lux-btn lux-btn-primary" style={{ minWidth: '200px' }}>
                <span className="gold-overlay" /><span className="btn-content">
                  {actionLoading ? 'Processing…' : <><ThumbsUp size={16} strokeWidth={1.5} /> Approve Worksheet</>}
                </span>
              </button>
              <button onClick={() => handleReview('revision')} disabled={actionLoading}
                className="lux-btn lux-btn-secondary" style={{ borderColor: '#C62828', color: '#C62828', minWidth: '200px' }}>
                {actionLoading ? 'Processing…' : <><ThumbsDown size={16} strokeWidth={1.5} /> Request Revision</>}
              </button>
            </div>
            <p style={{ fontFamily: t.body, fontSize: '0.65rem', color: t.wg, marginTop: '0.75rem', lineHeight: 1.5 }}>
              <span style={{ fontWeight: 500, color: t.ch }}>Approving</span> marks this worksheet as reviewed.{' '}
              <span style={{ fontWeight: 500, color: t.ch }}>Requesting Revision</span> asks the instructor to make changes and resubmit.
            </p>
          </div>
        ) : reviewStatus === 'approved' ? (
          <div style={{ textAlign: 'center', padding: '2rem 0', borderTop: '1px solid rgba(26, 26, 26, 0.12)' }}>
            <div className="lux-line lux-line-gold" style={{ margin: '0 auto 1.5rem' }} />
            <h3 style={{ fontFamily: t.heading, fontSize: '1.25rem', fontWeight: 400, color: '#1B5E20', marginBottom: '0.5rem' }}>✓ Worksheet Approved</h3>
            <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg, marginBottom: '1.5rem' }}>
              Reviewed and approved by {submission.reviewer_name || 'a reviewer'}.
            </p>
            <button onClick={() => navigate(-1)} className="lux-btn lux-btn-secondary">Back</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
