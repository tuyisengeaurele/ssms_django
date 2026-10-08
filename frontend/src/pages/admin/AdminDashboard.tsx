import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { alertService } from '../../services/alert.service';
import { farmService } from '../../services/farm.service';
import { Farm } from '../../types';
import EmptyState from '../../components/ui/EmptyState';
import { Icon, type IconName } from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import { SkeletonStatCard } from '../../components/ui/SkeletonLoader';
import StatTile from '../../components/ui/StatTile';

const QUICK_ACTIONS: Array<{ to: string; icon: IconName; label: string; hint: string }> = [
  { to: '/admin/users', icon: 'users', label: 'ptUsers', hint: 'adQaUsers' },
  { to: '/detections/reports', icon: 'detections', label: 'ptDetectionReports', hint: 'adQaDetections' },
  { to: '/supervisor', icon: 'overview', label: 'ptSupervisor', hint: 'adQaOverview' },
  { to: '/farms/new', icon: 'farms', label: 'adAddFarm', hint: 'adQaAddFarm' },
  { to: '/alerts', icon: 'alerts', label: 'ptAlerts', hint: 'adQaAlerts' },
  { to: '/admin/audit-log', icon: 'audit', label: 'ptAudit', hint: 'adQaAudit' },
];

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
      <PageHeader
        title={t('adminTitle')}
        subtitle={t('adminSubtitle')}
        actions={
          <>
            <Link to="/admin/users" className="btn btn-secondary btn-sm">
              <Icon name="users" size={15} />
              {t('ptUsers')}
            </Link>
            <Link to="/supervisor" className="btn btn-primary btn-sm">
              <Icon name="overview" size={15} />
              {t('ptSupervisor')}
            </Link>
          </>
        }
      />

      {failed && (
        <div className="alert alert-error" role="alert">
          <span style={{ flex: 1 }}>{t('adLoadFarmsError')}</span>
          <button type="button" className="btn btn-secondary btn-xs" onClick={load}>{t('btnRetry')}</button>
        </div>
      )}

      {loading ? (
        <div className="grid-4" style={{ marginBottom: 24 }}>
          {[0, 1, 2, 3].map((i) => <SkeletonStatCard key={i} />)}
        </div>
      ) : (
        <div className="grid-4" style={{ marginBottom: 24 }}>
          <StatTile icon="farms" label={t('adStatFarms')} value={farms.length} hint={`${farms.length} ${t('adStatFarmsHint')}`} />
          <StatTile icon="batches" label={t('adStatBatches')} value={totalBatches} hint={t('adStatBatchesHint')} />
          <StatTile icon="users" label={t('adStatFarmers')} value={uniqueFarmers} hint={t('adStatFarmersHint')} />
          <StatTile icon="alerts" label={t('adStatAlerts')} value={unread ?? '-'} hint={t('adStatAlertsHint')} />
        </div>
      )}

      <div className="grid-2 admin-split">
        <Panel title={t('adQuickActions')} flush>
          <ul className="action-list" aria-label={t('adQuickActions')}>
            {QUICK_ACTIONS.map((a) => (
              <li key={a.to}>
                <Link to={a.to} className="action-row">
                  <Icon name={a.icon} size={20} className="action-row-icon" />
                  <span className="action-row-text">
                    <span className="action-row-title">{t(a.label)}</span>
                    <span className="action-row-hint">{t(a.hint)}</span>
                  </span>
                  <Icon name="next" size={16} className="action-row-go" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

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
    </div>
  );
}
