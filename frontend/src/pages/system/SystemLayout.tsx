import { Outlet } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import PageHeader from '../../components/ui/PageHeader';
import TabNav from '../../components/ui/TabNav';

/** What an admin watches: whether SSMS is working, who did what, and how it is used. One title and a row of tabs. */
export default function SystemLayout() {
  const { t } = useLanguage();
  const tabs = [
    { to: '/admin/system/health', label: t('syTabHealth') },
    { to: '/admin/system/logs', label: t('syTabLogs') },
    { to: '/admin/system/activity', label: t('ptActivity') },
  ];

  return (
    <div>
      <PageHeader title={t('ptSystem')} />
      <TabNav label={t('syNavLabel')} items={tabs} />
      <Outlet />
    </div>
  );
}
