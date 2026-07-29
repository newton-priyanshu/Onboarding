import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../api/supabase';
import { CheckCircle2, ArrowLeft, Shield, User, Clock, Eye, ThumbsUp, ThumbsDown, RefreshCw, AlertCircle, LucideIcon } from 'lucide-react';
import { PHASE_WORKSHEETS_MAP, WORKSHEET_INFO, getPhaseLabel, type WorksheetSubmission, type UserProfile } from '../config/worksheetConfig';
import { useWorksheetTemplate } from '../hooks/useWorksheetTemplate';
import ReviewContent from '../components/ReviewContent';
import { checkAndPromote } from '../hooks/useAutoPromote';
import { useToast } from '../components/Toast';
import { t } from '../config/theme';
import { REVIEW_STATUS } from '../constants/status';

interface ReviewParams {
  userId: string;
  phaseNum: string;
  [key: string]: string | undefined;
}

interface SummaryCardProps {
  label: string;
  value: number;
  color: string;
  icon?: LucideIcon;
}

function SummaryCard({ label, value, color, icon: Icon }: SummaryCardProps) {
  return (
    <div style={{ background: 'var(--color-alabaster)', padding: '1rem', textAlign: 'center' }}>
      {Icon && <Icon size={18} strokeWidth={1.5} style={{ color, marginBottom: '4px' }} />}
      <p style={{ fontFamily: t.heading, fontSize: '1.25rem', fontWeight: 400, color: t.ch }}>{value}</p>
      <p style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.wg }}>{label}</p>
    </div>
  );
}

export default function PhaseReview() {
  const params = useParams<ReviewParams>();
  const userId = params.userId;
  const phaseNum = params.phaseNum;
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { template } = useWorksheetTemplate();
  const { showToast } = useToast();
  const [instructor, setInstructor] = useState<UserProfile | null>(null);
  const [submissions, setSubmissions] = useState<WorksheetSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [expandedSheet, setExpandedSheet] = useState<string | null>(null);

  // ── Per-worksheet manager "Request Revision" (H28) ──
  const [revisionDrafts, setRevisionDrafts] = useState<Record<string, string>>({});
  const [revisionMessages, setRevisionMessages] = useState<Record<string, string>>({});
  const [revisionLoadingId, setRevisionLoadingId] = useState<string | null>(null);

  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => { if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current); };
  }, []);

  const phaseNumber = parseInt(phaseNum || '1', 10);
  const isManager = profile?.role === 'academic_head';
  const isOnboardingLead = profile?.role === 'onboarding_lead';
  const wsList = PHASE_WORKSHEETS_MAP[phaseNumber] || [];
  const phaseLabel = getPhaseLabel(phaseNumber, template);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [instrRes, wsRes] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('worksheet_submissions').select('*').eq('user_id', userId).in('worksheet_id', wsList),
      ]);

      if (instrRes.error) {
        console.error('Error loading instructor:', instrRes.error);
        setLoadError('Failed to load the instructor profile: ' + instrRes.error.message);
        setLoading(false);
        return;
      }
      setInstructor(instrRes.data ? (instrRes.data as unknown as UserProfile) : null);

      if (wsRes.error) {
        console.error('Error loading submissions:', wsRes.error);
        setLoadError('Failed to load worksheet submissions for this phase: ' + wsRes.error.message);
        setLoading(false);
        return;
      }
      setSubmissions(wsRes.data ? (wsRes.data as unknown as WorksheetSubmission[]) : []);
    } catch (err) {
      console.error('Failed to load phase review data:', err);
      setLoadError(err instanceof Error ? err.message : 'Failed to load phase review data.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, JSON.stringify(wsList)]);

  useEffect(() => {
    if (userId && phaseNum) loadData();
  }, [userId, phaseNum, loadData]);

  async function handleApprovePhase() {
    setActionLoading(true);
    setActionMessage('');

    // Get all buddy_approved sheets that need upgrading
    const toApprove = submissions.filter(s => s.review_status === REVIEW_STATUS.BUDDY_APPROVED);
    if (toApprove.length === 0) {
      setActionMessage('No worksheets to approve in this phase.');
      setActionLoading(false);
      return;
    }

    const nowIso = new Date().toISOString();
    const reviewerName = profile?.full_name || profile?.email || 'Manager';
    const ids = toApprove.map(s => s.id);

    // ── Atomic bulk approve ──
    // A single UPDATE across all matching row ids replaces the old per-row loop:
    // Postgres applies it as one statement (all-or-nothing on error), and the
    // extra .eq('review_status', REVIEW_STATUS.BUDDY_APPROVED) re-checks each row's state at
    // write time so a worksheet that changed concurrently is simply excluded
    // rather than silently overwritten. review_history is appended server-side
    // by the BEFORE UPDATE trigger for each affected row.
    const { data: rows, error } = await supabase
      .from('worksheet_submissions')
      .update({
        review_status: REVIEW_STATUS.APPROVED,
        reviewed_by: profile?.id,
        reviewed_at: nowIso,
        reviewer_name: reviewerName,
        review_comment: `Phase ${phaseNumber} approved by manager`,
      })
      .in('id', ids)
      .eq('review_status', REVIEW_STATUS.BUDDY_APPROVED)
      .select();

    if (error) {
      console.error('Failed to approve phase:', error);
      setActionMessage('Error: ' + error.message);
      showToast('Failed to approve phase: ' + error.message, 'error');
      setActionLoading(false);
      return;
    }

    const updatedCount = rows ? rows.length : 0;

    if (updatedCount < toApprove.length) {
      setActionMessage(`⚠️ Only ${updatedCount} of ${toApprove.length} worksheet(s) were approved — the rest changed state since you loaded this page (approved or requested for revision by someone else). Reloading the latest state…`);
      showToast(`Partial approval: ${updatedCount}/${toApprove.length} worksheet(s) approved. Refreshing…`, 'error');
      setActionLoading(false);
      reloadTimerRef.current = setTimeout(() => { loadData(); }, 1500);
      return;
    }

    showToast(`Phase ${phaseNumber} approved! ${updatedCount} worksheet(s) marked as approved.`, 'success');
    setActionMessage(`✅ Phase ${phaseNumber} approved! ${updatedCount} worksheet(s) marked as approved.`);

    // Check if all phases are now complete → auto-promote
    const result = await checkAndPromote(userId || '');
    if (result.promoted) {
      showToast(`Phase ${phaseNumber} approved! 🎉 ${result.message}`, 'success');
      setActionMessage(`✅ Phase ${phaseNumber} approved! ${updatedCount} worksheet(s) marked as approved. 🎉 ${result.message}`);
    }

    // Reload data to show updated state
    reloadTimerRef.current = setTimeout(() => {
      loadData();
    }, 1500);

    setActionLoading(false);
  }

  // ── Manager rejection path (H28): send an individual buddy-approved
  // worksheet back for revision, right from the phase list. ──
  async function handleRequestRevision(sub: WorksheetSubmission) {
    const commentText = (revisionDrafts[sub.worksheet_id] || '').trim();
    if (!commentText) {
      setRevisionMessages(prev => ({ ...prev, [sub.worksheet_id]: 'Please add a comment explaining what needs revision.' }));
      return;
    }

    setRevisionLoadingId(sub.worksheet_id);
    setRevisionMessages(prev => ({ ...prev, [sub.worksheet_id]: '' }));
    const nowIso = new Date().toISOString();
    const reviewerName = profile?.full_name || profile?.email || 'Manager';

    const { data: rows, error } = await supabase
      .from('worksheet_submissions')
      .update({
        review_status: REVIEW_STATUS.NEEDS_REVISION,
        reviewed_by: profile?.id,
        reviewed_at: nowIso,
        reviewer_name: reviewerName,
        review_comment: commentText,
      })
      .eq('id', sub.id)
      .eq('review_status', REVIEW_STATUS.BUDDY_APPROVED)
      .select();

    if (error) {
      console.error(`Failed to request revision for ${sub.worksheet_id}:`, error);
      setRevisionMessages(prev => ({ ...prev, [sub.worksheet_id]: 'Error: ' + error.message }));
      setRevisionLoadingId(null);
      return;
    }

    if (!rows || rows.length === 0) {
      setRevisionMessages(prev => ({ ...prev, [sub.worksheet_id]: 'This worksheet changed since you loaded it. Reloading…' }));
      setRevisionLoadingId(null);
      await loadData();
      return;
    }

    showToast(`Revision requested for ${WORKSHEET_INFO[sub.worksheet_id]?.title || sub.worksheet_id}.`, 'success');
    setRevisionDrafts(prev => ({ ...prev, [sub.worksheet_id]: '' }));
    setRevisionLoadingId(null);
    await loadData();
  }

  const buddyApproved = submissions.filter(s => s.review_status === REVIEW_STATUS.BUDDY_APPROVED);
  const alreadyApproved = submissions.filter(s => s.review_status === REVIEW_STATUS.APPROVED);
  const pending = submissions.filter(s => s.review_status === REVIEW_STATUS.PENDING_REVIEW || s.review_status === REVIEW_STATUS.REVISION_SUBMITTED);
  const needsRevision = submissions.filter(s => s.review_status === REVIEW_STATUS.NEEDS_REVISION);
  const notSubmitted = wsList.filter(id => !submissions.find(s => s.worksheet_id === id));
  const isAllBuddyApproved = buddyApproved.length > 0 && pending.length === 0;
  const canApprove = isManager && isAllBuddyApproved;

  // Auto-expand ALL buddy-approved worksheets when manager can approve the phase
  useEffect(() => {
    if (!loading && canApprove) {
      setExpandedSheet('all');
    }
  }, [loading, canApprove]);

  if (loading) {
    return (
      <div className="lux-section">
        <div className="lux-container" style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.5rem' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ width: '60%', height: '1.5rem', background: 'var(--color-taupe)' }} />
            <div style={{ width: '40%', height: '0.8rem', background: 'var(--color-taupe)' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1px', marginTop: '1rem' }}>
              {[1, 2, 3, 4].map(i => (
                <div key={i} style={{ background: 'var(--color-alabaster)', padding: '1rem', textAlign: 'center' }}>
                  <div style={{ width: '40%', height: '1.25rem', background: 'var(--color-taupe)', margin: '0 auto 0.5rem' }} />
                  <div style={{ width: '60%', height: '0.55rem', background: 'var(--color-taupe)', margin: '0 auto' }} />
                </div>
              ))}
            </div>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ borderBottom: '1px solid rgba(26, 26, 26, 0.06)', padding: '1rem 0' }}>
                <div style={{ width: '50%', height: '0.85rem', background: 'var(--color-taupe)', marginBottom: '0.5rem' }} />
                <div style={{ width: '30%', height: '0.55rem', background: 'var(--color-taupe)' }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="lux-section" style={{ textAlign: 'center' }}>
        <div className="lux-container">
          <h2 style={{ fontFamily: t.heading, fontSize: '1.75rem', color: t.error }}>Couldn't Load Phase Review</h2>
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, margin: '1rem 0 1.5rem' }}>{loadError}</p>
          <button onClick={() => loadData()} className="lux-btn lux-btn-primary" style={{ marginRight: '0.75rem' }}>
            <span className="gold-overlay" /><span className="btn-content"><RefreshCw size={14} strokeWidth={1.5} /> Retry</span>
          </button>
          <button onClick={() => navigate(-1)} className="lux-btn lux-btn-secondary">Back</button>
        </div>
      </div>
    );
  }

  if (!instructor) {
    return (
      <div className="lux-section" style={{ textAlign: 'center' }}>
        <div className="lux-container">
          <h2 style={{ fontFamily: t.heading, fontSize: '1.75rem', color: t.ch }}>User Not Found</h2>
          <button onClick={() => navigate(-1)} className="lux-btn lux-btn-secondary" style={{ marginTop: '1rem' }}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '900px', margin: '0 auto' }}>
        <button onClick={() => navigate(-1)} className="lux-btn lux-btn-ghost" style={{ marginBottom: '1rem' }}>
          <ArrowLeft size={14} strokeWidth={1.5} /> Back to Dashboard
        </button>

        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.5rem' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
            <div style={{ width: '48px', height: '48px', border: '1px solid var(--color-charcoal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: t.body, fontSize: '1.1rem', fontWeight: 500, color: t.ch }}>
              {instructor.full_name?.charAt(0) || '?'}
            </div>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '4px' }}>
                {phaseLabel.title}
              </h1>
              <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>
                <User size={12} strokeWidth={1.5} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                {instructor.full_name} · {phaseLabel.days}
              </p>

              {isOnboardingLead && (
                <div style={{ marginTop: '8px', padding: '8px 12px', background: 'rgba(3, 105, 161, 0.06)', border: '1px solid #7DD3FC', fontFamily: t.body, fontSize: '0.7rem', color: t.info }}>
                  🔍 Read-only monitoring view — Onboarding Leads cannot approve phases.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Phase Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1px', background: 'rgba(26, 26, 26, 0.1)', marginBottom: '2rem' }}>
          <SummaryCard label="Buddy Approved" value={buddyApproved.length} color={t.purple} icon={Shield} />
          <SummaryCard label="Already Approved" value={alreadyApproved.length} color={t.success} icon={CheckCircle2} />
          <SummaryCard label="Pending Review" value={pending.length} color="#D4AF37" icon={Clock} />
          {needsRevision.length > 0 && <SummaryCard label="Needs Revision" value={needsRevision.length} color={t.warning} />}
          {notSubmitted.length > 0 && <SummaryCard label="Not Started" value={notSubmitted.length} color={t.wg} />}
        </div>

        {/* Approve Phase Button */}
        {canApprove && (
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ padding: '1.5rem', border: '2px solid ' + t.purple, background: 'rgba(56, 30, 114, 0.03)' }}>
              <Shield size={32} strokeWidth={1.5} style={{ color: t.purple, marginBottom: '0.75rem' }} />
              <h3 style={{ fontFamily: t.heading, fontSize: '1.25rem', fontWeight: 400, color: t.ch, marginBottom: '0.5rem' }}>
                Phase {phaseNumber} Ready for Manager Approval
              </h3>
              <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg, marginBottom: '1rem' }}>
                All {buddyApproved.length} worksheet(s) in this phase have been buddy-approved. Approving will mark all worksheets in this phase as fully approved.
              </p>
              <button onClick={handleApprovePhase} disabled={actionLoading}
                className="lux-btn lux-btn-primary" style={{ minWidth: '250px' }}>
                <span className="gold-overlay" /><span className="btn-content">
                  {actionLoading ? 'Processing…' : <><ThumbsUp size={16} strokeWidth={1.5} /> Approve Phase {phaseNumber}</>}
                </span>
              </button>
              {actionMessage && (
                <p style={{ fontFamily: t.body, fontSize: '0.75rem', color: actionMessage.includes('✅') ? t.success : t.error, marginTop: '0.75rem' }}>
                  {actionMessage}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Worksheets in Phase */}
        <div style={{ borderTop: '2px solid var(--color-charcoal)', paddingTop: '1.5rem' }}>
          <h3 style={{ fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg, marginBottom: '1rem' }}>
            All Phase Worksheets ({wsList.length})
          </h3>
          {wsList.map((wsId, idx) => {
            const sub = submissions.find(s => s.worksheet_id === wsId);
            const status = sub?.review_status || 'not_started';
            const data = sub?.worksheet_data || {};
            const info = WORKSHEET_INFO[wsId] || { title: wsId, phase: '' };
            const isExpanded = expandedSheet === wsId;
            const canRequestRevision = isManager && status === REVIEW_STATUS.BUDDY_APPROVED && !!sub;

            const statusColors: Record<string, string> = {
              [REVIEW_STATUS.APPROVED]: t.success,
              [REVIEW_STATUS.BUDDY_APPROVED]: t.purple,
              [REVIEW_STATUS.PENDING_REVIEW]: t.gd,
              [REVIEW_STATUS.REVISION_SUBMITTED]: t.pending,
              [REVIEW_STATUS.NEEDS_REVISION]: t.warning,
            };
            const statusLabels: Record<string, string> = {
              [REVIEW_STATUS.APPROVED]: 'Approved (Manager)',
              [REVIEW_STATUS.BUDDY_APPROVED]: 'Buddy Approved',
              [REVIEW_STATUS.PENDING_REVIEW]: 'Pending Buddy Review',
              [REVIEW_STATUS.REVISION_SUBMITTED]: 'Re-submitted',
              [REVIEW_STATUS.NEEDS_REVISION]: 'Needs Revision',
              not_started: 'Not Started',
            };

            return (
              <div key={wsId} style={{
                borderBottom: '1px solid rgba(26, 26, 26, 0.06)', padding: '1rem 0',
                opacity: 0, animation: `luxFadeIn 0.4s ${idx * 0.04}s forwards`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: t.body, fontSize: '0.85rem', fontWeight: 500, color: t.ch }}>
                        {info.title}
                      </span>
                      <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid ' + (statusColors[status] || t.wg), color: statusColors[status] || t.wg }}>
                        {statusLabels[status] || status}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => setExpandedSheet(isExpanded ? null : wsId)}
                    style={{ fontFamily: t.body, fontSize: '0.6rem', padding: '4px 12px', border: '1px solid ' + t.ch, background: 'transparent', cursor: 'pointer', color: t.ch }}>
                    <Eye size={12} strokeWidth={1.5} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                    {isExpanded ? 'Hide' : 'View'}
                  </button>
                </div>
                {(isExpanded || expandedSheet === 'all') && data && Object.keys(data).length > 0 && (
                  <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(26, 26, 26, 0.02)', border: '1px solid rgba(26, 26, 26, 0.08)' }}>
                    <ReviewContent data={data as Record<string, unknown>} worksheetId={wsId} />
                  </div>
                )}

                {/* Manager rejection path (H28) — per-worksheet Request Revision */}
                {canRequestRevision && (
                  <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(196, 30, 30, 0.03)', border: '1px solid rgba(196, 30, 30, 0.15)' }}>
                    <label className="lux-label" htmlFor={`revision-comment-${wsId}`} style={{ fontSize: '0.6rem' }}>
                      Request Revision <span style={{ fontFamily: t.body, fontWeight: 400, color: t.wg }}>(comment required)</span>
                    </label>
                    <textarea id={`revision-comment-${wsId}`} className="lux-textarea" rows={2}
                      value={revisionDrafts[wsId] || ''}
                      onChange={e => setRevisionDrafts(prev => ({ ...prev, [wsId]: e.target.value }))}
                      placeholder="What needs to change before this can be approved?"
                      style={{ marginBottom: '0.5rem' }} />
                    {revisionMessages[wsId] && (
                      <div className={`lux-alert ${revisionMessages[wsId].includes('Error') ? 'lux-alert-error' : 'lux-alert-success'}`} style={{ marginBottom: '0.5rem' }}>
                        <AlertCircle size={14} strokeWidth={1.5} />
                        <span>{revisionMessages[wsId]}</span>
                      </div>
                    )}
                    <button onClick={() => handleRequestRevision(sub!)} disabled={revisionLoadingId === wsId}
                      className="lux-btn lux-btn-secondary" style={{ borderColor: t.error, color: t.error, fontSize: '0.7rem' }}>
                      {revisionLoadingId === wsId ? 'Processing…' : <><ThumbsDown size={14} strokeWidth={1.5} /> Request Revision</>}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
