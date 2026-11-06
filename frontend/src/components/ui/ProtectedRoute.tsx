import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Role } from '../../types';
import LoadingSpinner from './LoadingSpinner';

interface Props {
  allowedRoles?: Role[];
}

export default function ProtectedRoute({ allowedRoles }: Props) {
  const { isAuthenticated, user, isLoading, switching } = useAuth();

  if (isLoading) return <LoadingSpinner fullPage />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    // While an admin starts or stops acting as a person, the page they were on was meant for the other one. That is not
    // a mistake to explain, so they go to the home page of whoever is on screen now.
    return <Navigate to={switching ? '/app' : '/unauthorized'} replace />;
  }

  return <Outlet />;
}
