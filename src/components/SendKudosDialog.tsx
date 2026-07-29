import { useState, type FormEvent } from 'react';
import { Heart, X, Send, AlertCircle, CheckCircle2 } from 'lucide-react';
import { t } from '../config/theme';

// ─── Props ──────────────────────────────────────────────

interface SendKudosDialogProps {
  /** Name of the person receiving kudos */
  recipientName: string;
  /** ID of the person receiving kudos */
  recipientId: string;
  /** Called with (recipientId, message) */
  onSend: (recipientId: string, message: string) => Promise<void>;
  onClose: () => void;
}

// ─── Component ──────────────────────────────────────────

export default function SendKudosDialog({
  recipientName,
  recipientId,
  onSend,
  onClose,
}: SendKudosDialogProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      setError('Please write a message.');
      return;
    }
    if (message.trim().length > 500) {
      setError('Message is too long (max 500 characters).');
      return;
    }
    setError('');
    setSending(true);
    try {
      await onSend(recipientId, message.trim());
      setSent(true);
    } catch (err) {
      setError((err as { message?: string }).message || 'Failed to send kudos.');
    } finally {
      setSending(false);
    }
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Send kudos"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.4)',
        padding: '1rem',
        animation: 'luxFadeIn 0.2s var(--ease-lux) forwards',
      }}
    >
      <div style={{
        width: '100%', maxWidth: '420px',
        background: 'var(--color-alabaster)',
        border: '1px solid rgba(26, 26, 26, 0.2)',
        animation: 'luxFadeInUp 0.3s var(--ease-lux) forwards',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid rgba(26, 26, 26, 0.1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px',
              border: '1px solid #E91E63',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Heart size={18} strokeWidth={1.5} style={{ color: '#E91E63' }} />
            </div>
            <div>
              <span style={{
                fontFamily: t.heading, fontSize: '0.95rem', fontWeight: 400,
                color: t.ch, display: 'block',
              }}>
                Send Kudos
              </span>
              <span style={{
                fontFamily: t.body, fontSize: '0.65rem',
                color: 'var(--color-warm-grey)',
              }}>
                Recognize {recipientName}
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-warm-grey)', padding: '4px',
            display: 'flex',
          }} aria-label="Close">
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        {sent ? (
          /* Success state */
          <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}>
            <CheckCircle2 size={40} strokeWidth={1.5} style={{ color: t.success, marginBottom: '1rem' }} />
            <h3 style={{
              fontFamily: t.heading, fontSize: '1.15rem', fontWeight: 400,
              color: t.ch, marginBottom: '0.5rem',
            }}>
              Kudos Sent! 🎉
            </h3>
            <p style={{
              fontFamily: t.body, fontSize: '0.8rem',
              color: 'var(--color-warm-grey)', marginBottom: '1.5rem',
              lineHeight: 1.6,
            }}>
              Your message has been sent to {recipientName}. They'll see it in their milestone feed.
            </p>
            <button
              onClick={onClose}
              className="lux-btn lux-btn-primary"
              style={{ minWidth: '120px' }}
            >
              <span className="gold-overlay" /><span className="btn-content">Done</span>
            </button>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label
                htmlFor="kudos-message"
                style={{
                  fontFamily: t.body, fontSize: '0.7rem', fontWeight: 500,
                  color: t.ch, display: 'block', marginBottom: '8px',
                }}
              >
                Your message to {recipientName}
              </label>
              <textarea
                id="kudos-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. Great work on completing your Phase 1 worksheets early!"
                rows={4}
                autoFocus
                maxLength={500}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  border: '1px solid rgba(26, 26, 26, 0.15)',
                  background: 'var(--color-alabaster)',
                  fontFamily: t.body, fontSize: '0.82rem',
                  lineHeight: 1.6,
                  color: t.ch,
                  resize: 'vertical',
                  minHeight: '100px',
                  outline: 'none',
                  transition: 'border-color 200ms var(--ease-lux)',
                }}
                onFocus={e => { e.target.style.borderColor = '#E91E63'; }}
                onBlur={e => { e.target.style.borderColor = 'rgba(26, 26, 26, 0.15)'; }}
              />
              <div style={{
                display: 'flex', justifyContent: 'flex-end', marginTop: '4px',
                fontFamily: t.body, fontSize: '0.6rem', color: 'var(--color-warm-grey)',
              }}>
                {message.length}/500
              </div>
            </div>

            {error && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '0.75rem 1rem', marginBottom: '1rem',
                background: 'rgba(200, 50, 50, 0.06)',
                border: '1px solid rgba(200, 50, 50, 0.15)',
                fontFamily: t.body, fontSize: '0.78rem', color: t.error,
              }}>
                <AlertCircle size={14} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={sending || !message.trim()}
              className="lux-btn"
              style={{
                width: '100%',
                background: '#E91E63',
                color: '#FFFFFF',
                border: 'none',
                opacity: sending || !message.trim() ? 0.6 : 1,
                cursor: sending || !message.trim() ? 'default' : 'pointer',
                transition: 'opacity 200ms',
              }}
            >
              {sending ? 'Sending…' : (
                <><Send size={14} strokeWidth={1.5} /> Send Kudos</>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
