import { FormEvent, useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { farmService } from '../../services/farm.service';
import { batchService } from '../../services/batch.service';
import { deviceService } from '../../services/device.service';
import { roomService } from '../../services/room.service';
import LocationPicker, { EMPTY_PLACE, PlaceValue } from '../../components/ui/LocationPicker';
import { STAGE_LABELS } from '../../utils/constants';
import { Farm, Batch, IoTDevice, Room } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';
import { fill } from '../../utils/fill';
import { timeAgo } from '../../utils/timeAgo';
import { useDocumentTitle } from '../../utils/pageTitle';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import StageBadge from '../../components/ui/StageBadge';
import AddDeviceModal from '../shared/AddDeviceModal';
import DeviceDetailModal from '../shared/DeviceDetailModal';
import DeviceStatusBadge from '../shared/DeviceStatusBadge';

export default function FarmDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { t, locale } = useLanguage();
  const { getErrorMessage } = useApiError();
  const { success, error: showError } = useToast();
  const navigate = useNavigate();

  const [downloading, setDownloading] = useState(false);
  const [farm, setFarm] = useState<Farm | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [devices, setDevices] = useState<IoTDevice[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  // Rooms: one dialog for adding and editing, and a question before deleting.
  const [roomDialog, setRoomDialog] = useState<{ room: Room | null } | null>(null);
  const [roomForm, setRoomForm] = useState({ name: '', notes: '' });
  const [roomError, setRoomError] = useState('');
  const [savingRoom, setSavingRoom] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState<Room | null>(null);
  const [deletingRoom, setDeletingRoom] = useState(false);
  const [error, setError] = useState('');

  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPlace, setEditPlace] = useState<PlaceValue>(EMPTY_PLACE);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [openDevice, setOpenDevice] = useState<IoTDevice | null>(null);

  useDocumentTitle(farm?.name ?? t('ptFarmDetail'));

  useEffect(() => {
    if (!id) return;
    Promise.all([farmService.getById(id), batchService.getByFarm(id), deviceService.getAll(id)])
      .then(([farmRes, batchRes, deviceRes]) => {
        setFarm(farmRes.data.data);
        setBatches(batchRes.data.data);
        setDevices(deviceRes.data.data);
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadRooms = () => {
    if (!id) return;
    roomService.getByFarm(id).then((r) => setRooms(r.data.data)).catch(() => {});
  };

  useEffect(loadRooms, [id]);

  const canEdit = user?.role === 'FARMER' || user?.role === 'ADMIN';
  const canManage = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';

  const downloadSummary = async () => {
    if (!id) return;
    setDownloading(true);
    try {
      await farmService.downloadSummary(id, locale);
    } catch {
      showError(t('fdSummaryError'));
    } finally {
      setDownloading(false);
    }
  };

  const openEdit = () => {
    if (!farm) return;
    setEditName(farm.name);
    setEditPlace({
      provinceCode: farm.province?.code ?? '', districtCode: farm.district?.code ?? '', sectorCode: farm.sector?.code ?? '',
      cellCode: farm.cell?.code ?? '', villageCode: farm.village?.code ?? '', street: farm.street ?? '',
    });
    setShowEdit(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    try {
      // A farm from before places that is only renamed keeps its old text. Any place sent must be the whole place.
      const untouched = !farm?.village && !editPlace.provinceCode;
      const res = await farmService.update(id, untouched ? { name: editName } : { name: editName, ...editPlace });
      setFarm(res.data.data);
      setShowEdit(false);
      success(t('fdUpdated'));
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const openRoomDialog = (room: Room | null) => {
    setRoomForm({ name: room?.name ?? '', notes: room?.notes ?? '' });
    setRoomError('');
    setRoomDialog({ room });
  };

  const saveRoom = async () => {
    if (!id || !roomDialog) return;
    const name = roomForm.name.trim();
    if (!name) {
      setRoomError(t('rmNameNeed'));
      return;
    }
    setRoomError('');
    setSavingRoom(true);
    try {
      const data = { name, notes: roomForm.notes.trim() || undefined };
      if (roomDialog.room) {
        const res = await roomService.update(roomDialog.room.id, data);
        setRooms((prev) => prev.map((r) => (r.id === res.data.data.id ? res.data.data : r)));
        success(t('rmUpdated'));
      } else {
        const res = await roomService.create(id, data);
        setRooms((prev) => [...prev, res.data.data]);
        success(t('rmAdded'));
      }
      setRoomDialog(null);
    } catch (err) {
      setRoomError(getErrorMessage(err));
    } finally {
      setSavingRoom(false);
    }
  };

  const deleteRoom = async () => {
    if (!roomToDelete) return;
    setDeletingRoom(true);
    try {
      await roomService.remove(roomToDelete.id);
      setRooms((prev) => prev.filter((r) => r.id !== roomToDelete.id));
      success(t('rmDeleted'));
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setDeletingRoom(false);
      setRoomToDelete(null);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await farmService.delete(id);
      success(t('fdDeleted'));
      navigate('/farms');
    } catch (err) {
      showError(getErrorMessage(err));
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="" />
        <SkeletonTable rows={4} cols={5} />
      </div>
    );
  }

  if (error || !farm) {
    return (
      <div>
        <div className="alert alert-error" role="alert">{error || t('fdNotFound')}</div>
        <Link to="/farms" className="btn btn-secondary btn-sm">
          <Icon name="back" size={15} />
          {t('afBack')}
        </Link>
      </div>
    );
  }

  const online = devices.filter((d) => d.status === 'online').length;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <div>
      <Modal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title={t('fdEdit')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowEdit(false)}>{t('btnCancel')}</button>
            <button className="btn btn-primary" form="farm-edit-form" type="submit" disabled={saving}>
              {saving ? <><span className="spinner" />{t('pfSaving')}</> : t('pfSave')}
            </button>
          </>
        }
      >
        <form id="farm-edit-form" onSubmit={handleSave}>
          <div className="form-group">
            <label className="form-label" htmlFor="edit-farm-name">{t('afName')} <span className="required" aria-hidden="true">*</span></label>
            <input id="edit-farm-name" className="form-input" value={editName} onChange={(e) => setEditName(e.target.value)} required maxLength={150} />
          </div>
          <LocationPicker value={editPlace} onChange={setEditPlace} legacyText={farm?.village ? undefined : farm?.location} idPrefix="edit-farm-place" />
        </form>
      </Modal>

      <Modal
        open={showDelete}
        onClose={() => setShowDelete(false)}
        title={t('fdDeleteTitle')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowDelete(false)}>{t('btnCancel')}</button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? <><span className="spinner" />{t('fdDeleting')}</> : t('fdDeleteYes')}
            </button>
          </>
        }
      >
        <p className="modal-text">{fill(t('fdDeleteBody'), { name: farm.name })}</p>
      </Modal>

      <Modal
        open={!!roomDialog}
        onClose={() => setRoomDialog(null)}
        title={roomDialog?.room ? t('rmEditTitle') : t('rmAddTitle')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setRoomDialog(null)}>{t('btnCancel')}</button>
            <button className="btn btn-primary" onClick={saveRoom} disabled={savingRoom}>
              {savingRoom ? <span className="spinner" aria-hidden="true" /> : null}
              {t('btnSave')}
            </button>
          </>
        }
      >
        {roomError && <div className="alert alert-error" role="alert">{roomError}</div>}
        <div className="form-group">
          <label className="form-label" htmlFor="room-name">{t('rmName')}</label>
          <input id="room-name" className="form-input" maxLength={100} value={roomForm.name} placeholder={t('rmNamePlace')}
            onChange={(e) => setRoomForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="room-notes">{t('rmNotes')} <span className="form-optional">({t('abNotesOptional')})</span></label>
          <textarea id="room-notes" className="form-textarea" rows={2} maxLength={500} value={roomForm.notes}
            onChange={(e) => setRoomForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>
      </Modal>

      <Modal
        open={!!roomToDelete}
        onClose={() => setRoomToDelete(null)}
        title={t('rmDeleteTitle')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setRoomToDelete(null)}>{t('btnCancel')}</button>
            <button className="btn btn-danger" onClick={deleteRoom} disabled={deletingRoom}>{t('rmDeleteYes')}</button>
          </>
        }
      >
        <p className="modal-text">{roomToDelete ? fill(t('rmDeleteBody'), { name: roomToDelete.name }) : ''}</p>
      </Modal>

      {showAddDevice && (
        <AddDeviceModal
          farms={[farm]}
          defaultFarmId={farm.id}
          onClose={() => setShowAddDevice(false)}
          onCreated={(device) => setDevices((prev) => [device, ...prev])}
        />
      )}

      {openDevice && (
        <DeviceDetailModal
          device={openDevice}
          canManage={canManage}
          onClose={() => setOpenDevice(null)}
          onRemoved={(removed) => setDevices((prev) => prev.filter((d) => d.id !== removed))}
          onMoved={(moved) => {
            setDevices((prev) => prev.map((d) => (d.id === moved.id ? { ...d, room: moved.room } : d)));
            loadRooms();
          }}
        />
      )}

      <PageHeader
        title={farm.name}
        subtitle={farm.location}
        actions={
          <>
            {canEdit && (
              <Link to={`/farms/${id}/batches/new`} className="btn btn-primary btn-sm">
                <Icon name="add" size={15} />
                {t('fdNewBatch')}
              </Link>
            )}
            <button onClick={downloadSummary} disabled={downloading} className="btn btn-secondary btn-sm">
              <Icon name="download" size={15} />
              {downloading ? t('reportExporting') : t('fdSummaryPdf')}
            </button>
            {canEdit && <button onClick={openEdit} className="btn btn-secondary btn-sm"><Icon name="edit" size={15} />{t('fdEdit')}</button>}
            {canEdit && <button onClick={() => setShowDelete(true)} className="btn btn-ghost btn-sm btn-quiet-danger"><Icon name="remove" size={15} />{t('fdDelete')}</button>}
            <Link to="/farms" className="btn btn-ghost btn-sm"><Icon name="back" size={15} />{t('afBack')}</Link>
          </>
        }
      />

      <dl className="facts facts--row">
        <div><dt>{t('fdOwner')}</dt><dd>{farm.owner?.name ?? '-'}</dd></div>
        <div><dt>{t('fdBatches')}</dt><dd>{batches.length}</dd></div>
        <div><dt>{t('fdDevices')}</dt><dd>{fill(t('fdDevicesValue'), { on: online, n: devices.length })}</dd></div>
        <div><dt>{t('fdCreated')}</dt><dd>{date.format(new Date(farm.createdAt))}</dd></div>
      </dl>

      <div className="stack-24">
        <Panel
          title={`${t('rmTitle')} (${rooms.length})`}
          flush
          actions={canEdit ? (
            <button className="btn btn-secondary btn-sm" onClick={() => openRoomDialog(null)}>
              <Icon name="add" size={15} />
              {t('rmAdd')}
            </button>
          ) : undefined}
        >
          {rooms.length === 0 ? (
            <EmptyState icon={<Icon name="batches" size={22} />} title={t('rmNone')} description={t('rmNoneBody')} />
          ) : (
            <ul className="room-list">
              {rooms.map((room) => (
                <li key={room.id}>
                  <div className="room-main">
                    <span className="cell-strong">{room.name}</span>
                    {room.notes && <span className="cell-sub">{room.notes}</span>}
                    {room.batches.length === 0 ? (
                      <span className="cell-sub">{t('rmEmpty')}</span>
                    ) : (
                      <span className="room-batches">
                        {room.batches.map((b) => (
                          <Link key={b.id} to={`/batches/${b.id}`} className="link">
                            {`#${b.id.slice(-8).toUpperCase()} (${STAGE_LABELS[b.stage]})`}
                          </Link>
                        ))}
                      </span>
                    )}
                    <span className="room-sensors">
                      {room.devices.length === 0 ? (
                        <span className="cell-sub">{t('rmNoSensor')}</span>
                      ) : (
                        <>
                          {room.devices.map((d) => (
                            <span key={d.id} className="room-sensor"><span>{d.name}</span><DeviceStatusBadge status={d.status} /></span>
                          ))}
                          <span className="cell-sub">
                            {room.latestReading
                              ? `${t('rmLatest')}: ${room.latestReading.temperature} °C, ${room.latestReading.humidity} %, ${timeAgo(room.latestReading.timestamp, locale)}`
                              : t('rmNoReading')}
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                  {canEdit && (
                    <div className="table-actions">
                      <button className="btn btn-ghost btn-xs" aria-label={fill(t('rmEditFor'), { name: room.name })} onClick={() => openRoomDialog(room)}>{t('coEdit')}</button>
                      <button className="btn btn-ghost btn-xs btn-quiet-danger" aria-label={fill(t('rmDeleteFor'), { name: room.name })} onClick={() => setRoomToDelete(room)}>{t('bdDeathDelete')}</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title={`${t('fdDevicesTitle')} (${devices.length})`}
          note={devices.length > 0 ? fill(t('fdDevicesNote'), { on: online, off: devices.length - online }) : undefined}
          flush
          actions={
            canManage && devices.length > 0 ? (
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddDevice(true)}>
                <Icon name="add" size={15} />
                {t('fdAddDevice')}
              </button>
            ) : undefined
          }
        >
          {devices.length === 0 ? (
            <EmptyState
              icon={<Icon name="devices" size={22} />}
              title={t('fdNoDevices')}
              description={canManage ? t('fdNoDevicesManage') : t('fdNoDevicesView')}
              action={canManage ? { label: t('fdAddDevice'), onClick: () => setShowAddDevice(true) } : undefined}
            />
          ) : (
            <ul className="device-list">
              {devices.map((d) => (
                <li key={d.id}>
                  <div className="device-list-main">
                    <p className="device-list-name">
                      <span className="cell-strong">{d.name}</span>
                      <DeviceStatusBadge status={d.status} />
                    </p>
                    <p className="device-list-meta">
                      <span className="cell-mono">{d.deviceKey}</span>
                      {d.location ? <span>{d.location}</span> : null}
                      <span>{t('fdSeen')}: {d.lastSeen ? timeAgo(d.lastSeen, locale) : t('dvNever')}</span>
                    </p>
                  </div>
                  <div className="device-list-reading">
                    {d.latestReading ? (
                      <>
                        <span>{d.latestReading.temperature} °C</span>
                        <span>{d.latestReading.humidity} %</span>
                      </>
                    ) : (
                      <span className="cell-muted">{t('fdNoReading')}</span>
                    )}
                  </div>
                  <button className="btn btn-ghost btn-xs" aria-label={`${t('fdDetails')} ${d.name}`} onClick={() => setOpenDevice(d)}>
                    {t('fdDetails')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title={`${t('fdBatchesTitle')} (${batches.length})`}
          flush
          actions={
            canEdit && batches.length > 0 ? (
              <Link to={`/farms/${id}/batches/new`} className="btn btn-primary btn-sm">
                <Icon name="add" size={15} />
                {t('fdAddBatch')}
              </Link>
            ) : undefined
          }
        >
          {batches.length === 0 ? (
            <EmptyState
              icon={<Icon name="batches" size={22} />}
              title={t('fdNoBatches')}
              description={t('fdNoBatchesBody')}
              action={canEdit ? { label: t('fdAddBatch'), to: `/farms/${id}/batches/new` } : undefined}
            />
          ) : (
            <div className="table-wrapper">
              <table className="table-stack">
                <thead>
                  <tr>
                    <th>{t('fdColBatch')}</th>
                    <th>{t('fdColStage')}</th>
                    <th>{t('fdColStarted')}</th>
                    <th>{t('fdColHarvest')}</th>
                    <th>{t('fdColChecks')}</th>
                    <th><span className="sr-only">{t('fdDetails')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id} className="tbody-row">
                      <td className="cell-lead cell-mono cell-muted">#{b.id.slice(-8)}</td>
                      <td data-label={t('fdColStage')}><StageBadge stage={b.stage} /></td>
                      <td data-label={t('fdColStarted')} className="cell-muted cell-nowrap">{date.format(new Date(b.startDate))}</td>
                      <td data-label={t('fdColHarvest')} className="cell-muted cell-nowrap">{date.format(new Date(b.expectedHarvestDate))}</td>
                      <td data-label={t('fdColChecks')} className="cell-strong">{b.counts?.diseaseDetections ?? 0}</td>
                      <td data-label="">
                        <div className="table-actions">
                          <Link to={`/batches/${b.id}`} className="btn btn-ghost btn-xs" aria-label={`${t('fdDetails')} #${b.id.slice(-8)}`}>{t('fdDetails')}</Link>
                          <Link to={`/batches/${b.id}/detect`} className="btn btn-ghost btn-xs" aria-label={`${t('fdCheck')} #${b.id.slice(-8)}`}>
                            <Icon name="detections" size={14} />
                            {t('fdCheck')}
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
      </div>
    </div>
  );
}
