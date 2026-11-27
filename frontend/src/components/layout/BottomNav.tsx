import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useMessages } from '../../context/MessagesContext';
import { fill } from '../../utils/fill';
import { Role } from '../../types';
import { Icon, type IconName } from '../ui/Icon';

interface Tab {
  to: string;
  labelKey: string;
  icon: IconName;
}

// The four pages each kind of person opens most. Everything else is under More.
export const TABS: Record<Role, Tab[]> = {
  FARMER: [
    { to: '/farmer', labelKey: 'navDashboard', icon: 'dashboard' },
    { to: '/farms', labelKey: 'navMyFarms', icon: 'farms' },
    { to: '/messages', labelKey: 'ptMessages', icon: 'chat' },
    { to: '/alerts', labelKey: 'ptAlerts', icon: 'alerts' },
  ],
  SUPERVISOR: [
    { to: '/supervisor', labelKey: 'ptSupervisor', icon: 'overview' },
    { to: '/farms', labelKey: 'ptFarms', icon: 'farms' },
    { to: '/messages', labelKey: 'ptMessages', icon: 'chat' },
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
  const { unread: unreadMessages } = useMessages();
  if (!user) return null;

  return (
    <nav className="bottom-nav" aria-label={t('shellQuickMenu')}>
      {TABS[user.role].map((tab) => {
        const label = t(tab.labelKey);
        const count = tab.to === '/alerts' ? alertCount : tab.to === '/messages' ? unreadMessages : 0;
        const shown = count > 99 ? '99+' : String(count);
        // The link's name replaces what is inside it, so the count of messages is part of the name.
        const name = tab.to === '/messages' && count > 0 ? `${label}, ${fill(t('msgUnread'), { n: shown })}` : label;
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/farmer' || tab.to === '/admin' || tab.to === '/supervisor'}
            aria-label={name}
            className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
          >
            <span className="bottom-nav-icon">
              <Icon name={tab.icon} size={22} />
              {count > 0 && (
                <span className="bottom-nav-badge" aria-label={tab.to === '/messages' ? fill(t('msgUnread'), { n: shown }) : `${shown} unread`}>
                  {shown}
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
