import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { batchService } from '../../services/batch.service';
import { detectionService } from '../../services/detection.service';
import { alertService } from '../../services/alert.service';
import { sensorService, type SeriesPoint, type StageRange } from '../../services/sensor.service';
import { Batch, BatchStage, DiseaseDetection } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';
import { STAGE_LABELS } from '../../utils/constants';
import { colorFor } from '../../utils/chartColors';
import { fill } from '../../utils/fill';
import { timeAgo } from '../../utils/timeAgo';
import { useDocumentTitle } from '../../utils/pageTitle';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import RangeChart from '../../components/ui/RangeChart';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import StageStepper from './StageStepper';

// Used when the server cannot give the range of a stage, the same range it falls back to.
const USUAL_RANGE = { tempMin: 22, tempMax: 28, humMin: 70, humMax: 85 };
const inRange = (value: number, low: number, high: number) => value >= low && value <= high;
const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const WINDOWS = [
  { hours: 24, label: 'bd24h' },
  { hours: 168, label: 'bd7d' },
  { hours: 720, label: 'bd30d' },
] as const;

export default function BatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { t, locale } = useLanguage();
  const { getErrorMessage } = useApiError();
  const { success, error: showError } = useToast();
  const navigate = useNavigate();

  const [batch, setBatch] = useState<Batch | null>(null);
  const [detections, setDetections] = useState<DiseaseDetection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moving, setMoving] = useState(false);
  const [pendingStage, setPendingStage] = useState<BatchStage | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [ranges, setRanges] = useState<StageRange[]>([]);
  const [hours, setHours] = useState<number>(24);
  const [points, setPoints] = useState<SeriesPoint[]>([]);

  const code = (id ?? '').slice(-8).toUpperCase();
  useDocumentTitle(fill(t('bdTitle'), { id: code }));

  useEffect(() => {
    if (!id) return;
    Promise.all([batchService.getById(id), detectionService.getByBatch(id)])
      .then(([batchRes, detectionRes]) => {
        setBatch(batchRes.data.data);
        setDetections(detectionRes.data.data);
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    // Without the ranges the page still works, using the usual ones.
    alertService.getThresholds().then((r) => setRanges(r.data.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    sensorService.getBatchSeries(id, hours)
      .then((r) => setPoints(r.data.data))
      .catch((err) => showError(getErrorMessage(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, hours]);

  const canEdit = user?.role === 'FARMER' || user?.role === 'ADMIN';

  const advance = async (stage: BatchStage) => {
    if (!id) return;
    setMoving(true);
    try {
      await batchService.updateStage(id, stage);
      success(fill(t('bdAdvanced'), { stage: STAGE_LABELS[stage] }));
      if (stage === 'HARVEST') navigate(`/batches/${id}/harvest`);
      else setBatch((prev) => (prev ? { ...prev, stage } : prev));
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setMoving(false);
      setPendingStage(null);
    }
  };

  const archive = async () => {
    if (!id) return;
    setArchiving(true);
    try {
      await batchService.delete(id);
      success(t('bdArchived'));
      navigate(`/farms/${batch?.farmId}`);
    } catch (err) {
      showError(getErrorMessage(err));
      setArchiving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="" />
        <SkeletonTable rows={4} cols={4} />
      </div>
    );
  }

  if (error || !batch) {
    return (
      <div>
        <div className="alert alert-error" role="alert">{error || t('bdNotFound')}</div>
        <Link to="/farms" className="btn btn-secondary btn-sm">
          <Icon name="back" size={15} />
          {t('afBack')}
        </Link>
      </div>
    );
  }

  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const clock = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const readings = batch.sensorReadings ?? [];
  const alerts = batch.alertLogs ?? [];
  const unread = alerts.filter((a) => !a.isRead).length;
  const counts = batch.counts ?? { diseaseDetections: detections.length, sensorReadings: readings.length, alertLogs: alerts.length };
  // The series comes oldest first, which is the way a chart reads.
  const series = points.map((p) => ({
    hour: clock.format(new Date(p.timestamp)),
    temp: p.temperature,
    hum: p.humidity,
  }));
  const range = ranges.find((r) => r.stage === batch.stage) ?? USUAL_RANGE;
  const tempSafe: [number, number] = [range.tempMin, range.tempMax];
  const humSafe: [number, number] = [range.humMin, range.humMax];

  const now = Date.now();
  const startMs = new Date(batch.startDate).getTime();
  const expectedMs = new Date(batch.expectedHarvestDate).getTime();
  const dayNumber = Math.floor((now - startMs) / 86_400_000) + 1;
  const totalDays = Math.round((expectedMs - startMs) / 86_400_000);
  const late = startOfDay(expectedMs) < startOfDay(now);
  const dayLine = batch.stage === 'HARVEST'
    ? ''
    : fill(t(late ? 'bdDayLate' : 'bdDay'), { n: dayNumber, total: totalDays, date: date.format(new Date(expectedMs)) });

  return (
    <div>
      <Modal
        open={!!pendingStage}
        onClose={() => setPendingStage(null)}
        title={pendingStage ? fill(t('bdMoveTitle'), { stage: STAGE_LABELS[pendingStage] }) : ''}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setPendingStage(null)} disabled={moving}>{t('btnCancel')}</button>
            <button className="btn btn-primary" onClick={() => pendingStage && advance(pendingStage)} disabled={moving}>
              {moving ? <><span className="spinner" />{t('bdMoving')}</> : t('bdMoveYes')}
            </button>
          </>
        }
      >
        <p className="modal-text">
          {pendingStage ? fill(t('bdMoveBody'), { id: code, from: STAGE_LABELS[batch.stage], to: STAGE_LABELS[pendingStage] }) : ''}
        </p>
      </Modal>

      <Modal
        open={showArchive}
        onClose={() => setShowArchive(false)}
        title={t('bdArchiveTitle')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowArchive(false)}>{t('btnCancel')}</button>
            <button className="btn btn-danger" onClick={archive} disabled={archiving}>
              {archiving ? <><span className="spinner" />{t('bdArchiving')}</> : t('bdArchiveYes')}
            </button>
          </>
        }
      >
        <p className="modal-text">{fill(t('bdArchiveBody'), { id: code })}</p>
      </Modal>

      <PageHeader
        title={fill(t('bdTitle'), { id: code })}
        actions={
          <>
            <Link to={`/batches/${id}/detect`} className="btn btn-primary btn-sm">
              <Icon name="detections" size={15} />
              {t('bdCheck')}
            </Link>
            {batch.stage === 'HARVEST' && (
              <Link to={`/batches/${id}/harvest`} className="btn btn-secondary btn-sm">
                <Icon name="harvests" size={15} />
                {t('bdHarvestRecords')}
              </Link>
            )}
            {canEdit && (
              <button onClick={() => setShowArchive(true)} className="btn btn-ghost btn-sm btn-quiet-danger">
                <Icon name="remove" size={15} />
                {t('bdArchive')}
              </button>
            )}
            <Link to={`/farms/${batch.farmId}`} className="btn btn-ghost btn-sm">
              <Icon name="back" size={15} />
              {t('bdBackFarm')}
            </Link>
          </>
        }
      />

      <div className="stack-24">
        <Panel title={t('bdLifecycle')}>
          {batch.stage !== 'HARVEST' && (
            <div className="lifecycle-notes">
              <p className="lifecycle-day">{dayLine}</p>
              <p className="lifecycle-range">
                {fill(t('bdStageRange'), {
                  stage: STAGE_LABELS[batch.stage],
                  tmin: range.tempMin, tmax: range.tempMax, hmin: range.humMin, hmax: range.humMax,
                })}
              </p>
            </div>
          )}
          <StageStepper current={batch.stage} canAdvance={canEdit} busy={moving} onAdvance={setPendingStage} />
        </Panel>

        <div className="split">
          <Panel title={t('bdDetails')}>
            <dl className="facts facts--pairs">
              <div>
                <dt>{t('bdStage')}</dt>
                <dd>{STAGE_LABELS[batch.stage]}</dd>
              </div>
              <div>
                <dt>{t('bdFarm')}</dt>
                <dd><Link to={`/farms/${batch.farmId}`} className="link">{batch.farm?.name ?? '-'}</Link></dd>
              </div>
              {batch.farm?.location && (
                <div>
                  <dt>{t('bdPlace')}</dt>
                  <dd>{batch.farm.location}</dd>
                </div>
              )}
              <div>
                <dt>{t('bdStarted')}</dt>
                <dd>{date.format(new Date(batch.startDate))}</dd>
              </div>
              <div>
                <dt>{t('bdExpected')}</dt>
                <dd>{date.format(new Date(batch.expectedHarvestDate))}</dd>
              </div>
              {batch.notes && (
                <div>
                  <dt>{t('bdNotes')}</dt>
                  <dd>{batch.notes}</dd>
                </div>
              )}
            </dl>
          </Panel>

          <Panel title={t('bdActivity')}>
            <div role="region" aria-label={t('bdActivity')}>
              <dl className="facts facts--three">
                <div>
                  <dt>{t('bdChecks')}</dt>
                  <dd>{counts.diseaseDetections}</dd>
                </div>
                <div>
                  <dt>{t('bdReadings')}</dt>
                  <dd>{counts.sensorReadings}</dd>
                </div>
                <div>
                  <dt>{t('bdUnread')}</dt>
                  <dd>{unread}</dd>
                </div>
              </dl>
            </div>
            {alerts.length > 0 && (
              <>
                <h3 className="subhead">{t('bdLatestAlerts')}</h3>
                <ul className="batch-alerts">
                  {alerts.slice(0, 3).map((a) => (
                    <li key={a.id}>
                      <span>{a.message}</span>
                      <span className="batch-alerts-time">{timeAgo(a.createdAt, locale)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>
        </div>

        {(counts.sensorReadings > 0 || series.length > 0) && (
          <>
            <div className="range-choice" role="group" aria-label={t('bdTimeLabel')}>
              {WINDOWS.map((w) => (
                <button key={w.hours} type="button" aria-pressed={hours === w.hours} onClick={() => setHours(w.hours)}>{t(w.label)}</button>
              ))}
            </div>

            {series.length === 0 ? (
              <p className="chart-empty">{t('bdNoSeries')}</p>
            ) : (
              <div className="split">
                <Panel title={t('bdTempChart')} note={fill(t('bdSafeTemp'), { min: range.tempMin, max: range.tempMax })}>
                  <RangeChart label={t('bdTempChart')} data={series} dataKey="temp" unit="°C" color={colorFor('stage', 'COCOON')} safe={tempSafe} />
                </Panel>
                <Panel title={t('bdHumChart')} note={fill(t('bdSafeHum'), { min: range.humMin, max: range.humMax })}>
                  <RangeChart label={t('bdHumChart')} data={series} dataKey="hum" unit="%" color={colorFor('stage', 'PUPA')} safe={humSafe} />
                </Panel>
              </div>
            )}

            <Panel title={t('bdRecentReadings')} flush>
              <div className="table-wrapper">
                <table className="table-stack" aria-label={t('bdRecentReadings')}>
                  <thead>
                    <tr>
                      <th>{t('bdColWhen')}</th>
                      <th>{t('bdColTemp')}</th>
                      <th>{t('bdColHum')}</th>
                      <th>{t('bdColState')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {readings.slice(0, 10).map((r) => {
                      const fine = inRange(r.temperature, range.tempMin, range.tempMax) && inRange(r.humidity, range.humMin, range.humMax);
                      return (
                        <tr key={r.id} className="tbody-row">
                          <td className="cell-lead cell-muted cell-nowrap">{clock.format(new Date(r.timestamp))}</td>
                          <td data-label={t('bdColTemp')}>{r.temperature.toFixed(1)} °C</td>
                          <td data-label={t('bdColHum')}>{r.humidity.toFixed(0)} %</td>
                          <td data-label={t('bdColState')}>
                            <span className={`badge ${fine ? 'badge-green' : 'badge-red'}`}>{fine ? t('bdInRange') : t('bdOutRange')}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        )}

        <Panel
          title={t('bdHistory')}
          flush
          actions={
            <Link to={`/batches/${id}/detect`} className="btn btn-secondary btn-sm">
              <Icon name="add" size={15} />
              {t('bdNewCheck')}
            </Link>
          }
        >
          {detections.length === 0 ? (
            <EmptyState icon={<Icon name="detections" size={22} />} title={t('bdNoChecks')} description={t('bdNoChecksBody')} />
          ) : (
            <div className="table-wrapper">
              <table className="table-stack">
                <thead>
                  <tr>
                    <th>{t('bdColWhen')}</th>
                    <th>{t('bdColResult')}</th>
                    <th>{t('bdColConfidence')}</th>
                    <th>{t('bdColNotes')}</th>
                  </tr>
                </thead>
                <tbody>
                  {detections.map((d) => (
                    <tr key={d.id} className="tbody-row">
                      <td className="cell-lead cell-muted cell-nowrap">{clock.format(new Date(d.detectedAt))}</td>
                      <td data-label={t('bdColResult')}>
                        <span className="badge badge-stage" style={{ '--c': colorFor('result', d.result) } as CSSProperties}>{d.result}</span>
                      </td>
                      <td data-label={t('bdColConfidence')} className="cell-nowrap">{Math.round(d.confidence * 100)}%</td>
                      <td data-label={t('bdColNotes')} className="cell-muted">{d.notes ?? '-'}</td>
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
