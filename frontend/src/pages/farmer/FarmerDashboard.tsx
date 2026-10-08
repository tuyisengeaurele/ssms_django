import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';
import { farmService } from '../../services/farm.service';
import { alertService } from '../../services/alert.service';
import { sensorService, batchSupervisorService, ActiveBatch, ChartPoint } from '../../services/sensor.service';
import { Farm, AlertLog } from '../../types';
import { ALERT_DOT } from '../../utils/alertTypes';
import { colorFor } from '../../utils/chartColors';
import { fill } from '../../utils/fill';
import { timeAgo } from '../../utils/timeAgo';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import RangeChart from '../../components/ui/RangeChart';
import { SkeletonStatCard } from '../../components/ui/SkeletonLoader';
import StageBadge from '../../components/ui/StageBadge';
import StatTile from '../../components/ui/StatTile';

export default function FarmerDashboard() {
  const { user } = useAuth();
  const { t, locale } = useLanguage();
  const { error: showError } = useToast();
  const { getErrorMessage } = useApiError();

  const [farms, setFarms] = useState<Farm[]>([]);
  const [batches, setBatches] = useState<ActiveBatch[]>([]);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [alerts, setAlerts] = useState<AlertLog[]>([]);
  const [loading, setLoading] = useState(true);

  const firstName = user?.name?.split(' ')[0];
  const title = firstName ? fill(t('fhWelcomeName'), { name: firstName }) : t('fhWelcome');
  const unread = alerts.filter((a) => !a.isRead).length;

  useEffect(() => {
    // One request failing should not blank the whole page.
    Promise.allSettled([
      farmService.getAll(),
      batchSupervisorService.getActive(),
      sensorService.getChart(24),
      alertService.getAll(true),
    ]).then(([farmsResult, batchResult, chartResult, alertResult]) => {
      if (farmsResult.status === 'fulfilled') setFarms(farmsResult.value.data.data);
      if (batchResult.status === 'fulfilled') setBatches(batchResult.value.data.data);
      if (chartResult.status === 'fulfilled') setChart(chartResult.value.data.data);
      else showError(getErrorMessage(chartResult.reason));
      if (alertResult.status === 'fulfilled') setAlerts(alertResult.value.data.data);
    }).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markRead = async (id: string) => {
    try {
      await alertService.markRead(id);
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: true } : a)));
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title={title} />
        <div className="grid-3">
          {[0, 1, 2].map((i) => <SkeletonStatCard key={i} />)}
        </div>
      </div>
    );
  }

  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const farmsWithBatches = new Set(batches.map((b) => b.farmId)).size;

  const charts = [
    { key: 'avgTemp', label: t('svTempChart'), unit: '°C', color: colorFor('stage', 'COCOON'), safe: [22, 28] as [number, number], range: t('svTempRange') },
    { key: 'avgHumidity', label: t('svHumChart'), unit: '%', color: colorFor('stage', 'PUPA'), safe: [70, 85] as [number, number], range: t('svHumRange') },
  ];

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={t('fhSubtitle')}
        actions={
          <>
            <Link to="/detections/reports" className="btn btn-secondary btn-sm">
              <Icon name="systemReport" size={15} />
              {t('fhReports')}
            </Link>
            <Link to="/farms/new" className="btn btn-secondary btn-sm">
              <Icon name="add" size={15} />
              {t('fhNewFarm')}
            </Link>
            <Link to="/farms" className="btn btn-primary btn-sm">{t('fhMyFarms')}</Link>
          </>
        }
      />

      <div className="stack-24">
        <div className="grid-3">
          <StatTile
            icon="farms"
            label={t('fhMyFarms')}
            value={farms.length}
            hint={farms.length > 0 ? fill(t('fhHintActive'), { n: farms.filter((f) => f.isActive).length }) : t('fhHintFirst')}
          />
          <StatTile
            icon="batches"
            label={t('fhStatBatches')}
            value={batches.length}
            hint={batches.length === 0 ? t('fhHintNoBatches') : fill(t(farmsWithBatches === 1 ? 'fhHintAcrossOne' : 'fhHintAcross'), { n: farmsWithBatches })}
          />
          <StatTile
            icon="alerts"
            label={t('fhStatAlerts')}
            value={unread}
            hint={unread > 0 ? t('fhHintAttention') : t('fhHintClear')}
          />
        </div>

        <div className="split">
          {charts.map((c) => (
            <Panel key={c.key} title={c.label} note={c.range}>
              {chart.length === 0 ? (
                <p className="chart-empty">{t('svNoReadings')}</p>
              ) : (
                <RangeChart label={c.label} data={chart as never} dataKey={c.key} unit={c.unit} color={c.color} safe={c.safe} />
              )}
            </Panel>
          ))}
        </div>

        <div className="split">
          <Panel
            title={`${t('fhBatches')} (${batches.length})`}
            flush
            actions={<Link to="/batches" className="btn btn-ghost btn-sm">{t('fhViewAll')}<Icon name="forward" size={14} /></Link>}
          >
            {batches.length === 0 ? (
              <EmptyState
                icon={<Icon name="batches" size={22} />}
                title={t('fhNoBatches')}
                description={t('fhNoBatchesBody')}
                action={{ label: t('btGoFarms'), to: '/farms' }}
              />
            ) : (
              <div className="table-wrapper">
                <table className="table-stack">
                  <thead>
                    <tr>
                      <th>{t('svColFarm')}</th>
                      <th>{t('svColStage')}</th>
                      <th>{t('fhColStarted')}</th>
                      <th><span className="sr-only">{t('btDetails')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.slice(0, 6).map((b) => (
                      <tr key={b.id} className="tbody-row">
                        <td className="cell-lead cell-strong">{b.farm?.name ?? '-'}</td>
                        <td data-label={t('svColStage')}><StageBadge stage={b.stage} /></td>
                        <td data-label={t('fhColStarted')} className="cell-muted cell-nowrap">{date.format(new Date(b.startDate))}</td>
                        <td data-label="">
                          <div className="table-actions">
                            <Link to={`/batches/${b.id}`} className="btn btn-ghost btn-xs" aria-label={`${t('btDetails')} ${b.farm?.name ?? ''}`}>{t('btDetails')}</Link>
                            <Link to={`/batches/${b.id}/detect`} className="btn btn-ghost btn-xs" aria-label={`${t('btCheck')} ${b.farm?.name ?? ''}`}>
                              <Icon name="detections" size={14} />
                              {t('btCheck')}
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel
            title={t('svAlertsTitle')}
            flush
            actions={<Link to="/alerts" className="btn btn-ghost btn-sm">{t('svAllAlerts')}<Icon name="forward" size={14} /></Link>}
          >
            {alerts.length === 0 ? (
              <EmptyState icon={<Icon name="alerts" size={22} />} title={t('fhNoAlerts')} description={t('fhNoAlertsBody')} />
            ) : (
              <ul className="alert-feed alert-feed--short" aria-label={t('svAlertsTitle')}>
                {alerts.slice(0, 6).map((a) => (
                  <li key={a.id} className={a.isRead ? 'is-read' : ''}>
                    <span className={`note-dot note-dot--${ALERT_DOT[a.type] ?? 'system'}`} aria-hidden="true" />
                    <div className="alert-feed-main">
                      <p className="alert-feed-message">{a.message}</p>
                      <p className="alert-feed-meta"><span>{timeAgo(a.createdAt, locale)}</span></p>
                    </div>
                    {!a.isRead && (
                      <button className="btn btn-ghost btn-xs" onClick={() => markRead(a.id)}>{t('alMarkRead')}</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
