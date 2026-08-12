import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useParams, useLocation } from 'react-router-dom';
import { LegacyRedirect, LegacyRouteFallback } from '../LegacyRedirect';
import { LEGACY_TOP_LEVEL_ROUTES } from '../../constants/campus';

// LegacyRedirect consumes useAuth (profile) + useCampus (campuses) — mock
// both so the redirect logic can be tested in isolation inside a router.
const mockUseAuth = vi.hoisted(() => vi.fn());
const mockUseCampus = vi.hoisted(() => vi.fn());

vi.mock('../../context/AuthContext', () => ({
  useAuth: mockUseAuth,
}));
vi.mock('../../context/CampusContext', () => ({
  useCampus: mockUseCampus,
}));

// ─── Campus-scoped markers (prove the redirect landed on the right route) ──

function ProgressionPhase1() {
  const { campusSlug } = useParams<{ campusSlug: string }>();
  return <div>PROGRESSION_PHASE_1 @ {campusSlug}</div>;
}

function ProgressionIndex() {
  const { campusSlug } = useParams<{ campusSlug: string }>();
  return <div>PROGRESSION_INDEX @ {campusSlug}</div>;
}

function OperationsPhase2() {
  const { campusSlug } = useParams<{ campusSlug: string }>();
  return <div>OPERATIONS_PHASE_2 @ {campusSlug}</div>;
}

function OperationsIndex() {
  const { campusSlug } = useParams<{ campusSlug: string }>();
  return <div>OPERATIONS_INDEX @ {campusSlug}</div>;
}

function CampusHome() {
  // These explicit routes (/default, /blr) have no :campusSlug param — derive
  // the slug from the pathname instead.
  const { pathname } = useLocation();
  const slug = pathname.split('/').filter(Boolean)[0] || '';
  return <div>CAMPUS_HOME @ {slug}</div>;
}

/**
 * Mirrors App.tsx's route structure for the legacy → campus redirect:
 * - Flat legacy routes (one per allowlist entry) render LegacyRedirect
 * - Campus-scoped routes exist under /:campusSlug/...
 * - The catch-all renders LegacyRouteFallback (smart 404 / nested redirect)
 */
function renderLegacy(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        {/* Flat legacy redirects — one per allowlist entry */}
        {[...LEGACY_TOP_LEVEL_ROUTES].map(route => (
          <Route key={route} path={`/${route}`} element={<LegacyRedirect />} />
        ))}

        {/* Campus-scoped routes the redirects should land on.
            NOTE: no bare /:campusSlug route here — it would shadow the
            catch-all for single-segment paths (like /worksheet), which is
            exactly what LegacyRouteFallback must handle. Only explicit
            targets are registered. */}
        <Route path="/:campusSlug/progression" element={<ProgressionIndex />} />
        <Route path="/:campusSlug/progression/phase-1" element={<ProgressionPhase1 />} />
        <Route path="/:campusSlug/operations" element={<OperationsIndex />} />
        <Route path="/:campusSlug/operations/phase-2" element={<OperationsPhase2 />} />
        <Route path="/default" element={<CampusHome />} />
        <Route path="/blr" element={<CampusHome />} />

        {/* Smart 404 — redirects nested legacy URLs, renders NotFound otherwise */}
        <Route path="*" element={<LegacyRouteFallback />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Legacy flat → campus routing (Phase 9 backward compat)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no profile, no campuses → target falls back to DEFAULT_CAMPUS_SLUG ('default')
    mockUseAuth.mockReturnValue({ profile: null });
    mockUseCampus.mockReturnValue({ campuses: [] });
  });

  it('redirects flat /progression/phase-1 to the campus-scoped route', () => {
    renderLegacy('/progression/phase-1');
    expect(screen.getByText('PROGRESSION_PHASE_1 @ default')).toBeInTheDocument();
  });

  it('redirects flat /operations/phase-2 to the campus-scoped route', () => {
    renderLegacy('/operations/phase-2');
    expect(screen.getByText('OPERATIONS_PHASE_2 @ default')).toBeInTheDocument();
  });

  it('redirects flat single-segment /progression and /operations to campus routes', () => {
    renderLegacy('/progression');
    expect(screen.getByText('PROGRESSION_INDEX @ default')).toBeInTheDocument();

    renderLegacy('/operations');
    expect(screen.getByText('OPERATIONS_INDEX @ default')).toBeInTheDocument();
  });

  it('prefers the user\'s assigned campus slug when the profile has one', () => {
    mockUseAuth.mockReturnValue({ profile: { campus_id: 'c2' } });
    mockUseCampus.mockReturnValue({ campuses: [{ id: 'c2', slug: 'blr' }] });

    renderLegacy('/progression/phase-1');
    expect(screen.getByText('PROGRESSION_PHASE_1 @ blr')).toBeInTheDocument();
  });

  it('renders NotFound for an unknown top-level route', () => {
    renderLegacy('/does-not-exist');
    expect(screen.getByText('Page Not Found')).toBeInTheDocument();
  });

  it('renders NotFound for /nonsense — catch-all never falls back to dashboard', () => {
    renderLegacy('/nonsense');
    expect(screen.getByText('Page Not Found')).toBeInTheDocument();
    // No home marker should render for unknown routes (BUG-6) — the NotFound
    // page's own "Back to Dashboard" link text is expected, so only assert the
    // CAMPUS_HOME marker absence.
    expect(screen.queryByText(/CAMPUS_HOME/i)).not.toBeInTheDocument();
  });

  it('redirects bare /worksheet and /worksheet/ to campus home (BUG-5)', () => {
    renderLegacy('/worksheet');
    expect(screen.getByText('CAMPUS_HOME @ default')).toBeInTheDocument();
  });

  it('redirects bare /worksheet/ (trailing slash) to campus home (BUG-5)', () => {
    renderLegacy('/worksheet/');
    expect(screen.getByText('CAMPUS_HOME @ default')).toBeInTheDocument();
  });

  it('keeps /worksheet/999999 as a 404 — only bare worksheet paths redirect (BUG-5)', () => {
    renderLegacy('/worksheet/999999');
    expect(screen.getByText('Page Not Found')).toBeInTheDocument();
  });

  it('prefers the user\'s campus for bare /worksheet redirects (BUG-5)', () => {
    mockUseAuth.mockReturnValue({ profile: { campus_id: 'c2' } });
    mockUseCampus.mockReturnValue({ campuses: [{ id: 'c2', slug: 'blr' }] });

    renderLegacy('/worksheet/');
    expect(screen.getByText('CAMPUS_HOME @ blr')).toBeInTheDocument();
  });
});
