import { lazy, Suspense } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Role } from '../../types';
import LoadingSpinner from './LoadingSpinner';

// Rarely shown, so it is not part of the first download.
const PhoneGate = lazy(() => import('../../pages/auth/PhoneGate'));
const ClosureScheduledPage = lazy(() => import('../../pages/auth/ClosureScheduledPage'));

interface Props {
  allowedRoles?: Role[];
}

export default function ProtectedRoute({ allowedRoles }: Props) {
  const { isAuthenticated, user, isLoading, switching, acting } = useAuth();

  if (isLoading) return <LoadingSpinner fullPage />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // An account whose owner asked to close it can do nothing but keep it or sign out, and that comes before the number.
  if (user?.deletionDate && !acting) {
    return <Suspense fallback={<LoadingSpinner fullPage />}><ClosureScheduledPage /></Suspense>;
  }
  // An account with no number can do nothing else (the server refuses it too). An admin looking at it with consent is not stopped.
  if (user?.phoneRequired && !acting) {
    return <Suspense fallback={<LoadingSpinner fullPage />}><PhoneGate /></Suspense>;
  }
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    // While an admin starts or stops acting as a person, the page they were on was meant for the other one. That is not
    // a mistake to explain, so they go to the home page of whoever is on screen now.
    return <Navigate to={switching ? '/app' : '/unauthorized'} replace />;
  }

  return <Outlet />;
}
