import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { farmService } from '../../services/farm.service';
import { batchService } from '../../services/batch.service';
import { deviceService } from '../../services/device.service';
import { Farm, Batch, IoTDevice, DeviceStatus } from '../../types';
import StageBadge from '../../components/ui/StageBadge';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import { useAuth } from '../../context/AuthContext';
import { useApiError } from '../../hooks/useApiError';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/ui/Modal';
import { useLanguage } from '../../context/LanguageContext';

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_META: Record<DeviceStatus, { label: string; color: string; bg: string; dot: string }> = {
  online:  { label: 'Online',  color: '#16a34a', bg: '#f0fdf4', dot: '#22c55e' },
  offline: { label: 'Offline', color: '#6b7280', bg: '#f9fafb', dot: '#9ca3af' },
  error:   { label: 'Error',   color: '#dc2626', bg: '#fef2f2', dot: '#ef4444' },
};

function StatusBadge({ status }: { status: DeviceStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.offline;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
      padding: '0.18rem 0.55rem', borderRadius: '9999px',
      fontSize: '0.7rem', fontWeight: 700,
      background: m.bg, color: m.color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.dot, flexShrink: 0 }} />
      {m.label}
    </span>
  );
}

function fmtAgo(iso: string | null) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Device readings mini chart ────────────────────────────────────────────────

function DeviceReadingsMini({ device }: { device: IoTDevice }) {
  const [detail, setDetail] = useState<IoTDevice | null>(null);
  const [open, setOpen]     = useState(false);
  const { error: showError } = useToast();
  const { getErrorMessage }  = useApiError();

  const load = () => {
    if (detail) { setOpen(o => !o); return; }
    deviceService.getById(device.id)
      .then(r => { setDetail(r.data.data); setOpen(true); })
      .catch(e => showError(getErrorMessage(e)));
  };

  const chartData = (detail?.recentReadings ?? [])
    .slice().reverse()
    .map(r => ({
      time: new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      temp: r.temperature,
      hum: r.humidity,
    }));

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <button
        className="btn btn-ghost btn-xs"
        onClick={load}
        style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
      >
        {open ? 'Hide chart ▲' : 'Show readings ▼'}
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.25 }}
          style={{ overflow: 'hidden', marginTop: '0.75rem' }}
        >
          {chartData.length === 0 ? (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-faint)', padding: '0.5rem 0' }}>No readings recorded yet.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={130}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                  <XAxis dataKey="time" tick={{ fontSize: 8, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 8, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.72rem' }}
                    formatter={(v, name) => [
                      name === 'temp' ? `${v}°C` : `${v}%`,
                      name === 'temp' ? 'Temp' : 'Humidity',
                    ]}
                  />
                  <Line type="monotone" dataKey="temp" stroke="#2563eb" strokeWidth={1.8} dot={false} />
                  <Line type="monotone" dataKey="hum"  stroke="#16a34a" strokeWidth={1.8} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.35rem' }}>
                {[{ color: '#2563eb', label: 'Temp (°C)' }, { color: '#16a34a', label: 'Humidity (%)' }].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.68rem', color: 'var(--text-faint)' }}>
                    <span style={{ width: 14, height: 2, background: l.color, display: 'inline-block', borderRadius: 2 }} />
                    {l.label}
                  </div>
                ))}
              </div>
            </>
          )}
        </motion.div>
      )}
    </div>
  );
}

// ── FarmDetailPage ────────────────────────────────────────────────────────────

export default function FarmDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const { user } = useAuth();
  const { getErrorMessage } = useApiError();
  const { success, error: showError } = useToast();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [farm,      setFarm]      = useState<Farm | null>(null);
  const [batches,   setBatches]   = useState<Batch[]>([]);
  const [devices,   setDevices]   = useState<IoTDevice[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [showDel,   setShowDel]   = useState(false);
  const [deleting,  setDeleting]  = useState(false);
  // Edit modal
  const [showEdit,  setShowEdit]  = useState(false);
  const [editForm,  setEditForm]  = useState({ name: '', location: '' });
  const [saving,    setSaving]    = useState(false);
  // Add device modal
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [deviceForm, setDeviceForm]       = useState({ name: '', location: '', deviceKey: '' });
  const [addingDevice, setAddingDevice]   = useState(false);
  const [removingId, setRemovingId]       = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      farmService.getById(id),
      batchService.getByFarm(id),
      deviceService.getAll(id),
    ])
      .then(([farmRes, batchRes, devRes]) => {
        setFarm(farmRes.data.data);
        setBatches(batchRes.data.data);
        setDevices(devRes.data.data);
      })
      .catch(err => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id]);

  const openEdit = () => {
    if (!farm) return;
    setEditForm({ name: farm.name, location: farm.location });
    setShowEdit(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !farm) return;
    setSaving(true);
    try {
      const res = await farmService.update(id, editForm);
      setFarm(res.data.data);
      setShowEdit(false);
      success('Farm updated.');
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
      success('Farm deleted.');
      navigate('/farms');
    } catch (err) {
      showError(getErrorMessage(err));
      setDeleting(false);
    }
  };

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setAddingDevice(true);
    try {
      const res = await deviceService.create({
        name: deviceForm.name.trim(),
        farmId: id,
        location: deviceForm.location.trim(),
        deviceKey: deviceForm.deviceKey.trim() || undefined,
      });
      setDevices(prev => [res.data.data, ...prev]);
      setShowAddDevice(false);
      setDeviceForm({ name: '', location: '', deviceKey: '' });
      success('Device registered.');
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setAddingDevice(false);
    }
  };

  const handleRemoveDevice = async (deviceId: string) => {
    setRemovingId(deviceId);
    try {
      await deviceService.remove(deviceId);
      setDevices(prev => prev.filter(d => d.id !== deviceId));
      success('Device removed.');
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setRemovingId(null);
    }
  };

  const canEdit   = user?.role === 'FARMER' || user?.role === 'ADMIN';
  const canManage = user?.role === 'ADMIN'  || user?.role === 'SUPERVISOR';

  if (loading) {
    return (
      <div>
        <div style={{ marginBottom: '1.75rem' }}>
          <div style={{ height: 28, width: 200, borderRadius: 6 }} className="skeleton" />
        </div>
        <SkeletonTable rows={4} cols={5} />
      </div>
    );
  }

  if (error || !farm) {
    return (
      <div>
        <div className="alert alert-error">{error || 'Farm not found.'}</div>
        <Link to="/farms" className="btn btn-secondary btn-sm">← Back</Link>
      </div>
    );
  }

  const onlineCount  = devices.filter(d => d.status === 'online').length;
  const offlineCount = devices.filter(d => d.status !== 'online').length;

  return (
    <div>
      {/* Edit modal */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title={t('farmEditTitle')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowEdit(false)}>Cancel</button>
            <button className="btn btn-primary" form="farm-edit-form" type="submit" disabled={saving}>
              {saving ? <><span className="spinner" />Saving…</> : 'Save changes'}
            </button>
          </>
        }
      >
        <form id="farm-edit-form" onSubmit={handleSave}>
          <div className="form-group">
            <label className="form-label">Farm Name</label>
            <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="form-input" required maxLength={100} />
          </div>
          <div className="form-group">
            <label className="form-label">Location</label>
            <input type="text" value={editForm.location} onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))} className="form-input" required maxLength={200} />
          </div>
        </form>
      </Modal>

      {/* Delete modal */}
      <Modal open={showDel} onClose={() => setShowDel(false)} title={t('farmDeleteTitle')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowDel(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? <><span className="spinner" />Deleting…</> : 'Yes, delete'}
            </button>
          </>
        }
      >
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          This will permanently delete <strong>{farm.name}</strong> and all associated data. This action cannot be undone.
        </p>
      </Modal>

      {/* Add Device modal */}
      <Modal open={showAddDevice} onClose={() => setShowAddDevice(false)} title="Register Device for This Farm"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowAddDevice(false)} type="button">Cancel</button>
            <button className="btn btn-primary" form="farm-add-device-form" type="submit" disabled={addingDevice}>
              {addingDevice ? <><span className="spinner" />Registering…</> : 'Register Device'}
            </button>
          </>
        }
      >
        <form id="farm-add-device-form" onSubmit={handleAddDevice}>
          <div className="form-group">
            <label className="form-label">{t('farmDeviceName')} <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input className="form-input" value={deviceForm.name} onChange={e => setDeviceForm(f => ({ ...f, name: e.target.value }))} required placeholder="e.g. DHT22-Sector-A" maxLength={100} />
            <p className="form-hint">Sensor type + location descriptor.</p>
          </div>
          <div className="form-group">
            <label className="form-label">Location / Sector</label>
            <input className="form-input" value={deviceForm.location} onChange={e => setDeviceForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Rearing Room B" maxLength={200} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('farmDeviceKey')} <span style={{ color: 'var(--text-faint)', fontWeight: 400, fontSize: '0.75rem' }}>(auto-generated if empty)</span></label>
            <input className="form-input" value={deviceForm.deviceKey} onChange={e => setDeviceForm(f => ({ ...f, deviceKey: e.target.value }))} placeholder="ssms-abc123..." maxLength={80} style={{ fontFamily: 'monospace' }} />
          </div>
        </form>
      </Modal>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{farm.name}</h1>
          <p className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            {farm.location}
          </p>
        </div>
        <div className="page-actions">
          {canEdit && <Link to={`/farms/${id}/batches/new`} className="btn btn-primary btn-sm">+ New Batch</Link>}
          {canEdit && <button onClick={openEdit} className="btn btn-secondary btn-sm">Edit</button>}
          {canEdit && <button onClick={() => setShowDel(true)} className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger-border)' }}>Delete</button>}
          <Link to="/farms" className="btn btn-ghost btn-sm">← Farms</Link>
        </div>
      </div>

      {/* Farm info */}
      <motion.div className="card" style={{ marginBottom: '1.5rem' }}
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1.5rem' }}>
          {[
            { label: 'Owner',   value: farm.owner?.name ?? '—' },
            { label: 'Batches', value: batches.length },
            { label: 'Devices', value: `${onlineCount} online / ${devices.length} total` },
            { label: 'Created', value: new Date(farm.createdAt).toLocaleDateString() },
            { label: 'Status',  value: farm.isActive ? 'Active' : 'Inactive' },
          ].map(item => (
            <div key={item.label}>
              <p style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-faint)', marginBottom: '0.3rem' }}>{item.label}</p>
              <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)' }}>{item.value}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── IoT Devices section ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.35 }} style={{ marginBottom: '1.5rem' }}>
        <div className="table-container">
          <div className="table-header">
            <div>
              <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>
                {t('farmDevicesTitle')} ({devices.length})
              </p>
              {devices.length > 0 && (
                <p style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginTop: '0.1rem' }}>
                  <span style={{ color: '#16a34a', fontWeight: 600 }}>{onlineCount} online</span>
                  {offlineCount > 0 && <> · <span style={{ color: '#6b7280' }}>{offlineCount} offline</span></>}
                </p>
              )}
            </div>
            {canManage && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddDevice(true)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.3rem' }}>
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add Device
              </button>
            )}
          </div>

          {devices.length === 0 ? (
            <EmptyState
              icon={
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
                </svg>
              }
              title="No devices deployed"
              description={canManage ? 'Register an IoT sensor for this farm to start monitoring temperature and humidity.' : 'No IoT devices have been deployed to this farm yet.'}
              action={canManage ? { label: '+ Add Device', onClick: () => setShowAddDevice(true) } : undefined}
            />
          ) : (
            <div style={{ padding: '0 0 0.75rem' }}>
              {devices.map((d, i) => (
                <motion.div
                  key={d.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  style={{
                    margin: '0.75rem 1rem',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '1rem 1.25rem',
                    background: 'var(--bg)',
                  }}
                >
                  {/* Device header row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                        {/* Device icon */}
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, background: '#eff6ff', flexShrink: 0 }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
                          </svg>
                        </span>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{d.name}</span>
                        <StatusBadge status={d.status} />
                      </div>
                      <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: 'var(--text-faint)', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'monospace' }}>{d.deviceKey}</span>
                        {d.location && <span>📍 {d.location}</span>}
                        <span>Last seen: {fmtAgo(d.lastSeen)}</span>
                      </div>
                    </div>

                    {/* Latest readings */}
                    <div style={{ display: 'flex', gap: '0.75rem', flexShrink: 0 }}>
                      {d.latestReading ? (
                        <>
                          <div style={{ textAlign: 'center', padding: '0.4rem 0.75rem', background: '#eff6ff', borderRadius: 8 }}>
                            <p style={{ fontWeight: 800, fontSize: '1.1rem', color: '#2563eb', letterSpacing: '-0.03em' }}>{d.latestReading.temperature}°C</p>
                            <p style={{ fontSize: '0.62rem', color: '#3b82f6', fontWeight: 600 }}>Temp</p>
                          </div>
                          <div style={{ textAlign: 'center', padding: '0.4rem 0.75rem', background: '#f0fdf4', borderRadius: 8 }}>
                            <p style={{ fontWeight: 800, fontSize: '1.1rem', color: '#16a34a', letterSpacing: '-0.03em' }}>{d.latestReading.humidity}%</p>
                            <p style={{ fontSize: '0.62rem', color: '#22c55e', fontWeight: 600 }}>Humidity</p>
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-faint)', padding: '0.4rem 0', alignSelf: 'center' }}>No readings yet</div>
                      )}
                    </div>

                    {/* Actions */}
                    {canManage && (
                      <button
                        className="btn btn-ghost btn-xs"
                        style={{ color: 'var(--danger)', flexShrink: 0, alignSelf: 'flex-start' }}
                        onClick={() => handleRemoveDevice(d.id)}
                        disabled={removingId === d.id}
                        title="Remove device"
                      >
                        {removingId === d.id ? <span className="spinner" style={{ width: 12, height: 12 }} /> : (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                          </svg>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Expandable readings chart */}
                  <DeviceReadingsMini device={d} />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Batches table ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.35 }}>
        <div className="table-container">
          <div className="table-header">
            <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>Batches ({batches.length})</p>
            {canEdit && <Link to={`/farms/${id}/batches/new`} className="btn btn-primary btn-sm">+ Add Batch</Link>}
          </div>

          {batches.length === 0 ? (
            <EmptyState
              icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>}
              title="No batches yet"
              description="Add your first batch to start tracking production."
              action={canEdit ? { label: '+ Add Batch', to: `/farms/${id}/batches/new` } : undefined}
            />
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Batch ID</th>
                    <th>Stage</th>
                    <th>Started</th>
                    <th>Expected Harvest</th>
                    <th>Detections</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b, i) => (
                    <motion.tr key={b.id} className="tbody-row"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.04 }}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-faint)' }}>#{b.id.slice(-8)}</td>
                      <td><StageBadge stage={b.stage} /></td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(b.startDate).toLocaleDateString()}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(b.expectedHarvestDate).toLocaleDateString()}</td>
                      <td><span style={{ fontWeight: 600, color: 'var(--brand-600)' }}>{b.counts?.diseaseDetections ?? 0}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.375rem' }}>
                          <Link to={`/batches/${b.id}`} className="btn btn-ghost btn-xs">Details</Link>
                          <Link to={`/batches/${b.id}/detect`} className="btn btn-xs btn-outline-primary" title="Run Detection">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                          </Link>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
