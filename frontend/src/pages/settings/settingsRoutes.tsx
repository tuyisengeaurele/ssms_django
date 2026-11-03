import { lazy, ReactNode, Suspense } from 'react';
import { Navigate, Route } from 'react-router-dom';
import ProtectedRoute from '../../components/ui/ProtectedRoute';

// Like every other page, Settings loads when it is first opened.
const SettingsLayout = lazy(() => import('./SettingsLayout'));
const AccountSettings = lazy(() => import('./AccountSettings'));
const SecuritySettings = lazy(() => import('./SecuritySettings'));
const AppearanceSettings = lazy(() => import('./AppearanceSettings'));
const AdminThresholdsPage = lazy(() => import('../admin/AdminThresholdsPage'));

const loading = <p className="panel-loading"><span className="spinner" /></p>;
const page = (element: ReactNode) => <Suspense fallback={loading}>{element}</Suspense>;

/**
 * Every route of the Settings page, with the two old addresses that now lead into it.
 * It is a function so the app and the tests share one list.
 */
export function settingsRoutes() {
  return (
    <>
      <Route path="/profile" element={<Navigate to="/settings/account" replace />} />
      <Route path="/admin/thresholds" element={<Navigate to="/settings/safe-ranges" replace />} />
      <Route path="/settings" element={page(<SettingsLayout />)}>
        <Route index element={<Navigate to="account" replace />} />
        <Route path="account" element={page(<AccountSettings />)} />
        <Route path="security" element={page(<SecuritySettings />)} />
        <Route path="appearance" element={page(<AppearanceSettings />)} />
        <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
          <Route path="safe-ranges" element={page(<AdminThresholdsPage embedded />)} />
        </Route>
      </Route>
    </>
  );
}
