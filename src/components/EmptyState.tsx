import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import { Link } from 'react-router-dom';
import { t } from '../config/theme';

// ─── Props ────────────────────────────────────────────

interface EmptyStateProps {
  /** Main icon — defaults to Inbox */
  icon?: LucideIcon;
  /** Short headline */
  title: string;
  /** Longer explanation */
  description: string;
  /** Optional CTA button text */
  actionLabel?: string;
  /** Where the CTA link goes */
  actionTo?: string;
  /** Override the action onClick instead of using a link */
  actionOnClick?: () => void;
  /** Optional icon color override */
  iconColor?: string;
}

// ─── Component ────────────────────────────────────────

export default function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  actionTo,
  actionOnClick,
  iconColor = t.wg,
}: EmptyStateProps) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '3rem 1rem',
        maxWidth: '420px',
        margin: '0 auto',
        animation: 'luxFadeIn 0.6s var(--ease-lux) forwards',
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: '64px',
          height: '64px',
          margin: '0 auto 1.25rem',
          border: '1px solid var(--color-taupe)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'border-color 200ms var(--ease-lux)',
        }}
      >
        <Icon size={28} strokeWidth={1.5} style={{ color: iconColor }} />
      </div>

      {/* Title */}
      <h3
        style={{
          fontFamily: t.heading,
          fontSize: '1.25rem',
          fontWeight: 400,
          color: t.ch,
          marginBottom: '0.5rem',
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </h3>

      {/* Description */}
      <p
        style={{
          fontFamily: t.body,
          fontSize: '0.85rem',
          color: t.wg,
          lineHeight: 1.6,
          marginBottom: actionLabel ? '1.5rem' : 0,
        }}
      >
        {description}
      </p>

      {/* CTA */}
      {actionLabel && actionTo && (
        <Link
          to={actionTo}
          className="lux-btn lux-btn-primary"
          style={{ marginTop: '0.5rem' }}
        >
          <span className="gold-overlay" />
          <span className="btn-content">{actionLabel}</span>
        </Link>
      )}
      {actionLabel && actionOnClick && (
        <button
          onClick={actionOnClick}
          className="lux-btn lux-btn-primary"
          style={{ marginTop: '0.5rem' }}
        >
          <span className="gold-overlay" />
          <span className="btn-content">{actionLabel}</span>
        </button>
      )}
    </div>
  );
}
