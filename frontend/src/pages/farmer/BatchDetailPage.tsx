import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { batchService } from '../../services/batch.service';
import { detectionService } from '../../services/detection.service';
import { alertService } from '../../services/alert.service';
import { roomService } from '../../services/room.service';
import { sensorService, type SeriesPoint, type StageRange } from '../../services/sensor.service';
import { Batch, BatchStage, DiseaseDetection, MortalityEntry, QuantityUnit, Room } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';
import { stageLabel } from '../../utils/constants';
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

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const byNewestDay = (a: MortalityEntry, b: MortalityEntry) => (a.recordedOn < b.recordedOn ? 1 : a.recordedOn > b.recordedOn ? -1 : 0);

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

  // Deaths log
  const [entries, setEntries] = useState<MortalityEntry[]>([]);
  const [showDeaths, setShowDeaths] = useState(false);
  const [deathsForm, setDeathsForm] = useState({ count: '', day: '', note: '' });
  const [deathsError, setDeathsError] = useState('');
  const [savingDeaths, setSavingDeaths] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<MortalityEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState(false);

  // Move to another room
  const [farmRooms, setFarmRooms] = useState<Room[]>([]);
  const [showMove, setShowMove] = useState(false);
  const [moveTo, setMoveTo] = useState('');
  const [moveError, setMoveError] = useState('');
  const [movingRoom, setMovingRoom] = useState(false);

  // Edit details
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({ breed: '', quantity: '', unit: 'BOXES', notes: '' });
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

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

  const farmId = batch?.farmId;
  useEffect(() => {
    if (!farmId) return;
    roomService.getByFarm(farmId).then((r) => setFarmRooms(r.data.data)).catch(() => {});
  }, [farmId]);

  useEffect(() => {
    if (!id) return;
    batchService.getMortality(id).then((r) => setEntries(r.data.data)).catch(() => {});
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
      success(fill(t('bdAdvanced'), { stage: stageLabel(t, stage) }));
      if (stage === 'HARVEST') navigate(`/batches/${id}/harvest`);
      else setBatch((prev) => (prev ? { ...prev, stage } : prev));
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setMoving(false);
      setPendingStage(null);
    }
  };

  const openDeaths = () => {
    setDeathsForm({ count: '', day: localDay(new Date()), note: '' });
    setDeathsError('');
    setShowDeaths(true);
  };

  const saveDeaths = async () => {
    if (!id) return;
    const count = Number(deathsForm.count);
    if (deathsForm.count.trim() === '' || !Number.isInteger(count) || count < 1) {
      setDeathsError(t('bdDeathsNeed'));
      return;
    }
    setDeathsError('');
    setSavingDeaths(true);
    try {
      const res = await batchService.addMortality(id, {
        count,
        recordedOn: deathsForm.day || undefined,
        note: deathsForm.note.trim() || undefined,
      });
      setEntries((prev) => [res.data.data, ...prev].sort(byNewestDay));
      setShowDeaths(false);
      success(t('bdDeathsSaved'));
    } catch (err) {
      setDeathsError(getErrorMessage(err));
    } finally {
      setSavingDeaths(false);
    }
  };

  const removeEntry = async () => {
    if (!id || !entryToDelete) return;
    setDeletingEntry(true);
    try {
      await batchService.deleteMortality(id, entryToDelete.id);
      setEntries((prev) => prev.filter((e) => e.id !== entryToDelete.id));
      success(t('bdDeathDeleted'));
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setDeletingEntry(false);
      setEntryToDelete(null);
    }
  };

  const openMove = () => {
    setMoveTo('');
    setMoveError('');
    setShowMove(true);
  };

  const saveMove = async () => {
    if (!id || !moveTo) return;
    setMoveError('');
    setMovingRoom(true);
    try {
      const res = await batchService.moveToRoom(id, moveTo);
      const moved = res.data.data;
      const stays = (await batchService.getById(id)).data.data.roomStays;
      setBatch((prev) => (prev ? { ...prev, room: moved.room, roomStays: stays ?? prev.roomStays } : prev));
      setShowMove(false);
      success(t('bdRoomMoved'));
    } catch (err) {
      setMoveError(getErrorMessage(err));
    } finally {
      setMovingRoom(false);
    }
  };

  const openEdit = () => {
    if (!batch) return;
    setEditForm({
      breed: batch.breed ?? '',
      quantity: batch.quantity ? String(batch.quantity) : '',
      unit: batch.quantityUnit ?? 'BOXES',
      notes: batch.notes ?? '',
    });
    setEditError('');
    setShowEdit(true);
  };

  const saveEdit = async () => {
    if (!id) return;
    const quantity = editForm.quantity.trim() === '' ? null : Number(editForm.quantity);
    if (quantity !== null && (!Number.isInteger(quantity) || quantity < 1)) {
      setEditError(t('bdQuantityNeed'));
      return;
    }
    setEditError('');
    setSavingEdit(true);
    try {
      const res = await batchService.update(id, {
        breed: editForm.breed.trim(),
        quantity,
        quantityUnit: editForm.unit as QuantityUnit,
        notes: editForm.notes,
      });
      const saved = res.data.data;
      setBatch((prev) => (prev ? { ...prev, breed: saved.breed, quantity: saved.quantity, quantityUnit: saved.quantityUnit, notes: saved.notes } : prev));
      setShowEdit(false);
      success(t('bdDetailsSaved'));
    } catch (err) {
      setEditError(getErrorMessage(err));
    } finally {
      setSavingEdit(false);
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
  const deathsTotal = entries.reduce((sum, e) => sum + e.count, 0);
  const number = new Intl.NumberFormat(locale);
  const quantityText = batch.quantity
    ? batch.quantityUnit === 'WORMS'
      ? fill(t('bdQtyWorms'), { n: number.format(batch.quantity) })
      : fill(t(batch.quantity === 1 ? 'bdQtyBoxesOne' : 'bdQtyBoxes'), { n: number.format(batch.quantity) })
    : '';
  const totalText = batch.quantity && batch.quantityUnit === 'WORMS'
    ? fill(t('bdDeathsTotalOf'), { n: number.format(deathsTotal), q: number.format(batch.quantity), pct: ((deathsTotal / batch.quantity) * 100).toFixed(1) })
    : fill(t('bdDeathsTotal'), { n: number.format(deathsTotal) });
  const dayLine = batch.stage === 'HARVEST'
    ? ''
    : fill(t(late ? 'bdDayLate' : 'bdDay'), { n: dayNumber, total: totalDays, date: date.format(new Date(expectedMs)) });

  return (
    <div>
      <Modal
        open={!!pendingStage}
        onClose={() => setPendingStage(null)}
        title={pendingStage ? fill(t('bdMoveTitle'), { stage: stageLabel(t, pendingStage) }) : ''}
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
          {pendingStage ? fill(t('bdMoveBody'), { id: code, from: stageLabel(t, batch.stage), to: stageLabel(t, pendingStage) }) : ''}
        </p>
      </Modal>

      <Modal
        open={showDeaths}
        onClose={() => setShowDeaths(false)}
        title={t('bdDeathsRecord')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowDeaths(false)}>{t('btnCancel')}</button>
            <button className="btn btn-primary" onClick={saveDeaths} disabled={savingDeaths}>
              {savingDeaths ? <span className="spinner" aria-hidden="true" /> : null}
              {t('btnSave')}
            </button>
          </>
        }
      >
        {deathsError && <div className="alert alert-error" role="alert">{deathsError}</div>}
        <div className="form-group">
          <label className="form-label" htmlFor="deaths-count">{t('bdDeathsHowMany')}</label>
          <input id="deaths-count" type="number" inputMode="numeric" min={1} step={1} className="form-input" value={deathsForm.count}
            onChange={(e) => setDeathsForm((f) => ({ ...f, count: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="deaths-day">{t('bdDeathsDay')}</label>
          <input id="deaths-day" type="date" className="form-input" value={deathsForm.day} max={localDay(new Date())} min={localDay(new Date(batch.startDate))}
            onChange={(e) => setDeathsForm((f) => ({ ...f, day: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="deaths-note">{t('bdDeathsNote')} <span className="form-optional">({t('abNotesOptional')})</span></label>
          <textarea id="deaths-note" className="form-textarea" rows={2} maxLength={500} value={deathsForm.note}
            onChange={(e) => setDeathsForm((f) => ({ ...f, note: e.target.value }))} />
        </div>
      </Modal>

      <Modal
        open={!!entryToDelete}
        onClose={() => setEntryToDelete(null)}
        title={t('bdDeathDeleteTitle')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setEntryToDelete(null)}>{t('btnCancel')}</button>
            <button className="btn btn-danger" onClick={removeEntry} disabled={deletingEntry}>{t('bdDeathDeleteYes')}</button>
          </>
        }
      >
        <p className="modal-text">{entryToDelete ? fill(t('bdDeathDeleteBody'), { n: entryToDelete.count }) : ''}</p>
      </Modal>

      <Modal
        open={showMove}
        onClose={() => setShowMove(false)}
        title={t('bdMoveRoom')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowMove(false)}>{t('btnCancel')}</button>
            <button className="btn btn-primary" onClick={saveMove} disabled={!moveTo || movingRoom}>
              {movingRoom ? <span className="spinner" aria-hidden="true" /> : null}
              {t('bdMoveRoomYes')}
            </button>
          </>
        }
      >
        {moveError && <div className="alert alert-error" role="alert">{moveError}</div>}
        <p className="modal-text">{t('bdMoveRoomBody')}</p>
        <div className="form-group">
          <label className="form-label" htmlFor="move-room">{t('bdMoveRoomPick')}</label>
          <select id="move-room" className="form-select" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            <option value="">{t('abRoomChoose')}</option>
            {farmRooms.filter((r) => r.id !== batch.room?.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
      </Modal>

      <Modal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title={t('bdEditTitle')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowEdit(false)}>{t('btnCancel')}</button>
            <button className="btn btn-primary" onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? <span className="spinner" aria-hidden="true" /> : null}
              {t('btnSave')}
            </button>
          </>
        }
      >
        {editError && <div className="alert alert-error" role="alert">{editError}</div>}
        <div className="form-group">
          <label className="form-label" htmlFor="edit-breed">{t('abBreed')} <span className="form-optional">({t('abNotesOptional')})</span></label>
          <input id="edit-breed" className="form-input" maxLength={100} value={editForm.breed} onChange={(e) => setEditForm((f) => ({ ...f, breed: e.target.value }))} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="edit-quantity">{t('abQuantity')} <span className="form-optional">({t('abNotesOptional')})</span></label>
            <input id="edit-quantity" type="number" inputMode="numeric" min={1} step={1} className="form-input" value={editForm.quantity}
              onChange={(e) => setEditForm((f) => ({ ...f, quantity: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="edit-unit">{t('abUnit')}</label>
            <select id="edit-unit" className="form-select" value={editForm.unit} onChange={(e) => setEditForm((f) => ({ ...f, unit: e.target.value }))}>
              <option value="BOXES">{t('abUnitBoxes')}</option>
              <option value="WORMS">{t('abUnitWorms')}</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="edit-notes">{t('abNotes')} <span className="form-optional">({t('abNotesOptional')})</span></label>
          <textarea id="edit-notes" className="form-textarea" rows={3} maxLength={500} value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>
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
            <Link to={`/batches/${id}/report`} className="btn btn-secondary btn-sm">
              <Icon name="download" size={15} />
              {t('ptBatchReport')}
            </Link>
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
                  stage: stageLabel(t, batch.stage),
                  tmin: range.tempMin, tmax: range.tempMax, hmin: range.humMin, hmax: range.humMax,
                })}
              </p>
            </div>
          )}
          <StageStepper current={batch.stage} canAdvance={canEdit} busy={moving} onAdvance={setPendingStage} />
        </Panel>

        <div className="split">
          <Panel
            title={t('bdDetails')}
            actions={canEdit ? (
              <>
                {farmRooms.some((r) => r.id !== batch.room?.id) && (
                  <button className="btn btn-ghost btn-sm" onClick={openMove}>{t('bdMoveRoom')}</button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={openEdit}>{t('bdEditDetails')}</button>
              </>
            ) : undefined}
          >
            <dl className="facts facts--pairs">
              <div>
                <dt>{t('bdStage')}</dt>
                <dd>{stageLabel(t, batch.stage)}</dd>
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
              {batch.room && (
                <div>
                  <dt>{t('bdRoom')}</dt>
                  <dd>{batch.room.name}</dd>
                </div>
              )}
              {batch.breed && (
                <div>
                  <dt>{t('bdBreed')}</dt>
                  <dd>{batch.breed}</dd>
                </div>
              )}
              {quantityText && (
                <div>
                  <dt>{t('bdQuantity')}</dt>
                  <dd>{quantityText}</dd>
                </div>
              )}
              {batch.notes && (
                <div>
                  <dt>{t('bdNotes')}</dt>
                  <dd>{batch.notes}</dd>
                </div>
              )}
            </dl>
            {(batch.roomStays?.length ?? 0) > 1 && (
              <ul className="room-history" aria-label={t('bdRoomHistory')}>
                {batch.roomStays!.map((stay) => (
                  <li key={`${stay.roomId}-${stay.startedAt}`}>
                    {stay.endedAt
                      ? fill(t('bdRoomStay'), { room: stay.roomName, from: date.format(new Date(stay.startedAt)), to: date.format(new Date(stay.endedAt)) })
                      : fill(t('bdRoomStayNow'), { room: stay.roomName, from: date.format(new Date(stay.startedAt)) })}
                  </li>
                ))}
              </ul>
            )}
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

        <Panel
          title={t('bdDeathsTitle')}
          actions={canEdit ? (
            <button className="btn btn-secondary btn-sm" onClick={openDeaths}>
              <Icon name="add" size={15} />
              {t('bdDeathsRecord')}
            </button>
          ) : undefined}
        >
          {entries.length === 0 ? (
            <p className="chart-empty">{t('bdDeathsNone')}</p>
          ) : (
            <>
              <p className="deaths-summary">{totalText}</p>
              <ul className="deaths-list">
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <span className="deaths-day">{date.format(new Date(`${entry.recordedOn}T00:00:00`))}</span>
                    <span className="deaths-count">{number.format(entry.count)}</span>
                    <span className="deaths-note">{entry.note}</span>
                    {canEdit && (
                      <button className="btn btn-ghost btn-xs btn-quiet-danger" onClick={() => setEntryToDelete(entry)}>{t('bdDeathDelete')}</button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>

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
