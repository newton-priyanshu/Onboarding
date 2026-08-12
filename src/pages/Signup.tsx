import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, Mail, Lock, AlertCircle, Eye, EyeOff, Building } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const ALLOWED_DOMAIN = 'newtonschool.co';

export default function Signup() {
  const navigate = useNavigate();
  const { signUp, signInWithGoogle } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  // Campus selection happens after signup on /select-campus

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    // Domain check
    if (!email.trim().toLowerCase().endsWith('@' + ALLOWED_DOMAIN)) {
      setError(`Only @${ALLOWED_DOMAIN} email addresses are allowed. Please use your NST company email.`);
      return;
    }
    setLoading(true);
    try {
      await signUp(email, password, fullName);
      // Email confirmation is disabled — user is auto-signed-in.
      // Navigate to / where HomeRoute will redirect to /select-campus
      // if the user hasn't picked a campus yet.
      navigate('/', { replace: true });
    } catch (err) {
      setError((err as { message?: string }).message || 'Sign up failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="lux-container" style={{ width: '100%' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <div style={{ marginBottom: '3rem', textAlign: 'center' }}>
            <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.5rem', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: '0.75rem' }}>Create Account</h1>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-warm-grey)' }}>Begin your journey with NST BLR - AARAMBH</p>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Campus hint banner */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2rem',
              padding: '0.75rem 1rem',
              background: 'rgba(0, 100, 148, 0.06)',
              border: '1px solid rgba(0, 100, 148, 0.15)',
              fontFamily: 'var(--font-body)', fontSize: '0.78rem',
              color: 'var(--color-warm-grey)',
              lineHeight: 1.5,
            }}>
              <Building size={16} strokeWidth={1.5} style={{ flexShrink: 0, color: '#006494' }} />
              <span>After signing up, you&apos;ll select your <strong>college/campus</strong> before accessing the dashboard.</span>
            </div>

            <div className="lux-form-group">
              <label className="lux-label" htmlFor="signup-name">Full Name</label>
              <div style={{ position: 'relative' }}>
                <User size={16} strokeWidth={1.5} style={{ position: 'absolute', left: '0', top: '14px', color: 'var(--color-warm-grey)' }} />
                <input id="signup-name" className="lux-input" value={fullName} onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Jane Smith" style={{ paddingLeft: '28px' }} required autoComplete="name" />
              </div>
            </div>
            <div className="lux-form-group">
              <label className="lux-label" htmlFor="signup-email">Email</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} strokeWidth={1.5} style={{ position: 'absolute', left: '0', top: '14px', color: 'var(--color-warm-grey)' }} />
                <input id="signup-email" className="lux-input" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="name@newtonschool.co" style={{ paddingLeft: '28px' }} required autoComplete="email" />
              </div>
            </div>
            <div className="lux-form-group">
              <label className="lux-label" htmlFor="signup-password">Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} strokeWidth={1.5} style={{ position: 'absolute', left: '0', top: '14px', color: 'var(--color-warm-grey)' }} />
                <input id="signup-password" className="lux-input" type={showPw ? 'text' : 'password'}
                  value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 6 characters"
                  style={{ paddingLeft: '28px', paddingRight: '32px' }} required autoComplete="new-password" />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  aria-pressed={showPw}
                  style={{ position: 'absolute', right: '0', top: '14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-warm-grey)', padding: 0 }}>
                  {showPw ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                </button>
              </div>
            </div>

            {error && <div className="lux-alert lux-alert-error" style={{ marginBottom: '1.5rem' }}>
              <AlertCircle size={16} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: '1px' }} /><span>{error}</span>
            </div>}

            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem',
              padding: '0.5rem 0.75rem',
              background: 'rgba(0, 100, 148, 0.06)', border: '1px solid rgba(0, 100, 148, 0.15)',
              fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-warm-grey)',
            }}>
              <Building size={14} strokeWidth={1.5} style={{ flexShrink: 0, color: '#006494' }} />
              <span>Only <strong>@newtonschool.co</strong> emails can register</span>
            </div>

            <button type="submit" className="lux-btn lux-btn-primary" disabled={loading} style={{ width: '100%' }}>
              <span className="gold-overlay" /><span className="btn-content">{loading ? 'Creating account…' : 'Create Account'}</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', margin: '1.5rem 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(26, 26, 26, 0.15)' }} />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>or</span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(26, 26, 26, 0.15)' }} />
            </div>

            <button type="button" onClick={async () => { setError(''); setGoogleLoading(true); try { await signInWithGoogle(); } catch (err) { setError((err as { message?: string }).message || 'Google sign in failed.'); setGoogleLoading(false); } }}
              disabled={googleLoading} className="lux-btn lux-btn-secondary" style={{ width: '100%' }}>
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {googleLoading ? 'Redirecting to Google…' : 'Sign up with Google'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '2rem', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-warm-grey)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--color-charcoal)', fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: '3px', textDecorationColor: 'rgba(26, 26, 26, 0.3)' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
