import { Navigate, useNavigate } from 'react-router-dom';
import { useCampus } from '../context/CampusContext';

interface CampusGuardProps {
  children: React.ReactNode;
  /** Fallback URL to redirect to when campus is not found (default: /campus-select) */
  fallbackUrl?: string;
}

/**
 * CampusGuard — Ensures the campus context is loaded before rendering children.
 *
 * - Shows a loading state while the campus is being resolved from the URL.
 * - Shows an error message if the campus slug doesn't match any active campus.
 * - Renders children once the campus is successfully resolved.
 *
 * This guard should wrap all routes that require a campus context.
 * It is NOT needed for super-admin routes (which bypass campus entirely).
 */
export default function CampusGuard({ children, fallbackUrl = '/campus-select' }: CampusGuardProps) {
  const navigate = useNavigate();
  const { campusSlug, isLoading, error } = useCampus();

  // Loading state
  if (isLoading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '60vh',
        fontFamily: 'var(--font-body)',
        color: 'var(--color-warm-grey)',
        fontSize: '0.875rem',
      }}>
        <div className="lux-container" style={{ textAlign: 'center' }}>
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <span>Loading campus…</span>
        </div>
      </div>
    );
  }

  // Error state — campus not found
  if (error && campusSlug) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '60vh',
        fontFamily: 'var(--font-body)',
      }}>
        <div className="lux-container" style={{ textAlign: 'center', maxWidth: '480px' }}>
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <h2 style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '1.5rem',
            fontWeight: 400,
            marginBottom: '1rem',
            color: 'var(--color-charcoal)',
          }}>
            Campus Not Found
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.875rem',
            color: 'var(--color-warm-grey)',
            lineHeight: 1.6,
            marginBottom: '2rem',
          }}>
            {error}
          </p>
          <button
            onClick={() => { navigate(fallbackUrl); }}
            className="lux-btn lux-btn-primary"
            style={{ minWidth: '200px' }}
          >
            <span className="gold-overlay" />
            <span className="btn-content">Select Campus</span>
          </button>
        </div>
      </div>
    );
  }

  // No campus slug — redirect to campus selection
  if (!campusSlug && !isLoading) {
    return <Navigate to={fallbackUrl} replace />;
  }

  // Success — campus is resolved
  return <>{children}</>;
}
