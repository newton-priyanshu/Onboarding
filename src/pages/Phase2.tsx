import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { MessageSquare, ClipboardCheck, FileText, Monitor, Lock, CheckCircle2, AlertCircle, RefreshCw, ArrowLeft, type LucideIcon } from 'lucide-react';
import { getEstimatedTime } from '../config/estimatedTimes';
import { supabase } from '../api/supabase';
import { unwrap } from '../api/db';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import { t } from '../config/theme';
import { REVIEWER_LABELS, REVIEWER_STYLES, canAccessPhase, getReviewerType, type WorksheetSubmission } from '../config/worksheetConfig';
import { useWorksheetTemplate } from '../hooks/useWorksheetTemplate';
import { countCompleted } from '../utils/worksheetHelpers';

interface WorksheetMeta {
  id: string;
  num: number;
  path: string;
  title: string;
  icon: LucideIcon;
  desc: string;
}

import type { StatusInfo } from '../utils/worksheetHelpers';

interface PhaseLockedViewProps {
  phaseNum: number;
  previousPhaseNum: number;
  navigate: ReturnType<typeof useNavigate>;
}

const phaseLabels: Record<number, string> = { 1: 'Orientation', 2: 'Contribution', 3: 'Ownership' };

const ACCENT = t.gd;

const worksheets: WorksheetMeta[] = [
  { id: 'p2_w1', num: 1, path: '/phase-2/worksheet-1', title: 'Student Doubt Resolution & Common Errors Diagnostic Log', icon: MessageSquare, desc: 'Track 30+ student interactions and identify confusion patterns.' },
  { id: 'p2_w2', num: 2, path: '/phase-2/worksheet-2', title: 'Independent Lab Facilitation Scorecard', icon: ClipboardCheck, desc: 'Document 2+ independent labs with mentor feedback.' },
  { id: 'p2_w3', num: 3, path: '/phase-2/worksheet-3', title: 'Courseware Content Creation Ledger', icon: FileText, desc: 'Track every content contribution — worksheets, MCQs, coding questions.' },
  { id: 'p2_w4', num: 4, path: '/phase-2/worksheet-4', title: 'Advanced Portal Operations & Quiz Configuration Check', icon: Monitor, desc: 'Evidence-based quiz configuration and scenario challenges.' },
];

function PhaseLockedView({ phaseNum, previousPhaseNum, navigate }: PhaseLockedViewProps) {
  return (
    <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="lux-container" style={{ textAlign: 'center', maxWidth: '500px' }}>
        <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
        <div style={{ width: '64px', height: '64px', border: '1px solid var(--color-charcoal)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
          <Lock size={28} strokeWidth={1.5} style={{ color: 'var(--color-warm-grey)' }} />
        </div>
        <h1 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, color: t.ch, marginBottom: '0.75rem' }}>
          Phase {phaseNum}: {phaseLabels[phaseNum]} Locked
        </h1>
        <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, lineHeight: 1.6, marginBottom: '1.5rem' }}>
          Complete and get <strong>all worksheets in Phase {previousPhaseNum}</strong> approved by your manager before accessing Phase {phaseNum}.
          Check your progress on the dashboard.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/')} className="lux-btn lux-btn-primary" style={{ textDecoration: 'none' }}>
            <span className="gold-overlay" /><span className="btn-content">Go to Dashboard</span>
          </button>
          <button onClick={() => navigate('/phase-' + previousPhaseNum)} className="lux-btn lux-btn-secondary">
            Back to Phase {previousPhaseNum}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Phase2() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { template } = useWorksheetTemplate();
  const [statuses, setStatuses] = useState<Record<string, StatusInfo>>({});
  const [allSubmissions, setAllSubmissions] = useState<WorksheetSubmission[]>([]);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadSubmissions();
    // loadSubmissions intentionally omitted: closes over fresh user each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadSubmissions() {
    if (!user) return;
    setCheckingAccess(true);
    setLoadError(null);
    try {
      const data = await supabase.from('worksheet_submissions').select('worksheet_id, status, review_status').eq('user_id', user.id).then(unwrap);
      const subs = data.map(s => ({ ...s, user_id: user.id })) as unknown as WorksheetSubmission[];
      setAllSubmissions(subs);
      const m: Record<string, StatusInfo> = {};
      data.forEach(s => { m[s.worksheet_id] = { status: s.status, review_status: s.review_status }; });
      setStatuses(m);
    } catch (err) {
      console.error('Failed to load Phase 2 submissions:', err);
      // Fail closed: a failed access check must never be treated as "unlocked".
      setLoadError('We could not verify your Phase 2 access. Please check your connection and try again.');
    } finally {
      setCheckingAccess(false);
    }
  }

  if (!checkingAccess && loadError) {
    return (
      <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="lux-container" style={{ textAlign: 'center', maxWidth: '500px' }}>
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <AlertCircle size={32} strokeWidth={1.5} style={{ color: t.error, marginBottom: '1rem' }} />
          <h1 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, color: t.ch, marginBottom: '0.75rem' }}>
            Couldn&apos;t Verify Access
          </h1>
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, lineHeight: 1.6, marginBottom: '1.5rem' }}>{loadError}</p>
          <button onClick={() => loadSubmissions()} className="lux-btn lux-btn-primary">
            <span className="gold-overlay" /><span className="btn-content"><RefreshCw size={14} strokeWidth={1.5} /> Retry</span>
          </button>
        </div>
      </div>
    );
  }

  if (!checkingAccess && !canAccessPhase(user?.id || '', 2, allSubmissions, template)) {
    return <PhaseLockedView phaseNum={2} previousPhaseNum={1} navigate={navigate} />;
  }

  const completed = countCompleted(worksheets.map(w => w.id), statuses);

  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '900px', margin: '0 auto' }}>
        {/* Back link */}
        <Link to="/" style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '6px 12px', marginBottom: '2rem',
          fontFamily: t.body, fontSize: '0.7rem',
          fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
          color: t.wg, textDecoration: 'none',
        }}>
          <ArrowLeft size={14} strokeWidth={1.5} /> Back to Dashboard
        </Link>

        <div className="lux-line" style={{ marginBottom: '1.5rem', borderColor: ACCENT }} />
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '4px 14px', marginBottom: '1rem',
            background: `${ACCENT}14`,
            border: `1px solid ${ACCENT}4D`,
            fontFamily: t.body, fontSize: '0.65rem',
            fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
            color: ACCENT,
          }}>
            Academics
          </div>
          <h1 style={{
            fontFamily: t.heading, fontSize: '2rem', fontWeight: 400,
            letterSpacing: '-0.02em', marginBottom: '0.5rem',
          }}>
            Phase 2: <em style={{ fontStyle: 'italic', color: ACCENT }}>Contribution</em>
          </h1>
          <p style={{ fontFamily: t.body, fontSize: '0.85rem', color: t.wg }}>
            Days 31–60 — Teach, create content, and develop your craft with mentor support.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '1.25rem' }}>
            <div className="lux-progress" style={{ flex: 1, maxWidth: '300px' }}>
              <div className="lux-progress-fill" style={{ width: `${(completed / worksheets.length) * 100}%`, background: ACCENT }} />
            </div>
            <span style={{ fontFamily: t.body, fontSize: '0.8rem', fontWeight: 500, color: t.ch }}>
              <CheckCircle2 size={14} strokeWidth={1.5} style={{ marginRight: '6px', color: ACCENT, verticalAlign: 'middle' }} />
              {completed} / {worksheets.length}
            </span>
          </div>
        </div>

        {/* Reviewer Legend */}
        <div style={{ marginBottom: '2rem', borderTop: '1px solid rgba(26, 26, 26, 0.1)', paddingTop: '1.5rem' }}>
          <span style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.25em', textTransform: 'uppercase', color: t.wg, display: 'block', marginBottom: '0.75rem' }}>
            Reviewed by
          </span>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {Object.entries(REVIEWER_LABELS).map(([key, label]) => {
              const style = REVIEWER_STYLES[key as keyof typeof REVIEWER_STYLES];
              if (!style) return null;
              return (
                <span key={key} style={{ fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.1em', padding: '4px 12px', border: '1px solid ' + style.color, color: style.color }}>{label}</span>
              );
            })}
          </div>
        </div>

        {/* Worksheet cards — progression-style cleaner design */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {worksheets.map((ws, idx) => {
            const wsStatus = statuses[ws.id];
            const statusLabel = wsStatus?.review_status || wsStatus?.status || 'not_started';
            const reviewerType = getReviewerType(ws.id, template);
            const reviewerStyle = REVIEWER_STYLES[reviewerType as keyof typeof REVIEWER_STYLES];
            let statusColor = t.wg;
            if (statusLabel === 'approved') statusColor = t.success;
            else if (statusLabel === 'buddy_approved') statusColor = t.purple;
            else if (statusLabel === 'under_review' || statusLabel === 'pending_review' || statusLabel === 'revision_submitted') statusColor = t.pending;
            else if (statusLabel === 'needs_revision') statusColor = t.warning;
            else if (statusLabel === 'in_progress') statusColor = t.ch;
            const statusDisplay = statusLabel === 'approved' ? 'Reviewed' :
              statusLabel === 'buddy_approved' ? 'Buddy ✓' :
              statusLabel === 'needs_revision' ? 'Revise' :
              statusLabel === 'in_progress' ? 'In Prog.' :
              (statusLabel === 'submitted' || statusLabel === 'under_review' || statusLabel === 'pending_review' || statusLabel === 'revision_submitted') ? 'Submitted' :
              'Not Started';

            return (
              <Link
                key={ws.id}
                to={ws.path}
                style={{
                  display: 'flex', alignItems: 'center', gap: '16px',
                  padding: '16px 20px',
                  border: '1px solid rgba(26, 26, 26, 0.12)',
                  textDecoration: 'none',
                  transition: 'all 200ms var(--ease-lux)',
                  opacity: 0,
                  animation: `luxFadeIn 0.4s ${idx * 0.06}s forwards`,
                }}
                onMouseOver={e => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.background = `${ACCENT}08`; }}
                onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(26, 26, 26, 0.12)'; e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{
                  width: '36px', height: '36px',
                  border: '1px solid rgba(26, 26, 26, 0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <ws.icon size={16} strokeWidth={1.5} style={{ color: t.ch }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontFamily: t.body, fontSize: '0.85rem', fontWeight: 500,
                    color: t.ch, marginBottom: '2px',
                  }}>
                    {ws.title}
                  </p>
                  <p style={{ fontFamily: t.body, fontSize: '0.7rem', color: t.wg, margin: 0 }}>
                    {ws.desc}
                  </p>
                  {getEstimatedTime(ws.id) && (
                    <span style={{ fontSize: '0.6rem', color: t.wg, marginTop: '2px', display: 'inline-block' }}>
                      {getEstimatedTime(ws.id)}
                    </span>
                  )}
                </div>
                {reviewerStyle && (
                  <span style={{
                    fontSize: '0.5rem', fontWeight: 500, letterSpacing: '0.15em',
                    textTransform: 'uppercase', color: reviewerStyle.color,
                    border: '1px solid ' + reviewerStyle.color,
                    padding: '1px 6px',
                    whiteSpace: 'nowrap',
                  }}>
                    {reviewerType === 'buddy' ? 'Buddy' : reviewerType === 'manager' ? 'Manager' : 'Self'}
                  </span>
                )}
                <span style={{ fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', color: statusColor, whiteSpace: 'nowrap' }}>
                  {statusDisplay}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
