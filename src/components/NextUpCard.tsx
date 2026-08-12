import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles, Zap } from 'lucide-react';
import { t } from '../config/theme';
import { getWorksheetName, PHASE_WORKSHEETS_MAP } from '../config/worksheetConfig';
import type { OnboardingTemplate } from '../types/supabase';
import { getEstimatedTime } from '../config/estimatedTimes';
import { getWorksheetPath } from '../utils/worksheetHelpers';
import { XP_RULES } from '../config/gamification';
import { getWorksheetStatus as getStatusInfo } from '../utils/worksheetStatus';

// ─── Props ──────────────────────────────────────────────

export interface NextUpWorksheet {
  worksheetId: string;
  phaseNum: number;
}

interface NextUpCardProps {
  /** Worksheet + phase to surface as the next action */
  next: NextUpWorksheet | null;
  submissions: Array<{ worksheet_id: string; review_status: string; status: string }>;
  template?: OnboardingTemplate | null;
  /** Optional extra CTA label (default 'Start Worksheet') */
  cta?: string;
}

/**
 * Picks the next worksheet to work on:
 *   - within the earliest incomplete phase (phase order 1 → 3)
 *   - the first sheet in that phase that isn't approved/buddy-approved
 * Falls back to null when everything is complete.
 */
export function pickNextWorksheet(
  submissions: Array<{ worksheet_id: string; review_status: string; status: string }>,
  phaseMap: Record<number, string[]> = PHASE_WORKSHEETS_MAP,
): NextUpWorksheet | null {
  for (const phaseNum of [1, 2, 3] as const) {
    const wsIds = phaseMap[phaseNum] || [];
    if (wsIds.length === 0) continue;
    const phaseDone = wsIds.every(id => {
      const s = submissions.find(x => x.worksheet_id === id);
      return s && (s.review_status === 'approved' || s.review_status === 'buddy_approved');
    });
    if (phaseDone) continue;
    // First sheet in this phase not yet done
    for (const wsId of wsIds) {
      const s = submissions.find(x => x.worksheet_id === wsId);
      const done = s && (s.review_status === 'approved' || s.review_status === 'buddy_approved');
      if (!done) return { worksheetId: wsId, phaseNum };
    }
  }
  return null;
}

// ─── Component ──────────────────────────────────────────

export default function NextUpCard({ next, submissions, template, cta = 'Start Worksheet' }: NextUpCardProps) {
  if (!next) return null;

  const wsId = next.worksheetId;
  const path = getWorksheetPath(wsId);
  if (!path) return null;

  const ws = getStatusInfo(submissions.find(s => s.worksheet_id === wsId));
  const estTime = getEstimatedTime(wsId);

  return (
    <div
      role="region"
      aria-label="Next worksheet to complete"
      style={{
        marginBottom: '2rem',
        padding: '1.25rem 1.5rem',
        border: '1px solid var(--color-gold)',
        background: 'linear-gradient(90deg, rgba(212, 175, 55, 0.08), rgba(212, 175, 55, 0.02))',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '1rem',
        animation: 'luxFadeIn 0.5s forwards',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', minWidth: '220px' }}>
        <div style={{
          width: '44px', height: '44px', flexShrink: 0,
          border: '1px solid var(--color-gold)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(212, 175, 55, 0.08)',
        }}>
          <Sparkles size={20} strokeWidth={1.5} style={{ color: 'var(--color-gold)' }} />
        </div>
        <div>
          <span style={{
            fontFamily: t.body, fontSize: '0.55rem', fontWeight: 600,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            color: 'var(--color-gold)', display: 'block', marginBottom: '4px',
          }}>
            Next Up · Phase {next.phaseNum}
          </span>
          <span style={{ fontFamily: t.heading, fontSize: '1.05rem', color: t.ch, display: 'block', lineHeight: 1.3 }}>
            {getWorksheetName(wsId, template)}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px', flexWrap: 'wrap' }}>
            {estTime && (
              <span style={{ fontFamily: t.body, fontSize: '0.6rem', color: t.wg }}>
                ⏱ {estTime}
              </span>
            )}
            <span style={{
              fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500,
              color: 'var(--color-gold)', display: 'inline-flex', alignItems: 'center', gap: '4px',
            }}>
              <Zap size={11} strokeWidth={2} /> +{XP_RULES.submit} XP on submit
            </span>
            {ws && ws.label && (
              <span style={{ fontFamily: t.body, fontSize: '0.6rem', color: ws.color }}>
                {ws.label}
              </span>
            )}
          </div>
        </div>
      </div>

      <Link
        to={path}
        className="lux-btn lux-btn-primary"
        style={{ textDecoration: 'none', flexShrink: 0 }}
      >
        <span className="gold-overlay" /><span className="btn-content">
          {cta} <ArrowRight size={14} strokeWidth={1.5} />
        </span>
      </Link>
    </div>
  );
}
