import { BookOpen, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../api/supabase';
import { unwrap } from '../api/db';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import { t } from '../config/theme';
import { WEEK_LABELS, ENGINE_TAG_INFO, ENGINE_TAG_COLORS } from '../config/worksheetConfigData';
import PhaseWorksheetList from '../components/PhaseWorksheetList';
import { countCompleted } from '../utils/worksheetHelpers';
import type { StatusInfo } from '../utils/worksheetHelpers';
import { week1Worksheets as worksheets } from '../config/weeklyWorksheets';

const weekNum = 1;
const weekLabel = WEEK_LABELS[weekNum]!;

export default function Week1() {
  const { user } = useAuth();
  const [statuses, setStatuses] = useState<Record<string, StatusInfo>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => { if (user) loadStatuses(); }, [user]);

  async function loadStatuses() {
    setLoadError(null);
    try {
      const data = await supabase.from('worksheet_submissions').select('worksheet_id, status, review_status').eq('user_id', user?.id).then(unwrap);
      const map: Record<string, StatusInfo> = {};
      data.forEach(s => { map[s.worksheet_id] = { status: s.status, review_status: s.review_status }; });
      setStatuses(map);
    } catch (err) {
      console.error('Failed to load Week 1 statuses:', err);
      setLoadError('We could not load your Week 1 progress. Please check your connection and try again.');
    }
  }

  const completed = countCompleted(worksheets.map(w => w.id), statuses);

  if (loadError) {
    return (
      <div className="lux-section" style={{ textAlign: 'center' }}>
        <div className="lux-container" style={{ maxWidth: '500px' }}>
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <AlertCircle size={32} strokeWidth={1.5} style={{ color: t.error, marginBottom: '1rem' }} />
          <h2 style={{ fontFamily: t.heading, fontSize: '1.5rem', fontWeight: 400, color: t.ch, marginBottom: '0.75rem' }}>
            Couldn&apos;t Load Week 1
          </h2>
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, lineHeight: 1.6, marginBottom: '1.5rem' }}>{loadError}</p>
          <button onClick={() => loadStatuses()} className="lux-btn lux-btn-primary">
            <span className="gold-overlay" /><span className="btn-content"><RefreshCw size={14} strokeWidth={1.5} /> Retry</span>
          </button>
        </div>
      </div>
    );
  }

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
