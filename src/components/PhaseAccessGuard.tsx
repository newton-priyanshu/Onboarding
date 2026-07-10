import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../api/supabase';
import { useAuth } from '../context/AuthContext';
import { canAccessPhase, type WorksheetSubmission } from '../config/worksheetConfig';
import { t } from '../config/theme';

// ─── Props ──────────────────────────────────────────────

interface PhaseAccessGuardProps {
  phaseNum: number;
  children: ReactNode;
}

// ─── Locked View ────────────────────────────────────────

const phaseLabels: Record<number, string> = { 1: 'Orientation', 2: 'Contribution', 3: 'Ownership' };

function PhaseLockedView({ phaseNum, previousPhaseNum }: { phaseNum: number; previousPhaseNum: number }) {
  const navigate = useNavigate();
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

// ─── Error View ─────────────────────────────────────────

function PhaseAccessErrorView({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="lux-container" style={{ textAlign: 'center', maxWidth: '500px' }}>
        <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
        <div style={{ width: '64px', height: '64px', border: '1px solid var(--color-charcoal)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
          <AlertCircle size={28} strokeWidth={1.5} style={{ color: t.error }} />
        </div>
        <h1 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, color: t.ch, marginBottom: '0.75rem' }}>
          Couldn&apos;t Verify Access
        </h1>
        <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, lineHeight: 1.6, marginBottom: '1.5rem' }}>
          We could not confirm you&apos;re cleared for this phase. Access stays locked until we can verify it — please check your connection and try again.
        </p>
        <button onClick={onRetry} className="lux-btn lux-btn-primary">
          <span className="gold-overlay" /><span className="btn-content"><RefreshCw size={14} strokeWidth={1.5} /> Retry</span>
        </button>
      </div>
    </div>
  );
}

// ─── Guard Component ────────────────────────────────────

export default function PhaseAccessGuard({ phaseNum, children }: PhaseAccessGuardProps) {
  const { user } = useAuth();
  const [allSubmissions, setAllSubmissions] = useState<WorksheetSubmission[]>([]);
  const [checking, setChecking] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const checkAccess = useCallback(() => {
    if (phaseNum <= 1) return; // Phase 1 always accessible — skip query
    if (!user) return;

    let cancelled = false;
    setChecking(true);
    setLoadError(false);
    supabase
      .from('worksheet_submissions')
      .select('worksheet_id, review_status, user_id')
      .eq('user_id', user.id)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('PhaseAccessGuard: failed to load submissions:', error);
          // Fail closed: a failed access check must never be treated as "unlocked".
          setLoadError(true);
          setChecking(false);
          return;
        }
        setAllSubmissions((data || []) as unknown as WorksheetSubmission[]);
        setChecking(false);
      });
    return () => { cancelled = true; };
  }, [user, phaseNum]);

  useEffect(() => {
    const cleanup = checkAccess();
    return cleanup;
  }, [checkAccess]);

  // Phase 1 is always accessible — render immediately, no query
  if (phaseNum <= 1) return <>{children}</>;

  if (checking) {
    return (
      <div className="lux-section" style={{ textAlign: 'center' }}>
        <div className="lux-container">
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return <PhaseAccessErrorView onRetry={checkAccess} />;
  }

  if (!canAccessPhase(user?.id || '', phaseNum, allSubmissions)) {
    return <PhaseLockedView phaseNum={phaseNum} previousPhaseNum={phaseNum - 1} />;
  }

  return <>{children}</>;
}
