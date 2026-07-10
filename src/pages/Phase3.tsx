import { useNavigate } from 'react-router-dom';
import { BookOpen, BookText, Users, FileText, ClipboardCheck, Lock, CheckCircle2, type LucideIcon } from 'lucide-react';
import { supabase } from '../api/supabase';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import { t } from '../config/theme';
import { REVIEWER_LABELS, REVIEWER_STYLES, canAccessPhase, type WorksheetSubmission } from '../config/worksheetConfig';
import PhaseWorksheetList from '../components/PhaseWorksheetList';
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

const worksheets: WorksheetMeta[] = [
  { id: 'p3_w1', num: 1, path: '/phase-3/worksheet-1', title: 'Independent Lecture Delivery Log & Pacing Post-Mortem', icon: BookText, desc: 'Document 2+ independent lectures with post-mortem analysis.' },
  { id: 'p3_w2', num: 2, path: '/phase-3/worksheet-2', title: 'Student Cohort Profiling & High/Low Performer Mapping', icon: Users, desc: 'Map high performers and at-risk students.' },
  { id: 'p3_w3', num: 3, path: '/phase-3/worksheet-3', title: 'Assessment Design Blueprint & Bloom\'s Taxonomy Grid', icon: FileText, desc: 'Design assessments mapped to Bloom\'s Taxonomy.' },
  { id: 'p3_w4', num: 4, path: '/phase-3/worksheet-4', title: 'Pedagogical Frameworks Application Journal', icon: BookOpen, desc: 'Document real classroom examples of pedagogical techniques.' },
  { id: 'p3_w5', num: 5, path: '/phase-3/worksheet-5', title: 'Continuous Course Improvement Proposal', icon: ClipboardCheck, desc: 'Capstone project — propose a course improvement with evidence.' },
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

export default function Phase3() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [statuses, setStatuses] = useState<Record<string, StatusInfo>>({});
  const [allSubmissions, setAllSubmissions] = useState<WorksheetSubmission[]>([]);
  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    if (user) (async () => {
      try {
        const { data } = await supabase.from('worksheet_submissions').select('worksheet_id, status, review_status').eq('user_id', user.id);
        if (data) {
          const subs = data.map(s => ({ ...s, user_id: user.id })) as unknown as WorksheetSubmission[];
          setAllSubmissions(subs);
          const m: Record<string, StatusInfo> = {};
          data.forEach(s => { m[s.worksheet_id] = { status: s.status, review_status: s.review_status }; });
          setStatuses(m);
        }
      } catch (err) {
        console.error('Failed to load Phase 3 submissions:', err);
      } finally {
        setCheckingAccess(false);
      }
    })();
  }, [user]);

  if (!checkingAccess && !canAccessPhase(user?.id || '', 3, allSubmissions)) {
    return <PhaseLockedView phaseNum={3} previousPhaseNum={2} navigate={navigate} />;
  }

  const completed = countCompleted(worksheets.map(w => w.id), statuses);

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
                Phase 3: <em style={{ fontStyle: 'italic', color: t.gd }}>Ownership</em>
              </h1>
              <span style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.wg, letterSpacing: '0.05em' }}>Days 61–90 — 5 worksheets</span>
            </div>
          </div>
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, lineHeight: 1.6, marginTop: '1rem', maxWidth: '600px' }}>
            Teach independently, design assessments, and propose course improvements.
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
