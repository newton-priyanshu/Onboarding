import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../api/supabase';
import { GraduationCap } from 'lucide-react';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('Completing sign in…');

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;

    const params = new URLSearchParams(window.location.search);
    const errorDesc = params.get('error_description') || params.get('error');
    if (errorDesc) {
      // The initial setStatus is synchronous and intentional: we must display
      // the error immediately before scheduling a redirect. This is a
      // known-safe pattern (on-mount side-effect, not cascading).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus(`Sign in failed: ${errorDesc}`);
      timers.push(setTimeout(() => { if (!cancelled) navigate('/login', { replace: true }); }, 4000));
      return () => { cancelled = true; timers.forEach(clearTimeout); };
    }

    const timer = setTimeout(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (cancelled) return;
        if (session) {
          navigate('/', { replace: true });
        } else {
          setStatus('Sign in failed. Redirecting…');
          timers.push(setTimeout(() => { if (!cancelled) navigate('/login', { replace: true }); }, 2000));
        }
      });
    }, 1000);
    timers.push(timer);

    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [navigate]);

  return (
    <div className="lux-container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: 'var(--md-radius-md)', background: 'var(--md-primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
          <GraduationCap size={28} />
        </div>
        <p className="body-medium text-muted">{status}</p>
        <div style={{ width: '32px', height: '32px', margin: '1rem auto', border: '3px solid var(--md-primary-container)', borderTopColor: 'var(--md-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
