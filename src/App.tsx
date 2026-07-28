import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, Suspense, lazy, type ReactNode } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CampusProvider } from './context/CampusContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import PhaseAccessGuard from './components/PhaseAccessGuard';
import WeekAccessGuard from './components/WeekAccessGuard';
import { ToastProvider } from './components/Toast';
import Dashboard from './pages/Dashboard';
import Phase1 from './pages/Phase1';
import Phase2 from './pages/Phase2';
import Phase3 from './pages/Phase3';
import WeekPage from './pages/WeekPage';
import Assessment from './pages/Assessment';
import Stakeholders from './pages/Stakeholders';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AuthCallback from './pages/AuthCallback';
import NotFound from './pages/NotFound';
import SelectCampus from './pages/SelectCampus';
import DepartmentPhasePage from './pages/DepartmentPhasePage';

// Lazy-loaded heavy pages (admin/buddy/review routes)
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const BuddyDashboard = lazy(() => import('./pages/BuddyDashboard'));
const OnboardingLeadDashboard = lazy(() => import('./pages/OnboardingLeadDashboard'));
const WorksheetReview = lazy(() => import('./pages/WorksheetReview'));
const PhaseReview = lazy(() => import('./pages/PhaseReview'));
const BuddyGatePass = lazy(() => import('./pages/BuddyGatePass'));

// Super Admin pages
import SuperAdminGuard from './components/SuperAdminGuard';
const SuperAdminDashboard = lazy(() => import('./pages/super-admin/SuperAdminDashboard'));
const CampusManagement = lazy(() => import('./pages/super-admin/CampusManagement'));
const TemplateList = lazy(() => import('./pages/super-admin/TemplateList'));
const TemplateCreate = lazy(() => import('./pages/super-admin/TemplateCreate'));
const TemplateDetail = lazy(() => import('./pages/super-admin/TemplateDetail'));

import { ALL_WORKSHEETS, WORKSHEET_COMPONENTS } from './config/worksheetConfig';
import WeekWorksheetPage from './pages/WeekWorksheetPage';
import type { Department } from './types/supabase';

// ─── Types ──────────────────────────────────────────────

interface PhaseData {
  num: number;
  sheets: Array<{
    id: string;
    title: string;
    reviewer: string;
    color: string;
    isGate?: boolean;
  }>;
}

// ─── Fallback for lazy-loaded pages ────────────────────

function PageFallback() {
  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '900px', margin: '0 auto', paddingTop: '4rem', textAlign: 'center' }}>
        <div className="lux-line" style={{ margin: '0 auto 1.5rem', width: '60px' }} />
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-warm-grey)' }}>Loading…</div>
      </div>
    </div>
  );
}

// ─── Layout Wrapper ─────────────────────────────────────

function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {children}
    </div>
  );
}

/**
 * Role-aware landing for "/". lead_instructor users are buddies, not new
 * joinees — sending them to the phase-card Dashboard dead-ends them, so route
 * them to the buddy dashboard instead. All other roles keep the existing
 * Dashboard.
 */
function HomeRoute() {
  const { profile, loading } = useAuth();

  if (loading) {
    return <PageFallback />;
  }

  // Profile not loaded yet — wait for fetchProfile to finish
  // (prevents Dashboard flash where profile is briefly null after sign-in)
  if (!profile) {
    return <PageFallback />;
  }

  // New users without a campus_id must select their campus first
  if (!profile.campus_id && profile.role !== 'super_admin') {
    return <Navigate to="/select-campus" replace />;
  }

  if (profile.role === 'lead_instructor') {
    return <Navigate to="/buddy" replace />;
  }

  return <Dashboard />;
}

/** Department dashboard — shared for Progression and Operations */
function DeptDashboard({ dept, label, desc }: { dept: Department; label: string; desc: string }) {
  const navigate = useNavigate();
  return (
    <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="lux-container" style={{ textAlign: 'center', maxWidth: '500px' }}>
        <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 400, marginBottom: '0.5rem' }}>{label}</h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-warm-grey)', marginBottom: '2rem' }}>{desc}</p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => navigate(`/${dept}/phase-1`)} className="lux-btn lux-btn-primary">
            <span className="gold-overlay" /><span className="btn-content">Phase 1 — Orientation</span>
          </button>
          <button onClick={() => navigate(`/${dept}/phase-2`)} className="lux-btn lux-btn-secondary">
            Phase 2 — Contribution
          </button>
          <button onClick={() => navigate(`/${dept}/phase-3`)} className="lux-btn lux-btn-secondary">
            Phase 3 — Ownership
          </button>
        </div>
      </div>
    </div>
  );
}

/** Department worksheet wrapper — looks up the component from WORKSHEET_COMPONENTS */
function DeptWorksheetWrapper(_props: { dept: Department }) {
  const location = useLocation();
  const wsId = location.pathname.split('/').pop() || '';
  const Component = WORKSHEET_COMPONENTS[wsId];

  if (!Component) {
    return <NotFound />;
  }

  return (
    <ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}>
      <Suspense fallback={<PageFallback />}>
        <Component />
      </Suspense>
    </ProtectedRoute>
  );
}

/** Wraps the routed page content in an ErrorBoundary that resets on route change */
function AppRoutes() {
  const location = useLocation();
  // Generate dynamic worksheet routes — exclude department-specific worksheets (they have their own routes)
  const DEPT_PREFIXES = ['pr_', 'op_'];
  const worksheetRoutes = Object.entries(ALL_WORKSHEETS).flatMap(([phaseName, phaseData]) => {
    // Skip department phase entries (they have explicit routes)
    if (phaseName.startsWith('Progression') || phaseName.startsWith('Operations')) return [];
    const data = phaseData as PhaseData;
    const phasePath = phaseName.toLowerCase().replace(' ', '-');
    return data.sheets
      .filter(sheet => !sheet.isGate && !DEPT_PREFIXES.some(p => sheet.id.startsWith(p)))
      .map(sheet => {
        const Component = WORKSHEET_COMPONENTS[sheet.id];
        if (!Component) return null;
        const wsNum = sheet.id.includes('_w') ? sheet.id.split('_w')[1] : '';
        const routePath = `/${phasePath}/worksheet-${wsNum}`;
        const phaseNum = data.num;
        const wrapped = phaseNum > 1
          ? <PhaseAccessGuard phaseNum={phaseNum}><Suspense fallback={<PageFallback />}><Component /></Suspense></PhaseAccessGuard>
          : <Suspense fallback={<PageFallback />}><Component /></Suspense>;
        return (
          <Route key={sheet.id} path={routePath} element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}>{wrapped}</ProtectedRoute>} />
        );
      })
  });

  return (
    <ErrorBoundary locationKey={location.key}>
      <Routes>
        {/* Auth routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/select-campus" element={<ProtectedRoute><SelectCampus /></ProtectedRoute>} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Admin / Lead — wrapped in Suspense for code-splitting */}
        <Route path="/admin" element={<ProtectedRoute requiredRoles={['academic_head', 'onboarding_lead']}><Suspense fallback={<PageFallback />}><AdminDashboard /></Suspense></ProtectedRoute>} />
        <Route path="/buddy" element={<ProtectedRoute requiredRoles={['lead_instructor', 'academic_head']}><Suspense fallback={<PageFallback />}><BuddyDashboard /></Suspense></ProtectedRoute>} />
        <Route path="/onboarding-lead" element={<ProtectedRoute requiredRoles={['onboarding_lead']}><Suspense fallback={<PageFallback />}><OnboardingLeadDashboard /></Suspense></ProtectedRoute>} />
        {/* Phase Review Routes */}
        <Route path="/admin/review-phase/:userId/:phaseNum" element={<ProtectedRoute requiredRoles={['academic_head', 'onboarding_lead']}><Suspense fallback={<PageFallback />}><PhaseReview /></Suspense></ProtectedRoute>} />
        <Route path="/onboarding-lead/review-phase/:userId/:phaseNum" element={<ProtectedRoute requiredRoles={['onboarding_lead', 'academic_head']}><Suspense fallback={<PageFallback />}><PhaseReview /></Suspense></ProtectedRoute>} />

        {/* Buddy Gate Pass Routes */}
        <Route path="/buddy/gate-pass/:userId/:gateId" element={<ProtectedRoute requiredRoles={['lead_instructor', 'academic_head']}><Suspense fallback={<PageFallback />}><BuddyGatePass /></Suspense></ProtectedRoute>} />

        {/* Individual Worksheet Review Routes */}
        <Route path="/admin/review/:userId/:worksheetId" element={<ProtectedRoute requiredRoles={['academic_head', 'onboarding_lead']}><Suspense fallback={<PageFallback />}><WorksheetReview /></Suspense></ProtectedRoute>} />
        <Route path="/buddy/review/:userId/:worksheetId" element={<ProtectedRoute requiredRoles={['lead_instructor', 'academic_head']}><Suspense fallback={<PageFallback />}><WorksheetReview /></Suspense></ProtectedRoute>} />
        <Route path="/onboarding-lead/review/:userId/:worksheetId" element={<ProtectedRoute requiredRoles={['onboarding_lead', 'academic_head']}><Suspense fallback={<PageFallback />}><WorksheetReview /></Suspense></ProtectedRoute>} />

        {/* Dashboard / Phases */}
        <Route path="/" element={<ProtectedRoute><HomeRoute /></ProtectedRoute>} />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/phase-1" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><Phase1 /></ProtectedRoute>} />
        <Route path="/phase-2" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><Phase2 /></ProtectedRoute>} />
        <Route path="/phase-3" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><Phase3 /></ProtectedRoute>} />

        {/* Department Routes — Progression & Operations */}
        <Route path="/progression" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}>
          <DeptDashboard dept="progression" label="Progression Department" desc="Progress tracking, assessment design, and student outcome analysis" />
        </ProtectedRoute>} />
        <Route path="/progression/phase-1" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><DepartmentPhasePage dept="progression" phaseNum={1} /></ProtectedRoute>} />
        <Route path="/progression/phase-2" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><DepartmentPhasePage dept="progression" phaseNum={2} /></ProtectedRoute>} />
        <Route path="/progression/phase-3" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><DepartmentPhasePage dept="progression" phaseNum={3} /></ProtectedRoute>} />
        <Route path="/progression/phase-1/worksheet/:worksheetId" element={<DeptWorksheetWrapper dept="progression" />} />
        <Route path="/progression/phase-2/worksheet/:worksheetId" element={<DeptWorksheetWrapper dept="progression" />} />
        <Route path="/progression/phase-3/worksheet/:worksheetId" element={<DeptWorksheetWrapper dept="progression" />} />
        <Route path="/operations" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}>
          <DeptDashboard dept="operations" label="Operations Department" desc="Campus operations, scheduling, compliance, and resource management" />
        </ProtectedRoute>} />
        <Route path="/operations/phase-1" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><DepartmentPhasePage dept="operations" phaseNum={1} /></ProtectedRoute>} />
        <Route path="/operations/phase-2" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><DepartmentPhasePage dept="operations" phaseNum={2} /></ProtectedRoute>} />
        <Route path="/operations/phase-3" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><DepartmentPhasePage dept="operations" phaseNum={3} /></ProtectedRoute>} />
        <Route path="/operations/phase-1/worksheet/:worksheetId" element={<DeptWorksheetWrapper dept="operations" />} />
        <Route path="/operations/phase-2/worksheet/:worksheetId" element={<DeptWorksheetWrapper dept="operations" />} />
        <Route path="/operations/phase-3/worksheet/:worksheetId" element={<DeptWorksheetWrapper dept="operations" />} />

        {/* FTP Week Routes — Week 1 always open, weeks 2+ gated behind prior week completion */}
        <Route path="/week-1" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><WeekPage weekNum={1} /></ProtectedRoute>} />
        <Route path="/week-2" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><WeekAccessGuard weekNum={2}><WeekPage weekNum={2} /></WeekAccessGuard></ProtectedRoute>} />
        <Route path="/week-3" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><WeekAccessGuard weekNum={3}><WeekPage weekNum={3} /></WeekAccessGuard></ProtectedRoute>} />
        <Route path="/week-4" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><WeekAccessGuard weekNum={4}><WeekPage weekNum={4} /></WeekAccessGuard></ProtectedRoute>} />
        {/* FTP Week Worksheet Routes — also gated by week access */}
        <Route path="/week-1/worksheet/:worksheetId" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><WeekWorksheetPage weekNum={1} /></ProtectedRoute>} />
        <Route path="/week-2/worksheet/:worksheetId" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><WeekAccessGuard weekNum={2}><WeekWorksheetPage weekNum={2} /></WeekAccessGuard></ProtectedRoute>} />
        <Route path="/week-3/worksheet/:worksheetId" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><WeekAccessGuard weekNum={3}><WeekWorksheetPage weekNum={3} /></WeekAccessGuard></ProtectedRoute>} />
        <Route path="/week-4/worksheet/:worksheetId" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><WeekAccessGuard weekNum={4}><WeekWorksheetPage weekNum={4} /></WeekAccessGuard></ProtectedRoute>} />

        {/* Dynamic Worksheet Routes */}
        {worksheetRoutes}

        {/* Super Admin Routes */}
        <Route path="/super-admin" element={
          <SuperAdminGuard><Suspense fallback={<PageFallback />}><SuperAdminDashboard /></Suspense></SuperAdminGuard>
        } />
        <Route path="/super-admin/campuses" element={
          <SuperAdminGuard><Suspense fallback={<PageFallback />}><CampusManagement /></Suspense></SuperAdminGuard>
        } />
        <Route path="/super-admin/templates" element={
          <SuperAdminGuard><Suspense fallback={<PageFallback />}><TemplateList /></Suspense></SuperAdminGuard>
        } />
        <Route path="/super-admin/templates/create" element={
          <SuperAdminGuard><Suspense fallback={<PageFallback />}><TemplateCreate /></Suspense></SuperAdminGuard>
        } />
        <Route path="/super-admin/templates/:id" element={
          <SuperAdminGuard><Suspense fallback={<PageFallback />}><TemplateDetail /></Suspense></SuperAdminGuard>
        } />

        {/* Legacy */}
        <Route path="/assessment" element={<ProtectedRoute requiredRoles={['academic_head', 'onboarding_lead', 'lead_instructor']}><Assessment /></ProtectedRoute>} />
        <Route path="/stakeholders" element={<ProtectedRoute><Stakeholders /></ProtectedRoute>} />

        {/* 404 catch-all */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  );
}

// ─── App Component ──────────────────────────────────────

export default function App() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('onboarding_progress');
      if (stored) setProgress(Number(stored));
    } catch { /* localStorage unavailable */ }
  }, []);

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      setProgress(e.detail);
      try { localStorage.setItem('onboarding_progress', String(e.detail)); } catch { /* localStorage unavailable */ }
    };
    window.addEventListener('progressUpdate', handler as EventListener);
    return () => window.removeEventListener('progressUpdate', handler as EventListener);
  }, []);

  return (
    <BrowserRouter>
      <CampusProvider>
        <AuthProvider>
          <ToastProvider>
          <AppLayout>
            <Navbar progress={progress} />
            <main style={{ flex: 1, position: 'relative', zIndex: 1 }}>
              <AppRoutes />
            </main>

            <footer style={{
              textAlign: 'center',
              padding: '2rem 1rem',
              borderTop: '1px solid rgba(26, 26, 26, 0.12)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.75rem',
              lineHeight: 1.6,
              color: 'var(--color-warm-grey)',
            }}>
              <span className="lux-line" style={{ margin: '0 auto 1rem' }} />
              <p><span style={{ fontWeight: 600, color: '#D4A853' }}>NST</span> BLR <span style={{ opacity: 0.3 }}>-</span> AARAMBH</p>
              <p style={{ fontSize: '0.65rem', marginTop: '2px', opacity: 0.7 }}>Faculty Onboarding Programme</p>
            </footer>
          </AppLayout>
        </ToastProvider>        </AuthProvider>
      </CampusProvider>
    </BrowserRouter>
  );
}
