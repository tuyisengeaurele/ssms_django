import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/** The old cooperative report address. It now lives in the cooperative page, which depends on who asks. */
export default function CooperativeReportRedirect() {
  const { user } = useAuth();
  if (user?.role === 'ADMIN') return <Navigate to="/admin/cooperatives/all" replace />;
  if (user?.role === 'SUPERVISOR') return <Navigate to="/supervisor/cooperative" replace />;
  return <Navigate to="/unauthorized" replace />;
}
