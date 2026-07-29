import { t } from '../config/theme';
import type { AchievementWithState } from '../config/achievements';

// ─── Props ────────────────────────────────────────────

interface AchievementCardProps {
  achievement: AchievementWithState;
  /** Whether this was recently unlocked (triggers brief celebration) */
  isNew?: boolean;
}

// ─── Component ────────────────────────────────────────

export default function AchievementCard({ achievement, isNew }: AchievementCardProps) {
  const { unlocked, unlockedAt, icon, title, description, hint } = achievement;

  return (
    <div
      role="listitem"
      aria-label={`${unlocked ? 'Unlocked' : 'Locked'} achievement: ${title}`}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '1rem 1.25rem',
        border: `1px solid ${unlocked ? 'rgba(212, 175, 55, 0.3)' : 'rgba(26, 26, 26, 0.08)'}`,
        background: unlocked ? 'rgba(212, 175, 55, 0.03)' : 'transparent',
        opacity: unlocked ? 1 : 0.5,
        transition: 'opacity 300ms var(--ease-lux), border-color 300ms var(--ease-lux), background 300ms var(--ease-lux)',
        animation: isNew ? 'luxFadeIn 0.5s var(--ease-lux) forwards' : undefined,
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: '40px',
          height: '40px',
          border: `1px solid ${unlocked ? 'var(--color-gold)' : 'rgba(26, 26, 26, 0.15)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: '1.25rem',
          lineHeight: 1,
          background: unlocked ? 'rgba(212, 175, 55, 0.06)' : 'transparent',
        }}
        aria-hidden="true"
      >
        {unlocked ? icon : '?'}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '2px' }}>
          <span style={{
            fontFamily: t.heading,
            fontSize: '0.85rem',
            fontWeight: 400,
            color: unlocked ? 'var(--color-charcoal)' : 'var(--color-warm-grey)',
          }}>
            {unlocked ? title : '???'}
          </span>
          {unlocked && unlockedAt && (
            <span style={{
              fontFamily: t.body,
              fontSize: '0.5rem',
              letterSpacing: '0.1em',
              color: 'var(--color-warm-grey)',
              whiteSpace: 'nowrap',
            }}>
              {new Date(unlockedAt).toLocaleDateString()}
            </span>
          )}
          {isNew && (
            <span style={{
              fontFamily: t.body,
              fontSize: '0.45rem',
              fontWeight: 600,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'var(--color-gold)',
              padding: '1px 6px',
              border: '1px solid var(--color-gold)',
              animation: 'luxFadeIn 0.5s var(--ease-lux)',
            }}>
              New!
            </span>
          )}
        </div>
        <p style={{
          fontFamily: t.body,
          fontSize: '0.72rem',
          color: unlocked ? 'var(--color-warm-grey)' : 'rgba(108, 104, 99, 0.6)',
          lineHeight: 1.4,
          margin: 0,
        }}>
          {unlocked ? description : hint}
        </p>
      </div>
    </div>
  );
}
