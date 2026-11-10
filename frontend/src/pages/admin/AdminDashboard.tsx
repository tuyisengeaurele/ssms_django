import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { alertService } from '../../services/alert.service';
import { farmService } from '../../services/farm.service';
import { Farm } from '../../types';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import FarmCalendar from '../../components/calendar/FarmCalendar';
import QuickActions from '../../components/dashboard/QuickActions';
import DecisionsCard from '../../components/supply/DecisionsCard';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import { SkeletonStatCard } from '../../components/ui/SkeletonLoader';
import StatTile from '../../components/ui/StatTile';

export default function AdminDashboard() {
  const { t } = useLanguage();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [unread, setUnread] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = () => {
    setLoading(true);
    setFailed(false);
    Promise.allSettled([farmService.getAll(), alertService.getAll(true)])
      .then(([farmResult, alertResult]) => {
        if (farmResult.status === 'fulfilled') setFarms(farmResult.value.data.data);
        else setFailed(true);
        if (alertResult.status === 'fulfilled') setUnread(alertResult.value.data.data.length);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const totalBatches = farms.reduce((sum, f) => sum + (f.counts?.batches ?? 0), 0);
  const uniqueFarmers = new Set(farms.map((f) => f.ownerId)).size;

  return (
    <div>
      <PageHeader title={t('adminTitle')} />

      <div className="stack-24">
      <DecisionsCard />

      {failed && (
        <div className="alert alert-error" role="alert">
          <span style={{ flex: 1 }}>{t('adLoadFarmsError')}</span>
          <button type="button" className="btn btn-secondary btn-xs" onClick={load}>{t('btnRetry')}</button>
        </div>
      )}

      <QuickActions role="ADMIN" counts={{ alerts: unread ?? 0 }} />

      <div className="dash-body">
      <div className="dash-main stagger">
      {loading ? (
        <div className="grid-4">
          {[0, 1, 2, 3].map((i) => <SkeletonStatCard key={i} />)}
        </div>
      ) : (
        <div className="grid-4">
          <StatTile label={t('adStatFarms')} value={farms.length} hint={`${farms.length} ${t('adStatFarmsHint')}`} />
          <StatTile label={t('adStatBatches')} value={totalBatches} hint={t('adStatBatchesHint')} />
          <StatTile label={t('adStatFarmers')} value={uniqueFarmers} hint={t('adStatFarmersHint')} />
          <StatTile label={t('adStatAlerts')} value={unread ?? '-'} hint={t('adStatAlertsHint')} />
        </div>
      )}

        <Panel
          title={`${t('adFarmRegistry')} (${farms.length})`}
          flush
          actions={
            farms.length > 0 ? (
              <Link to="/farms/new" className="btn btn-primary btn-sm"><Icon name="add" size={15} />{t('adAddFarm')}</Link>
            ) : undefined
          }
        >
          {loading ? (
            <p className="panel-loading"><span className="spinner" /></p>
          ) : farms.length === 0 && !failed ? (
            <EmptyState
              title={t('adNoFarms')}
              description={t('adNoFarmsHint')}
              action={{ label: t('adAddFarm'), to: '/farms/new' }}
            />
          ) : (
            <div className="table-wrapper">
              <table className="table-stack">
                <thead>
                  <tr>
                    <th>{t('colFarm')}</th>
                    <th>{t('colOwner')}</th>
                    <th>{t('colLocation')}</th>
                    <th>{t('colBatches')}</th>
                  </tr>
                </thead>
                <tbody>
                  {farms.slice(0, 8).map((f) => (
                    <tr key={f.id} className="tbody-row">
                      <td className="cell-lead">
                        <Link to={`/farms/${f.id}`} className="cell-link">{f.name}</Link>
                      </td>
                      <td data-label={t('colOwner')} className="cell-muted">{f.owner?.name ?? '-'}</td>
                      <td data-label={t('colLocation')} className="cell-muted cell-trim">{f.location}</td>
                      <td data-label={t('colBatches')} className="cell-strong">{f.counts?.batches ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
      <aside className="dash-rail">
        <div className="card"><FarmCalendar staff /></div>
      </aside>
      </div>
      </div>
    </div>
  );
}
