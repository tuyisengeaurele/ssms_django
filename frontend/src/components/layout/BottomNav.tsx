import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Role } from '../../types';
import { Icon, type IconName } from '../ui/Icon';

interface Tab {
  to: string;
  labelKey: string;
  icon: IconName;
}

// The four pages each kind of person opens most. Everything else is under More.
const TABS: Record<Role, Tab[]> = {
  FARMER: [
    { to: '/farmer', labelKey: 'navDashboard', icon: 'dashboard' },
    { to: '/farms', labelKey: 'navMyFarms', icon: 'farms' },
    { to: '/batches', labelKey: 'ptBatches', icon: 'batches' },
    { to: '/alerts', labelKey: 'ptAlerts', icon: 'alerts' },
  ],
  SUPERVISOR: [
    { to: '/supervisor', labelKey: 'ptSupervisor', icon: 'overview' },
    { to: '/farms', labelKey: 'ptFarms', icon: 'farms' },
    { to: '/detections/reports', labelKey: 'ptDetectionReports', icon: 'detections' },
    { to: '/alerts', labelKey: 'ptAlerts', icon: 'alerts' },
  ],
  ADMIN: [
    { to: '/admin', labelKey: 'navDashboard', icon: 'adminDashboard' },
    { to: '/admin/users', labelKey: 'ptUsers', icon: 'users' },
    { to: '/farms', labelKey: 'ptFarms', icon: 'farms' },
    { to: '/alerts', labelKey: 'ptAlerts', icon: 'alerts' },
  ],
};

interface Props {
  alertCount?: number;
  onMore: () => void;
}

/** The tab bar at the bottom of a phone screen. Hidden on larger screens by the stylesheet. */
export default function BottomNav({ alertCount = 0, onMore }: Props) {
  const { user } = useAuth();
  const { t } = useLanguage();
  if (!user) return null;

  return (
    <nav className="bottom-nav" aria-label={t('shellQuickMenu')}>
      {TABS[user.role].map((tab) => {
        const label = t(tab.labelKey);
        const unread = tab.to === '/alerts' && alertCount > 0;
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/farmer' || tab.to === '/admin' || tab.to === '/supervisor'}
            aria-label={label}
            className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
          >
            <span className="bottom-nav-icon">
              <Icon name={tab.icon} size={22} />
              {unread && (
                <span className="bottom-nav-badge" aria-label={`${alertCount > 99 ? '99+' : alertCount} unread`}>
                  {alertCount > 99 ? '99+' : alertCount}
                </span>
              )}
            </span>
            <span className="bottom-nav-label" aria-hidden="true">{label}</span>
          </NavLink>
        );
      })}
      <button type="button" className="bottom-nav-item" onClick={onMore} aria-label={t('navMore')}>
        <span className="bottom-nav-icon"><Icon name="menu" size={22} /></span>
        <span className="bottom-nav-label" aria-hidden="true">{t('navMore')}</span>
      </button>
    </nav>
  );
}
