import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Role } from '../../types';
import Modal from '../ui/Modal';

// ── SVG Icon paths ────────────────────────────────────────────────────────────
const ICONS = {
  harvest:    'M12 22V12M3.5 8.5C3.5 5.46 6.46 3 10 3c2.12 0 4 .9 5.28 2.33A6.5 6.5 0 0 1 21 11.5c0 3.58-2.91 6.5-6.5 6.5H5a1.5 1.5 0 0 1 0-3',
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
  logout:      'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  activity:    'M22 12h-4l-3 9L9 3l-3 9H2',
  cooperative: 'cooperative',  // handled in SideIcon
  devices:     'devices',      // handled in SideIcon
  mail:        'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6',
};

interface NavItem {
  to: string;
  label: string;
  icon: keyof typeof ICONS;
  badge?: number;
}

function getNavItems(
  role: Role | undefined,
  alertCount: number,
  t: (k: string) => string,
): NavItem[] {
  if (role === 'FARMER') return [
    { to: '/farmer',              label: t('navDashboard'), icon: 'dashboard' },
    { to: '/farms',               label: t('navMyFarms'),   icon: 'farmLeaf' },
    { to: '/batches',             label: t('navBatches'),   icon: 'batch' },
    { to: '/harvests',            label: t('navHarvests'),  icon: 'harvest' },
    { to: '/detections/reports',  label: t('navReports'),   icon: 'reports' },
    { to: '/devices',             label: t('navDevices'),   icon: 'devices' },
    { to: '/alerts',              label: t('navAlerts'),    icon: 'alerts', badge: alertCount },
  ];
  if (role === 'SUPERVISOR') return [
    { to: '/supervisor',          label: t('navOverview'),  icon: 'overview' },
    { to: '/farms',               label: t('navFarms'),     icon: 'farmLeaf' },
    { to: '/harvests',            label: t('navHarvests'),  icon: 'harvest' },
    { to: '/detections/reports',  label: t('navReports'),   icon: 'reports' },
    { to: '/devices',             label: t('navDevices'),   icon: 'devices' },
    { to: '/alerts',              label: t('navAlerts'),    icon: 'alerts', badge: alertCount },
  ];
  if (role === 'ADMIN') return [
    { to: '/admin',               label: t('navDashboard'), icon: 'shield' },
    { to: '/admin/users',         label: t('navUserMgmt'),  icon: 'users' },
    { to: '/admin/cooperatives',  label: t('navCooperatives'), icon: 'cooperative' },
    { to: '/farms',               label: t('navFarms'),     icon: 'farmLeaf' },
    { to: '/harvests',            label: t('navHarvests'),  icon: 'harvest' },
    { to: '/supervisor',          label: t('navOverview'),  icon: 'overview' },
    { to: '/detections/reports',  label: t('navReports'),   icon: 'reports' },
    { to: '/devices',             label: t('navDevices'),   icon: 'devices' },
    { to: '/admin/contacts',      label: t('navMessages'),  icon: 'mail' },
    { to: '/alerts',              label: t('navAlerts'),    icon: 'alerts', badge: alertCount },
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
  if (name === 'cooperative') {
    return (
      <>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <path d="M9 22V12h2v10" />
        <path d="M13 22V12h2v10" />
        <circle cx="12" cy="4" r="1.5" />
      </>
    );
  }
  if (name === 'devices') {
    return (
      <>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
        <circle cx="12" cy="10" r="2" fill="currentColor" fillOpacity="0.25" />
      </>
    );
  }
  return <path d={ICONS[name]} />;
}

export default function Sidebar({ collapsed, mobileOpen, onMobileClose, alertCount = 0 }: SidebarProps) {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const navItems = getNavItems(user?.role, alertCount, t);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = () => {
    setShowLogoutConfirm(false);
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <>
      {/* Sign-out confirmation */}
      <Modal
        open={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        title={t('navLogout')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowLogoutConfirm(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleLogout}>Sign Out</button>
          </>
        }
      >
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Are you sure you want to sign out?
        </p>
      </Modal>

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
          {/* Logout button — shows confirm modal */}
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="sidebar-item sidebar-logout-btn"
            title={collapsed ? t('navLogout') : undefined}
            style={{ width: '100%', border: 'none', background: 'none' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round"
              className="sidebar-item-icon">
              <path d={ICONS.logout} />
            </svg>
            <span className="sidebar-item-label">{t('navLogout')}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
