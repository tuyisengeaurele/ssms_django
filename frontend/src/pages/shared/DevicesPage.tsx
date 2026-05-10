import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { deviceService } from '../../services/device.service';
import { IoTDevice, DeviceStatus } from '../../types';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';

// ── helpers ──────────────────────────────────────────────────────────────────

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
      padding: '0.2rem 0.6rem', borderRadius: '9999px',
      fontSize: '0.7rem', fontWeight: 700,
      background: m.bg, color: m.color,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: m.dot,
        flexShrink: 0,
        ...(status === 'online' ? {
          boxShadow: `0 0 0 2px ${m.dot}40`,
          animation: 'pulse 2s infinite',
        } : {}),
      }} />
      {m.label}
    </span>
  );
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString();
}

// ── DeviceDetailDrawer ────────────────────────────────────────────────────────

function DeviceDetailDrawer({
  device, onClose,
}: { device: IoTDevice | null; onClose: () => void }) {
  const [detail, setDetail] = useState<IoTDevice | null>(null);
  const [loading, setLoading] = useState(false);
  const { error: showError } = useToast();
  const { getErrorMessage } = useApiError();

  useEffect(() => {
    if (!device) { setDetail(null); return; }
    setLoading(true);
    deviceService.getById(device.id)
      .then(r => setDetail(r.data.data))
      .catch(e => showError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [device?.id]);

  if (!device) return null;

  const chartData = (detail?.recentReadings ?? [])
    .slice()
    .reverse()
    .map(r => ({
      time: new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      temp: r.temperature,
      hum: r.humidity,
    }));

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
          zIndex: 200, backdropFilter: 'blur(2px)',
        }}
      />
      {/* Drawer */}
      <motion.div
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 420,
          background: 'var(--surface)', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          zIndex: 201, display: 'flex', flexDirection: 'column', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>
              {device.name}
            </h2>
            <StatusBadge status={device.status} />
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            style={{ padding: '0.3rem 0.5rem', marginLeft: '0.5rem' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Info grid */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
          {[
            { label: 'Device Key', value: device.deviceKey },
            { label: 'Farm',       value: device.farmName ?? '—' },
            { label: 'Location',   value: device.location || '—' },
            { label: 'Last Seen',  value: fmtTime(device.lastSeen) },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem', fontSize: '0.82rem' }}>
              <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>{row.label}</span>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{row.value}</span>
            </div>
          ))}
        </div>

        {/* Latest reading */}
        {device.latestReading && (
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: '0.75rem' }}>
              Latest Reading
            </p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1, background: '#eff6ff', borderRadius: 12, padding: '0.875rem', textAlign: 'center' }}>
                <p style={{ fontSize: '1.6rem', fontWeight: 800, color: '#2563eb', letterSpacing: '-0.04em' }}>
                  {device.latestReading.temperature}°C
                </p>
                <p style={{ fontSize: '0.7rem', color: '#3b82f6', fontWeight: 600 }}>Temperature</p>
              </div>
              <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 12, padding: '0.875rem', textAlign: 'center' }}>
                <p style={{ fontSize: '1.6rem', fontWeight: 800, color: '#16a34a', letterSpacing: '-0.04em' }}>
                  {device.latestReading.humidity}%
                </p>
                <p style={{ fontSize: '0.7rem', color: '#22c55e', fontWeight: 600 }}>Humidity</p>
              </div>
            </div>
          </div>
        )}

        {/* Chart */}
        <div style={{ padding: '1.25rem 1.5rem', flex: 1 }}>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: '0.75rem' }}>
            Recent Readings
          </p>
          {loading ? (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: '0.8rem' }}>
              Loading…
            </div>
          ) : chartData.length === 0 ? (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: '0.8rem' }}>
              No readings yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.75rem' }}
                  formatter={(v: number, name: string) => [
                    name === 'temp' ? `${v}°C` : `${v}%`,
                    name === 'temp' ? 'Temperature' : 'Humidity',
                  ]}
                />
                <Line type="monotone" dataKey="temp" stroke="#2563eb" strokeWidth={1.8} dot={false} />
                <Line type="monotone" dataKey="hum"  stroke="#16a34a" strokeWidth={1.8} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}

          {/* Mini legend */}
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
            {[{ color: '#2563eb', label: 'Temperature (°C)' }, { color: '#16a34a', label: 'Humidity (%)' }].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: 'var(--text-faint)' }}>
                <span style={{ width: 16, height: 2, background: l.color, display: 'inline-block', borderRadius: 2 }} />
                {l.label}
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </>
  );
}

// ── DevicesPage ───────────────────────────────────────────────────────────────

export default function DevicesPage() {
  const { error: showError } = useToast();
  const { getErrorMessage }  = useApiError();
  const [devices, setDevices]     = useState<IoTDevice[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search,  setSearch]      = useState('');
  const [selected, setSelected]   = useState<IoTDevice | null>(null);
  const [statusFilter, setFilter] = useState<DeviceStatus | 'all'>('all');

  useEffect(() => {
    deviceService.getAll()
      .then(r => setDevices(r.data.data))
      .catch(e => showError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  const online  = devices.filter(d => d.status === 'online').length;
  const offline = devices.filter(d => d.status === 'offline').length;
  const errored = devices.filter(d => d.status === 'error').length;

  const filtered = devices.filter(d => {
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    const q = search.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      (d.farmName ?? '').toLowerCase().includes(q) ||
      (d.location ?? '').toLowerCase().includes(q) ||
      d.deviceKey.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">IoT Devices</h1>
          <p className="page-subtitle">{devices.length} device{devices.length !== 1 ? 's' : ''} registered</p>
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setLoading(true);
            deviceService.getAll()
              .then(r => setDevices(r.data.data))
              .catch(e => showError(getErrorMessage(e)))
              .finally(() => setLoading(false));
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.3rem' }}>
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Devices', value: devices.length, color: '#2563eb', bg: '#eff6ff', filter: 'all'    as const },
          { label: 'Online',        value: online,         color: '#16a34a', bg: '#f0fdf4', filter: 'online' as const },
          { label: 'Offline',       value: offline,        color: '#6b7280', bg: '#f9fafb', filter: 'offline' as const },
          { label: 'Error',         value: errored,        color: '#dc2626', bg: '#fef2f2', filter: 'error'  as const },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            className="stat-card"
            style={{ cursor: 'pointer', outline: statusFilter === s.filter ? `2px solid ${s.color}` : 'none' }}
            onClick={() => setFilter(f => f === s.filter ? 'all' : s.filter)}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="stat-card-glow" style={{ background: s.color }} />
            <p style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: '0.6rem' }}>{s.label}</p>
            <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em' }}>{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <SkeletonTable rows={5} cols={6} />
      ) : devices.length === 0 ? (
        <div className="table-container">
          <EmptyState
            icon={
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
              </svg>
            }
            title="No devices found"
            description="Run the sensor simulator to register IoT devices automatically."
          />
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.35 }}>
          <div className="table-container">
            <div className="table-header">
              <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>
                Devices ({filtered.length}{statusFilter !== 'all' ? ` · ${statusFilter}` : ''})
              </p>
              <div style={{ maxWidth: 280 }}>
                <div className="input-wrapper">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="input-icon-left">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input
                    className="form-input has-left"
                    placeholder="Search devices…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ paddingBlock: '0.4rem' }}
                  />
                </div>
              </div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>}
                title="No results"
                description="Try a different search or filter"
                action={{ label: 'Clear', onClick: () => { setSearch(''); setFilter('all'); } }}
              />
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Device</th>
                      <th>Farm</th>
                      <th>Location</th>
                      <th>Status</th>
                      <th>Temperature</th>
                      <th>Humidity</th>
                      <th>Last Seen</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((d, i) => (
                      <motion.tr
                        key={d.id}
                        className="tbody-row"
                        style={{ cursor: 'pointer' }}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.02 }}
                        onClick={() => setSelected(d)}
                      >
                        <td>
                          <div style={{ fontWeight: 700, fontSize: '0.83rem' }}>{d.name}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-faint)', fontFamily: 'monospace' }}>{d.deviceKey}</div>
                        </td>
                        <td style={{ fontSize: '0.82rem' }}>{d.farmName ?? <span style={{ color: 'var(--text-faint)' }}>—</span>}</td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{d.location || <span style={{ color: 'var(--text-faint)' }}>—</span>}</td>
                        <td><StatusBadge status={d.status} /></td>
                        <td>
                          {d.latestReading
                            ? <span style={{ fontWeight: 700, color: '#2563eb' }}>{d.latestReading.temperature}°C</span>
                            : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                        </td>
                        <td>
                          {d.latestReading
                            ? <span style={{ fontWeight: 700, color: '#16a34a' }}>{d.latestReading.humidity}%</span>
                            : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                        </td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                          {fmtTime(d.lastSeen)}
                        </td>
                        <td>
                          <button
                            className="btn btn-ghost btn-xs"
                            onClick={e => { e.stopPropagation(); setSelected(d); }}
                          >
                            Details →
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Detail drawer */}
      {selected && (
        <DeviceDetailDrawer device={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
