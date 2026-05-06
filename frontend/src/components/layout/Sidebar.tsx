import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Role } from '../../types';

// ── SVG Icon paths ────────────────────────────────────────────────────────────
const ICONS = {
  dashboard:  'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  farms:      'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  farmLeaf:   'M12 22V12M3.5 8.5C3.5 5.46 6.46 3 10 3c2.12 0 4 .9 5.28 2.33A6.5 6.5 0 0 1 21 11.5c0 3.58-2.91 6.5-6.5 6.5H5a1.5 1.5 0 0 1 0-3',
  batch:      'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
  microscope: 'M6 18h8 M3 22h18 M14 22a7 7 0 1 0 0-14h-1 M9 14H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5l2 3-2 3 2 3-2 3z',
  reports:    'M18 20V10M12 20V4M6 20v-6',
  alerts:     'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  users:      'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  overview:   'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  shield:     'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  logout:     'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  activity:   'M22 12h-4l-3 9L9 3l-3 9H2',
};

interface NavItem {
  to: string;
  label: string;
  icon: keyof typeof ICONS;
  badge?: number;
}

function getNavItems(role: Role | undefined, alertCount: number): NavItem[] {
  if (role === 'FARMER') return [
    { to: '/farmer',              label: 'Dashboard',         icon: 'dashboard' },
    { to: '/farms',               label: 'My Farms',          icon: 'farmLeaf' },
    { to: '/batches',             label: 'Batches',           icon: 'batch' },
    { to: '/detections/reports',  label: 'Detection Reports', icon: 'reports' },
    { to: '/alerts',              label: 'Alerts',            icon: 'alerts', badge: alertCount },
  ];
  if (role === 'SUPERVISOR') return [
    { to: '/supervisor',          label: 'Overview',          icon: 'overview' },
    { to: '/farms',               label: 'Farms',             icon: 'farmLeaf' },
    { to: '/detections/reports',  label: 'Detection Reports', icon: 'reports' },
    { to: '/alerts',              label: 'Alerts',            icon: 'alerts', badge: alertCount },
  ];
  if (role === 'ADMIN') return [
    { to: '/admin',               label: 'Dashboard',         icon: 'shield' },
    { to: '/admin/users',         label: 'User Management',   icon: 'users' },
    { to: '/farms',               label: 'Farms',             icon: 'farmLeaf' },
    { to: '/supervisor',          label: 'System Overview',   icon: 'overview' },
    { to: '/detections/reports',  label: 'Detection Reports', icon: 'reports' },
    { to: '/alerts',              label: 'Alerts',            icon: 'alerts', badge: alertCount },
  ];
  return [];
}

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
  alertCount?: number;
}

function SideIcon({ name }: { name: keyof typeof ICONS }) {
  if (name === 'users') {
    return (
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    );
  }
  if (name === 'overview') {
    return (
      <>
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
        <circle cx="12" cy="12" r="3" />
      </>
    );
  }
  return <path d={ICONS[name]} />;
}

export default function Sidebar({ collapsed, mobileOpen, onMobileClose, alertCount = 0 }: SidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const navItems = getNavItems(user?.role, alertCount);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : 'U';

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${mobileOpen ? 'active' : ''}`}
        onClick={onMobileClose}
      />

      <aside className={`app-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <img src="/logo.png" alt="SSMS" />
          <div className="sidebar-logo-text">
            <span className="name">SSMS</span>
            <span className="tagline">Sericulture Management</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Navigation</div>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/farmer' || item.to === '/admin' || item.to === '/supervisor'}
              className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
              onClick={onMobileClose}
              title={collapsed ? item.label : undefined}
            >
              {({ isActive }) => (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth={isActive ? 2.2 : 1.8}
                    strokeLinecap="round" strokeLinejoin="round"
                    className="sidebar-item-icon">
                    <SideIcon name={item.icon} />
                  </svg>
                  <span className="sidebar-item-label">{item.label}</span>
                  {item.badge != null && item.badge > 0 && (
                    <span className="sidebar-badge">{item.badge > 99 ? '99+' : item.badge}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          {/* User info (display only — no action) */}
          <div className="sidebar-user-display">
            <div className="sidebar-avatar">{initials}</div>
            <div className="sidebar-user-info">
              <div className="u-name">{user?.name ?? 'User'}</div>
              <div className="u-role">{user?.role ?? ''}</div>
            </div>
          </div>

          {/* Logout button */}
          <button
            onClick={handleLogout}
            className="sidebar-item sidebar-logout-btn"
            title={collapsed ? 'Sign out' : undefined}
            style={{ width: '100%', border: 'none', background: 'none', marginTop: '0.25rem' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round"
              className="sidebar-item-icon">
              <path d={ICONS.logout} />
            </svg>
            <span className="sidebar-item-label">Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
