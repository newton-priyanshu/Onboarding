import { CheckCircle2, Send, ArrowLeft, Clock, AlertCircle } from 'lucide-react';
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
export function SubmittedView({ msg, path, title = 'Worksheet Submitted' }) {
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
export function ApprovedView({ msg, path, title = '✓ Worksheet Approved', reviewerName, date }) {
  const navigate = useNavigate();
  return (
    <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center' }}>
      <div className="lux-container" style={{ textAlign: 'center', maxWidth: '520px', margin: '0 auto' }}>
        <div className="lux-line lux-line-gold" style={{ margin: '0 auto 1.5rem' }} />
        <h1 style={{ fontFamily: t.heading, fontSize: '2.5rem', fontWeight: 400, color: '#1B5E20', marginBottom: '0.75rem' }}>
          {title}
        </h1>
        <p style={{ fontFamily: t.body, fontSize: '0.9rem', color: t.wg, marginBottom: '1rem', lineHeight: 1.6 }}>
          {msg}
        </p>
        {reviewerName && (
          <p style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.wg, marginBottom: '2rem' }}>
            Reviewed by {reviewerName}{date ? ` · ${new Date(date).toLocaleDateString()}` : ''}
          </p>
        )}
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

/* ─── Review Feedback Banner ──────────────────────────────── */
/**
 * ReviewFeedback – Shows reviewer's comment and full review history
 * to the joinee when a worksheet is sent back for revision.
 * Props:
 *   status: 'needs_revision' | 'revision_submitted' | 'approved' | null
 *   comment: string (reviewer's comment/reason for revision)
 *   reviewerName: string
 *   history: array of { action, reviewer_name, comment, timestamp }
 */
export function ReviewFeedback({ data }) {
  if (!data || !data._savedReviewStatus) return null;

  const status = data._savedReviewStatus;
  const comment = data._savedReviewComment;
  const reviewerName = data._savedReviewerName;
  const history = data._savedReviewHistory || [];
  const submittedDate = data.dateSubmitted;

  // Find the most recent 'needs_revision' entry for the latest reviewer feedback
  const latestRevision = history.find(e => e.action === 'needs_revision');

  const isRevision = status === 'needs_revision';
  const isResubmitted = status === 'revision_submitted';

  if (!isRevision && !isResubmitted) return null;

  return (
    <div style={{
      marginBottom: '1.5rem',
      border: '1px solid ' + (isResubmitted ? '#7D5260' : '#C62828'),
      background: isResubmitted ? '#F8F0F5' : '#FFF5F5',
    }}>
      <div style={{ padding: '1.25rem' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          marginBottom: '0.75rem',
        }}>
          <div style={{
            width: '6px', height: '6px',
            background: isResubmitted ? '#7D5260' : '#C62828',
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: t.body, fontSize: '0.7rem', fontWeight: 600,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: isResubmitted ? '#7D5260' : '#C62828',
          }}>
            {isResubmitted ? 'Resubmitted — Awaiting Review' : 'Revision Requested'}
          </span>
        </div>

        {(comment || latestRevision?.comment) && (
          <div style={{
            fontFamily: t.body, fontSize: '0.85rem',
            color: t.ch, lineHeight: 1.6,
            marginBottom: '0.75rem',
            whiteSpace: 'pre-wrap',
          }}>
            {latestRevision?.comment || comment}
          </div>
        )}

        {reviewerName && (
          <div style={{ fontFamily: t.body, fontSize: '0.65rem', color: t.wg }}>
            — {reviewerName}
          </div>
        )}

        {history.length > 0 && (
          <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(26,26,26,0.1)' }}>
            <span style={{
              fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500,
              letterSpacing: '0.15em', textTransform: 'uppercase', color: t.wg,
              display: 'block', marginBottom: '8px',
            }}>
              Review History ({history.length})
            </span>
            {history.slice().reverse().map((entry, idx) => {
              const isApprove = entry.action === 'approved';
              const isRev = entry.action === 'needs_revision';
              const date = entry.timestamp ? new Date(entry.timestamp) : null;
              return (
                <div key={idx} style={{
                  display: 'flex', gap: '8px', padding: '6px 0',
                  borderBottom: '1px solid rgba(26,26,26,0.06)',
                  fontSize: '0.75rem',
                }}>
                  <span style={{
                    color: isApprove ? '#1B5E20' : isRev ? '#C62828' : t.wg,
                    fontWeight: 600, flexShrink: 0,
                  }}>
                    {isApprove ? '✓' : isRev ? '✗' : '•'}
                  </span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 500, color: t.ch }}>
                      {isApprove ? 'Approved' : isRev ? 'Revision requested' : entry.action}
                    </span>
                    {entry.reviewer_name && (
                      <span style={{ color: t.wg }}> by {entry.reviewer_name}</span>
                    )}
                    {entry.comment && (
                      <p style={{ color: t.ch, margin: '2px 0 0', whiteSpace: 'pre-wrap' }}>{entry.comment}</p>
                    )}
                    {date && (
                      <p style={{ color: t.wg, fontSize: '0.6rem', margin: '2px 0 0' }}>
                        {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{
          marginTop: '1rem', padding: '0.75rem',
          background: isResubmitted ? 'rgba(125, 82, 96, 0.06)' : 'rgba(198, 40, 40, 0.06)',
          fontFamily: t.body, fontSize: '0.75rem',
          color: isResubmitted ? '#7D5260' : '#C62828',
        }}>
          {isResubmitted
            ? 'You have resubmitted this worksheet after revision. The reviewer will review it again.'
            : 'Please review the feedback above, make the necessary changes, and resubmit.'}
        </div>
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

/* ─── GateControl Section ──────────────────────────────────── */
export function Section({ title, subtitle, children }) {
  const t = { body: 'var(--font-body)', heading: 'var(--font-heading)', ch: 'var(--color-charcoal)', wg: 'var(--color-warm-grey)' };
  return (
    <div style={{ borderTop: '1px solid var(--color-charcoal)', padding: '1.25rem 0' }}>
      <h3 style={{ fontFamily: t.body, fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.ch, marginBottom: subtitle ? '4px' : '0.75rem' }}>{title}</h3>
      {subtitle && <p style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.wg, marginBottom: '0.75rem' }}>{subtitle}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>{children}</div>
    </div>
  );
}

/* ─── GateControl Slider (1-5 rating) ──────────────────────── */
export function Slider({ label, value, onChange }) {
  const t = { body: 'var(--font-body)', ch: 'var(--color-charcoal)', wg: 'var(--color-warm-grey)', gd: 'var(--color-gold)', ease: 'var(--ease-lux)' };
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontFamily: t.body, fontSize: '0.8rem', fontWeight: 500, color: t.ch }}>{label}</span>
        <span style={{ fontFamily: t.body, fontSize: '0.8rem', fontWeight: 600, color: t.gd }}>{value}/5</span>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" onClick={() => onChange(n)}
            style={{
              flex: 1, padding: '10px', border: value >= n ? '1px solid var(--color-charcoal)' : '1px solid rgba(26,26,26,0.15)',
              background: value >= n ? 'var(--color-charcoal)' : 'transparent',
              color: value >= n ? '#F9F8F6' : t.wg,
              fontWeight: 500, cursor: 'pointer', fontFamily: t.body, fontSize: '0.85rem',
              transition: 'all 300ms var(--ease-lux)',
            }}
            onMouseOver={e => { if (value < n) e.currentTarget.style.borderColor = 'var(--color-gold)'; }}
            onMouseOut={e => { if (value < n) e.currentTarget.style.borderColor = 'rgba(26,26,26,0.15)'; }}
          >{n}</button>
        ))}
      </div>
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
