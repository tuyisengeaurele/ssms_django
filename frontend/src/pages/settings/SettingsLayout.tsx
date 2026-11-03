import { Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import PageHeader from '../../components/ui/PageHeader';
import TabNav from '../../components/ui/TabNav';

/** The Settings page: one title, a row of tabs, and the open section under them. */
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
        <TabNav label={t('stNavLabel')} items={sections} />
        <div className="settings-body">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
