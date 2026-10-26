import { FormEvent, useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { farmService } from '../../services/farm.service';
import { batchService } from '../../services/batch.service';
import { deviceService } from '../../services/device.service';
import { Farm, Batch, IoTDevice } from '../../types';
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

  const [farm, setFarm] = useState<Farm | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [devices, setDevices] = useState<IoTDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', location: '' });
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

  const canEdit = user?.role === 'FARMER' || user?.role === 'ADMIN';
  const canManage = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';

  const openEdit = () => {
    if (!farm) return;
    setEditForm({ name: farm.name, location: farm.location });
    setShowEdit(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    try {
      const res = await farmService.update(id, editForm);
      setFarm(res.data.data);
      setShowEdit(false);
      success(t('fdUpdated'));
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSaving(false);
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
            <input id="edit-farm-name" className="form-input" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} required maxLength={150} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="edit-farm-location">{t('afLocation')} <span className="required" aria-hidden="true">*</span></label>
            <input id="edit-farm-location" className="form-input" value={editForm.location} onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))} required maxLength={250} />
          </div>
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
