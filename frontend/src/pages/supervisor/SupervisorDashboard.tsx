import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { farmService } from '../../services/farm.service';
import { alertService, getAlertStreamUrl } from '../../services/alert.service';
import { sensorService, batchSupervisorService, detectionService2, ActiveBatch, ChartPoint, RecentDetection } from '../../services/sensor.service';
import { Farm, AlertLog } from '../../types';
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
import FarmRiskPanel from './FarmRiskPanel';

export default function SupervisorDashboard() {
  const { user } = useAuth();
  const { success } = useToast();
  const { t, locale } = useLanguage();

  const [farms, setFarms] = useState<Farm[]>([]);
  const [batches, setBatches] = useState<ActiveBatch[]>([]);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [alerts, setAlerts] = useState<AlertLog[]>([]);
  const [recent, setRecent] = useState<RecentDetection[]>([]);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState<Date | null>(null);

  const unread = alerts.filter((a) => !a.isRead).length;

  useEffect(() => {
    Promise.all([
      farmService.getAll(),
      batchSupervisorService.getActive(),
      sensorService.getChart(24),
      alertService.getAll(),
      detectionService2.getRecent(20),
    ])
      .then(([f, b, c, al, det]) => {
        setFarms(f.data.data);
        setBatches(b.data.data);
        setChart(c.data.data);
        setAlerts(al.data.data);
        setRecent(det.data.data);
        setUpdated(new Date());
      })
      .finally(() => setLoading(false));
  }, []);

  // New alerts arrive over a live connection. A ticket works for one connection, so every
  // reconnect asks for a fresh one: after a drop, and shortly before the server ends a long stream.
  useEffect(() => {
    let source: EventSource | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const take = (alert: AlertLog) => {
      setAlerts((prev) => {
        if (prev.some((a) => a.id === alert.id)) return prev;
        success(t('svNewAlertOne'));
        return [alert, ...prev].slice(0, 50);
      });
      setUpdated(new Date());
    };

    const onMessage = (e: MessageEvent) => {
      if (!e.data) return;
      try {
        const data = JSON.parse(e.data);
        // One alert per message. Several in a list are accepted too.
        (Array.isArray(data) ? data : [data]).forEach((a: AlertLog) => a?.id && take(a));
      } catch {
        // A message we cannot read is ignored.
      }
    };

    const connect = async () => {
      source?.close();
      try {
        const url = await getAlertStreamUrl();
        if (stopped) return;
        source = new EventSource(url);
        source.onmessage = onMessage;
        source.onerror = () => {
          source?.close();
          clearTimeout(timer);
          timer = setTimeout(connect, 5000);
        };
        clearTimeout(timer);
        timer = setTimeout(connect, 9 * 60 * 1000);
      } catch {
        // The live connection is a bonus. The page works without it, so try again later.
        if (!stopped) timer = setTimeout(connect, 30000);
      }
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      source?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeader title={t('ptSupervisor')} />
        <div className="grid-4">
          {[0, 1, 2, 3].map((i) => <SkeletonStatCard key={i} />)}
        </div>
      </div>
    );
  }

  const checks = batches.reduce((sum, b) => sum + (b.detectionCount ?? 0), 0);
  const scope = user?.role === 'ADMIN'
    ? t('svScopeAll')
    : user?.cooperativeName ? fill(t('svScopeCoop'), { name: user.cooperativeName }) : t('svScopeNone');
  const subtitle = updated ? `${scope} ${fill(t('svUpdated'), { when: timeAgo(updated.toISOString(), locale) })}` : scope;

  const charts = [
    { key: 'avgTemp', label: t('svTempChart'), unit: '°C', color: colorFor('stage', 'COCOON'), safe: [22, 28] as [number, number], range: t('svTempRange') },
    { key: 'avgHumidity', label: t('svHumChart'), unit: '%', color: colorFor('stage', 'PUPA'), safe: [70, 85] as [number, number], range: t('svHumRange') },
  ];

  return (
    <div>
      <PageHeader
        title={t('ptSupervisor')}
        subtitle={subtitle}
        actions={
          <>
            <Link to="/detections/reports" className="btn btn-secondary btn-sm">
              <Icon name="detections" size={15} />
              {t('svFullReports')}
            </Link>
            {unread > 0 && (
              <Link to="/alerts" className="btn btn-primary btn-sm">
                <Icon name="alerts" size={15} />
                {fill(t('svAlertsLink'), { n: unread })}
              </Link>
            )}
          </>
        }
      />

      {user?.role === 'SUPERVISOR' && !user.cooperativeId && (
        <div className="alert alert-warning" role="note">
          <Icon name="warning" size={18} />
          <span>{t('svNoCoop')}</span>
        </div>
      )}

      <div className="grid-4" style={{ marginBottom: 24 }}>
        <StatTile icon="farms" label={t('svStatFarms')} value={farms.length} />
        <StatTile icon="batches" label={t('svStatBatches')} value={batches.length} hint={t('svHintRunning')} />
        <StatTile icon="alerts" label={t('svStatAlerts')} value={unread} hint={unread > 0 ? t('svHintAlertsOn') : t('svHintAlertsOff')} />
        <StatTile icon="detections" label={t('svStatChecks')} value={checks} hint={t('svHintChecks')} />
      </div>

      <div style={{ marginBottom: 24 }}>
        <FarmRiskPanel />
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
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

      <div className="grid-2 admin-split" style={{ marginBottom: 24 }}>
        <Panel
          title={`${t('svBatchesTitle')} (${batches.length})`}
          flush
          actions={<Link to="/farms" className="btn btn-ghost btn-sm">{t('svViewFarms')}<Icon name="forward" size={14} /></Link>}
        >
          {batches.length === 0 ? (
            <EmptyState icon={<Icon name="batches" size={22} />} title={t('svNoBatches')} />
          ) : (
            <div className="table-wrapper">
              <table className="table-stack">
                <thead>
                  <tr>
                    <th>{t('svColFarm')}</th>
                    <th>{t('svColStage')}</th>
                    <th>{t('svColChecks')}</th>
                    <th><span className="sr-only">{t('svOpen')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {batches.slice(0, 7).map((b) => (
                    <tr key={b.id} className="tbody-row">
                      <td className="cell-lead cell-strong">{b.farm?.name ?? '-'}</td>
                      <td data-label={t('svColStage')}><StageBadge stage={b.stage} /></td>
                      <td data-label={t('svColChecks')} className="cell-strong">{b.detectionCount ?? 0}</td>
                      <td data-label="">
                        <div className="table-actions">
                          <Link to={`/batches/${b.id}`} className="btn btn-ghost btn-xs" aria-label={`${t('svOpen')} ${b.farm?.name ?? ''}`}>{t('svOpen')}</Link>
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
            <EmptyState icon={<Icon name="alerts" size={22} />} title={t('svNoAlerts')} description={t('svNoAlertsBody')} />
          ) : (
            <ul className="alert-feed alert-feed--short" aria-label={t('svAlertsTitle')}>
              {alerts.slice(0, 8).map((a) => (
                <li key={a.id} className={a.isRead ? 'is-read' : ''}>
                  <div className="alert-feed-main">
                    <p className="alert-feed-message">{a.message}</p>
                    <p className="alert-feed-meta"><span>{timeAgo(a.createdAt, locale)}</span></p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title={t('svChecksTitle')}
        flush
        actions={<Link to="/detections/reports" className="btn btn-ghost btn-sm">{t('svFullReport')}<Icon name="forward" size={14} /></Link>}
      >
        {recent.length === 0 ? (
          <EmptyState icon={<Icon name="detections" size={22} />} title={t('svNoChecks')} description={t('svNoChecksBody')} />
        ) : (
          <div className="table-wrapper">
            <table className="table-stack">
              <thead>
                <tr>
                  <th>{t('svColFarm')}</th>
                  <th>{t('svColResult')}</th>
                  <th>{t('svColConfidence')}</th>
                  <th>{t('svColDate')}</th>
                </tr>
              </thead>
              <tbody>
                {recent.slice(0, 8).map((d) => (
                  <tr key={d.id} className="tbody-row">
                    <td className="cell-lead cell-strong">{d.farmName ?? '-'}</td>
                    <td data-label={t('svColResult')}>
                      <span className="badge badge-stage" style={{ '--c': colorFor('result', d.result) } as React.CSSProperties}>{d.result}</span>
                    </td>
                    <td data-label={t('svColConfidence')} className="cell-strong">{Math.round(d.confidence * 100)}%</td>
                    <td data-label={t('svColDate')} className="cell-muted cell-nowrap">
                      {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(d.detectedAt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
