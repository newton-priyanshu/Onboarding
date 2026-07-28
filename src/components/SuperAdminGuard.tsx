import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface SuperAdminGuardProps {
  children: React.ReactNode;
  /** Fallback URL for non-super-admin users (default: /) */
  fallbackUrl?: string;
}

/**
 * SuperAdminGuard — Route guard that only allows users with the 'super_admin' role.
 *
 * - Checks if the authenticated user has role === 'super_admin'.
 * - If not, redirects to the fallback URL (default: '/').
 * - Shows a loading state while auth is resolving.
 * - Redirects unauthenticated users to /login.
 *
 * This guard BYPASSES campus context entirely — super admins operate globally.
 * Wrap super admin routes with this guard instead of ProtectedRoute.
 */
export default function SuperAdminGuard({ children, fallbackUrl = '/' }: SuperAdminGuardProps) {
  const { user, profile, loading } = useAuth();

  // Loading state
  if (loading) {
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
          <span>Loading…</span>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Not super_admin
  if (profile?.role !== 'super_admin') {
    return <Navigate to={fallbackUrl} replace />;
  }

  // Success — user is super_admin
  return <>{children}</>;
}
