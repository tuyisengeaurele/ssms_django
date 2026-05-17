import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const dashboardPath =
    user?.role === 'ADMIN'
      ? '/admin'
      : user?.role === 'SUPERVISOR'
      ? '/supervisor'
      : '/farmer';

  return (
    <nav style={{
      background: 'var(--primary)',
      color: '#fff',
      padding: '0 1.5rem',
      height: '60px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxShadow: 'var(--shadow-md)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <Link to={dashboardPath} style={{ color: '#fff', fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.02em' }}>
        SSMS
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <Link to="/farms" style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.9rem' }}>Farms</Link>

        {user?.role !== 'FARMER' && (
          <Link to="/supervisor" style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.9rem' }}>Overview</Link>
        )}
        {user?.role === 'ADMIN' && (
          <Link to="/admin" style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.9rem' }}>Admin</Link>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.85rem', opacity: 0.85 }}>{user?.name}</span>
          <span style={{
            background: 'rgba(255,255,255,0.2)',
            padding: '0.15rem 0.5rem',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: 600,
          }}>
            {user?.role}
          </span>
          <button onClick={handleLogout} className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}>
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
