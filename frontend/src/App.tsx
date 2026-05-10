import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import ProtectedRoute from './components/ui/ProtectedRoute';
import DashboardLayout from './components/layout/DashboardLayout';

import LandingPage        from './pages/LandingPage';
import LoginPage          from './pages/auth/LoginPage';
import RegisterPage       from './pages/auth/RegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage  from './pages/auth/ResetPasswordPage';
import FarmerDashboard    from './pages/farmer/FarmerDashboard';
import SupervisorDashboard from './pages/supervisor/SupervisorDashboard';
import AdminDashboard     from './pages/admin/AdminDashboard';
import FarmsPage          from './pages/farmer/FarmsPage';
import AddFarmPage        from './pages/farmer/AddFarmPage';
import FarmDetailPage     from './pages/farmer/FarmDetailPage';
import AddBatchPage       from './pages/farmer/AddBatchPage';
import BatchDetailPage    from './pages/farmer/BatchDetailPage';
import AddDetectionPage   from './pages/farmer/AddDetectionPage';
import AdminUsersPage          from './pages/admin/AdminUsersPage';
import AdminCooperativesPage   from './pages/admin/AdminCooperativesPage';
import DetectionReportsPage    from './pages/farmer/DetectionReportsPage';
import HarvestPage             from './pages/farmer/HarvestPage';
import HarvestsPage            from './pages/farmer/HarvestsPage';
import AlertsPage         from './pages/shared/AlertsPage';
import DevicesPage        from './pages/shared/DevicesPage';
import BatchesPage        from './pages/farmer/BatchesPage';
import ProfilePage        from './pages/shared/ProfilePage';
import AdminContactsPage  from './pages/admin/AdminContactsPage';

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
    <LanguageProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login"            element={<LoginPage />} />
          <Route path="/register"         element={<RegisterPage />} />
          <Route path="/forgot-password"  element={<ForgotPasswordPage />} />
          <Route path="/reset-password"   element={<ResetPasswordPage />} />
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
              </Route>

            </Route>
          </Route>

          {/* Default */}
          <Route path="/"  element={<LandingPage />} />
          <Route path="*"  element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </LanguageProvider>
  );
}
