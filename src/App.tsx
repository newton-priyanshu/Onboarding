import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect, type ReactNode } from 'react';
import { AuthProvider } from './context/AuthContext';
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
import Week1 from './pages/Week1';
import Week2 from './pages/Week2';
import Week3 from './pages/Week3';
import Week4 from './pages/Week4';
import Assessment from './pages/Assessment';
import Stakeholders from './pages/Stakeholders';
import Login from './pages/Login';
import Signup from './pages/Signup';
import AuthCallback from './pages/AuthCallback';
import AdminDashboard from './pages/AdminDashboard';
import BuddyDashboard from './pages/BuddyDashboard';
import OnboardingLeadDashboard from './pages/OnboardingLeadDashboard';
import WorksheetReview from './pages/WorksheetReview';
import PhaseReview from './pages/PhaseReview';
import BuddyGatePass from './pages/BuddyGatePass';
import NotFound from './pages/NotFound';

import { ALL_WORKSHEETS, WORKSHEET_COMPONENTS } from './config/worksheetConfig';
import WeekWorksheetPage from './pages/WeekWorksheetPage';

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

// ─── Error Boundary Route Resetter ──────────────────────

function ErrorBoundaryRouteResetter({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {children}
    </div>
  );
}

/** Wraps the routed page content in an ErrorBoundary that resets on route change */
function AppRoutes() {
  const location = useLocation();
  // Generate dynamic worksheet routes
  const worksheetRoutes = Object.entries(ALL_WORKSHEETS).flatMap(([phaseName, phaseData]) => {
    const data = phaseData as PhaseData;
    const phasePath = phaseName.toLowerCase().replace(' ', '-');
    return data.sheets
      .filter(sheet => !sheet.isGate)
      .map(sheet => {
        const Component = WORKSHEET_COMPONENTS[sheet.id];
        if (!Component) return null;
        const wsNum = sheet.id.includes('_w') ? sheet.id.split('_w')[1] : '';
        const routePath = `/${phasePath}/worksheet-${wsNum}`;
        const phaseNum = data.num;
        const wrapped = phaseNum > 1
          ? <PhaseAccessGuard phaseNum={phaseNum}><Component /></PhaseAccessGuard>
          : <Component />;
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
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Admin / Lead */}
        <Route path="/admin" element={<ProtectedRoute requiredRoles={['academic_head', 'onboarding_lead']}><AdminDashboard /></ProtectedRoute>} />
        <Route path="/buddy" element={<ProtectedRoute requiredRoles={['lead_instructor', 'academic_head']}><BuddyDashboard /></ProtectedRoute>} />
        <Route path="/onboarding-lead" element={<ProtectedRoute requiredRoles={['onboarding_lead']}><OnboardingLeadDashboard /></ProtectedRoute>} />
        {/* Phase Review Routes */}
        <Route path="/admin/review-phase/:userId/:phaseNum" element={<ProtectedRoute requiredRoles={['academic_head', 'onboarding_lead']}><PhaseReview /></ProtectedRoute>} />
        <Route path="/onboarding-lead/review-phase/:userId/:phaseNum" element={<ProtectedRoute requiredRoles={['onboarding_lead', 'academic_head']}><PhaseReview /></ProtectedRoute>} />

        {/* Buddy Gate Pass Routes */}
        <Route path="/buddy/gate-pass/:userId/:gateId" element={<ProtectedRoute requiredRoles={['lead_instructor', 'academic_head']}><BuddyGatePass /></ProtectedRoute>} />

        {/* Individual Worksheet Review Routes */}
        <Route path="/admin/review/:userId/:worksheetId" element={<ProtectedRoute requiredRoles={['academic_head', 'onboarding_lead']}><WorksheetReview /></ProtectedRoute>} />
        <Route path="/buddy/review/:userId/:worksheetId" element={<ProtectedRoute requiredRoles={['lead_instructor', 'academic_head']}><WorksheetReview /></ProtectedRoute>} />
        <Route path="/onboarding-lead/review/:userId/:worksheetId" element={<ProtectedRoute requiredRoles={['onboarding_lead', 'academic_head']}><WorksheetReview /></ProtectedRoute>} />

        {/* Dashboard / Phases */}
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/phase-1" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><Phase1 /></ProtectedRoute>} />
        <Route path="/phase-2" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><Phase2 /></ProtectedRoute>} />
        <Route path="/phase-3" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><Phase3 /></ProtectedRoute>} />

        {/* FTP Week Routes — Week 1 always open, weeks 2+ gated behind prior week completion */}
        <Route path="/week-1" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><Week1 /></ProtectedRoute>} />
        <Route path="/week-2" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><WeekAccessGuard weekNum={2}><Week2 /></WeekAccessGuard></ProtectedRoute>} />
        <Route path="/week-3" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><WeekAccessGuard weekNum={3}><Week3 /></WeekAccessGuard></ProtectedRoute>} />
        <Route path="/week-4" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><WeekAccessGuard weekNum={4}><Week4 /></WeekAccessGuard></ProtectedRoute>} />
        {/* FTP Week Worksheet Routes — also gated by week access */}
        <Route path="/week-1/worksheet/:worksheetId" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><WeekWorksheetPage /></ProtectedRoute>} />
        <Route path="/week-2/worksheet/:worksheetId" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><WeekAccessGuard weekNum={2}><WeekWorksheetPage /></WeekAccessGuard></ProtectedRoute>} />
        <Route path="/week-3/worksheet/:worksheetId" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><WeekAccessGuard weekNum={3}><WeekWorksheetPage /></WeekAccessGuard></ProtectedRoute>} />
        <Route path="/week-4/worksheet/:worksheetId" element={<ProtectedRoute requiredRoles={['new_joinee', 'lab_instructor']}><WeekAccessGuard weekNum={4}><WeekWorksheetPage /></WeekAccessGuard></ProtectedRoute>} />

        {/* Dynamic Worksheet Routes */}
        {worksheetRoutes}

        {/* Legacy */}
        <Route path="/assessment" element={<ProtectedRoute><Assessment /></ProtectedRoute>} />
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
      <AuthProvider>
        <ToastProvider>
          <ErrorBoundaryRouteResetter>
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
              <p>Newton School of Technology <span style={{ opacity: 0.3 }}>·</span> Bengaluru</p>
              <p style={{ fontSize: '0.65rem', marginTop: '2px', opacity: 0.7 }}>Faculty Onboarding Portal</p>
            </footer>
          </ErrorBoundaryRouteResetter>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
