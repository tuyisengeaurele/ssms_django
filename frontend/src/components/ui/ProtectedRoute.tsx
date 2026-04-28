import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Role } from '../../types';
import LoadingSpinner from './LoadingSpinner';

interface Props {
  allowedRoles?: Role[];
}

export default function ProtectedRoute({ allowedRoles }: Props) {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) return <LoadingSpinner fullPage />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}
