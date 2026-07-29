import { useState, useEffect } from 'react';
import { X, ArrowRight, BookOpen, Target, Sparkles } from 'lucide-react';
import { t } from '../config/theme';

interface WelcomeOverlayProps {
  fullName?: string;
}

const WELCOME_KEY = 'has_seen_welcome_overlay';

export default function WelcomeOverlay({ fullName }: WelcomeOverlayProps) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      const hasSeen = localStorage.getItem(WELCOME_KEY);
      if (!hasSeen) {
        // Small delay for page to render first
        const timer = setTimeout(() => setVisible(true), 600);
        return () => clearTimeout(timer);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(WELCOME_KEY, 'true');
    } catch {
      // localStorage unavailable
    }
  }

  function next() {
    if (step < 2) {
      setStep(step + 1);
    } else {
      dismiss();
    }
  }

  if (!visible) return null;

  const name = fullName?.split(' ')[0] || 'there';

  return (
    <div style={{
      position: 'fixed', inset: 0,
      zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(26, 26, 26, 0.7)',
      backdropFilter: 'blur(4px)',
      WebkitBackdropFilter: 'blur(4px)',
      animation: 'luxFadeIn 0.4s var(--ease-lux) forwards',
    }}>
      <div style={{
        background: 'var(--color-alabaster)',
        padding: '3rem',
        maxWidth: '480px',
        width: '90%',
        position: 'relative',
        animation: 'luxFadeInUp 0.5s var(--ease-lux) forwards',
      }}>
        {/* Close button */}
        <button
          onClick={dismiss}
          style={{
            position: 'absolute', top: '1rem', right: '1rem',
            background: 'none', border: 'none', cursor: 'pointer',
            color: t.wg, padding: '4px',
            transition: 'color 200ms var(--ease-lux)',
          }}
          onMouseOver={e => { e.currentTarget.style.color = t.ch; }}
          onMouseOut={e => { e.currentTarget.style.color = t.wg; }}
          aria-label="Dismiss"
        >
          <X size={18} strokeWidth={1.5} />
        </button>

        {/* Step indicators */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '2rem' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              flex: 1, height: '2px',
              background: i <= step ? '#D4A853' : 'rgba(26,26,26,0.1)',
              transition: 'background 300ms var(--ease-lux)',
            }} />
          ))}
        </div>

        {/* Step 0: Welcome */}
        {step === 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '64px', height: '64px',
              border: '1px solid #D4A853',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1.5rem',
              background: 'rgba(212, 168, 83, 0.08)',
            }}>
              <BookOpen size={28} strokeWidth={1.5} style={{ color: '#D4A853' }} />
            </div>
            <h2 style={{
              fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400,
              color: t.ch, marginBottom: '0.75rem', letterSpacing: '-0.02em',
            }}>
              Welcome{', '}{name}
            </h2>
            <p style={{
              fontFamily: t.body, fontSize: '0.85rem', color: t.wg,
              lineHeight: 1.7, marginBottom: '0.5rem',
            }}>
              You&apos;ve joined the <span style={{ fontWeight: 600, color: '#D4A853' }}>NST</span> BLR Faculty Onboarding Programme.{' '}
              Let&apos;s get you started on your journey.
            </p>
          </div>
        )}

        {/* Step 1: Three Phases */}
        {step === 1 && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{
                fontFamily: t.heading, fontSize: '1.5rem', fontWeight: 400,
                color: t.ch, marginBottom: '0.5rem', letterSpacing: '-0.02em',
              }}>
                Your Onboarding <em style={{ fontStyle: 'italic', color: '#D4A853' }}>Journey</em>
              </h2>
              <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>
                Three phases to build your practice. Complete worksheets, get reviewed by your buddy, and progress through each stage.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { icon: BookOpen, label: 'Phase 1 — Orientation', desc: 'Days 1–30: Foundational knowledge', color: '#D4A853' },
                { icon: Target, label: 'Phase 2 — Contribution', desc: 'Days 31–60: Guided teaching', color: '#006494' },
                { icon: Sparkles, label: 'Phase 3 — Ownership', desc: 'Days 61–90: Independent practice', color: '#2E7D32' },
              ].map((p, i) => {
                const Icon = p.icon;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: `${p.color}08`, border: `1px solid ${p.color}20` }}>
                    <Icon size={18} strokeWidth={1.5} style={{ color: p.color, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontFamily: t.body, fontSize: '0.8rem', fontWeight: 500, color: t.ch }}>{p.label}</p>
                      <p style={{ fontFamily: t.body, fontSize: '0.65rem', color: t.wg }}>{p.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Getting Started */}
        {step === 2 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '64px', height: '64px',
              border: '1px solid #D4A853',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1.5rem',
              background: 'rgba(212, 168, 83, 0.08)',
            }}>
              <Target size={28} strokeWidth={1.5} style={{ color: '#D4A853' }} />
            </div>
            <h2 style={{
              fontFamily: t.heading, fontSize: '1.5rem', fontWeight: 400,
              color: t.ch, marginBottom: '0.75rem', letterSpacing: '-0.02em',
            }}>
              Ready to <em style={{ fontStyle: 'italic', color: '#D4A853' }}>Begin</em>?
            </h2>
            <p style={{
              fontFamily: t.body, fontSize: '0.85rem', color: t.wg,
              lineHeight: 1.7, marginBottom: '1rem',
            }}>
              Start with your first worksheet. Complete it, submit for review, and your buddy will guide you through the rest.
            </p>
            <div style={{
              background: 'rgba(26, 26, 26, 0.04)',
              padding: '1rem',
              fontFamily: t.body, fontSize: '0.75rem', color: t.wg, lineHeight: 1.6,
            }}>
              💡 <strong style={{ color: t.ch }}>Pro tip:</strong> Your progress is saved automatically as you type. Never lose your work.
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2rem' }}>
          <button
            onClick={dismiss}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: t.wg, padding: '8px 0',
              transition: 'color 200ms var(--ease-lux)',
            }}
            onMouseOver={e => { e.currentTarget.style.color = t.ch; }}
            onMouseOut={e => { e.currentTarget.style.color = t.wg; }}
          >
            Skip
          </button>
          <button
            onClick={next}
            className="lux-btn lux-btn-primary"
            style={{ fontSize: '0.7rem', padding: '10px 28px' }}
          >
            <span className="gold-overlay" />
            <span className="btn-content">
              {step < 2 ? 'Next' : 'Get Started'}
              <ArrowRight size={14} strokeWidth={1.5} style={{ marginLeft: '6px' }} />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
