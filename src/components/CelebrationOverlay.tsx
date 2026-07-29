import { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../config/theme';
import { CheckCircle2, ArrowRight, X } from 'lucide-react';

// ─── Styles (injected once) ──────────────────────────

const STYLE_ID = 'celebration-overlay-styles';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes ce-scaleIn {
      0% { opacity: 0; transform: scale(0.9) translateY(20px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }
    @keyframes ce-fadeOut {
      0% { opacity: 1; }
      100% { opacity: 0; }
    }
    @keyframes ce-confettiFall {
      0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
      100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
    }
    @keyframes ce-confettiDrift {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(30px); }
      75% { transform: translateX(-20px); }
    }
    @keyframes ce-shimmer {
      0% { background-position: -200% center; }
      100% { background-position: 200% center; }
    }
    @keyframes ce-ringPulse {
      0% { transform: scale(1); opacity: 0.4; }
      100% { transform: scale(1.15); opacity: 0; }
    }
    .ce-confetti-piece {
      position: fixed;
      width: 8px;
      height: 8px;
      pointer-events: none;
      z-index: 10000;
      animation: ce-confettiFall var(--ce-duration, 3s) var(--ce-delay, 0s) ease-in forwards,
                 ce-confettiDrift 2s var(--ce-delay, 0s) ease-in-out infinite;
      opacity: 0;
    }
    @media (prefers-reduced-motion: reduce) {
      .ce-confetti-piece { display: none; }
      .ce-overlay-inner { animation: none !important; }
    }
  `;
  document.head.appendChild(style);
}

// ─── Confetti Particles ──────────────────────────────

interface ConfettiPiece {
  id: number;
  left: string;
  color: string;
  delay: string;
  duration: string;
  size: string;
}

function generateConfetti(count: number = 40): ConfettiPiece[] {
  const colors = ['#D4AF37', '#C62828', '#1B5E20', '#381E72', '#0369A1', '#E65100', '#7D5260', '#1A1A1A'];
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    color: colors[Math.floor(Math.random() * colors.length)] || '#D4AF37',
    delay: `${Math.random() * 2}s`,
    duration: `${2.5 + Math.random() * 2}s`,
    size: `${6 + Math.random() * 6}px`,
  }));
}

// ─── Props ────────────────────────────────────────────

interface CelebrationOverlayProps {
  /** Which phase number was completed (1, 2, or 3) */
  phaseNum: number;
  /** Called when the overlay is dismissed */
  onDismiss: () => void;
  /** Path to navigate to when "View Progress" is clicked */
  progressPath?: string;
  /** Key used for sessionStorage dedup — pass something unique per phase */
  storageKey: string;
}

// ─── Component ────────────────────────────────────────

export default function CelebrationOverlay({
  phaseNum,
  onDismiss,
  progressPath,
  storageKey,
}: CelebrationOverlayProps) {
  const navigate = useNavigate();
  const [exiting, setExiting] = useState(false);
  const [confetti] = useState(() => generateConfetti(40));

  // Inject CSS once
  useEffect(() => { injectStyles(); }, []);

  // Check sessionStorage — only show once per phase per session
  const [visible, setVisible] = useState(() => {
    try {
      return !sessionStorage.getItem(`celebration_${storageKey}`);
    } catch { return true; }
  });

  // Mark shown & auto-dismiss
  const dismiss = useCallback(() => {
    if (exiting) return;
    setExiting(true);
    setTimeout(() => {
      try { sessionStorage.setItem(`celebration_${storageKey}`, '1'); } catch { /* noop */ }
      setVisible(false);
      onDismiss();
    }, 400);
  }, [exiting, storageKey, onDismiss]);

  useEffect(() => {
    const timer = setTimeout(dismiss, 5000);
    return () => clearTimeout(timer);
  }, [dismiss]);

  // Keyboard dismiss
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, dismiss]);

  if (!visible) return null;

  const phaseLabels = ['', 'Orientation & Understanding', 'Contribution & Guided Teaching', 'Independent Teaching & Ownership'];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Phase ${phaseNum} complete!`}
      onClick={dismiss}
      onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') dismiss(); }}
      tabIndex={0}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: exiting
          ? 'rgba(26, 26, 26, 0)'
          : 'rgba(26, 26, 26, 0.85)',
        transition: 'background 400ms var(--ease-lux)',
        cursor: 'pointer',
        backdropFilter: exiting ? 'blur(0px)' : 'blur(4px)',
        WebkitBackdropFilter: exiting ? 'blur(0px)' : 'blur(4px)',
      }}
    >
      {/* Confetti particles */}
      {!exiting && confetti.map(p => (
        <div
          key={p.id}
          className="ce-confetti-piece"
          style={{
            left: p.left,
            top: '-5%',
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.id % 3 === 0 ? '50%' : '0',
            '--ce-delay': p.delay,
            '--ce-duration': p.duration,
          } as React.CSSProperties}
        />
      ))}

      {/* Main card */}
      <div
        className="ce-overlay-inner"
        onClick={e => e.stopPropagation()}
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
        role="presentation"
        style={{
          position: 'relative',
          maxWidth: '480px', width: '90%',
          padding: '3rem 2.5rem',
          background: 'var(--color-alabaster)',
          textAlign: 'center',
          cursor: 'default',
          animation: exiting
            ? 'ce-fadeOut 400ms var(--ease-lux) forwards'
            : 'ce-scaleIn 600ms var(--ease-lux) forwards',
          transformOrigin: 'center',
        }}
      >
        {/* Close button */}
        <button
          onClick={dismiss}
          aria-label="Dismiss celebration"
          style={{
            position: 'absolute', top: '12px', right: '12px',
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '4px', color: t.wg,
            transition: 'color 200ms var(--ease-lux)',
          }}
          onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.color = t.ch; }}
          onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.color = t.wg; }}
        >
          <X size={16} strokeWidth={1.5} />
        </button>

        {/* Animated ring */}
        <div style={{ position: 'relative', width: '80px', height: '80px', margin: '0 auto 1.5rem' }}>
          <div style={{
            position: 'absolute', inset: 0,
            borderRadius: '50%',
            border: '2px solid var(--color-gold)',
            animation: 'ce-ringPulse 2s ease-out infinite',
          }} />
          <div style={{
            width: '80px', height: '80px',
            borderRadius: '50%',
            border: '2px solid var(--color-gold)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(212, 175, 55, 0.08)',
          }}>
            <CheckCircle2 size={40} strokeWidth={1.5} style={{ color: 'var(--color-gold)' }} />
          </div>
        </div>

        {/* Phase badge */}
        <span style={{
          display: 'inline-block',
          fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500,
          letterSpacing: '0.25em', textTransform: 'uppercase',
          color: t.wg,
          marginBottom: '0.75rem',
          padding: '4px 12px',
          border: '1px solid var(--color-gold)',
        }}>
          Phase {phaseNum} Complete
        </span>

        {/* Title */}
        <h2 style={{
          fontFamily: t.heading,
          fontSize: '2rem',
          fontWeight: 400,
          letterSpacing: '-0.02em',
          color: t.ch,
          marginBottom: '0.75rem',
          lineHeight: 1.15,
        }}>
          {phaseLabels[phaseNum] || `Phase ${phaseNum}`}
        </h2>

        <p style={{
          fontFamily: t.body, fontSize: '0.85rem',
          color: t.wg, lineHeight: 1.6,
          marginBottom: '2rem',
        }}>
          {phaseNum < 3
            ? `You've completed this phase. Take a moment — then continue your journey.`
            : `All three phases are complete. Welcome to the faculty! 🎓`}
        </p>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {progressPath && (
            <button
              onClick={() => { dismiss(); setTimeout(() => navigate(progressPath), 450); }}
              className="lux-btn lux-btn-primary"
            >
              <span className="gold-overlay" /><span className="btn-content">
                View Progress <ArrowRight size={14} strokeWidth={1.5} />
              </span>
            </button>
          )}
          <button onClick={dismiss} className="lux-btn lux-btn-secondary">
            Continue
          </button>
        </div>

        {/* Subtle shimmer on the card bottom */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: '2px',
          background: 'linear-gradient(90deg, transparent, var(--color-gold), transparent)',
          backgroundSize: '200% 100%',
          animation: 'ce-shimmer 2s ease-in-out infinite',
        }} />
      </div>
    </div>
  );
}
