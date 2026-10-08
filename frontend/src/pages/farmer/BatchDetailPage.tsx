import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { batchService } from '../../services/batch.service';
import { detectionService } from '../../services/detection.service';
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

// The same limits the sensors use when they raise an alert.
const TEMP_RANGE: [number, number] = [22, 28];
const HUM_RANGE: [number, number] = [70, 85];
const inRange = (value: number, [low, high]: [number, number]) => value >= low && value <= high;

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
  const [showArchive, setShowArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);

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
  // The API sends the newest reading first, charts read oldest first.
  const series = [...readings].reverse().map((r) => ({
    hour: clock.format(new Date(r.timestamp)),
    temp: Number(r.temperature.toFixed(1)),
    hum: Number(r.humidity.toFixed(1)),
  }));

  return (
    <div>
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
          <StageStepper current={batch.stage} canAdvance={canEdit} busy={moving} onAdvance={advance} />
        </Panel>

        <div className="split">
          <Panel title={t('bdDetails')}>
            <dl className="facts facts--one">
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

        {series.length > 0 && (
          <>
            <div className="split">
              <Panel title={t('bdTempChart')} note={t('bdSafeTemp')}>
                <RangeChart label={t('bdTempChart')} data={series} dataKey="temp" unit="°C" color={colorFor('stage', 'COCOON')} safe={TEMP_RANGE} />
              </Panel>
              <Panel title={t('bdHumChart')} note={t('bdSafeHum')}>
                <RangeChart label={t('bdHumChart')} data={series} dataKey="hum" unit="%" color={colorFor('stage', 'PUPA')} safe={HUM_RANGE} />
              </Panel>
            </div>

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
                      const fine = inRange(r.temperature, TEMP_RANGE) && inRange(r.humidity, HUM_RANGE);
                      return (
                        <tr key={r.id} className="tbody-row">
                          <td className="cell-lead cell-muted cell-nowrap">{clock.format(new Date(r.timestamp))}</td>
                          <td data-label={t('bdColTemp')}>{r.temperature.toFixed(1)} °C</td>
                          <td data-label={t('bdColHum')}>{r.humidity.toFixed(0)} %</td>
                          <td data-label={t('bdColState')}>
                            <span className={`badge badge-dot ${fine ? 'badge-green' : 'badge-red'}`}>{fine ? t('bdInRange') : t('bdOutRange')}</span>
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
                        <span className="badge badge-stage badge-dot" style={{ '--c': colorFor('result', d.result) } as CSSProperties}>{d.result}</span>
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
