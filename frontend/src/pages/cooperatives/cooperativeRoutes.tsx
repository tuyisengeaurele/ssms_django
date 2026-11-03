import { lazy, ReactNode, Suspense } from 'react';
import { Navigate, Route } from 'react-router-dom';
import ProtectedRoute from '../../components/ui/ProtectedRoute';
import CooperativeReportRedirect from './CooperativeReportRedirect';

// Like every other page, these load when they are first opened.
const AdminCooperativesPage = lazy(() => import('../admin/AdminCooperativesPage'));
const CooperativePage = lazy(() => import('./CooperativePage'));
const CoopReportTab = lazy(() => import('./CoopReportTab'));
const CoopFarmsTab = lazy(() => import('./CoopFarmsTab'));
const CoopMembersTab = lazy(() => import('./CoopMembersTab'));
const CoopDetailsTab = lazy(() => import('./CoopDetailsTab'));
const CoopFarmersTab = lazy(() => import('./CoopFarmersTab'));

const loading = <p className="panel-loading"><span className="spinner" /></p>;
const page = (element: ReactNode) => <Suspense fallback={loading}>{element}</Suspense>;

/**
 * Every route of the cooperative pages: the admin's list, one cooperative or all of them together, the supervisor's own
 * cooperative, and the old addresses that now lead into them. It is a function so the app and the tests share one list.
 */
export function cooperativeRoutes() {
  return (
    <>
      <Route path="/reports/cooperative" element={<CooperativeReportRedirect />} />
      <Route path="/supervisor/farmers" element={<Navigate to="/supervisor/cooperative/farmers" replace />} />

      <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
        <Route path="/admin/cooperatives" element={page(<AdminCooperativesPage />)} />
        <Route path="/admin/cooperatives/all" element={page(<CooperativePage scope="all" />)}>
          <Route index element={page(<CoopReportTab />)} />
          <Route path="farms" element={page(<CoopFarmsTab />)} />
        </Route>
        <Route path="/admin/cooperatives/:id" element={page(<CooperativePage scope="one" />)}>
          <Route index element={page(<CoopReportTab />)} />
          <Route path="farms" element={page(<CoopFarmsTab />)} />
          <Route path="members" element={page(<CoopMembersTab />)} />
          <Route path="details" element={page(<CoopDetailsTab />)} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['SUPERVISOR']} />}>
        <Route path="/supervisor/cooperative" element={page(<CooperativePage scope="mine" />)}>
          <Route index element={page(<CoopReportTab />)} />
          <Route path="farms" element={page(<CoopFarmsTab />)} />
          <Route path="farmers" element={page(<CoopFarmersTab />)} />
        </Route>
      </Route>
    </>
  );
}
