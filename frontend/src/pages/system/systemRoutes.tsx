import { lazy, ReactNode, Suspense } from 'react';
import { Navigate, Route } from 'react-router-dom';
import ProtectedRoute from '../../components/ui/ProtectedRoute';

// Like every other page, these load when they are first opened.
const SystemLayout = lazy(() => import('./SystemLayout'));
const AdminHealthPage = lazy(() => import('../admin/AdminHealthPage'));
const AdminLogsPage = lazy(() => import('../admin/AdminLogsPage'));
const AdminReportsPage = lazy(() => import('../admin/AdminReportsPage'));

const loading = <p className="panel-loading"><span className="spinner" /></p>;
const page = (element: ReactNode) => <Suspense fallback={loading}>{element}</Suspense>;

/**
 * The System hub for admins, and the three old addresses that now lead into it. It is a function so the app and the
 * tests share one list.
 */
export function systemRoutes() {
  return (
    <>
      <Route path="/admin/health" element={<Navigate to="/admin/system/health" replace />} />
      <Route path="/admin/audit-log" element={<Navigate to="/admin/system/logs" replace />} />
      <Route path="/admin/reports" element={<Navigate to="/admin/system/activity" replace />} />
      <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
        <Route path="/admin/system" element={page(<SystemLayout />)}>
          <Route index element={<Navigate to="health" replace />} />
          <Route path="health" element={page(<AdminHealthPage />)} />
          <Route path="logs" element={page(<AdminLogsPage />)} />
          <Route path="activity" element={page(<AdminReportsPage />)} />
        </Route>
      </Route>
    </>
  );
}
