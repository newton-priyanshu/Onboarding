import { BookOpen, Monitor, Eye, BookText, Search, ClipboardList, Shield, CheckCircle2, type LucideIcon } from 'lucide-react';
import { supabase } from '../api/supabase';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import { t } from '../config/theme';
import { WEEK_LABELS, ENGINE_TAG_INFO, ENGINE_TAG_COLORS } from '../config/worksheetConfigData';
import PhaseWorksheetList from '../components/PhaseWorksheetList';

interface WorksheetMeta { id: string; num: number; path: string; title: string; icon: LucideIcon; desc: string; }
interface StatusInfo { status: string | null; review_status: string | null; }

const weekNum = 1;
const weekLabel = WEEK_LABELS[weekNum]!;

const worksheets: WorksheetMeta[] = [
  { id: 'p1_w5', num: 1, path: '/week-1/worksheet/p1_w5', title: 'Systems & Platform Walkthrough', icon: Monitor, desc: 'Product orientation — how the platform works end-to-end.' },
  { id: 'p1_w6', num: 2, path: '/week-1/worksheet/p1_w6', title: 'Structured Observation — Recorded Lectures', icon: Eye, desc: '3 recorded lectures with TLAC-lens observation sheet.' },
  { id: 'p1_w3', num: 3, path: '/week-1/worksheet/p1_w3', title: 'Culture-in-Delivery Opening', icon: BookText, desc: 'What NST believes about teaching — no student left behind.' },
  { id: 'w1_o1', num: 4, path: '/week-1/worksheet/w1_o1', title: 'Day 1 Logistics & Access', icon: ClipboardList, desc: 'Access verification, buddy contact, comms channels.' },
  { id: 'w1_e1', num: 5, path: '/week-1/worksheet/w1_e1', title: 'Contest Guidelines V3 Pre-read', icon: BookText, desc: 'Read Contest Guidelines V3 for W2-E1 receptivity build.' },
  { id: 'w1_o2', num: 6, path: '/week-1/worksheet/w1_o2', title: 'Playbook Scavenger Exercise', icon: Search, desc: 'Find-the-answer sheet across Playbook §1 to §5.' },
  { id: 'w1_g1', num: 7, path: '/week-1/worksheet/w1_g1', title: 'Gate 1 — Anchor Artifacts', icon: Shield, desc: 'Operational check, observation logs, scavenger sheet, reflection #0.' },
];

export default function Week1() {
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
                Week 1: <em style={{ fontStyle: 'italic', color: t.gd }}>{weekLabel.title}</em>
              </h1>
              <span style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.wg, letterSpacing: '0.05em' }}>{weekLabel.subtitle} — 7 worksheets</span>
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
