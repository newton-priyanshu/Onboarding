import { useState, useEffect } from 'react';
import { t } from '../config/theme';
import { Trophy } from 'lucide-react';
import type { AchievementWithState } from '../config/achievements';

// ─── Props ──────────────────────────────────────────────

interface AchievementUnlockBannerProps {
  newlyUnlocked: AchievementWithState[];
  /** Callback fired when the banner is dismissed (auto or manual) */
  onDismiss?: () => void;
}

// ─── Component ──────────────────────────────────────────

/**
 * Shown at the top of the dashboard the moment a new achievement unlocks.
 * Auto-dismisses after 6s; clicking dismisses immediately.
 */
export default function AchievementUnlockBanner({ newlyUnlocked, onDismiss }: AchievementUnlockBannerProps) {
  const [hidden, setHidden] = useState(false);
  const latest = newlyUnlocked[0];

  // Reset visibility whenever a *different* achievement arrives
  useEffect(() => {
    setHidden(false);
  }, [latest?.id]);

  // Auto-dismiss
  useEffect(() => {
    if (!latest) return;
    const timer = setTimeout(() => {
      setHidden(true);
      onDismiss?.();
    }, 6000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id]);

  if (!latest || hidden) return null;

  return (
    <div
      role="status"
      aria-label={`Achievement unlocked: ${latest.title}`}
      style={{
        marginBottom: '2rem',
        padding: '1.25rem 1.5rem',
        border: '1px solid var(--color-gold)',
        background: 'linear-gradient(90deg, rgba(212, 175, 55, 0.12), rgba(212, 175, 55, 0.03))',
        display: 'flex', alignItems: 'center', gap: '14px',
        animation: 'luxFadeIn 0.6s forwards, luxShimmerBorder 2.5s ease-in-out infinite',
      }}
    >
      <div style={{
        width: '48px', height: '48px', flexShrink: 0,
        border: '1px solid var(--color-gold)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(212, 175, 55, 0.1)',
        fontSize: '1.4rem',
      }} aria-hidden="true">
        {latest.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontFamily: t.body, fontSize: '0.55rem', fontWeight: 600,
          letterSpacing: '0.2em', textTransform: 'uppercase',
          color: 'var(--color-gold)', marginBottom: '2px',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <Trophy size={12} strokeWidth={2} /> Achievement Unlocked
        </span>
        <span style={{ fontFamily: t.heading, fontSize: '1.05rem', color: t.ch, display: 'block' }}>
          {latest.title}
        </span>
        <span style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.wg, display: 'block', marginTop: '2px' }}>
          {latest.description}
        </span>
      </div>
      <button
        onClick={() => { setHidden(true); onDismiss?.(); }}
        aria-label="Dismiss"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: t.wg, fontSize: '1.1rem', padding: '4px 6px', flexShrink: 0,
          transition: 'color 200ms',
        }}
        onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.color = t.ch; }}
        onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.color = t.wg; }}
      >
        ×
      </button>
    </div>
  );
}
