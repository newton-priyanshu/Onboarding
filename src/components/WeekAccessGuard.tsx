import { useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { supabase } from '../api/supabase';
import { useAuth } from '../context/AuthContext';
import { WK_WORKSHEETS_MAP } from '../config/worksheetConfigData';
import { t } from '../config/theme';

// ─── Props ──────────────────────────────────────────────

interface WeekAccessGuardProps {
  weekNum: number;
  children: ReactNode;
}

// ─── Locked View ────────────────────────────────────────

const weekLabels: Record<number, string> = {
  1: 'Anchor',
  2: 'Co-create',
  3: 'Co-deliver',
  4: 'Independence Review',
};

function WeekLockedView({ weekNum }: { weekNum: number }) {
  const navigate = useNavigate();
  return (
    <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="lux-container" style={{ textAlign: 'center', maxWidth: '500px' }}>
        <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
        <div style={{ width: '64px', height: '64px', border: '1px solid var(--color-charcoal)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
          <Lock size={28} strokeWidth={1.5} style={{ color: 'var(--color-warm-grey)' }} />
        </div>
        <h1 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, color: t.ch, marginBottom: '0.75rem' }}>
          Week {weekNum}: {weekLabels[weekNum]} Locked
        </h1>
        <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, lineHeight: 1.6, marginBottom: '1.5rem' }}>
          Complete and submit <strong>all worksheets in Week {weekNum - 1}</strong> before accessing Week {weekNum}.
          Check your progress on the dashboard.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/')} className="lux-btn lux-btn-primary" style={{ textDecoration: 'none' }}>
            <span className="gold-overlay" /><span className="btn-content">Go to Dashboard</span>
          </button>
          <button onClick={() => navigate('/week-' + (weekNum - 1))} className="lux-btn lux-btn-secondary">
            Back to Week {weekNum - 1}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * WeekAccessGuard — Gates week N behind completion of week N-1.
 * A week is "complete" when all its worksheets have a status of 'submitted'
 * or a review_status of 'buddy_approved' or 'approved'.
 */
export default function WeekAccessGuard({ weekNum, children }: WeekAccessGuardProps) {
  const { user } = useAuth();
  const [checking, setChecking] = useState(true);
  const [canAccess, setCanAccess] = useState(false);

  useEffect(() => {
    if (weekNum <= 1) {
      // Week 1 is always accessible
      setCanAccess(true);
      setChecking(false);
      return;
    }
    if (!user?.id) {
      setChecking(false);
      setCanAccess(false);
      return;
    }

    const previousWeekWorksheets = WK_WORKSHEETS_MAP[weekNum - 1];
    if (!previousWeekWorksheets || previousWeekWorksheets.length === 0) {
      setCanAccess(true);
      setChecking(false);
      return;
    }

    supabase
      .from('worksheet_submissions')
      .select('worksheet_id, status, review_status')
      .eq('user_id', user.id)
      .in('worksheet_id', previousWeekWorksheets)
      .then(({ data }) => {
        if (!data) {
          setCanAccess(false);
          setChecking(false);
          return;
        }

        // Check ALL worksheets in the previous week are at least "submitted"
        const submissionMap = new Map<string, { status: string; review_status: string }>();
        data.forEach((row: { worksheet_id: string; status: string; review_status: string }) => {
          submissionMap.set(row.worksheet_id, row);
        });

        const allComplete = previousWeekWorksheets.every((wsId: string) => {
          const sub = submissionMap.get(wsId);
          if (!sub) return false;
          // Consider "submitted", "buddy_approved", or "approved" as complete
          return (
            sub.status === 'submitted' ||
            sub.review_status === 'buddy_approved' ||
            sub.review_status === 'approved'
          );
        });

        setCanAccess(allComplete);
        setChecking(false);
      }, () => {
        // On error, deny access
        setCanAccess(false);
        setChecking(false);
      });
  }, [user?.id, weekNum]);

  if (checking) {
    return (
      <div className="lux-section" style={{ textAlign: 'center' }}>
        <div className="lux-container">
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (!canAccess) {
    return <WeekLockedView weekNum={weekNum} />;
  }

  return <>{children}</>;
}
