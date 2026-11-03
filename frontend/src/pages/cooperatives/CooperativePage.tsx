import { useCallback, useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useParams } from 'react-router-dom';
import { cooperativeService } from '../../services/cooperative.service';
import { CooperativeDetail } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import TabNav, { TabItem } from '../../components/ui/TabNav';
import { CoopContext, CoopScope } from './coopContext';
import { useCoopReport } from './useCoopReport';

const LIST = '/admin/cooperatives';

/**
 * One cooperative with its sections as tabs: its report, its farms, and for an admin its members and details, or for a
 * supervisor its farmers. The same page serves an admin opening one cooperative, an admin looking at all of them
 * together, and a supervisor looking at their own.
 */
export default function CooperativePage({ scope }: { scope: CoopScope }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { id } = useParams();
  const { pathname } = useLocation();

  const base = scope === 'one' ? `${LIST}/${id}` : scope === 'all' ? `${LIST}/all` : '/supervisor/cooperative';
  const tab = pathname.slice(base.length).split('/').filter(Boolean)[0] ?? 'report';

  const [detail, setDetail] = useState<CooperativeDetail | null>(null);
  const [missing, setMissing] = useState(false);

  const refreshDetail = useCallback(async () => {
    if (scope !== 'one' || !id) return;
    const res = await cooperativeService.getById(id);
    setDetail(res.data.data);
  }, [scope, id]);

  useEffect(() => {
    if (scope !== 'one' || !id) return undefined;
    let live = true;
    setDetail(null);
    setMissing(false);
    cooperativeService.getById(id)
      .then((res) => live && setDetail(res.data.data))
      .catch(() => live && setMissing(true));
    return () => { live = false; };
  }, [scope, id]);

  // The report is built only while a section shows it, and Report and Farms share one answer.
  const period = useCoopReport(scope === 'one' ? id : undefined, !missing && (tab === 'report' || tab === 'farms'));

  const back = (
    <Link to={LIST} className="back-link">
      <Icon name="back" size={15} />
      {t('ptCooperatives')}
    </Link>
  );

  if (missing) {
    return (
      <div>
        {back}
        <EmptyState icon={<Icon name="cooperatives" size={22} />} title={t('cpNotFound')} />
      </div>
    );
  }

  const tabs: TabItem[] = [
    { to: base, label: t('cpTabReport'), end: true },
    { to: `${base}/farms`, label: t('ptFarms') },
    ...(scope === 'one' ? [{ to: `${base}/members`, label: t('coColMembers') }, { to: `${base}/details`, label: t('cpTabDetails') }] : []),
    ...(scope === 'mine' ? [{ to: `${base}/farmers`, label: t('cpTabFarmers') }] : []),
  ];

  const title = scope === 'all' ? t('crAll') : scope === 'mine' ? t('ptMyCooperative') : (detail?.name ?? t('ptCooperative'));
  const subtitle = scope === 'all' ? t('cpAllSubtitle') : scope === 'mine' ? (user?.cooperativeName ?? t('cpMineSubtitle')) : detail?.location || undefined;

  const context: CoopContext = { scope, period, detail, setDetail, refreshDetail };

  return (
    <div>
      {scope !== 'mine' ? back : null}
      <PageHeader title={title} subtitle={subtitle} />
      <TabNav label={t('cpNavLabel')} items={tabs} />
      <Outlet context={context} />
    </div>
  );
}
