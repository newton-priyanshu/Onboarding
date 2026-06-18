import { Link } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';

import { t } from '../config/theme.js';

export default function NotFound() {
  return (
    <div className="lux-section" style={{
      minHeight: 'calc(100vh - 64px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div className="lux-container" style={{ textAlign: 'center' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <div className="lux-line lux-line-gold" style={{ margin: '0 auto 1.5rem' }} />
          <h1 style={{
            fontFamily: t.heading, fontSize: '6rem', fontWeight: 400,
            color: t.ch, lineHeight: 1, marginBottom: '0.5rem',
            letterSpacing: '-0.04em',
          }}>
            404
          </h1>
          <p style={{
            fontFamily: t.body, fontSize: '0.875rem', color: t.wg,
            marginBottom: '0.5rem', letterSpacing: '0.15em', textTransform: 'uppercase',
          }}>
            Page Not Found
          </p>
          <p style={{
            fontFamily: t.body, fontSize: '0.9rem', color: t.wg,
            lineHeight: 1.6, marginBottom: '2.5rem', maxWidth: '360px', margin: '0 auto 2.5rem',
          }}>
            The page you're looking for doesn't exist or has been moved.
            Try checking the URL or navigating back to the dashboard.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/" className="lux-btn lux-btn-primary" style={{ textDecoration: 'none' }}>
              <span className="gold-overlay" />
              <span className="btn-content">
                <ArrowLeft size={14} strokeWidth={1.5} /> Back to Dashboard
              </span>
            </Link>
            <Link to="/login" className="lux-btn lux-btn-secondary" style={{ textDecoration: 'none' }}>
              <Search size={14} strokeWidth={1.5} /> Go to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
