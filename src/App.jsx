import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import Dashboard from './pages/Dashboard';
import Phase1 from './pages/Phase1';
import Phase2 from './pages/Phase2';
import Phase3 from './pages/Phase3';
import Assessment from './pages/Assessment';
import Stakeholders from './pages/Stakeholders';
import Login from './pages/Login';
import Signup from './pages/Signup';
import AuthCallback from './pages/AuthCallback';
import AdminDashboard from './pages/AdminDashboard';
import BuddyDashboard from './pages/BuddyDashboard';
import OnboardingLeadDashboard from './pages/OnboardingLeadDashboard';
import WorksheetReview from './pages/WorksheetReview';

import { ALL_WORKSHEETS, WORKSHEET_COMPONENTS } from './worksheetConfig';

// Grid lines removed per user request. Structure preserved in CSS if re-enabled.

export default function App() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem('onboarding_progress');
    if (stored) setProgress(Number(stored));
  }, []);

  useEffect(() => {
    const handler = (e) => { setProgress(e.detail); localStorage.setItem('onboarding_progress', String(e.detail)); };
    window.addEventListener('progressUpdate', handler);
    return () => window.removeEventListener('progressUpdate', handler);
  }, []);

  // Generate dynamic worksheet routes
  const worksheetRoutes = Object.entries(ALL_WORKSHEETS).flatMap(([phaseName, phaseData]) => {
    const phasePath = phaseName.toLowerCase().replace(' ', '-');
    return phaseData.sheets.map(sheet => {
      const Component = WORKSHEET_COMPONENTS[sheet.id];
      const routePath = `/${phasePath}/${sheet.isGate ? `gate-${phaseData.num}` : `worksheet-${sheet.id.split('_w')[1] || sheet.id.split('gc')[1]}`}`;
      return (
        <Route key={sheet.id} path={routePath} element={<ProtectedRoute><Component /></ProtectedRoute>} />
      );
    });
  });

  return (
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <ToastProvider>
            <div className="lux-noise" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
              <Navbar progress={progress} />
              <main style={{ flex: 1, position: 'relative', zIndex: 1 }}>
                <Routes>
                  {/* Auth routes */}
                  <Route path="/login" element={<Login />} />
                  <Route path="/signup" element={<Signup />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />

                  {/* Admin / Lead */}
                  <Route path="/admin" element={<ProtectedRoute requiredRoles={['academic_head', 'onboarding_lead']}><AdminDashboard /></ProtectedRoute>} />
                  <Route path="/buddy" element={<ProtectedRoute requiredRoles={['lead_instructor']}><BuddyDashboard /></ProtectedRoute>} />
                  <Route path="/onboarding-lead" element={<ProtectedRoute requiredRoles={['onboarding_lead']}><OnboardingLeadDashboard /></ProtectedRoute>} />
                  <Route path="/admin/review/:userId/:worksheetId" element={<ProtectedRoute requiredRoles={['academic_head', 'lead_instructor', 'onboarding_lead']}><WorksheetReview /></ProtectedRoute>} />
                  <Route path="/buddy/review/:userId/:worksheetId" element={<ProtectedRoute requiredRoles={['lead_instructor', 'academic_head', 'onboarding_lead']}><WorksheetReview /></ProtectedRoute>} />
                  <Route path="/onboarding-lead/review/:userId/:worksheetId" element={<ProtectedRoute requiredRoles={['lead_instructor', 'academic_head', 'onboarding_lead']}><WorksheetReview /></ProtectedRoute>} />

                  {/* Dashboard / Phases */}
                  <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                  <Route path="/phase-1" element={<ProtectedRoute><Phase1 /></ProtectedRoute>} />
                  <Route path="/phase-2" element={<ProtectedRoute><Phase2 /></ProtectedRoute>} />
                  <Route path="/phase-3" element={<ProtectedRoute><Phase3 /></ProtectedRoute>} />

                  {/* Dynamic Worksheet Routes */}
                  {worksheetRoutes}

                  {/* Legacy */}
                  <Route path="/assessment" element={<ProtectedRoute><Assessment /></ProtectedRoute>} />
                  <Route path="/stakeholders" element={<ProtectedRoute><Stakeholders /></ProtectedRoute>} />
                </Routes>
              </main>

              <footer style={{
                textAlign: 'center',
                padding: '2rem 1rem',
                borderTop: '1px solid rgba(26, 26, 26, 0.15)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.7rem',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: 'var(--color-warm-grey)',
              }}>
                <span className="lux-line" style={{ margin: '0 auto 1rem' }} />
                <p>Newton School of Technology · Bengaluru Campus · Faculty Onboarding Portal</p>
              </footer>
            </div>
          </ToastProvider>
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}
