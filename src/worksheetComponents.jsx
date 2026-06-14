import { CheckCircle2, Send, ArrowLeft, Clock, AlertCircle, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const t = {
  body: 'var(--font-body)', heading: 'var(--font-heading)',
  ch: 'var(--color-charcoal)', wg: 'var(--color-warm-grey)', gd: 'var(--color-gold)',
  ease: 'var(--ease-lux)',
};

/* ─── Worksheet Header ─────────────────────────────────────── */
export function WorksheetHeader({ icon: Icon, title, subtitle, badge, saveStatus }) {
  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <div className="lux-line lux-line-gold" style={{ marginBottom: '1rem' }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
        <div style={{ width: '44px', height: '44px', border: '1px solid var(--color-charcoal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={20} strokeWidth={1.5} style={{ color: t.ch }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
            <h1 style={{ fontFamily: t.heading, fontSize: '1.35rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, margin: 0 }}>
              {title}
            </h1>
            {badge && <span className="lux-badge lux-badge-light" style={{ fontSize: '0.55rem' }}>{badge}</span>}
          </div>
          <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg, margin: 0 }}>{subtitle}</p>
        </div>
        <div style={{ flexShrink: 0 }}>
          <SaveIndicator status={saveStatus} />
        </div>
      </div>
    </div>
  );
}

/* ─── Worksheet Section (Card) ─────────────────────────────── */
export function WorksheetSection({ title, subtitle, children }) {
  return (
    <div style={{ borderTop: '1px solid var(--color-charcoal)', padding: '1.5rem 0' }}>
      {title && (
        <h3 style={{ fontFamily: t.body, fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.ch, marginBottom: subtitle ? '4px' : '1rem' }}>
          {title}
        </h3>
      )}
      {subtitle && <p style={{ fontFamily: t.body, fontSize: '0.78rem', color: t.wg, marginBottom: '1rem', lineHeight: 1.5 }}>{subtitle}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>{children}</div>
    </div>
  );
}

/* ─── Field Group ──────────────────────────────────────────── */
export function FieldGroup({ label, required, id, children, hint }) {
  return (
    <div className="lux-form-group">
      <label className="lux-label" htmlFor={id || undefined} style={{ marginBottom: '8px' }}>
        {label}{required && <span style={{ color: '#C62828', marginLeft: '4px' }}>*</span>}
      </label>
      {children}
      {hint && <p style={{ fontFamily: t.body, fontSize: '0.65rem', color: t.wg, marginTop: '4px', fontStyle: 'italic' }}>{hint}</p>}
    </div>
  );
}

/* ─── Grid Layout Helper ───────────────────────────────────── */
export function FieldGrid({ cols, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '1rem' }}>
      {children}
    </div>
  );
}

/* ─── Save Indicator ───────────────────────────────────────── */
export function SaveIndicator({ status }) {
  if (!status || status === 'idle') return null;

  const configs = {
    saving: { label: 'Saving…', icon: Clock, color: '#E65100' },
    saved: { label: 'Saved', icon: CheckCircle2, color: '#1B5E20' },
    error: { label: 'Failed', icon: AlertCircle, color: '#C62828' },
  };

  const config = configs[status];
  if (!config) return null;

  const Icon = config.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500,
      letterSpacing: '0.1em', textTransform: 'uppercase', color: config.color,
      whiteSpace: 'nowrap',
    }}>
      <Icon size={11} strokeWidth={2} />
      {config.label}
    </span>
  );
}

/* ─── Action Bar ───────────────────────────────────────────── */
export function ActionBar({ onCancel, onSubmit, submitting, submitLabel = 'Submit for Review' }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'flex-end', gap: '12px',
      paddingTop: '1.5rem', marginTop: '0.5rem',
      borderTop: '1px solid rgba(26, 26, 26, 0.1)',
    }}>
      <button type="button" onClick={onCancel} className="lux-btn lux-btn-secondary">
        Cancel
      </button>
      <button type="button" onClick={onSubmit} disabled={submitting} className="lux-btn lux-btn-primary" style={{ minWidth: '160px' }}>
        <span className="gold-overlay" />
        <span className="btn-content">
          {submitting ? 'Submitting…' : <><Send size={14} strokeWidth={1.5} /> {submitLabel}</>}
        </span>
      </button>
    </div>
  );
}

/* ─── Submitted View ───────────────────────────────────────── */
export function SubmittedView({ msg, path, title = 'Worksheet Submitted', isCapstone = false }) {
  const navigate = useNavigate();
  return (
    <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center' }}>
      <div className="lux-container" style={{ textAlign: 'center', maxWidth: '520px', margin: '0 auto' }}>
        <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
        <h1 style={{ fontFamily: t.heading, fontSize: '2.5rem', fontWeight: 400, color: t.ch, marginBottom: '0.75rem' }}>
          {title}
        </h1>
        <p style={{ fontFamily: t.body, fontSize: '0.9rem', color: t.wg, marginBottom: '2rem', lineHeight: 1.6 }}>
          {msg}
        </p>
        <button onClick={() => navigate(path)} className="lux-btn lux-btn-primary">
          <span className="gold-overlay" />
          <span className="btn-content">Back</span>
        </button>
      </div>
    </div>
  );
}

/* ─── Approved View ────────────────────────────────────────── */
export function ApprovedView({ msg, path, title = '✓ Worksheet Approved' }) {
  const navigate = useNavigate();
  return (
    <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center' }}>
      <div className="lux-container" style={{ textAlign: 'center', maxWidth: '520px', margin: '0 auto' }}>
        <div className="lux-line lux-line-gold" style={{ margin: '0 auto 1.5rem' }} />
        <h1 style={{ fontFamily: t.heading, fontSize: '2.5rem', fontWeight: 400, color: '#1B5E20', marginBottom: '0.75rem' }}>
          {title}
        </h1>
        <p style={{ fontFamily: t.body, fontSize: '0.9rem', color: t.wg, marginBottom: '2rem', lineHeight: 1.6 }}>
          {msg}
        </p>
        <button onClick={() => navigate(path)} className="lux-btn lux-btn-primary">
          <span className="gold-overlay" />
          <span className="btn-content">Back to Phase</span>
        </button>
      </div>
    </div>
  );
}



/* ─── Loading View ─────────────────────────────────────────── */
export function LoadingView() {
  return (
    <div className="lux-section" style={{ textAlign: 'center' }}>
      <div className="lux-container">
        <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg }}>Loading…</p>
      </div>
    </div>
  );
}

/* ─── Error Alert ──────────────────────────────────────────── */
export function ErrorAlert({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="lux-alert lux-alert-error" style={{ marginBottom: '1rem' }}>
      <AlertCircle size={16} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: '1px' }} />
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C62828', padding: '0 0 0 8px', fontSize: '0.8rem' }}>×</button>
      )}
    </div>
  );
}

/* ─── Table Grid Renderer ──────────────────────────────────── */
export function GridTable({ headers, rows, renderCell }) {
  if (!rows || rows.length === 0) return null;
  const hasData = rows.some(row => Object.values(row).some(v => v !== '' && v !== null && v !== undefined));
  if (!hasData) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: headers.map(h => h.width || '1fr').join(' '), gap: '8px', padding: '8px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
        {headers.map(h => (
          <span key={h.key} style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.wg }}>
            {h.label}
          </span>
        ))}
      </div>
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: headers.map(h => h.width || '1fr').join(' '), gap: '8px', padding: '8px 0', borderBottom: '1px solid rgba(26,26,26,0.06)' }}>
          {headers.map(h => (
            <div key={h.key}>
              {renderCell ? renderCell(row, h.key, i) : <span style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.ch }}>{row[h.key] || '—'}</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ─── Back Button ──────────────────────────────────────────── */
export function BackButton({ to, label = 'Back' }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => to ? navigate(to) : navigate(-1)} className="lux-btn lux-btn-ghost" style={{ marginBottom: '0.5rem' }}>
      <ArrowLeft size={14} strokeWidth={1.5} /> {label}
    </button>
  );
}
