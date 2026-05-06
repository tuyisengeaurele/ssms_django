import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Role } from '../../types';

const ICONS = {
  dashboard:  'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  farms:      'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  batches:    'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
  detect:     'M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z',
  reports:    'M18 20V10M12 20V4M6 20v-6',
  alerts:     'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  users:      'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  overview:   'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  admin:      'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  sensor:     'M22 12h-4l-3 9L9 3l-3 9H2',
  logout:     'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  collapse:   'M11 19l-7-7 7-7m8 14l-7-7 7-7',
  expand:     'M13 5l7 7-7 7M5 5l7 7-7 7',
};

interface NavItem {
  to: string;
  label: string;
  icon: keyof typeof ICONS;
  badge?: number;
  roles?: Role[];
}

function getNavItems(role: Role | undefined, alertCount: number): NavItem[] {
  if (role === 'FARMER') return [
    { to: '/farmer',              label: 'Dashboard',        icon: 'dashboard' },
    { to: '/farms',               label: 'My Farms',         icon: 'farms' },
    { to: '/batches',             label: 'Batches',          icon: 'batches' },
    { to: '/detections/reports',  label: 'Detection Reports',icon: 'reports' },
    { to: '/alerts',              label: 'Alerts',           icon: 'alerts', badge: alertCount },
  ];
  if (role === 'SUPERVISOR') return [
    { to: '/supervisor',          label: 'Overview',         icon: 'dashboard' },
    { to: '/farms',               label: 'Farms',            icon: 'farms' },
    { to: '/detections/reports',  label: 'Detection Reports',icon: 'reports' },
    { to: '/alerts',              label: 'Alerts',           icon: 'alerts', badge: alertCount },
  ];
  if (role === 'ADMIN') return [
    { to: '/admin',               label: 'Dashboard',        icon: 'admin' },
    { to: '/admin/users',         label: 'User Management',  icon: 'users' },
    { to: '/farms',               label: 'Farms',            icon: 'farms' },
    { to: '/supervisor',          label: 'System Overview',  icon: 'overview' },
    { to: '/detections/reports',  label: 'Detection Reports',icon: 'reports' },
    { to: '/alerts',              label: 'Alerts',           icon: 'alerts', badge: alertCount },
  ];
  return [];
}

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onCollapse: () => void;
  onMobileClose: () => void;
  alertCount?: number;
}

export default function Sidebar({ collapsed, mobileOpen, onCollapse, onMobileClose, alertCount = 0 }: SidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const navItems = getNavItems(user?.role, alertCount);

  const handleLogout = () => {
    logout();
    navigate('/login');
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
        {/* Logo area */}
        <div className="sidebar-logo">
          <img src="/logo.png" alt="SSMS Logo" />
          <div className="sidebar-logo-text">
            <span className="name">SSMS</span>
            <span className="tagline">Sericulture Management</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Menu</div>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to.includes('/admin') && item.to === '/admin'}
              className={({ isActive }) =>
                `sidebar-item ${isActive ? 'active' : ''}`
              }
              onClick={onMobileClose}
              title={collapsed ? item.label : undefined}
            >
              {({ isActive }) => (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth={isActive ? 2.2 : 1.8}
                    strokeLinecap="round" strokeLinejoin="round"
                    className="sidebar-item-icon">
                    {item.icon === 'users'
                      ? <>
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </>
                      : <path d={ICONS[item.icon]} />
                    }
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

        {/* Footer: collapse toggle + user */}
        <div className="sidebar-footer">
          {/* Collapse button — hidden on mobile */}
          <button
            onClick={onCollapse}
            className="sidebar-item"
            style={{ width: '100%', border: 'none', background: 'none', marginBottom: '0.25rem' }}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className="sidebar-item-icon">
              {collapsed
                ? <path d={ICONS.expand} />
                : <path d={ICONS.collapse} />
              }
            </svg>
            <span className="sidebar-item-label">
              {collapsed ? 'Expand' : 'Collapse'}
            </span>
          </button>

          {/* User info + logout */}
          <div className="sidebar-user" onClick={handleLogout} title="Sign out">
            <div className="sidebar-avatar">{initials}</div>
            <div className="sidebar-user-info">
              <div className="u-name">{user?.name ?? 'User'}</div>
              <div className="u-role">{user?.role ?? ''}</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ marginLeft: 'auto', opacity: 0.5, flexShrink: 0 }}>
              <path d={ICONS.logout} />
            </svg>
          </div>
        </div>
      </aside>
    </>
  );
}
