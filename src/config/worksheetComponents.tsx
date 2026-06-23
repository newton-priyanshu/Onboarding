import { CheckCircle2, Send, ArrowLeft, Clock, AlertCircle, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';

const t = {
  body: 'var(--font-body)', heading: 'var(--font-heading)',
  ch: 'var(--color-charcoal)', wg: 'var(--color-warm-grey)', gd: 'var(--color-gold)',
  success: 'var(--color-success)', error: 'var(--color-error)',
  pending: 'var(--color-pending)', warning: 'var(--color-warning)', purple: 'var(--color-purple)',
  ease: 'var(--ease-lux)',
};

// ─── Types ──────────────────────────────────────────────

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface WorksheetHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  badge?: string;
  saveStatus?: SaveStatus;
}

interface SectionProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}

interface FieldGroupProps {
  label: string;
  required?: boolean;
  id?: string;
  children: ReactNode;
  hint?: string;
}

interface FieldGridProps {
  cols: number;
  children: ReactNode;
}

interface SaveIndicatorProps {
  status?: SaveStatus;
}

interface ActionBarProps {
  onCancel?: () => void;
  onSubmit?: () => void;
  submitting?: boolean;
  submitLabel?: string;
}

interface StatusViewProps {
  msg: string;
  path: string;
  title?: string;
}

interface ApprovedViewProps {
  msg: string;
  path: string;
  title?: string;
  reviewerName?: string;
  date?: string;
}

interface ReviewFeedbackProps {
  data?: Record<string, unknown>;
}

interface ErrorAlertProps {
  message?: string | null;
  onDismiss?: () => void;
}

interface GridTableProps {
  headers: Array<{ key: string; label: string; width?: string }>;
  rows: Array<Record<string, unknown>>;
  renderCell?: (row: Record<string, unknown>, key: string, index: number) => ReactNode;
}

interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

interface BackButtonProps {
  to?: string;
  label?: string;
}

interface ReviewHistoryEntry {
  action: string;
  reviewer_name?: string;
  comment?: string;
  timestamp?: string;
}

/* ─── Worksheet Header ────────────────────────────────── */
export function WorksheetHeader({ icon: Icon, title, subtitle, badge }: WorksheetHeaderProps) {
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
      </div>
    </div>
  );
}

/* ─── Worksheet Section (Card) ────────────────────────── */
export function WorksheetSection(props: SectionProps) {
  return <Section {...props} />;
}

/* ─── Field Group ─────────────────────────────────────── */
export function FieldGroup({ label, required, id, children, hint }: FieldGroupProps) {
  return (
    <div className="lux-form-group">
      <label className="lux-label" htmlFor={id || undefined} style={{ marginBottom: '6px' }}>
        {label}{required && <span style={{ color: t.error, marginLeft: '4px' }}>*</span>}
      </label>
      {children}
      {hint && <p style={{ fontFamily: t.body, fontSize: '0.65rem', color: t.wg, marginTop: '4px', fontStyle: 'italic' }}>{hint}</p>}
    </div>
  );
}

/* ─── Grid Layout Helper ──────────────────────────────── */
export function FieldGrid({ cols, children }: FieldGridProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '0.75rem' }}>
      {children}
    </div>
  );
}

/* ─── Save Indicator ──────────────────────────────────── */
export function SaveIndicator({ status }: SaveIndicatorProps) {
  if (!status || status === 'idle') return null;

  const configs: Record<string, { label: string; icon: LucideIcon; color: string }> = {
    saving: { label: 'Saving…', icon: Clock, color: t.warning },
    saved: { label: 'Saved', icon: CheckCircle2, color: t.success },
    error: { label: 'Failed', icon: AlertCircle, color: t.error },
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

/* ─── Action Bar ──────────────────────────────────────── */
export function ActionBar({ onCancel, onSubmit, submitting, submitLabel = 'Submit for Review' }: ActionBarProps) {
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

/* ─── Submitted View ──────────────────────────────────── */
export function SubmittedView({ msg, path, title = 'Worksheet Submitted' }: StatusViewProps) {
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

/* ─── Buddy Approved View ─────────────────────────────── */
export function BuddyApprovedView({ msg, path, title = '✓ Buddy Approved' }: StatusViewProps) {
  const navigate = useNavigate();
  return (
    <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center' }}>
      <div className="lux-container" style={{ textAlign: 'center', maxWidth: '520px', margin: '0 auto' }}>
        <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
        <h1 style={{ fontFamily: t.heading, fontSize: '2.5rem', fontWeight: 400, color: t.purple, marginBottom: '0.75rem' }}>
          {title}
        </h1>
        <p style={{ fontFamily: t.body, fontSize: '0.9rem', color: t.wg, marginBottom: '1rem', lineHeight: 1.6 }}>
          {msg}
        </p>
        <p style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.purple, marginBottom: '1.5rem', padding: '8px 12px', border: '1px solid #381E72', background: 'rgba(56, 30, 114, 0.04)' }}>
          Your buddy has approved this worksheet. It now awaits manager-level phase approval.
          Once all worksheets in this phase are buddy-approved, the manager will review and
          finalize them in one go.
        </p>
        <button onClick={() => navigate(path)} className="lux-btn lux-btn-primary">
          <span className="gold-overlay" />
          <span className="btn-content">Back to Phase</span>
        </button>
      </div>
    </div>
  );
}

/* ─── Approved View ───────────────────────────────────── */
export function ApprovedView({ msg, path, title = '✓ Worksheet Approved', reviewerName, date }: ApprovedViewProps) {
  const navigate = useNavigate();
  return (
    <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center' }}>
      <div className="lux-container" style={{ textAlign: 'center', maxWidth: '520px', margin: '0 auto' }}>
        <div className="lux-line lux-line-gold" style={{ margin: '0 auto 1.5rem' }} />
        <h1 style={{ fontFamily: t.heading, fontSize: '2.5rem', fontWeight: 400, color: t.success, marginBottom: '0.75rem' }}>
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

/* ─── Loading View ────────────────────────────────────── */
export function LoadingView() {
  return (
    <div className="lux-section" style={{ textAlign: 'center' }}>
      <div className="lux-container">
        <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg }}>Loading…</p>
      </div>
    </div>
  );
}

/* ─── Review Feedback Banner ──────────────────────────── */
export function ReviewFeedback({ data }: ReviewFeedbackProps) {
  if (!data || !data._savedReviewStatus) return null;

  const status = data._savedReviewStatus as string;
  const comment = data._savedReviewComment as string | undefined;
  const reviewerName = data._savedReviewerName as string | undefined;
  const history = (data._savedReviewHistory as ReviewHistoryEntry[]) || [];

  // Find the most recent 'needs_revision' entry for the latest reviewer feedback
  const latestRevision = history.find(e => e.action === 'needs_revision');

  const isRevision = status === 'needs_revision';
  const isResubmitted = status === 'revision_submitted';

  if (!isRevision && !isResubmitted) return null;

  return (
    <div style={{
      marginBottom: '1.5rem',
      border: '1px solid ' + (isResubmitted ? t.pending : t.error),
      background: isResubmitted ? '#F8F0F5' : '#FFF5F5',
    }}>
      <div style={{ padding: '1.25rem' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          marginBottom: '0.75rem',
        }}>
          <div style={{
            width: '6px', height: '6px',
            background: isResubmitted ? t.pending : t.error,
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: t.body, fontSize: '0.7rem', fontWeight: 600,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: isResubmitted ? t.pending : t.error,
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
            {history.slice().reverse().map((entry: ReviewHistoryEntry, idx: number) => {
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
                    color: isApprove ? t.success : isRev ? t.error : t.wg,
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
          color: isResubmitted ? t.pending : t.error,
        }}>
          {isResubmitted
            ? 'You have resubmitted this worksheet after revision. The reviewer will review it again.'
            : 'Please review the feedback above, make the necessary changes, and resubmit.'}
        </div>
      </div>
    </div>
  );
}

/* ─── Error Alert ─────────────────────────────────────── */
export function ErrorAlert({ message, onDismiss }: ErrorAlertProps) {
  if (!message) return null;
  return (
    <div className="lux-alert lux-alert-error" style={{ marginBottom: '1rem' }}>
      <AlertCircle size={16} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: '1px' }} />
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.error, padding: '0 0 0 8px', fontSize: '0.8rem' }}>×</button>
      )}
    </div>
  );
}

/* ─── Table Grid Renderer ─────────────────────────────── */
export function GridTable({ headers, rows, renderCell }: GridTableProps) {
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
              {renderCell ? renderCell(row, h.key, i) : <span style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.ch }}>{String(row[h.key] ?? '—')}</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ─── GateControl Section ─────────────────────────────── */
export function Section({ title, subtitle, children }: SectionProps) {
  return (
    <div style={{ borderTop: '1px solid var(--color-charcoal)', padding: '1.25rem 0' }}>
      <h3 style={{ fontFamily: t.body, fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.ch, marginBottom: subtitle ? '4px' : '0.75rem' }}>{title}</h3>
      {subtitle && <p style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.wg, marginBottom: '0.75rem' }}>{subtitle}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>{children}</div>
    </div>
  );
}

/* ─── GateControl Slider (1-5 rating) ─────────────────── */
export function Slider({ label, value, onChange }: SliderProps) {
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
            onMouseOver={e => { if (value < n) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-gold)'; }}
            onMouseOut={e => { if (value < n) (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(26,26,26,0.15)'; }}
          >{n}</button>
        ))}
      </div>
    </div>
  );
}

/* ─── Back Button ─────────────────────────────────────── */
export function BackButton({ to, label = 'Back' }: BackButtonProps) {
  const navigate = useNavigate();
  return (
    <button onClick={() => to ? navigate(to) : navigate(-1)} className="lux-btn lux-btn-ghost" style={{ marginBottom: '0.5rem' }}>
      <ArrowLeft size={14} strokeWidth={1.5} /> {label}
    </button>
  );
}
