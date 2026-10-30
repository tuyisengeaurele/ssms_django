import { Navigate } from 'react-router-dom';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import { homePathFor } from '../utils/roleHome';

/**
 * Where the installed app opens (start_url in site.webmanifest). Someone who is signed in goes straight to their own
 * dashboard and anyone else to the login page, so the app never opens on the public landing page.
 */
export default function AppHome() {
  const { user, isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <LoadingSpinner fullPage />;
  return <Navigate to={isAuthenticated ? homePathFor(user?.role) : '/login'} replace />;
}
