import { t } from '../config/theme';
import { Flame, Zap, Trophy } from 'lucide-react';
import { getLevelProgress, streakLabel } from '../config/gamification';
import type { GamificationProfile } from '../hooks/useGamification';

// ─── Props ──────────────────────────────────────────────

interface GamificationStripProps {
  profile: GamificationProfile | null;
  achievementsUnlocked: number;
  achievementsTotal: number;
  /** Hide streak chip when there's no DB (client fallback can't compute it reliably) */
  showStreak?: boolean;
}

// ─── Component ──────────────────────────────────────────

/**
 * Compact "level · XP bar · streak · achievements" strip shown at the top of
 * the joinee dashboard. Gives immediate, visible feedback that effort = XP.
 */
export default function GamificationStrip({
  profile,
  achievementsUnlocked,
  achievementsTotal,
  showStreak = true,
}: GamificationStripProps) {
  const xp = profile?.total_xp || 0;
  const level = getLevelProgress(xp);
  const streak = profile?.current_streak || 0;

  return (
    <div
      role="region"
      aria-label={`Level ${level.level} ${level.title}, ${xp} XP`}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1px',
        background: 'rgba(26, 26, 26, 0.1)',
        marginBottom: '2.5rem',
      }}
    >
      {/* Level */}
      <div style={{
        background: 'var(--color-alabaster)',
        padding: '1.25rem 1.5rem',
        display: 'flex', alignItems: 'center', gap: '14px',
      }}>
        <div style={{
          width: '46px', height: '46px', flexShrink: 0,
          border: '1px solid var(--color-gold)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(212, 175, 55, 0.07)',
          fontFamily: t.heading, fontSize: '1.1rem', color: 'var(--color-gold)',
        }}>
          {level.level}
        </div>
        <div style={{ minWidth: 0 }}>
          <span style={{
            fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            color: t.wg, display: 'block', marginBottom: '2px',
          }}>
            Level {level.level} · {level.title}
          </span>
          <span style={{
            fontFamily: t.heading, fontSize: '1rem', color: t.ch, display: 'block',
          }}>
            {xp.toLocaleString()} XP
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <div className="lux-progress" style={{ flex: 1, minWidth: '70px', height: '2px' }}>
              <div
                className="lux-progress-fill"
                style={{ width: `${level.pct}%`, background: 'var(--color-gold)', height: '2px' }}
              />
            </div>
            <span style={{ fontFamily: t.body, fontSize: '0.5rem', color: t.wg, whiteSpace: 'nowrap' }}>
              {level.intoLevel}/{level.needed}
            </span>
          </div>
        </div>
      </div>

      {/* Streak */}
      {showStreak && (
        <div style={{
          background: 'var(--color-alabaster)',
          padding: '1.25rem 1.5rem',
          display: 'flex', alignItems: 'center', gap: '14px',
        }}>
          <div style={{
            width: '46px', height: '46px', flexShrink: 0,
            border: '1px solid rgba(230, 81, 0, 0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(230, 81, 0, 0.05)',
          }}>
            <Flame size={20} strokeWidth={1.5} style={{ color: '#E65100' }} />
          </div>
          <div>
            <span style={{
              fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              color: t.wg, display: 'block', marginBottom: '2px',
            }}>
              Streak
            </span>
            <span style={{ fontFamily: t.heading, fontSize: '1rem', color: t.ch, display: 'block' }}>
              {streakLabel(streak)}
            </span>
            <span style={{ fontFamily: t.body, fontSize: '0.55rem', color: t.wg, display: 'block', marginTop: '2px' }}>
              Best: {profile?.longest_streak || 0} days
            </span>
          </div>
        </div>
      )}

      {/* Achievements */}
      <div style={{
        background: 'var(--color-alabaster)',
        padding: '1.25rem 1.5rem',
        display: 'flex', alignItems: 'center', gap: '14px',
      }}>
        <div style={{
          width: '46px', height: '46px', flexShrink: 0,
          border: '1px solid rgba(56, 30, 114, 0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(56, 30, 114, 0.05)',
        }}>
          <Trophy size={20} strokeWidth={1.5} style={{ color: t.purple }} />
        </div>
        <div>
          <span style={{
            fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            color: t.wg, display: 'block', marginBottom: '2px',
          }}>
            Achievements
          </span>
          <span style={{ fontFamily: t.heading, fontSize: '1rem', color: t.ch, display: 'block' }}>
            {achievementsUnlocked} <span style={{ fontSize: '0.7rem', color: t.wg }}>/ {achievementsTotal}</span>
          </span>
          <span style={{ fontFamily: t.body, fontSize: '0.55rem', color: t.wg, display: 'block', marginTop: '2px' }}>
            <Zap size={10} strokeWidth={2} style={{ verticalAlign: 'middle', marginRight: '2px', color: 'var(--color-gold)' }} />
            {achievementsTotal > 0 ? Math.round((achievementsUnlocked / achievementsTotal) * 100) : 0}% complete
          </span>
        </div>
      </div>
    </div>
  );
}
