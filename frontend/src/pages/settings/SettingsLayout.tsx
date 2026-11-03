import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import PageHeader from '../../components/ui/PageHeader';

/** The Settings page: one title, a list of sections, and the open section beside it (above it on a phone). */
export default function SettingsLayout() {
  const { user } = useAuth();
  const { t } = useLanguage();

  const sections = [
    { to: '/settings/account', label: t('stTabAccount') },
    { to: '/settings/security', label: t('stTabSecurity') },
    { to: '/settings/appearance', label: t('stTabAppearance') },
    ...(user?.role === 'ADMIN' ? [{ to: '/settings/safe-ranges', label: t('ptThresholds') }] : []),
  ];

  return (
    <div>
      <PageHeader title={t('ptSettings')} subtitle={t('stSubtitle')} />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label={t('stNavLabel')}>
          <ul>
            {sections.map((section) => (
              <li key={section.to}>
                <NavLink to={section.to} className={({ isActive }) => `settings-link${isActive ? ' is-on' : ''}`}>
                  {section.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="settings-body">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
