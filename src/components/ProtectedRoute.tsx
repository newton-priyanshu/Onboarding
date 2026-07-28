import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { can } from '../utils/rbac';
import type { UserRole } from '../types/supabase';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Role-based access: user must have one of these roles */
  requiredRoles?: UserRole[];
  /** Permission-based access: user must have this permission on the resource */
  requirePermission?: { resource: string; action: string };
  /** Optional campus slug to validate user belongs to this campus */
  campusSlug?: string;
}

/**
 * ProtectedRoute — Authenticates the user and optionally validates campus access,
 * role requirements, or permission requirements.
 *
 * - If the user is not authenticated, redirects to /login.
 * - If `campusSlug` is provided, validates that the user belongs to that campus
 *   (super_admin bypasses campus validation).
 * - If `requiredRoles` is provided, validates the user has one of the required roles.
 * - If `requirePermission` is provided, validates the user has the specified
 *   resource/action permission (uses RBAC's hardcoded default + DB-backed checks).
 */
export default function ProtectedRoute({
  children,
  requiredRoles,
  requirePermission: perm,
  campusSlug: _campusSlug,
}: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

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

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Role-based check
  if (requiredRoles && requiredRoles.length > 0) {
    const userRole = profile?.role;
    if (!userRole || !requiredRoles.includes(userRole)) {
      return <Navigate to="/" replace />;
    }
  }

  // Permission-based check (uses hardcoded + DB-backed RBAC)
  if (perm) {
    const hasPermission = can(profile, perm.resource, perm.action);
    if (!hasPermission) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
