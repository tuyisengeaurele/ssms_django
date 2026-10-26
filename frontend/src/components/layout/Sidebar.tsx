import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Role } from '../../types';
import { Icon, type IconName } from '../ui/Icon';
import Modal from '../ui/Modal';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  badge?: number;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export const ROLE_LABEL_KEY: Record<Role, string> = {
  ADMIN: 'roleAdmin',
  SUPERVISOR: 'roleSupervisor',
  FARMER: 'roleFarmer',
};

function getNavGroups(role: Role | undefined, alertCount: number, t: (k: string) => string): NavGroup[] {
  const alerts: NavItem = { to: '/alerts', label: t('ptAlerts'), icon: 'alerts', badge: alertCount };

  if (role === 'FARMER') {
    return [
      { label: t('navGroupOverview'), items: [{ to: '/farmer', label: t('navDashboard'), icon: 'dashboard' }] },
      {
        label: t('navGroupFarming'),
        items: [
          { to: '/farms', label: t('navMyFarms'), icon: 'farms' },
          { to: '/batches', label: t('ptBatches'), icon: 'batches' },
          { to: '/harvests', label: t('ptHarvests'), icon: 'harvests' },
        ],
      },
      {
        label: t('navGroupMonitoring'),
        items: [
          { to: '/detections/reports', label: t('ptDetectionReports'), icon: 'detections' },
          { to: '/devices', label: t('ptDevices'), icon: 'devices' },
          alerts,
        ],
      },
    ];
  }

  if (role === 'SUPERVISOR') {
    return [
      { label: t('navGroupOverview'), items: [{ to: '/supervisor', label: t('ptSupervisor'), icon: 'overview' }] },
      {
        label: t('navGroupFarming'),
        items: [
          { to: '/farms', label: t('ptFarms'), icon: 'farms' },
          { to: '/harvests', label: t('ptHarvests'), icon: 'harvests' },
          { to: '/detections/reports', label: t('ptDetectionReports'), icon: 'detections' },
          { to: '/devices', label: t('ptDevices'), icon: 'devices' },
        ],
      },
      { label: t('navGroupMonitoring'), items: [alerts] },
    ];
  }

  if (role === 'ADMIN') {
    return [
      {
        label: t('navGroupOverview'),
        items: [
          { to: '/admin', label: t('navDashboard'), icon: 'adminDashboard' },
          { to: '/supervisor', label: t('ptSupervisor'), icon: 'overview' },
        ],
      },
      {
        label: t('navGroupPeople'),
        items: [
          { to: '/admin/users', label: t('ptUsers'), icon: 'users' },
          { to: '/admin/cooperatives', label: t('ptCooperatives'), icon: 'cooperatives' },
          { to: '/admin/contacts', label: t('ptMessages'), icon: 'messages' },
        ],
      },
      {
        label: t('navGroupFarming'),
        items: [
          { to: '/farms', label: t('ptFarms'), icon: 'farms' },
          { to: '/harvests', label: t('ptHarvests'), icon: 'harvests' },
          { to: '/detections/reports', label: t('ptDetectionReports'), icon: 'detections' },
          { to: '/devices', label: t('ptDevices'), icon: 'devices' },
        ],
      },
      {
        label: t('navGroupSystem'),
        items: [
          alerts,
          { to: '/admin/audit-log', label: t('ptAudit'), icon: 'audit' },
          { to: '/admin/reports', label: t('ptSystemReport'), icon: 'systemReport' },
        ],
      },
    ];
  }
  return [];
}

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
  alertCount?: number;
}

export default function Sidebar({ collapsed, mobileOpen, onMobileClose, alertCount = 0 }: SidebarProps) {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const groups = getNavGroups(user?.role, alertCount, t);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleLogout = () => {
    setConfirmOpen(false);
    logout();
    navigate('/login', { replace: true });
  };

  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : 'U';

  return (
    <>
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('btnSignOut')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmOpen(false)}>{t('btnCancel')}</button>
            <button className="btn btn-danger" onClick={handleLogout}>{t('btnSignOut')}</button>
          </>
        }
      >
        <p className="modal-text">{t('shellSignOutAsk')}</p>
      </Modal>

      <div className={`sidebar-overlay ${mobileOpen ? 'active' : ''}`} onClick={onMobileClose} aria-hidden="true" />

      <aside className={`app-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-logo">
          <img src="/logo-on-dark.png" alt="" width="36" height="36" />
          <div className="sidebar-logo-text">
            <span className="name">SSMS</span>
            <span className="tagline">Sericulture Management</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label={t('shellMainMenu')}>
          {groups.map((group) => (
            <div key={group.label} role="group" aria-label={group.label} className="sidebar-group">
              <div className="sidebar-section-label" aria-hidden="true">{group.label}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/farmer' || item.to === '/admin' || item.to === '/supervisor'}
                  className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
                  onClick={onMobileClose}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon name={item.icon} className="sidebar-item-icon" />
                  <span className="sidebar-item-label">{item.label}</span>
                  {item.badge != null && item.badge > 0 && (
                    <span className="sidebar-badge" aria-label={`${item.badge > 99 ? '99+' : item.badge} unread`}>
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="sidebar-avatar" aria-hidden="true">{initials}</span>
            <span className="sidebar-user-text">
              <span className="sidebar-user-name">{user?.name}</span>
              <span className="sidebar-user-role">{user ? t(ROLE_LABEL_KEY[user.role]) : ''}</span>
            </span>
          </div>
          <button
            type="button"
            className="sidebar-logout"
            onClick={() => setConfirmOpen(true)}
            title={collapsed ? t('navLogout') : undefined}
          >
            <Icon name="logout" />
            <span className="sidebar-item-label">{t('navLogout')}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
