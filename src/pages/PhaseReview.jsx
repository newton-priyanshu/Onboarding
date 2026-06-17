import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../api/supabase';
import { CheckCircle2, ArrowLeft, Shield, User, Clock, Eye, ThumbsUp } from 'lucide-react';
import { WORKSHEET_REVIEWER, REVIEWER_LABELS, REVIEWER_STYLES, PHASE_WORKSHEETS_MAP, getBuddyApprovedSheets } from '../config/worksheetConfig.jsx';
import ReviewContent from '../components/ReviewContent.jsx';
import { triggerNotification, getReviewerUserIds, getAssignedReviewerIds } from '../hooks/useNotifications';
import { checkAndPromote } from '../hooks/useAutoPromote';

const WORKSHEET_NAMES = {
  p1_w1: 'Team Introduction', p1_w2: 'Faculty Mentor Sync', p1_w3: 'Teaching Philosophy',
  p1_w4: 'University Governance', p1_w5: 'Portal Walkthrough', p1_w6: 'Observation Journal',
  p1_w7: 'Courseware Review', p1_w8: 'Slack Audit', gc1: 'Gate Control 1',
  p2_w1: 'Doubt Resolution', p2_w2: 'Lab Scorecard', p2_w3: 'Content Ledger',
  p2_w4: 'Portal Ops Check', gc2: 'Gate Control 2',
  p3_w1: 'Lecture Delivery', p3_w2: 'Cohort Profiling', p3_w3: 'Assessment Blueprint',
  p3_w4: 'Pedagogical Journal', p3_w5: 'Course Proposal', gc3: 'Gate Control 3',
};

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

const PHASE_LABELS = {
  1: { title: 'Phase 1 — Orientation', days: 'Days 1–30' },
  2: { title: 'Phase 2 — Contribution', days: 'Days 31–60' },
  3: { title: 'Phase 3 — Ownership', days: 'Days 61–90' },
};

const t = {
  body: 'var(--font-body)', heading: 'var(--font-heading)',
  ch: 'var(--color-charcoal)', wg: 'var(--color-warm-grey)', gd: 'var(--color-gold)',
  ease: 'var(--ease-lux)',
};

export default function PhaseReview() {
  const { userId, phaseNum } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [instructor, setInstructor] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [expandedSheet, setExpandedSheet] = useState(null);

  const phaseNumber = parseInt(phaseNum, 10);
  const isManager = profile?.role === 'academic_head';
  const isOnboardingLead = profile?.role === 'onboarding_lead';
  const wsList = PHASE_WORKSHEETS_MAP[phaseNumber] || [];
  const phaseLabel = PHASE_LABELS[phaseNumber] || { title: `Phase ${phaseNumber}`, days: '' };

  useEffect(() => {
    if (userId && phaseNum) loadData();
  }, [userId, phaseNum]);

  async function loadData() {
    setLoading(true);
    try {
      const [instrRes, wsRes] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('worksheet_submissions').select('*').eq('user_id', userId).in('worksheet_id', wsList),
      ]);
      if (instrRes.data) setInstructor(instrRes.data);
      if (wsRes.data) setSubmissions(wsRes.data);
    } catch (err) {
      console.error('Failed to load phase review data:', err);
    }
    setLoading(false);
  }

  async function handleApprovePhase() {
    setActionLoading(true);
    setActionMessage('');

    // Get all buddy_approved sheets that need upgrading
    const toApprove = submissions.filter(s => s.review_status === 'buddy_approved');
    if (toApprove.length === 0) {
      setActionMessage('No worksheets to approve in this phase.');
      setActionLoading(false);
      return;
    }

    const historyEntry = {
      action: 'phase_approved',
      reviewer_name: profile?.full_name || profile?.email || 'Manager',
      reviewer_id: profile?.id,
      comment: `Phase ${phaseNumber} fully approved by manager.`,
      timestamp: new Date().toISOString(),
    };

    let allSucceeded = true;
    let approvedNames = [];

    for (const sub of toApprove) {
      const existingHistory = sub.review_history || [];
      const { error } = await supabase
        .from('worksheet_submissions')
        .update({
          review_status: 'approved',
          reviewed_by: profile?.id,
          reviewed_at: new Date().toISOString(),
          reviewer_name: profile?.full_name || profile?.email || 'Manager',
          review_comment: `Phase ${phaseNumber} approved by manager`,
          review_history: [...existingHistory, historyEntry],
        })
        .eq('id', sub.id);

      if (error) {
        console.error(`Failed to approve ${sub.worksheet_id}:`, error);
        allSucceeded = false;
      } else {
        approvedNames.push(sub.worksheet_id);
        // Notify joinee for each approved worksheet
        await triggerNotification({
          userId,
          fromUserId: profile?.id,
          worksheetId: sub.worksheet_id,
          type: 'approved',
          message: `Your worksheet (${sub.worksheet_id}) has been fully approved by the manager (${profile?.full_name || 'Manager'}). Phase ${phaseNumber} complete!`,
        });
      }
    }

    if (allSucceeded) {
      setActionMessage(`✅ Phase ${phaseNumber} approved! ${approvedNames.length} worksheet(s) marked as approved.`);

      // Notify the ASSIGNED buddy that the phase has been manager-approved
      let buddyIds = await getAssignedReviewerIds(userId, 'buddy');
      // Fallback to all buddies if no assigned buddy found
      if (buddyIds.length === 0) {
        buddyIds = await getReviewerUserIds('buddy');
      }
      for (const buddyId of buddyIds) {
        await triggerNotification({
          userId: buddyId,
          fromUserId: profile?.id,
          worksheetId: wsList[0], // reference the first sheet in the phase
          type: 'approved',
          message: `Phase ${phaseNumber} for ${instructor?.full_name || 'joinee'} has been approved by the manager.`,
        });
      }

      // Check if all phases are now complete → auto-promote
      const result = await checkAndPromote(userId);
      if (result.promoted) {
        setActionMessage(`✅ Phase ${phaseNumber} approved! ${approvedNames.length} worksheet(s) marked as approved. 🎉 ${result.message}`);
      }

      // Reload data to show updated state
      setTimeout(() => {
        loadData();
      }, 1500);
    } else {
      setActionMessage(`⚠️ Some worksheets could not be approved. Check console for details.`);
    }

    setActionLoading(false);
  }

  const buddyApproved = submissions.filter(s => s.review_status === 'buddy_approved');
  const alreadyApproved = submissions.filter(s => s.review_status === 'approved');
  const pending = submissions.filter(s => s.review_status === 'pending_review' || s.review_status === 'revision_submitted');
  const needsRevision = submissions.filter(s => s.review_status === 'needs_revision');
  const notSubmitted = wsList.filter(id => !submissions.find(s => s.worksheet_id === id));

  if (loading) {
    return (
      <div className="lux-section">
        <div className="lux-container" style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.5rem' }} />
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, textAlign: 'center', padding: '2rem' }}>Loading phase review...</p>
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

  const canApprove = isManager && buddyApproved.length > 0 && pending.length === 0;

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
                <div style={{ marginTop: '8px', padding: '8px 12px', background: 'rgba(3, 105, 161, 0.06)', border: '1px solid #7DD3FC', fontFamily: t.body, fontSize: '0.7rem', color: '#0369A1' }}>
                  🔍 Read-only monitoring view — Onboarding Leads cannot approve phases.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Phase Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1px', background: 'rgba(26, 26, 26, 0.1)', marginBottom: '2rem' }}>
          <SummaryCard label="Buddy Approved" value={buddyApproved.length} color="#381E72" icon={Shield} />
          <SummaryCard label="Already Approved" value={alreadyApproved.length} color="#1B5E20" icon={CheckCircle2} />
          <SummaryCard label="Pending Review" value={pending.length} color="#D4AF37" icon={Clock} />
          <SummaryCard label="Needs Revision" value={needsRevision.length} color="#C62828" />
          <SummaryCard label="Not Started" value={notSubmitted.length} color={t.wg} />
        </div>

        {/* Approve Phase Button */}
        {canApprove && (
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ padding: '1.5rem', border: '2px solid #381E72', background: 'rgba(56, 30, 114, 0.03)' }}>
              <Shield size={32} strokeWidth={1.5} style={{ color: '#381E72', marginBottom: '0.75rem' }} />
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
                <p style={{ fontFamily: t.body, fontSize: '0.75rem', color: actionMessage.includes('✅') ? '#1B5E20' : '#C62828', marginTop: '0.75rem' }}>
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
            const info = WORKSHEET_INFO[wsId] || { title: wsId };
            const isExpanded = expandedSheet === wsId;

            const statusColors = {
              approved: '#1B5E20',
              buddy_approved: '#381E72',
              pending_review: '#D4AF37',
              revision_submitted: '#7D5260',
              needs_revision: '#C62828',
            };
            const statusLabels = {
              approved: 'Approved (Manager)',
              buddy_approved: 'Buddy Approved',
              pending_review: 'Pending Buddy Review',
              revision_submitted: 'Re-submitted',
              needs_revision: 'Needs Revision',
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
                {isExpanded && data && Object.keys(data).length > 0 && (
                  <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(26, 26, 26, 0.02)', border: '1px solid rgba(26, 26, 26, 0.08)' }}>
                    <ReviewContent data={data} worksheetId={wsId} />
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

function SummaryCard({ label, value, color, icon: Icon }) {
  return (
    <div style={{ background: 'var(--color-alabaster)', padding: '1rem', textAlign: 'center' }}>
      {Icon && <Icon size={18} strokeWidth={1.5} style={{ color, marginBottom: '4px' }} />}
      <p style={{ fontFamily: t.heading, fontSize: '1.25rem', fontWeight: 400, color: t.ch }}>{value}</p>
      <p style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.wg }}>{label}</p>
    </div>
  );
}
