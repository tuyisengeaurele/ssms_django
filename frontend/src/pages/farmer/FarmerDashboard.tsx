import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { farmService } from '../../services/farm.service';
import { alertService } from '../../services/alert.service';
import { sensorService, batchSupervisorService, ActiveBatch, ChartPoint } from '../../services/sensor.service';
import { Farm, AlertLog, AlertType } from '../../types';
import StageBadge from '../../components/ui/StageBadge';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonStatCard } from '../../components/ui/SkeletonLoader';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';

// ── animated counter ──────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target) { setVal(0); return; }
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      setVal(Math.round((1 - Math.pow(1 - t, 3)) * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

const ALERT_META: Record<AlertType, { color: string; bg: string; label: string }> = {
  TEMPERATURE:  { color: '#d97706', bg: '#fef3c7', label: 'Temp' },
  HUMIDITY:     { color: '#2563eb', bg: '#dbeafe', label: 'Humidity' },
  DISEASE:      { color: '#dc2626', bg: '#fee2e2', label: 'Disease' },
  STAGE_CHANGE: { color: '#7c3aed', bg: '#f3e8ff', label: 'Stage' },
  SYSTEM:       { color: '#4b5563', bg: '#f1f5f9', label: 'System' },
};

// ── stat card ─────────────────────────────────────────────────────────────────
interface StatProps {
  icon: string; label: string; value: number | string; color: string; bg: string; delay: number; suffix?: string;
}

function StatCard({ icon, label, value, color, bg, delay, suffix = '' }: StatProps) {
  const num = typeof value === 'number' ? value : 0;
  const count = useCountUp(num);
  return (
    <motion.div
      className="stat-card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      style={{ borderTop: `3px solid ${color}` }}
    >
      <div className="stat-card-glow" style={{ background: color }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-faint)', marginBottom: '0.5rem' }}>{label}</p>
          <p style={{ fontSize: '2rem', fontWeight: 800, color, letterSpacing: '-0.03em', lineHeight: 1 }}>
            {typeof value === 'string' ? value : count}{suffix}
          </p>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>
          {icon}
        </div>
      </div>
    </motion.div>
  );
}

// ── sensor mini chart ─────────────────────────────────────────────────────────
interface ChartCardProps {
  title: string; unit: string; data: ChartPoint[]; dataKey: 'avgTemp' | 'avgHumidity';
  color: string; refMin: number; refMax: number; safeLabel: string; delay: number;
}

function SensorChartCard({ title, unit, data, dataKey, color, refMin, refMax, safeLabel, delay }: ChartCardProps) {
  return (
    <motion.div
      className="chart-card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
        <p className="chart-title">{title}</p>
        <span style={{ fontSize: '0.68rem', background: 'var(--brand-50)', color: 'var(--brand-700)', padding: '0.15rem 0.55rem', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>
          {safeLabel}
        </span>
      </div>
      <p className="chart-subtitle">Last 24 hours</p>
      {data.length === 0 ? (
        <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: '0.82rem' }}>
          No readings — start the simulator
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.18} />
                <stop offset="100%" stopColor={color} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
            <XAxis dataKey="hour" tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} width={40} />
            <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.78rem', boxShadow: 'var(--shadow-md)' }}
              formatter={(v) => [`${Number(v).toFixed(1)}${unit}`, title]} />
            <ReferenceLine y={refMin} stroke={color} strokeDasharray="4 3" strokeOpacity={0.5} strokeWidth={1} />
            <ReferenceLine y={refMax} stroke={color} strokeDasharray="4 3" strokeOpacity={0.5} strokeWidth={1} />
            <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#grad-${dataKey})`} dot={false} activeDot={{ r: 4, fill: color }} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function FarmerDashboard() {
  const { user }   = useAuth();
  const { error: showError } = useToast();
  const { getErrorMessage }  = useApiError();

  const [farms,   setFarms]   = useState<Farm[]>([]);
  const [batches, setBatches] = useState<ActiveBatch[]>([]);
  const [chart,   setChart]   = useState<ChartPoint[]>([]);
  const [alerts,  setAlerts]  = useState<AlertLog[]>([]);
  const [loading, setLoading] = useState(true);

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const unreadCount = alerts.filter(a => !a.isRead).length;

  useEffect(() => {
    Promise.all([
      farmService.getAll(),
      batchSupervisorService.getActive(),
      sensorService.getChart(24),
      alertService.getAll(true),
    ])
      .then(([farmsRes, batchRes, chartRes, alertRes]) => {
        setFarms(farmsRes.data.data);
        setBatches(batchRes.data.data);
        setChart(chartRes.data.data);
        setAlerts(alertRes.data.data);
      })
      .catch(e => showError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  const handleMarkRead = async (id: string) => {
    try {
      await alertService.markRead(id);
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, isRead: true } : a));
    } catch {/* silent */}
  };

  if (loading) {
    return (
      <div>
        <div style={{ marginBottom: '1.75rem' }}>
          <div style={{ height: 28, width: 220, background: 'var(--gray-200)', borderRadius: 6, marginBottom: 8 }} className="skeleton" />
          <div style={{ height: 14, width: 160, background: 'var(--gray-200)', borderRadius: 4 }} className="skeleton" />
        </div>
        <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
          {[0,1,2].map(i => <SkeletonStatCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Welcome back, {firstName} 👋</h1>
          <p className="page-subtitle">Here's what's happening on your farms today</p>
        </div>
        <div className="page-actions">
          <Link to="/detections/reports" className="btn btn-secondary btn-sm">🔬 Reports</Link>
          <Link to="/farms/new" className="btn btn-secondary btn-sm">+ New Farm</Link>
          <Link to="/farms" className="btn btn-primary btn-sm">My Farms</Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
        <StatCard icon="🌾" label="My Farms"      value={farms.length}   color="var(--brand-600)" bg="var(--brand-50)"  delay={0} />
        <StatCard icon="📦" label="Active Batches" value={batches.length} color="#1e40af"          bg="#eff6ff"          delay={0.07} />
        <StatCard icon="🚨" label="Unread Alerts"  value={unreadCount}    color="#dc2626"          bg="#fef2f2"          delay={0.14} />
      </div>

      {/* Charts */}
      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
        <SensorChartCard title="Temperature" unit="°C" data={chart} dataKey="avgTemp"
          color="#d97706" refMin={22} refMax={28} safeLabel="Safe: 22–28°C" delay={0.2} />
        <SensorChartCard title="Humidity" unit="%" data={chart} dataKey="avgHumidity"
          color="#2563eb" refMin={70} refMax={85} safeLabel="Safe: 70–85%" delay={0.27} />
      </div>

      {/* Batches + Alerts */}
      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>

        {/* Active batches */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32, duration: 0.4 }}>
          <div className="table-container">
            <div className="table-header">
              <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>Active Batches ({batches.length})</p>
              <Link to="/farms" className="btn btn-ghost btn-sm">View farms →</Link>
            </div>
            {batches.length === 0 ? (
              <EmptyState icon="📦" title="No active batches" description="Create a batch on one of your farms to get started." action={{ label: 'View farms', to: '/farms' }} />
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Farm</th>
                      <th>Stage</th>
                      <th>Started</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.slice(0, 6).map((b) => (
                      <tr key={b.id} className="tbody-row">
                        <td style={{ fontWeight: 500 }}>{b.farm?.name ?? '—'}</td>
                        <td><StageBadge stage={b.stage} /></td>
                        <td style={{ color: 'var(--text-faint)', fontSize: '0.78rem' }}>{new Date(b.startDate).toLocaleDateString()}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            <Link to={`/batches/${b.id}`} className="btn btn-ghost btn-xs">Detail</Link>
                            <Link to={`/batches/${b.id}/detect`} className="btn btn-xs btn-outline-primary">🔬</Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </motion.div>

        {/* Alerts */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38, duration: 0.4 }}>
          <div className="table-container">
            <div className="table-header">
              <div className="flex-start gap-2">
                <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>Recent Alerts</p>
                {unreadCount > 0 && (
                  <span style={{ background: 'var(--danger)', color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: 'var(--radius-full)' }}>
                    {unreadCount}
                  </span>
                )}
              </div>
              <Link to="/alerts" className="btn btn-ghost btn-sm">All alerts →</Link>
            </div>
            {alerts.length === 0 ? (
              <EmptyState icon="🔔" title="No unread alerts" description="You're all caught up! We'll notify you when something needs attention." />
            ) : (
              <div style={{ padding: '0.5rem 0' }}>
                {alerts.slice(0, 6).map((a) => {
                  const meta = ALERT_META[a.type];
                  return (
                    <div key={a.id}
                      onClick={() => !a.isRead && handleMarkRead(a.id)}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                        padding: '0.75rem 1.25rem', cursor: !a.isRead ? 'pointer' : 'default',
                        borderLeft: !a.isRead ? `3px solid ${meta.color}` : '3px solid transparent',
                        transition: 'background 0.12s',
                        opacity: a.isRead ? 0.55 : 1,
                      }}
                      onMouseEnter={e => { if (!a.isRead) (e.currentTarget.style.background = 'var(--gray-50)'); }}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ width: 28, height: 28, borderRadius: 8, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0 }}>
                        {meta.label[0]}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '0.78rem', fontWeight: a.isRead ? 400 : 600, color: 'var(--text)', lineHeight: 1.4 }}>{a.message}</p>
                        <p style={{ fontSize: '0.68rem', color: 'var(--text-faint)', marginTop: '0.2rem' }}>{timeAgo(a.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
