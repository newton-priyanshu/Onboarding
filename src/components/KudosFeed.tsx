import { useState } from 'react';
import { t } from '../config/theme';
import {
  Heart, Award, CheckCircle2, Trophy, Sparkles,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import type { MilestoneItem } from '../hooks/useMilestones';

// ─── Props ──────────────────────────────────────────────

interface KudosFeedProps {
  milestones: MilestoneItem[];
  /** Show only the most recent N, with "Show all" toggle */
  compact?: boolean;
}

// ─── Icon Mapping ───────────────────────────────────────

const MILESTONE_ICONS: Record<MilestoneItem['type'], { icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; color: string; label: string }> = {
  kudos: { icon: Heart, color: '#E91E63', label: 'Kudos' },
  achievement: { icon: Trophy, color: '#D4A853', label: 'Achievement' },
  worksheet_approved: { icon: CheckCircle2, color: '#2E7D32', label: 'Approved' },
  phase_completed: { icon: Award, color: '#006494', label: 'Phase Complete' },
};

// Wrapper renders a Lucide icon inside a colored container
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MilestoneIcon({ Icon, color }: { Icon: React.ComponentType<any>; color: string }) {
  return (
    <div style={{
      width: '36px', height: '36px',
      border: '1px solid ' + color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <Icon size={16} strokeWidth={1.5} style={{ color }} />
    </div>
  );
}

// ─── Time Helper ────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

// ─── Component ──────────────────────────────────────────

export default function KudosFeed({ milestones, compact = true }: KudosFeedProps) {
  const [showAll, setShowAll] = useState(false);

  if (milestones.length === 0) {
    return (
      <div style={{
        padding: '2rem 1.5rem',
        textAlign: 'center',
        border: '1px solid rgba(26, 26, 26, 0.1)',
      }}>
        <Sparkles size={28} strokeWidth={1.5} style={{ color: 'var(--color-warm-grey)', marginBottom: '0.75rem', opacity: 0.3 }} />
        <p style={{
          fontFamily: t.body, fontSize: '0.8rem',
          color: 'var(--color-warm-grey)', marginBottom: '4px',
        }}>
          No milestones yet
        </p>
        <p style={{
          fontFamily: t.body, fontSize: '0.65rem',
          color: 'var(--color-warm-grey)', opacity: 0.7,
        }}>
          Kudos, achievements, and approvals will appear here.
        </p>
      </div>
    );
  }

  const displayItems = compact && !showAll
    ? milestones.slice(0, 5)
    : milestones;

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {displayItems.map((item, idx) => {
          const config = MILESTONE_ICONS[item.type];
          const Icon = config.icon;
          return (
            <div
              key={item.id}
              style={{
                display: 'flex', gap: '12px',
                padding: '0.875rem 1rem',
                borderBottom: idx < displayItems.length - 1
                  ? '1px solid rgba(26, 26, 26, 0.06)'
                  : 'none',
                animation: `luxFadeIn 0.5s ${idx * 0.04}s forwards`,
                opacity: 0,
                transition: 'background 200ms var(--ease-lux)',
              }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(26, 26, 26, 0.02)'; }}
              onMouseOut={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <MilestoneIcon Icon={Icon} color={config.color} />

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '2px' }}>
                  <span style={{
                    fontFamily: t.heading,
                    fontSize: '0.8rem',
                    fontWeight: 400,
                    color: 'var(--color-charcoal)',
                  }}>
                    {item.title}
                  </span>
                  <span style={{
                    fontFamily: t.body, fontSize: '0.5rem', fontWeight: 500,
                    letterSpacing: '0.1em', color: config.color,
                    padding: '1px 6px',
                    border: '1px solid ' + config.color,
                    whiteSpace: 'nowrap',
                  }}>
                    {config.label}
                  </span>
                </div>
                <p style={{
                  fontFamily: t.body,
                  fontSize: '0.72rem',
                  lineHeight: 1.5,
                  color: 'var(--color-warm-grey)',
                  margin: '0 0 2px 0',
                }}>
                  {item.description}
                </p>
                <span style={{
                  fontFamily: t.body,
                  fontSize: '0.55rem',
                  color: 'var(--color-warm-grey)',
                  opacity: 0.6,
                }}>
                  {timeAgo(item.timestamp)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Show all / Show less toggle */}
      {compact && milestones.length > 5 && (
        <button
          onClick={() => setShowAll(!showAll)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '6px', width: '100%',
            padding: '0.75rem',
            border: 'none', borderTop: '1px solid rgba(26, 26, 26, 0.08)',
            background: 'none',
            cursor: 'pointer',
            fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500,
            color: 'var(--color-warm-grey)',
            transition: 'color 200ms var(--ease-lux)',
          }}
          onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.color = t.ch; }}
          onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-warm-grey)'; }}
        >
          {showAll ? (
            <>Show less <ChevronUp size={14} strokeWidth={1.5} /></>
          ) : (
            <>Show all {milestones.length} milestones <ChevronDown size={14} strokeWidth={1.5} /></>
          )}
        </button>
      )}
    </div>
  );
}
