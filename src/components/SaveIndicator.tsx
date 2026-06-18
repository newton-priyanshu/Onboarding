import { CheckCircle2, Clock, AlertCircle, type LucideIcon } from 'lucide-react';

interface SaveIndicatorConfig {
  label: string;
  icon: LucideIcon;
  bg: string;
  color: string;
}

interface SaveIndicatorProps {
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error';
  status?: string;
}

const CONFIGS: Record<string, SaveIndicatorConfig> = {
  saving: { label: 'Saving…', icon: Clock, bg: '#FFF8E1', color: '#E65100' },
  saved: { label: 'Saved', icon: CheckCircle2, bg: '#E8F5E9', color: '#1B5E20' },
  error: { label: 'Save failed · retrying', icon: AlertCircle, bg: '#FFEBEE', color: '#C62828' },
};

const style: Record<string, React.CSSProperties> = {
  root: {
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    padding: '3px 10px', borderRadius: 'var(--md-radius-pill, 9999px)',
    fontSize: '0.65rem', fontWeight: 600, whiteSpace: 'nowrap',
    transition: 'all 200ms ease',
  },
};

/**
 * SaveIndicator — Shows the auto-save status in worksheet headers.
 */
export default function SaveIndicator({ saveStatus, status: _status }: SaveIndicatorProps) {
  if (!saveStatus || saveStatus === 'idle') return null;

  const config = CONFIGS[saveStatus];
  if (!config) return null;

  const Icon = config.icon;

  return (
    <span style={{ ...style.root, background: config.bg, color: config.color }}>
      <Icon size={12} />
      {config.label}
    </span>
  );
}
