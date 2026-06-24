import { useNavigate } from 'react-router-dom';
import { BookOpen, MessageSquare, ClipboardCheck, FileText, Monitor, Lock, CheckCircle2, type LucideIcon } from 'lucide-react';
import { supabase } from '../api/supabase';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import { t } from '../config/theme';
import { REVIEWER_LABELS, REVIEWER_STYLES, canAccessPhase, type WorksheetSubmission } from '../config/worksheetConfig';
import PhaseWorksheetList from '../components/PhaseWorksheetList';

interface WorksheetMeta {
  id: string;
  num: number;
  path: string;
  title: string;
  icon: LucideIcon;
  desc: string;
}

interface StatusInfo {
  status: string | null;
  review_status: string | null;
}

interface PhaseLockedViewProps {
  phaseNum: number;
  previousPhaseNum: number;
  navigate: ReturnType<typeof useNavigate>;
}

const phaseLabels: Record<number, string> = { 1: 'Orientation', 2: 'Contribution', 3: 'Ownership' };

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
  const [statuses, setStatuses] = useState<Record<string, StatusInfo>>({});
  const [allSubmissions, setAllSubmissions] = useState<WorksheetSubmission[]>([]);
  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    if (user) (async () => {
      const { data } = await supabase.from('worksheet_submissions').select('worksheet_id, status, review_status').eq('user_id', user.id);
      if (data) {
        const subs = data.map(s => ({ ...s, user_id: user.id })) as unknown as WorksheetSubmission[];
        setAllSubmissions(subs);
        const m: Record<string, StatusInfo> = {};
        data.forEach(s => { m[s.worksheet_id] = { status: s.status, review_status: s.review_status }; });
        setStatuses(m);
      }
      setCheckingAccess(false);
    })();
  }, [user]);

  if (!checkingAccess && !canAccessPhase(user?.id || '', 2, allSubmissions)) {
    return <PhaseLockedView phaseNum={2} previousPhaseNum={1} navigate={navigate} />;
  }

  const completed = worksheets.filter(w => {
    const s = statuses[w.id];
    return s?.status === 'submitted' || s?.review_status === 'approved' || s?.review_status === 'buddy_approved';
  }).length;

  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ marginBottom: '3rem' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.5rem' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ width: '48px', height: '48px', border: '1px solid var(--color-charcoal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <BookOpen size={22} strokeWidth={1.5} style={{ color: t.ch }} />
            </div>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontFamily: t.heading, fontSize: '2rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '4px' }}>
                Phase 2: <em style={{ fontStyle: 'italic', color: t.gd }}>Contribution</em>
              </h1>
              <span style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.wg, letterSpacing: '0.05em' }}>Days 31–60 — 4 worksheets</span>
            </div>
          </div>
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, lineHeight: 1.6, marginTop: '1rem', maxWidth: '600px' }}>
            Teach, create content, and develop your craft with mentor support.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '1.25rem' }}>
            <div className="lux-progress" style={{ flex: 1, maxWidth: '300px' }}>
              <div className="lux-progress-fill lux-progress-fill-gold" style={{ width: `${(completed / worksheets.length) * 100}%` }} />
            </div>
            <span style={{ fontFamily: t.body, fontSize: '0.8rem', fontWeight: 500, color: t.ch }}>
              <CheckCircle2 size={14} strokeWidth={1.5} style={{ marginRight: '6px', color: t.gd, verticalAlign: 'middle' }} />
              {completed} / {worksheets.length}
            </span>
          </div>
        </div>

        <div style={{ marginBottom: '2.5rem', borderTop: '1px solid rgba(26, 26, 26, 0.1)', paddingTop: '1.5rem' }}>
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

        <PhaseWorksheetList worksheets={worksheets} statuses={statuses} />
      </div>
    </div>
  );
}
