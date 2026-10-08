import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import ProtectedRoute from './components/ui/ProtectedRoute';
const DashboardLayout = lazy(() => import('./components/layout/DashboardLayout'));

// Every page loads on demand, so the landing page does not pull in the dashboards.
const LandingPage = lazy(() => import('./pages/LandingPage'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));
const CheckEmailPage = lazy(() => import('./pages/auth/CheckEmailPage'));
const VerifyEmailPage = lazy(() => import('./pages/auth/VerifyEmailPage'));
const FarmerDashboard = lazy(() => import('./pages/farmer/FarmerDashboard'));
const SupervisorDashboard = lazy(() => import('./pages/supervisor/SupervisorDashboard'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const FarmsPage = lazy(() => import('./pages/farmer/FarmsPage'));
const AddFarmPage = lazy(() => import('./pages/farmer/AddFarmPage'));
const FarmDetailPage = lazy(() => import('./pages/farmer/FarmDetailPage'));
const AddBatchPage = lazy(() => import('./pages/farmer/AddBatchPage'));
const BatchDetailPage = lazy(() => import('./pages/farmer/BatchDetailPage'));
const AddDetectionPage = lazy(() => import('./pages/farmer/AddDetectionPage'));
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'));
const AdminCooperativesPage = lazy(() => import('./pages/admin/AdminCooperativesPage'));
const DetectionReportsPage = lazy(() => import('./pages/farmer/DetectionReportsPage'));
const HarvestPage = lazy(() => import('./pages/farmer/HarvestPage'));
const HarvestsPage = lazy(() => import('./pages/farmer/HarvestsPage'));
const AlertsPage = lazy(() => import('./pages/shared/AlertsPage'));
const DevicesPage = lazy(() => import('./pages/shared/DevicesPage'));
const BatchesPage = lazy(() => import('./pages/farmer/BatchesPage'));
const ProfilePage = lazy(() => import('./pages/shared/ProfilePage'));
const AdminContactsPage = lazy(() => import('./pages/admin/AdminContactsPage'));
const AdminAuditLogPage = lazy(() => import('./pages/admin/AdminAuditLogPage'));
const AdminReportsPage = lazy(() => import('./pages/admin/AdminReportsPage'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'));
const TermsOfServicePage = lazy(() => import('./pages/TermsOfServicePage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
import { ErrorBoundary }  from './components/ui/ErrorBoundary';

function Unauthorized() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '1rem',
      background: 'var(--bg)',
    }}>
      <div style={{ width: 64, height: 64, background: '#fef2f2', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
      </div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Access Denied</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
        You don't have permission to view this page.
      </p>
      <a href="/" className="btn btn-primary btn-sm">← Go home</a>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
    <LanguageProvider>
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<div style={{ minHeight: '100vh', background: '#F6F3EC' }} />}>
        <Routes>
          {/* Public */}
          <Route path="/login"            element={<LoginPage />} />
          <Route path="/register"         element={<RegisterPage />} />
          <Route path="/forgot-password"  element={<ForgotPasswordPage />} />
          <Route path="/reset-password"   element={<ResetPasswordPage />} />
          <Route path="/check-email"      element={<CheckEmailPage />} />
          <Route path="/verify-email"     element={<VerifyEmailPage />} />
          <Route path="/unauthorized"     element={<Unauthorized />} />

          {/* All authenticated — inside DashboardLayout (sidebar + topbar) */}
          <Route element={<ProtectedRoute allowedRoles={['FARMER', 'SUPERVISOR', 'ADMIN']} />}>
            <Route element={<DashboardLayout />}>

              {/* Farmer */}
              <Route path="/farmer"                    element={<FarmerDashboard />} />
              <Route path="/farms"                     element={<FarmsPage />} />
              <Route path="/farms/new"                 element={<AddFarmPage />} />
              <Route path="/farms/:id"                 element={<FarmDetailPage />} />
              <Route path="/farms/:farmId/batches/new" element={<AddBatchPage />} />
              <Route path="/batches"                   element={<BatchesPage />} />
              <Route path="/batches/:id"               element={<BatchDetailPage />} />
              <Route path="/batches/:id/detect"        element={<AddDetectionPage />} />
              <Route path="/batches/:id/harvest"       element={<HarvestPage />} />
              <Route path="/harvests"                  element={<HarvestsPage />} />
              <Route path="/detections/reports"        element={<DetectionReportsPage />} />
              <Route path="/alerts"                    element={<AlertsPage />} />
              <Route path="/devices"                   element={<DevicesPage />} />
              <Route path="/profile"                  element={<ProfilePage />} />

              {/* Supervisor + Admin */}
              <Route element={<ProtectedRoute allowedRoles={['SUPERVISOR', 'ADMIN']} />}>
                <Route path="/supervisor" element={<SupervisorDashboard />} />
              </Route>

              {/* Admin only */}
              <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
                <Route path="/admin"                  element={<AdminDashboard />} />
                <Route path="/admin/users"            element={<AdminUsersPage />} />
                <Route path="/admin/cooperatives"     element={<AdminCooperativesPage />} />
                <Route path="/admin/contacts"         element={<AdminContactsPage />} />
                <Route path="/admin/audit-log"        element={<AdminAuditLogPage />} />
                <Route path="/admin/reports"          element={<AdminReportsPage />} />
              </Route>

            </Route>
          </Route>

          {/* Legal */}
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/terms"   element={<TermsOfServicePage />} />

          {/* Default */}
          <Route path="/" element={<LandingPage />} />
          <Route path="*"  element={<NotFoundPage />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
    </LanguageProvider>
    </ErrorBoundary>
  );
}
