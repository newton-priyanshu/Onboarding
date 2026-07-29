import { t } from '../config/theme';

// ─── Props ────────────────────────────────────────────

interface ProgressRingProps {
  /** Overall completion percentage (0–100) */
  percentage: number;
  /** Size of the ring in pixels (default 120) */
  size?: number;
  /** Stroke width of the ring in pixels (default 6) */
  strokeWidth?: number;
  /** Color of the filled arc (default gold) */
  color?: string;
  /** Background track color (default taupe) */
  trackColor?: string;
  /** Label shown below the percentage (default 'Complete') */
  label?: string;
  /** Animate on mount */
  animate?: boolean;
}

// ─── Component ────────────────────────────────────────

export default function ProgressRing({
  percentage,
  size = 120,
  strokeWidth = 6,
  color = t.gd,
  trackColor = 'var(--color-taupe)',
  label = 'Complete',
  animate = true,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedPct = Math.max(0, Math.min(100, percentage));
  const offset = circumference - (clampedPct / 100) * circumference;

  return (
    <div
      role="progressbar"
      aria-valuenow={clampedPct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${clampedPct}% ${label}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
      >
        {/* Track circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
          strokeDasharray={circumference}
          strokeDashoffset={animate ? circumference : offset}
          style={{
            transition: 'stroke-dashoffset 1200ms var(--ease-lux)',
            strokeDashoffset: animate ? offset : undefined,
          }}
        />
      </svg>
      {/* Center text (absolute over the SVG) */}
      <div
        style={{
          position: 'absolute',
          width: size,
          height: size,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            fontFamily: t.heading,
            fontSize: `${size * 0.18}px`,
            fontWeight: 400,
            color: t.ch,
            lineHeight: 1,
          }}
        >
          {clampedPct}%
        </span>
        <span
          style={{
            fontFamily: t.body,
            fontSize: `${size * 0.08}px`,
            color: t.wg,
            marginTop: '2px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

// Inject animation keyframes once
const STYLE_ID = 'progress-ring-styles';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes pr-shimmer {
      0% { background-position: -200% center; }
      100% { background-position: 200% center; }
    }
    @keyframes pr-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
  `;
  document.head.appendChild(style);
}
