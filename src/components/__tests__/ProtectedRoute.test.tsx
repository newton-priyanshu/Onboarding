import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';

const mockUseAuth = vi.hoisted(() => vi.fn());

vi.mock('../../context/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

function LoginPage() {
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
  return <div>Login Page{from ? ` (from ${from})` : ''}</div>;
}

function renderProtected(path: string, requiredRoles?: string[]) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/secret"
          element={
            <ProtectedRoute requiredRoles={requiredRoles as never}>
              <div>Secret Content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>Home Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state and does not redirect while auth is resolving', () => {
    mockUseAuth.mockReturnValue({ user: null, profile: null, loading: true });
    renderProtected('/secret');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument();
    expect(screen.queryByText(/Login Page/)).not.toBeInTheDocument();
  });

  it('redirects an unauthenticated user to /login, carrying the attempted location', () => {
    mockUseAuth.mockReturnValue({ user: null, profile: null, loading: false });
    renderProtected('/secret');
    expect(screen.getByText('Login Page (from /secret)')).toBeInTheDocument();
    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument();
  });

  it('redirects an authenticated user whose role is not in requiredRoles to /', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1' },
      profile: { id: 'u1', role: 'new_joinee' },
      loading: false,
    });
    renderProtected('/secret', ['academic_head', 'onboarding_lead']);
    expect(screen.getByText('Home Page')).toBeInTheDocument();
    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument();
  });

  it('redirects to / when the profile has not loaded yet (no role) even though a user session exists', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1' },
      profile: null,
      loading: false,
    });
    renderProtected('/secret', ['academic_head']);
    expect(screen.getByText('Home Page')).toBeInTheDocument();
    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument();
  });

  it('renders children when the authenticated user has a required role', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1' },
      profile: { id: 'u1', role: 'academic_head' },
      loading: false,
    });
    renderProtected('/secret', ['academic_head', 'onboarding_lead']);
    expect(screen.getByText('Secret Content')).toBeInTheDocument();
  });

  it('renders children for an authenticated user when no roles are required', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1' },
      profile: { id: 'u1', role: 'new_joinee' },
      loading: false,
    });
    renderProtected('/secret');
    expect(screen.getByText('Secret Content')).toBeInTheDocument();
  });
});
