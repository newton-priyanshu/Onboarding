import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, requiredRoles }) {
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

  if (requiredRoles && requiredRoles.length > 0) {
    const userRole = profile?.role;
    if (!userRole || !requiredRoles.includes(userRole)) {
      return <Navigate to="/" replace />;
    }
  }

  return children;
}
