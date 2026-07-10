import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../api/supabase';
import { Lock, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [invalidLink, setInvalidLink] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // A password recovery link establishes a temporary recovery session and fires
  // a PASSWORD_RECOVERY auth event. We wait for that event (or an existing
  // recovery session) before allowing the user to set a new password.
  useEffect(() => {
    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      }
    });

    // Fallback: if the recovery session was already established before this
    // component mounted (e.g. supabase-js already parsed the URL), check it.
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (cancelled) return;
      if (sessionError) {
        setInvalidLink(true);
        return;
      }
      if (data.session) {
        setReady(true);
      } else {
        setInvalidLink(true);
      }
    });

    // If neither the event nor an existing session shows up quickly, treat the
    // link as invalid/expired rather than leaving the user on a stuck spinner.
    const timeout = setTimeout(() => {
      if (cancelled) return;
      setReady((current) => {
        if (!current) setInvalidLink(true);
        return current;
      });
    }, 5000);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      subscription?.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message || 'Could not reset password. Please try again.');
        return;
      }
      setSuccess(true);
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err) {
      setError((err as { message?: string }).message || 'Could not reset password. Please try again.');
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
            }}>Set New Password</h1>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-warm-grey)', lineHeight: 1.6 }}>
              Choose a new password for your account.
            </p>
          </div>

          {success ? (
            <div className="lux-alert lux-alert-success" style={{ marginBottom: '1.5rem' }}>
              <CheckCircle2 size={16} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>Password updated. Redirecting to sign in…</span>
            </div>
          ) : invalidLink ? (
            <>
              <div className="lux-alert lux-alert-error" style={{ marginBottom: '1.5rem' }}>
                <AlertCircle size={16} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>This reset link is invalid or has expired. Please request a new one.</span>
              </div>
              <Link to="/forgot-password" className="lux-btn lux-btn-primary" style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                <span className="btn-content">Request New Link</span>
              </Link>
            </>
          ) : !ready ? (
            <div style={{ textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-warm-grey)' }}>
              Verifying reset link…
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="lux-form-group">
                <label className="lux-label" htmlFor="reset-password">New Password</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} strokeWidth={1.5} style={{ position: 'absolute', left: '0', top: '14px', color: 'var(--color-warm-grey)' }} />
                  <input id="reset-password" className="lux-input" type={showPw ? 'text' : 'password'}
                    value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter a new password"
                    style={{ paddingLeft: '28px', paddingRight: '32px' }} required autoComplete="new-password" minLength={6} />
                  <button type="button" onClick={() => setShowPw(!showPw)} style={{
                    position: 'absolute', right: '0', top: '14px',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-warm-grey)', padding: 0,
                  }}>
                    {showPw ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                  </button>
                </div>
              </div>
              <div className="lux-form-group">
                <label className="lux-label" htmlFor="reset-confirm-password">Confirm Password</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} strokeWidth={1.5} style={{ position: 'absolute', left: '0', top: '14px', color: 'var(--color-warm-grey)' }} />
                  <input id="reset-confirm-password" className="lux-input" type={showPw ? 'text' : 'password'}
                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter your new password"
                    style={{ paddingLeft: '28px' }} required autoComplete="new-password" minLength={6} />
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
                <span className="btn-content">{loading ? 'Updating…' : 'Update Password'}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
