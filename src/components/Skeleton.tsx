interface SkeletonProps {
  /** Width of the skeleton. Default '100%' */
  width?: string;
  /** Height of the skeleton. Default '1rem' */
  height?: string;
  /** Border radius. Default 0 */
  radius?: string;
  /** Optional inline style overrides */
  style?: React.CSSProperties;
}

/**
 * Skeleton — A minimal loading placeholder that matches the luxury aesthetic.
 * Uses a subtle shimmer animation on the taupe background.
 */
export default function Skeleton({ width = '100%', height = '1rem', radius = '0', style }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      style={{
        width,
        height,
        borderRadius: radius,
        background: 'var(--color-taupe)',
        opacity: 0.5,
        animation: 'skeletonPulse 1.5s ease-in-out infinite',
        ...style,
      }}
    />
  );
}

/**
 * SkeletonBlock — A larger block skeleton for sections/areas.
 */
export function SkeletonBlock({ lines = 3, width = '100%' }: { lines?: number; width?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 ? '60%' : '100%'}
          height="0.85rem"
        />
      ))}
    </div>
  );
}

/**
 * SkeletonCard — A card-shaped skeleton with icon + text lines.
 */
export function SkeletonCard({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          <Skeleton width="40px" height="40px" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Skeleton width="70%" height="0.9rem" />
            <Skeleton width="45%" height="0.7rem" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Inject the keyframes once
if (typeof document !== 'undefined' && !document.getElementById('skeleton-styles')) {
  const style = document.createElement('style');
  style.id = 'skeleton-styles';
  style.textContent = `
    @keyframes skeletonPulse {
      0%, 100% { opacity: 0.5; }
      50% { opacity: 0.25; }
    }
  `;
  document.head.appendChild(style);
}
