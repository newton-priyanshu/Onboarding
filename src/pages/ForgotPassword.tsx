import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../api/supabase';
import { Mail, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password',
      });
      if (resetError) {
        setError(resetError.message || 'Could not send reset email. Please try again.');
        return;
      }
      setSent(true);
    } catch (err) {
      setError((err as { message?: string }).message || 'Could not send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lux-section" style={{
      minHeight: 'calc(100vh - 64px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div className="lux-container" style={{ width: '100%' }}>
        <div style={{ maxWidth: '420px', margin: '0 auto' }}>
          <div style={{ marginBottom: '3rem', textAlign: 'center' }}>
            <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
            <h1 style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '2.5rem', fontWeight: 400, lineHeight: 1.1,
              letterSpacing: '-0.02em', marginBottom: '0.75rem',
            }}>Reset Password</h1>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-warm-grey)', lineHeight: 1.6 }}>
              Enter your email and we&apos;ll send you a link to reset your password.
            </p>
          </div>

          {sent ? (
            <div className="lux-alert lux-alert-success" style={{ marginBottom: '1.5rem' }}>
              <CheckCircle2 size={16} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>If an account exists for {email}, a password reset link has been sent. Check your inbox.</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="lux-form-group">
                <label className="lux-label" htmlFor="forgot-email">Email</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} strokeWidth={1.5} style={{ position: 'absolute', left: '0', top: '14px', color: 'var(--color-warm-grey)' }} />
                  <input id="forgot-email" className="lux-input" type="email" value={email}
                    onChange={(e) => setEmail(e.target.value)} placeholder="jane@newton.edu"
                    style={{ paddingLeft: '28px' }} required autoComplete="email" />
                </div>
              </div>
              {error && (
                <div className="lux-alert lux-alert-error" style={{ marginBottom: '1.5rem' }}>
                  <AlertCircle size={16} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span>{error}</span>
                </div>
              )}
              <button type="submit" className="lux-btn lux-btn-primary" disabled={loading} style={{ width: '100%', marginTop: '0.5rem' }}>
                <span className="gold-overlay" />
                <span className="btn-content">{loading ? 'Sending…' : 'Send Reset Link'}</span>
              </button>
            </form>
          )}

          <p style={{ textAlign: 'center', marginTop: '1.5rem', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-warm-grey)' }}>
            Remembered your password?{' '}
            <Link to="/login" style={{ color: 'var(--color-charcoal)', fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: '3px', textDecorationColor: 'rgba(26, 26, 26, 0.3)' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
