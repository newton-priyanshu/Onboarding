import { t } from '../config/theme';
import { CheckCircle2, Circle, Clock } from 'lucide-react';

// ─── Props ────────────────────────────────────────────

interface PhaseMilestone {
  num: number;
  title: string;
  days: string;
  description: string;
  status: 'completed' | 'current' | 'locked';
  /** ISO date string when the phase was approved (only for completed) */
  completedAt?: string;
}

interface JourneyTimelineProps {
  phases: PhaseMilestone[];
  accentColor?: string;
}

// ─── CSS-injection ─────────────────────────────────────

const STYLE_ID = 'jt-styles';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    @keyframes jt-pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.25); opacity: 0.7; }
    }
    @keyframes jt-lineGrow {
      from { height: 0; }
      to { height: 100%; }
    }
    @keyframes jt-fadeSlideIn {
      from { opacity: 0; transform: translateX(-8px); }
      to { opacity: 1; transform: translateX(0); }
    }
  `;
  document.head.appendChild(s);
}

// ─── Component ────────────────────────────────────────

export default function JourneyTimeline({ phases, accentColor = t.gd }: JourneyTimelineProps) {
  return (
    <div
      role="list"
      aria-label="Onboarding journey timeline"
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        paddingLeft: '28px',
      }}
    >
      {/* Vertical connecting line */}
      <div
        style={{
          position: 'absolute',
          left: '11px',
          top: '8px',
          bottom: '8px',
          width: '1px',
          background: 'var(--color-taupe)',
        }}
      />

      {phases.map((phase, idx) => {
        const isCompleted = phase.status === 'completed';
        const isCurrent = phase.status === 'current';
        const isLocked = phase.status === 'locked';

        return (
          <div
            key={phase.num}
            role="listitem"
            aria-label={`Phase ${phase.num}: ${phase.title} — ${phase.status}`}
            style={{
              position: 'relative',
              paddingBottom: idx < phases.length - 1 ? '2rem' : 0,
              animation: `jt-fadeSlideIn 0.5s ${idx * 0.15}s var(--ease-lux) forwards`,
              opacity: 0,
            }}
          >
            {/* Timeline dot */}
            <div
              style={{
                position: 'absolute',
                left: '-28px',
                top: '4px',
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isCompleted ? (
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    border: '1px solid var(--color-success)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--color-alabaster)',
                  }}
                >
                  <CheckCircle2 size={14} strokeWidth={2} style={{ color: 'var(--color-success)' }} />
                </div>
              ) : isCurrent ? (
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    border: `2px solid ${accentColor}`,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--color-alabaster)',
                    animation: 'jt-pulse 2s ease-in-out infinite',
                  }}
                >
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      background: accentColor,
                      borderRadius: '50%',
                    }}
                  />
                </div>
              ) : (
                <Circle
                  size={20}
                  strokeWidth={1.5}
                  style={{ color: 'var(--color-warm-grey)' }}
                />
              )}
            </div>

            {/* Content card */}
            <div
              style={{
                padding: '0.5rem 0',
                opacity: isLocked ? 0.5 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '2px' }}>
                <span
                  style={{
                    fontFamily: t.body,
                    fontSize: '0.55rem',
                    fontWeight: 500,
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    color: isCompleted ? 'var(--color-success)' : isCurrent ? accentColor : t.wg,
                  }}
                >
                  Phase {phase.num}
                </span>
                <span style={{ fontFamily: t.body, fontSize: '0.55rem', letterSpacing: '0.1em', color: t.wg }}>
                  {phase.days}
                </span>
                {isCompleted && phase.completedAt && (
                  <span
                    style={{
                      fontFamily: t.body,
                      fontSize: '0.5rem',
                      letterSpacing: '0.1em',
                      color: 'var(--color-success)',
                      padding: '1px 8px',
                      border: '1px solid var(--color-success)',
                    }}
                  >
                    Completed {new Date(phase.completedAt).toLocaleDateString()}
                  </span>
                )}
                {isCurrent && (
                  <span
                    style={{
                      fontFamily: t.body,
                      fontSize: '0.5rem',
                      fontWeight: 500,
                      letterSpacing: '0.15em',
                      textTransform: 'uppercase',
                      color: accentColor,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Clock size={10} strokeWidth={2} />
                    In Progress
                  </span>
                )}
              </div>
              <h4
                style={{
                  fontFamily: t.heading,
                  fontSize: '1rem',
                  fontWeight: 400,
                  color: isLocked ? 'var(--color-warm-grey)' : 'var(--color-charcoal)',
                  marginBottom: '2px',
                }}
              >
                {phase.title}
              </h4>
              <p
                style={{
                  fontFamily: t.body,
                  fontSize: '0.75rem',
                  color: 'var(--color-warm-grey)',
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                {phase.description}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
