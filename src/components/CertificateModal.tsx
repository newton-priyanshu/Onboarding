import { useState, useEffect } from 'react';
import { X, Printer, Award } from 'lucide-react';
import { t } from '../config/theme';
import type { CompletionCertificate } from '../hooks/useGamification';

// ─── Props ──────────────────────────────────────────────

interface CertificateModalProps {
  certificate: CompletionCertificate;
  fullName: string;
  campusName?: string | null;
  onClose: () => void;
}

// ─── Styles (injected once) ─────────────────────────────

const STYLE_ID = 'certificate-modal-styles';
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes cert-scaleIn {
      0% { opacity: 0; transform: scale(0.95) translateY(12px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }
    .cert-certificate {
      border: 1px solid rgba(212, 175, 55, 0.5);
      background:
        radial-gradient(circle at 50% 40%, rgba(212, 175, 55, 0.05), transparent 60%),
        var(--color-alabaster);
    }
    .cert-script { font-style: italic; }
    @media print {
      body * { visibility: hidden; }
      .cert-print-area, .cert-print-area * { visibility: visible; }
      .cert-print-area {
        position: absolute; inset: 0; margin: 0;
        box-shadow: none !important; border: none !important;
      }
      .cert-no-print { display: none !important; }
    }
  `;
  document.head.appendChild(style);
}

// ─── Component ──────────────────────────────────────────

export default function CertificateModal({ certificate, fullName, campusName, onClose }: CertificateModalProps) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => { injectStyles(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    if (leaving) return;
    setLeaving(true);
    setTimeout(onClose, 200);
  }

  const issued = new Date(certificate.issued_at);
  const issuedLabel = issued.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Onboarding completion certificate"
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: leaving ? 'rgba(26,26,26,0)' : 'rgba(26,26,26,0.82)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        padding: '1.5rem',
        transition: 'background 250ms var(--ease-lux)',
      }}
    >
      <div
        className="cert-print-area"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '720px', width: '100%',
          background: 'var(--color-alabaster)',
          border: '1px solid rgba(212, 175, 55, 0.45)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
          position: 'relative',
          animation: leaving ? undefined : 'cert-scaleIn 450ms var(--ease-lux) forwards',
        }}
      >
        {/* Print-only close button is hidden via .cert-no-print on screen */}
        <button
          onClick={close}
          aria-label="Close certificate"
          className="cert-no-print"
          style={{
            position: 'absolute', top: '10px', right: '10px', zIndex: 5,
            background: 'none', border: 'none', cursor: 'pointer',
            color: t.wg, padding: '6px', display: 'flex',
            transition: 'color 200ms',
          }}
          onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.color = t.ch; }}
          onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.color = t.wg; }}
        >
          <X size={18} strokeWidth={1.5} />
        </button>

        <div className="cert-certificate" style={{
          padding: '3rem 3rem 2.5rem',
          textAlign: 'center',
          border: '8px double rgba(212, 175, 55, 0.35)',
          margin: '10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '1.5rem' }}>
            <div style={{ width: '1px', height: '28px', background: 'rgba(212,175,55,0.5)' }} />
            <Award size={26} strokeWidth={1.5} style={{ color: 'var(--color-gold)' }} />
            <div style={{ width: '1px', height: '28px', background: 'rgba(212,175,55,0.5)' }} />
          </div>

          <span style={{
            fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500,
            letterSpacing: '0.35em', textTransform: 'uppercase',
            color: t.wg, display: 'block', marginBottom: '1rem',
          }}>
            NST BLR · AARAMBH FACULTY ONBOARDING
          </span>

          <h2 style={{
            fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400,
            letterSpacing: '-0.01em', color: t.ch, marginBottom: '0.25rem',
          }}>
            Certificate of Completion
          </h2>

          <p style={{
            fontFamily: t.body, fontSize: '0.8rem', color: t.wg,
            lineHeight: 1.7, maxWidth: '440px', margin: '0 auto 1.5rem',
          }}>
            This certifies that
          </p>

          <p className="cert-script" style={{
            fontFamily: t.heading, fontSize: '2.4rem', color: 'var(--color-gold)',
            margin: '0 0 1.5rem', lineHeight: 1.1,
          }}>
            {fullName}
          </p>

          <p style={{
            fontFamily: t.body, fontSize: '0.8rem', color: t.wg,
            lineHeight: 1.7, maxWidth: '460px', margin: '0 auto',
          }}>
            has successfully completed the full 30–60–90 day faculty onboarding
            program — all three phases covering orientation, guided teaching, and
            independent ownership{ campusName ? ` at ${campusName}` : '' }.
          </p>

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
            marginTop: '2.5rem', gap: '1rem',
          }}>
            <div style={{ textAlign: 'left' }}>
              <div style={{ width: '140px', height: '1px', background: t.ch, marginBottom: '6px' }} />
              <span style={{ fontFamily: t.body, fontSize: '0.6rem', color: t.wg }}>
                Issued {issuedLabel}
              </span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{
                fontFamily: t.body, fontSize: '0.55rem', letterSpacing: '0.15em',
                color: t.wg, textTransform: 'uppercase', display: 'block', marginBottom: '4px',
              }}>
                Certificate №
              </span>
              <span style={{ fontFamily: t.heading, fontSize: '0.85rem', color: t.ch }}>
                {certificate.certificate_number}
              </span>
            </div>
          </div>
        </div>

        {/* Actions (hidden when printing) */}
        <div className="cert-no-print" style={{
          display: 'flex', justifyContent: 'center', gap: '12px', padding: '1.25rem',
          borderTop: '1px solid rgba(26,26,26,0.08)',
        }}>
          <button onClick={() => window.print()} className="lux-btn lux-btn-primary">
            <span className="gold-overlay" /><span className="btn-content">
              <Printer size={14} strokeWidth={1.5} /> Print Certificate
            </span>
          </button>
          <button onClick={close} className="lux-btn lux-btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
