import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ui/ProtectedRoute';
import DashboardLayout from './components/layout/DashboardLayout';

import LoginPage          from './pages/auth/LoginPage';
import RegisterPage       from './pages/auth/RegisterPage';
import FarmerDashboard    from './pages/farmer/FarmerDashboard';
import SupervisorDashboard from './pages/supervisor/SupervisorDashboard';
import AdminDashboard     from './pages/admin/AdminDashboard';
import FarmsPage          from './pages/farmer/FarmsPage';
import AddFarmPage        from './pages/farmer/AddFarmPage';
import FarmDetailPage     from './pages/farmer/FarmDetailPage';
import AddBatchPage       from './pages/farmer/AddBatchPage';
import BatchDetailPage    from './pages/farmer/BatchDetailPage';
import AddDetectionPage   from './pages/farmer/AddDetectionPage';
import AdminUsersPage     from './pages/admin/AdminUsersPage';
import DetectionReportsPage from './pages/farmer/DetectionReportsPage';
import AlertsPage         from './pages/shared/AlertsPage';

function Unauthorized() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '1rem',
      background: 'var(--bg)',
    }}>
      <div style={{ fontSize: '3rem' }}>🚫</div>
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
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login"        element={<LoginPage />} />
          <Route path="/register"     element={<RegisterPage />} />
          <Route path="/unauthorized" element={<Unauthorized />} />

          {/* All authenticated — inside DashboardLayout (sidebar + topbar) */}
          <Route element={<ProtectedRoute allowedRoles={['FARMER', 'SUPERVISOR', 'ADMIN']} />}>
            <Route element={<DashboardLayout />}>

              {/* Farmer */}
              <Route path="/farmer"                    element={<FarmerDashboard />} />
              <Route path="/farms"                     element={<FarmsPage />} />
              <Route path="/farms/new"                 element={<AddFarmPage />} />
              <Route path="/farms/:id"                 element={<FarmDetailPage />} />
              <Route path="/farms/:farmId/batches/new" element={<AddBatchPage />} />
              <Route path="/batches/:id"               element={<BatchDetailPage />} />
              <Route path="/batches/:id/detect"        element={<AddDetectionPage />} />
              <Route path="/detections/reports"        element={<DetectionReportsPage />} />
              <Route path="/alerts"                    element={<AlertsPage />} />

              {/* Supervisor + Admin */}
              <Route element={<ProtectedRoute allowedRoles={['SUPERVISOR', 'ADMIN']} />}>
                <Route path="/supervisor" element={<SupervisorDashboard />} />
              </Route>

              {/* Admin only */}
              <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
                <Route path="/admin"       element={<AdminDashboard />} />
                <Route path="/admin/users" element={<AdminUsersPage />} />
              </Route>

            </Route>
          </Route>

          {/* Default */}
          <Route path="/"  element={<Navigate to="/login" replace />} />
          <Route path="*"  element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
