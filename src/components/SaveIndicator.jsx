import { CheckCircle2, Clock, AlertCircle } from 'lucide-react';

/**
 * SaveIndicator — Shows the auto-save status in worksheet headers.
 *
 * Props:
 *   saveStatus: 'idle' | 'saving' | 'saved' | 'error' (from useAutoSave)
 *   status: string (worksheet submission status, e.g. 'In Progress')
 *
 * Usage:
 *   <SI saveStatus={saveStatus} status={data.status} />
 *   or simply <SI /> for a minimal version
 */
export default function SaveIndicator({ saveStatus, status }) {
  // Show nothing if idle or no status provided
  if (!saveStatus || saveStatus === 'idle') return null;

  const configs = {
    saving: { label: 'Saving…', icon: Clock, bg: '#FFF8E1', color: '#E65100' },
    saved: { label: 'Saved', icon: CheckCircle2, bg: '#E8F5E9', color: '#1B5E20' },
    error: { label: 'Save failed', icon: AlertCircle, bg: '#FFEBEE', color: '#C62828' },
  };

  const config = configs[saveStatus];
  if (!config) return null;

  const Icon = config.icon;

  return (
    <span className="label-medium" style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '3px 10px', borderRadius: 'var(--md-radius-pill, 9999px)',
      background: config.bg, color: config.color,
      fontSize: '0.65rem', fontWeight: 600, whiteSpace: 'nowrap',
      transition: 'all 200ms ease',
    }}>
      <Icon size={12} />
      {config.label}
    </span>
  );
}
