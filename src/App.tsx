import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect, Suspense, lazy, type ReactNode } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CampusProvider, useCampus } from './context/CampusContext';
import { RBACProvider } from './context/RBACContext';
import { ThemeProvider } from './context/ThemeContext';
import Navbar from './components/Navbar';
import GlobalCommandPalette from './components/GlobalCommandPalette';
import WelcomeOverlay from './components/WelcomeOverlay';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import PhaseAccessGuard from './components/PhaseAccessGuard';
import WeekAccessGuard from './components/WeekAccessGuard';
import CampusRouteLayout from './components/CampusRouteLayout';
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
import DeptDashboard from './pages/DeptDashboard';
import CampusHeadDashboard from './pages/CampusHeadDashboard';

// Lazy-loaded heavy pages (admin/buddy/review routes)
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const BuddyDashboard = lazy(() => import('./pages/BuddyDashboard'));
const OnboardingLeadDashboard = lazy(() => import('./pages/OnboardingLeadDashboard'));
const WorksheetReview = lazy(() => import('./pages/WorksheetReview'));
const PhaseReview = lazy(() => import('./pages/PhaseReview'));
const BuddyGatePass = lazy(() => import('./pages/BuddyGatePass'));

// Campus Admin pages
const CampusAdminDashboard = lazy(() => import('./pages/campus-admin/CampusAdminDashboard'));
const CampusUserManagement = lazy(() => import('./pages/campus-admin/CampusUserManagement'));
const CampusReports = lazy(() => import('./pages/campus-admin/CampusReports'));
const CampusSettings = lazy(() => import('./pages/campus-admin/CampusSettings'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));

// Super Admin pages
import SuperAdminGuard from './components/SuperAdminGuard';
const SuperAdminDashboard = lazy(() => import('./pages/super-admin/SuperAdminDashboard'));
const CampusManagement = lazy(() => import('./pages/super-admin/CampusManagement'));
const TemplateList = lazy(() => import('./pages/super-admin/TemplateList'));
const TemplateCreate = lazy(() => import('./pages/super-admin/TemplateCreate'));
const TemplateDetail = lazy(() => import('./pages/super-admin/TemplateDetail'));
const CampusDetail = lazy(() => import('./pages/super-admin/CampusDetail'));
const PlatformAnalytics = lazy(() => import('./pages/super-admin/PlatformAnalytics'));
const AuditLogView = lazy(() => import('./pages/super-admin/AuditLogView'));

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
 * Root-level handler for "/". Routes users based on campus and role:
 * - No campus_id → /select-campus
 * - Has campus_id → /:campusSlug/ (campus-scoped index route)
 *
 * The campus-scoped HomeRoute (inside CampusRouteLayout) handles the
 * actual dashboard rendering and role-based redirects.
 */
function HomeRoute() {
  const { profile, loading } = useAuth();
  const { campusSlug } = useCampus();

  if (loading) {
    return <PageFallback />;
  }

  // Profile not loaded yet — wait for fetchProfile to finish
  if (!profile) {
    return <PageFallback />;
  }

  // New users without a campus_id must select their campus first
  if (!profile.campus_id && profile.role !== 'super_admin') {
    return <Navigate to="/select-campus" replace />;
  }

  // Redirect super admin to their dashboard
  if (profile.role === 'super_admin') {
    return <Navigate to="/super-admin" replace />;
  }

  // Redirect to campus-scoped URL
  if (campusSlug) {
    return <Navigate to={`/${campusSlug}/`} replace />;
  }

  // Fallback — campusSlug not yet resolved
  return <PageFallback />;
}

/**
 * Campus-scoped landing — renders the actual dashboard for authenticated
 * users who already have a campus assigned. This is the index route
 * inside CampusRouteLayout.
 */
function CampusHomeRoute() {
  const { profile, loading } = useAuth();

  if (loading) {
    return <PageFallback />;
  }

  if (!profile) {
    return <PageFallback />;
  }

  // Campus Head → campus head dashboard
  if (profile.role === 'campus_head') {
    return <CampusHeadDashboard />;
  }

  // Lead instructor → buddy dashboard
  if (profile.role === 'lead_instructor') {
    return <Navigate to="buddy" replace />;
  }

  // Department-aware redirect: progression/operations users go to their dept dashboard
  if (profile.department && profile.department !== 'academics') {
    return <Navigate to={profile.department} replace />;
  }

  return <Dashboard />;
}

/** Department worksheet wrapper — looks up the component from WORKSHEET_COMPONENTS */
function DeptWorksheetWrapper(_props: { dept: Department }) {
  const location = useLocation();
  // Extract worksheet ID from path like /:campusSlug/progression/phase-1/worksheet/pr_p1_w1
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

/** Role-aware admin dashboard wrapper — campus_admin sees dedicated dashboard, others see existing */
function RoleAwareAdminDashboard() {
  const { profile } = useAuth();
  if (profile?.role === 'campus_admin') {
    return <CampusAdminDashboard />;
  }
  return <AdminDashboard />;
}

/** Global overlay components — shown on the dashboard home */
function GlobalOverlays() {
  const { profile, loading } = useAuth();
  if (loading || !profile) return null;
  // Only show welcome overlay to new joinees on their first visit
  if (profile.role === 'new_joinee' || profile.role === 'lab_instructor') {
    return <WelcomeOverlay fullName={profile.full_name || undefined} />;
  }
  return null;
}

/** Wraps the routed page content in an ErrorBoundary that resets on route change */
function AppRoutes() {
  const location = useLocation();
  // Generate dynamic worksheet routes (relative to campus slug)
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
        // Route is relative to /:campusSlug/ parent
        const routePath = `${phasePath}/worksheet-${wsNum}`;
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
        {/* ─── Auth Routes (flat — no campus prefix) ─── */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* ─── Campus Selection (flat — happens before campus assignment) ─── */}
        <Route path="/select-campus" element={<ProtectedRoute><SelectCampus /></ProtectedRoute>} />

        {/* ─── Super Admin Routes (flat — no campus context) ─── */}
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
        <Route path="/super-admin/campuses/:campusId" element={
          <SuperAdminGuard><Suspense fallback={<PageFallback />}><CampusDetail /></Suspense></SuperAdminGuard>
        } />
        <Route path="/super-admin/analytics" element={
          <SuperAdminGuard><Suspense fallback={<PageFallback />}><PlatformAnalytics /></Suspense></SuperAdminGuard>
        } />
        <Route path="/super-admin/audit-log" element={
          <SuperAdminGuard><Suspense fallback={<PageFallback />}><AuditLogView /></Suspense></SuperAdminGuard>
        } />

        {/* ─── Root redirect: handles campus routing ─── */}
        <Route path="/" element={<ProtectedRoute><HomeRoute /></ProtectedRoute>} />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />

        {/* ─── Campus-Scoped Routes (all under /:campusSlug) ─── */}
        <Route path="/:campusSlug" element={<ProtectedRoute><CampusRouteLayout /></ProtectedRoute>}>
          {/* Index route — the dashboard/home (campus-aware) */}
          <Route index element={<CampusHomeRoute />} />

          {/* Phase Routes */}
          <Route path="phase-1" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><Phase1 /></ProtectedRoute>} />
          <Route path="phase-2" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><Phase2 /></ProtectedRoute>} />
          <Route path="phase-3" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><Phase3 /></ProtectedRoute>} />

          {/* Campus Head Route */}
          <Route path="campus-head" element={
            <ProtectedRoute requiredRoles={['campus_head']}>
              <CampusHeadDashboard />
            </ProtectedRoute>
          } />

          {/* Department Routes — Progression */}
          <Route path="progression" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}>
            <DeptDashboard dept="progression" label="Progression Department" desc="Progress tracking, assessment design, and student outcome analysis" />
          </ProtectedRoute>} />
          <Route path="progression/phase-1" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><DepartmentPhasePage dept="progression" phaseNum={1} /></ProtectedRoute>} />
          <Route path="progression/phase-2" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><DepartmentPhasePage dept="progression" phaseNum={2} /></ProtectedRoute>} />
          <Route path="progression/phase-3" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><DepartmentPhasePage dept="progression" phaseNum={3} /></ProtectedRoute>} />
          <Route path="progression/phase-1/worksheet/:worksheetId" element={<DeptWorksheetWrapper dept="progression" />} />
          <Route path="progression/phase-2/worksheet/:worksheetId" element={<DeptWorksheetWrapper dept="progression" />} />
          <Route path="progression/phase-3/worksheet/:worksheetId" element={<DeptWorksheetWrapper dept="progression" />} />

          {/* Department Routes — Operations */}
          <Route path="operations" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}>
            <DeptDashboard dept="operations" label="Operations Department" desc="Campus operations, scheduling, compliance, and resource management" />
          </ProtectedRoute>} />
          <Route path="operations/phase-1" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><DepartmentPhasePage dept="operations" phaseNum={1} /></ProtectedRoute>} />
          <Route path="operations/phase-2" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><DepartmentPhasePage dept="operations" phaseNum={2} /></ProtectedRoute>} />
          <Route path="operations/phase-3" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><DepartmentPhasePage dept="operations" phaseNum={3} /></ProtectedRoute>} />
          <Route path="operations/phase-1/worksheet/:worksheetId" element={<DeptWorksheetWrapper dept="operations" />} />
          <Route path="operations/phase-2/worksheet/:worksheetId" element={<DeptWorksheetWrapper dept="operations" />} />
          <Route path="operations/phase-3/worksheet/:worksheetId" element={<DeptWorksheetWrapper dept="operations" />} />

          {/* FTP Week Routes */}
          <Route path="week-1" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><WeekPage weekNum={1} /></ProtectedRoute>} />
          <Route path="week-2" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><WeekAccessGuard weekNum={2}><WeekPage weekNum={2} /></WeekAccessGuard></ProtectedRoute>} />
          <Route path="week-3" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><WeekAccessGuard weekNum={3}><WeekPage weekNum={3} /></WeekAccessGuard></ProtectedRoute>} />
          <Route path="week-4" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><WeekAccessGuard weekNum={4}><WeekPage weekNum={4} /></WeekAccessGuard></ProtectedRoute>} />
          <Route path="week-1/worksheet/:worksheetId" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><WeekWorksheetPage weekNum={1} /></ProtectedRoute>} />
          <Route path="week-2/worksheet/:worksheetId" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><WeekAccessGuard weekNum={2}><WeekWorksheetPage weekNum={2} /></WeekAccessGuard></ProtectedRoute>} />
          <Route path="week-3/worksheet/:worksheetId" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><WeekAccessGuard weekNum={3}><WeekWorksheetPage weekNum={3} /></WeekAccessGuard></ProtectedRoute>} />
          <Route path="week-4/worksheet/:worksheetId" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><WeekAccessGuard weekNum={4}><WeekWorksheetPage weekNum={4} /></WeekAccessGuard></ProtectedRoute>} />

          {/* Admin Routes */}
          <Route path="admin" element={
            <ProtectedRoute requiredRoles={['academic_head', 'onboarding_lead', 'campus_head', 'progression_head', 'ops_head', 'campus_admin']}>
              <Suspense fallback={<PageFallback />}>
                <RoleAwareAdminDashboard />
              </Suspense>
            </ProtectedRoute>
          } />
          <Route path="admin/users" element={<ProtectedRoute requiredRoles={['campus_admin', 'academic_head', 'campus_head']}><Suspense fallback={<PageFallback />}><CampusUserManagement /></Suspense></ProtectedRoute>} />
          <Route path="admin/reports" element={<ProtectedRoute requiredRoles={['campus_admin', 'academic_head', 'campus_head']}><Suspense fallback={<PageFallback />}><CampusReports /></Suspense></ProtectedRoute>} />
          <Route path="admin/settings" element={<ProtectedRoute requiredRoles={['campus_admin', 'campus_head']}><Suspense fallback={<PageFallback />}><CampusSettings /></Suspense></ProtectedRoute>} />
          <Route path="admin/review-phase/:userId/:phaseNum" element={<ProtectedRoute requiredRoles={['academic_head', 'onboarding_lead', 'progression_head', 'ops_head', 'campus_head']}><Suspense fallback={<PageFallback />}><PhaseReview /></Suspense></ProtectedRoute>} />
          <Route path="admin/review/:userId/:worksheetId" element={<ProtectedRoute requiredRoles={['academic_head', 'onboarding_lead', 'progression_head', 'ops_head', 'campus_head']}><Suspense fallback={<PageFallback />}><WorksheetReview /></Suspense></ProtectedRoute>} />

          {/* Buddy Routes */}
          <Route path="buddy" element={<ProtectedRoute requiredRoles={['lead_instructor', 'academic_head', 'progression_head', 'ops_head', 'campus_head']}><Suspense fallback={<PageFallback />}><BuddyDashboard /></Suspense></ProtectedRoute>} />
          <Route path="buddy/review/:userId/:worksheetId" element={<ProtectedRoute requiredRoles={['lead_instructor', 'academic_head', 'progression_head', 'ops_head', 'campus_head']}><Suspense fallback={<PageFallback />}><WorksheetReview /></Suspense></ProtectedRoute>} />
          <Route path="buddy/gate-pass/:userId/:gateId" element={<ProtectedRoute requiredRoles={['lead_instructor', 'academic_head', 'progression_head', 'ops_head', 'campus_head']}><Suspense fallback={<PageFallback />}><BuddyGatePass /></Suspense></ProtectedRoute>} />

          {/* Onboarding Lead Routes */}
          <Route path="onboarding-lead" element={<ProtectedRoute requiredRoles={['onboarding_lead']}><Suspense fallback={<PageFallback />}><OnboardingLeadDashboard /></Suspense></ProtectedRoute>} />
          <Route path="onboarding-lead/review-phase/:userId/:phaseNum" element={<ProtectedRoute requiredRoles={['onboarding_lead', 'academic_head']}><Suspense fallback={<PageFallback />}><PhaseReview /></Suspense></ProtectedRoute>} />
          <Route path="onboarding-lead/review/:userId/:worksheetId" element={<ProtectedRoute requiredRoles={['onboarding_lead', 'academic_head']}><Suspense fallback={<PageFallback />}><WorksheetReview /></Suspense></ProtectedRoute>} />

          {/* Other Routes */}
          <Route path="assessment" element={<ProtectedRoute requiredRoles={['academic_head', 'onboarding_lead', 'lead_instructor']}><Assessment /></ProtectedRoute>} />
          <Route path="notifications" element={<ProtectedRoute><Suspense fallback={<PageFallback />}><NotificationsPage /></Suspense></ProtectedRoute>} />
          <Route path="stakeholders" element={<ProtectedRoute><Stakeholders /></ProtectedRoute>} />

          {/* Dynamic Worksheet Routes */}
          {worksheetRoutes}
        </Route>

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
      <ThemeProvider>
      <CampusProvider>
        <AuthProvider>
          <RBACProvider>
          <ToastProvider>
          <AppLayout>
            <Navbar progress={progress} />
            <GlobalCommandPalette />
            <GlobalOverlays />
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
        </ToastProvider>
        </RBACProvider>
        </AuthProvider>
      </CampusProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
