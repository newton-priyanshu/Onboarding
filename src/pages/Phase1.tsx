import { BookOpen, Users, MessageSquare, BookText, FileText, Eye, Monitor, MessageCircle, Shield, CheckCircle2, type LucideIcon } from 'lucide-react';
import { supabase } from '../api/supabase';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import { t } from '../config/theme';
import { REVIEWER_LABELS, REVIEWER_STYLES } from '../config/worksheetConfig';
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

const worksheets: WorksheetMeta[] = [
  { id: 'p1_w1', num: 1, path: '/phase-1/worksheet-1', title: 'Team Introduction & Stakeholder Mapping Log', icon: Users, desc: 'Meet key people across teams and understand how they collaborate.' },
  { id: 'p1_w2', num: 2, path: '/phase-1/worksheet-2', title: 'Faculty Mentor Alignment & Weekly Sync Tracker', icon: MessageSquare, desc: 'Align with your mentor, document weekly syncs, and track feedback patterns.' },
  { id: 'p1_w3', num: 3, path: '/phase-1/worksheet-3', title: 'Organizational Culture & Teaching Philosophy Reflection', icon: BookText, desc: 'Reflect on the culture, teaching beliefs, and your evolving philosophy.' },
  { id: 'p1_w4', num: 4, path: '/phase-1/worksheet-4', title: 'Partner University Governance & Semester Architecture Map', icon: Shield, desc: 'Understand university policies, semester flow, and escalation paths.' },
  { id: 'p1_w5', num: 5, path: '/phase-1/worksheet-5', title: 'Core Learning Portal Practical Walkthrough & Verification', icon: Monitor, desc: 'Walk through the portal from student and faculty views with scenario challenges.' },
  { id: 'p1_w6', num: 6, path: '/phase-1/worksheet-6', title: 'Classroom & Laboratory Live Observation Journal', icon: Eye, desc: 'Observe 6 lectures and 4 labs, document methods and engagement.' },
  { id: 'p1_w7', num: 7, path: '/phase-1/worksheet-7', title: 'Existing Courseware & Question Bank Review Matrix', icon: FileText, desc: 'Review PPTs, worksheets, assignments and assessments for quality.' },
  { id: 'p1_w8', num: 8, path: '/phase-1/worksheet-8', title: 'Slack Historical Context & Student Bottleneck Audit', icon: MessageCircle, desc: 'Audit Slack history to identify recurring student pain points.' },
];

export default function Phase1() {
  const { user } = useAuth();
  const [statuses, setStatuses] = useState<Record<string, StatusInfo>>({});

  useEffect(() => {
    if (user) loadStatuses();
  }, [user]);

  async function loadStatuses() {
    const { data } = await supabase
      .from('worksheet_submissions')
      .select('worksheet_id, status, review_status')
      .eq('user_id', user?.id);
    if (data) {
      const map: Record<string, StatusInfo> = {};
      data.forEach(s => { map[s.worksheet_id] = { status: s.status, review_status: s.review_status }; });
      setStatuses(map);
    }
  }

  const completed = worksheets.filter(w => {
    const s = statuses[w.id];
    return s?.status === 'submitted' || s?.review_status === 'approved' || s?.review_status === 'buddy_approved';
  }).length;

  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '900px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '3rem' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.5rem' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ width: '48px', height: '48px', border: '1px solid var(--color-charcoal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <BookOpen size={22} strokeWidth={1.5} style={{ color: t.ch }} />
            </div>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontFamily: t.heading, fontSize: '2rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '4px' }}>
                Phase 1: <em style={{ fontStyle: 'italic', color: t.gd }}>Orientation</em>
              </h1>
              <span style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.wg, letterSpacing: '0.05em' }}>Days 1–30 — 8 worksheets</span>
            </div>
          </div>
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, lineHeight: 1.6, marginTop: '1rem', maxWidth: '600px' }}>
            Build foundational knowledge of people, culture, systems, and processes.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '1.25rem' }}>
            <div className="lux-progress" style={{ flex: 1, maxWidth: '300px' }}>
              <div className="lux-progress-fill lux-progress-fill-gold" style={{ width: `${(completed / (worksheets.length + 1)) * 100}%` }} />
            </div>
            <span style={{ fontFamily: t.body, fontSize: '0.8rem', fontWeight: 500, color: t.ch }}>
              <CheckCircle2 size={14} strokeWidth={1.5} style={{ marginRight: '6px', color: t.gd, verticalAlign: 'middle' }} />
              {completed} / {worksheets.length}
            </span>
          </div>
        </div>

        {/* Reviewer Legend */}
        <div style={{ marginBottom: '2.5rem', borderTop: '1px solid rgba(26, 26, 26, 0.1)', paddingTop: '1.5rem' }}>
          <span style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.25em', textTransform: 'uppercase', color: t.wg, display: 'block', marginBottom: '0.75rem' }}>
            Reviewed by
          </span>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {Object.entries(REVIEWER_LABELS).map(([key, label]) => {
              const style = REVIEWER_STYLES[key as keyof typeof REVIEWER_STYLES];
              if (!style) return null;
              return (
                <span key={key} style={{
                  fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500,
                  letterSpacing: '0.1em',
                  padding: '4px 12px',
                  border: '1px solid ' + style.color,
                  color: style.color,
                }}>
                  {label}
                </span>
              );
            })}
          </div>
        </div>

        {/* Worksheets */}
        <PhaseWorksheetList worksheets={worksheets} statuses={statuses} />
      </div>
    </div>
  );
}
