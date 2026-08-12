import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../api/supabase';
import { unwrap } from '../api/db';
import { useAuth } from '../context/AuthContext';
import { useCampusPath } from '../utils/campusSlug';
import { WORKSHEET_NAMES, getDeptPhaseMap, canAccessDeptPhase } from '../config/worksheetConfigData';
import { Link } from 'react-router-dom';
import { ArrowLeft, ClipboardList, Lock, AlertCircle, RefreshCw } from 'lucide-react';
import type { Department } from '../types/supabase';
import type { WorksheetSubmission } from '../config/worksheetConfig';
import { t } from '../config/theme';

interface DeptPhasePageProps {
  dept: Department;
  phaseNum: number;
}

const DEPT_LABELS: Record<string, string> = {
  progression: 'Progression',
  operations: 'Operations',
  academics: 'Academics',
};

const PHASE_TITLES: Record<number, string> = {
  1: 'Phase 1 — Orientation',
  2: 'Phase 2 — Contribution',
  3: 'Phase 3 — Ownership',
};

const DEPT_COLORS: Record<string, string> = {
  progression: '#2E7D32',
  operations: '#7B1FA2',
  academics: '#006494',
};

export default function DepartmentPhasePage({ dept, phaseNum }: DeptPhasePageProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const campusPath = useCampusPath();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [canAccess, setCanAccess] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setCheckingAccess(false);
      return;
    }
    (async () => {
      try {
        const data = await supabase
          .from('worksheet_submissions')
          .select('worksheet_id, status, review_status, user_id')
          .eq('user_id', user.id)
          .then(unwrap);
        const subs = data.map(s => ({ ...s, user_id: user.id })) as unknown as WorksheetSubmission[];
        setCanAccess(canAccessDeptPhase(user.id, phaseNum, subs, dept));
      } catch (err) {
        console.error('Failed to check phase access:', err);
        setLoadError('Could not verify phase access.');
      } finally {
        setCheckingAccess(false);
      }
    })();
  }, [user?.id, phaseNum, dept]);

  const phaseMap = getDeptPhaseMap(dept);
  const wsIds = phaseMap[phaseNum] || [];
  const color = DEPT_COLORS[dept] || 'var(--color-charcoal)';
  const deptLabel = DEPT_LABELS[dept] || dept;
  const phaseTitle = PHASE_TITLES[phaseNum] || `Phase ${phaseNum}`;

  // ── Loading / Error / Locked States ─────────────────────
  if (checkingAccess) {
    return (
      <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="lux-container" style={{ width: '100%', textAlign: 'center' }}>
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-warm-grey)' }}>Checking access…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="lux-container" style={{ textAlign: 'center', maxWidth: '500px' }}>
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <AlertCircle size={32} strokeWidth={1.5} style={{ color: t.error, marginBottom: '1rem' }} />
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 400, color: 'var(--color-charcoal)', marginBottom: '0.75rem' }}>
            Couldn&apos;t Verify Access
          </h2>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-warm-grey)', lineHeight: 1.6, marginBottom: '1.5rem' }}>{loadError}</p>
          <button onClick={() => window.location.reload()} className="lux-btn lux-btn-primary">
            <span className="gold-overlay" /><span className="btn-content"><RefreshCw size={14} strokeWidth={1.5} /> Retry</span>
          </button>
        </div>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="lux-container" style={{ textAlign: 'center', maxWidth: '500px' }}>
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <div style={{ width: '64px', height: '64px', border: '1px solid var(--color-charcoal)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
            <Lock size={28} strokeWidth={1.5} style={{ color: 'var(--color-warm-grey)' }} />
          </div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 400, color: 'var(--color-charcoal)', marginBottom: '0.75rem' }}>
            {phaseTitle} Locked
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-warm-grey)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            Complete and get <strong>all worksheets in Phase {phaseNum - 1}</strong> approved before accessing {phaseTitle}.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => navigate(campusPath(`/${dept}`))} className="lux-btn lux-btn-primary">
              <span className="gold-overlay" /><span className="btn-content">Go to Dashboard</span>
            </button>
            <button onClick={() => navigate(campusPath(`/${dept}/phase-${phaseNum - 1}`))} className="lux-btn lux-btn-secondary">
              Back to Phase {phaseNum - 1}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '900px', margin: '0 auto' }}>
        {/* Back link */}
        <Link to={campusPath(`/${dept}`)} style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '6px 12px', marginBottom: '2rem',
          fontFamily: 'var(--font-body)', fontSize: '0.7rem',
          fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
          color: 'var(--color-warm-grey)', textDecoration: 'none',
        }}>
          <ArrowLeft size={14} strokeWidth={1.5} /> Back to Dashboard
        </Link>

        <div className="lux-line" style={{ marginBottom: '1.5rem' }} />
        <div style={{ marginBottom: '2.5rem' }}>
          {/* Department + Phase badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '4px 14px', marginBottom: '1rem',
            background: `${color}14`,
            border: `1px solid ${color}4D`,
            fontFamily: 'var(--font-body)', fontSize: '0.65rem',
            fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
            color: color,
          }}>
            {deptLabel}
          </div>
          <h1 style={{
            fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 400,
            letterSpacing: '-0.02em', marginBottom: '0.5rem',
          }}>
            {phaseTitle}
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-warm-grey)' }}>
            {deptLabel} Department — Complete all worksheets to unlock the next phase.
          </p>
        </div>

        {/* Worksheet List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {wsIds.map((wsId, idx) => {
            const name = WORKSHEET_NAMES[wsId] || wsId;
            const isGate = wsId.includes('gc');
            const routePath = campusPath(`/${dept}/phase-${phaseNum}/worksheet/${wsId}`);

            return (
              <Link
                key={wsId}
                to={routePath}
                style={{
                  display: 'flex', alignItems: 'center', gap: '16px',
                  padding: '16px 20px',
                  border: '1px solid rgba(26, 26, 26, 0.12)',
                  textDecoration: 'none',
                  transition: 'all 200ms var(--ease-lux)',
                  opacity: 0,
                  animation: `luxFadeIn 0.4s ${idx * 0.04}s forwards`,
                }}
                onMouseOver={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.background = `${color}08`; }}
                onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(26, 26, 26, 0.12)'; e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{
                  width: '36px', height: '36px',
                  border: `1px solid ${isGate ? color : 'rgba(26,26,26,0.2)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  background: isGate ? `${color}15` : 'transparent',
                }}>
                  {isGate ? <Lock size={16} strokeWidth={1.5} style={{ color }} /> : <ClipboardList size={16} strokeWidth={1.5} style={{ color: 'var(--color-charcoal)' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 500,
                    color: 'var(--color-charcoal)', marginBottom: '2px',
                  }}>
                    {name}
                    {isGate && <span style={{ color, fontSize: '0.65rem', marginLeft: '8px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Gate</span>}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>

        {wsIds.length === 0 && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-warm-grey)', textAlign: 'center', padding: '3rem 0' }}>
            No worksheets configured for this phase yet.
          </p>
        )}
      </div>
    </div>
  );
}
