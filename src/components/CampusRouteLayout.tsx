import { Outlet, useParams, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCampus } from '../context/CampusContext';

/**
 * CampusRouteLayout — Wraps all campus-scoped routes.
 *
 * Reads `:campusSlug` from the URL and validates that:
 * 1. The user has a campus assigned (not still in /select-campus flow)
 * 2. If the user has a campus, the slug matches (or the user is super_admin)
 *
 * If no campus_id is set yet, redirects to /select-campus.
 * If the slug doesn't match, redirects to the correct campus URL.
 */
export default function CampusRouteLayout() {
  const { campusSlug: urlSlug } = useParams<{ campusSlug: string }>();
  const { profile, loading: authLoading } = useAuth();
  const { campusSlug: resolvedSlug, isLoading: campusLoading } = useCampus();
  const navigate = useNavigate();

  // Wait for auth and campus resolution
  if (authLoading || campusLoading) {
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

  // User has no campus yet — must select one first
  if (profile && !profile.campus_id && profile.role !== 'super_admin') {
    return <Navigate to="/select-campus" replace />;
  }

  // No slug resolved yet — redirect to select-campus if no campus assigned, or stay loading
  if (!resolvedSlug) {
    if (profile && !profile.campus_id && profile.role !== 'super_admin') {
      return <Navigate to="/select-campus" replace />;
    }
    // Slug is still loading — stay on loading state to prevent redirect loop
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

  // URL slug doesn't match resolved slug — redirect to correct campus
  if (urlSlug && urlSlug !== resolvedSlug) {
    // Replace the slug in the URL path
    const newPath = window.location.pathname.replace(/^\/[^/]+/, `/${resolvedSlug}`);
    navigate(newPath, { replace: true });
    return null;
  }

  return <Outlet />;
}
