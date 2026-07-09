import { BookOpen, Layers, FileEdit, Mic, Shield, ClipboardCheck, Eye, CheckCircle2, type LucideIcon } from 'lucide-react';
import { supabase } from '../api/supabase';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import { t } from '../config/theme';
import { WEEK_LABELS, ENGINE_TAG_INFO, ENGINE_TAG_COLORS } from '../config/worksheetConfigData';
import PhaseWorksheetList from '../components/PhaseWorksheetList';

interface WorksheetMeta { id: string; num: number; path: string; title: string; icon: LucideIcon; desc: string; }
interface StatusInfo { status: string | null; review_status: string | null; }

const weekNum = 2;
const weekLabel = WEEK_LABELS[weekNum]!;

const worksheets: WorksheetMeta[] = [
  { id: 'p2_w3', num: 1, path: '/week-2/worksheet/p2_w3', title: 'Question Creation Mechanics', icon: FileEdit, desc: 'MCQ, coding, components, playgrounds — how to build them.' },
  { id: 'p1_w7', num: 2, path: '/week-2/worksheet/p1_w7', title: 'The Quality Standard', icon: ClipboardCheck, desc: 'Solved-by-creator, peer review, silent vs loud errors.' },
  { id: 'p1_w6', num: 3, path: '/week-2/worksheet/p1_w6', title: 'Recorded Lectures — TLAC Lens', icon: Eye, desc: '2 more recorded lectures, technique-spotting with TLAC 3.0.' },
  { id: 'w2_e1', num: 4, path: '/week-2/worksheet/w2_e1', title: "Bloom's Two-Pens Session", icon: Layers, desc: 'Tag real past questions using Bloom\'s Taxonomy v4.' },
  { id: 'w2_c3', num: 5, path: '/week-2/worksheet/w2_c3', title: 'Create & Peer Review', icon: FileEdit, desc: '3 MCQs + 2 coding questions; review a peer\'s set.' },
  { id: 'w2_d2', num: 6, path: '/week-2/worksheet/w2_d2', title: 'Micro-Teach #1', icon: Mic, desc: '10-minute segment to 3 peers — rubric-lite feedback.' },
  { id: 'w2_b1', num: 7, path: '/week-2/worksheet/w2_b1', title: 'Discipline Consistency', icon: Shield, desc: 'Customise your classroom discipline approach.' },
  { id: 'w2_o1', num: 8, path: '/week-2/worksheet/w2_o1', title: 'Invigilation & Exam Formalities', icon: ClipboardCheck, desc: 'Policy walkthrough plus scenario sheet.' },
  { id: 'w2_g1', num: 9, path: '/week-2/worksheet/w2_g1', title: 'Gate 2 — Co-create Artifacts', icon: Shield, desc: 'Q set, peer reviews, Bloom\'s tagging, discipline sheet.' },
];

export default function Week2() {
  const { user } = useAuth();
  const [statuses, setStatuses] = useState<Record<string, StatusInfo>>({});

  useEffect(() => { if (user) loadStatuses(); }, [user]);

  async function loadStatuses() {
    const { data } = await supabase.from('worksheet_submissions').select('worksheet_id, status, review_status').eq('user_id', user?.id);
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
        <div style={{ marginBottom: '3rem' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.5rem' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ width: '48px', height: '48px', border: '1px solid var(--color-charcoal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <BookOpen size={22} strokeWidth={1.5} style={{ color: t.ch }} />
            </div>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontFamily: t.heading, fontSize: '2rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '4px' }}>
                Week 2: <em style={{ fontStyle: 'italic', color: t.gd }}>{weekLabel.title}</em>
              </h1>
              <span style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.wg, letterSpacing: '0.05em' }}>{weekLabel.subtitle} — 9 worksheets</span>
            </div>
          </div>
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, lineHeight: 1.6, marginTop: '1rem', maxWidth: '600px' }}>{weekLabel.theme}</p>
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
          <span style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.25em', textTransform: 'uppercase', color: t.wg, display: 'block', marginBottom: '0.75rem' }}>Engine Tags</span>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {(['K', 'B'] as const).map(tag => {
              const info = ENGINE_TAG_INFO[tag];
              const colors = ENGINE_TAG_COLORS[tag];
              return (
                <span key={tag} style={{ fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.1em', padding: '4px 12px', border: '1px solid ' + colors.border, background: colors.bg, color: colors.color }}>
                  {tag}: {info.label}
                </span>
              );
            })}
          </div>
        </div>

        <PhaseWorksheetList worksheets={worksheets} statuses={statuses} />
      </div>
    </div>
  );
}
