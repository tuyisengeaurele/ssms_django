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

// ── Modern Stat Card ──────────────────────────────────────────────────────────
interface StatProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
  bg: string;
  delay: number;
  suffix?: string;
  trend?: string;
}

function StatCard({ icon, label, value, color, bg, delay, suffix = '', trend }: StatProps) {
  const num = typeof value === 'number' ? value : 0;
  const count = useCountUp(num);
  return (
    <motion.div
      className="stat-card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="stat-card-glow" style={{ background: color }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: '0.75rem' }}>{label}</p>
          <p style={{ fontSize: '2.1rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em', lineHeight: 1, marginBottom: trend ? '0.5rem' : 0 }}>
            {typeof value === 'string' ? value : count}{suffix}
          </p>
          {trend && (
            <p style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginTop: '0.375rem' }}>{trend}</p>
          )}
        </div>
        <div className="stat-card-icon" style={{ background: bg, marginLeft: '1rem' }}>
          <div style={{ color, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {icon}
          </div>
        </div>
      </div>
      {/* Bottom accent line */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${color}60, ${color}10)`, borderRadius: '0 0 var(--radius-xl,16px) var(--radius-xl,16px)' }} />
    </motion.div>
  );
}

// ── Sensor Chart ──────────────────────────────────────────────────────────────
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
          No readings yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.2} />
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

// ── Icons ─────────────────────────────────────────────────────────────────────
const FarmIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);
const BatchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
  </svg>
);
const AlertIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);

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
          <h1 className="page-title">Welcome back, {firstName}</h1>
          <p className="page-subtitle">Here's what's happening on your farms today</p>
        </div>
        <div className="page-actions">
          <Link to="/detections/reports" className="btn btn-secondary btn-sm">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
            Reports
          </Link>
          <Link to="/farms/new" className="btn btn-secondary btn-sm">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Farm
          </Link>
          <Link to="/farms" className="btn btn-primary btn-sm">My Farms</Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
        <StatCard
          icon={<FarmIcon />}
          label="My Farms"
          value={farms.length}
          color="#2D6A4F"
          bg="#F0FDF4"
          delay={0}
          trend={farms.length > 0 ? `${farms.filter(f => f.isActive).length} active` : 'Create your first farm'}
        />
        <StatCard
          icon={<BatchIcon />}
          label="Active Batches"
          value={batches.length}
          color="#1e40af"
          bg="#eff6ff"
          delay={0.07}
          trend={batches.length > 0 ? `Across ${new Set(batches.map(b => b.farmId)).size} farm${new Set(batches.map(b => b.farmId)).size !== 1 ? 's' : ''}` : 'No batches running'}
        />
        <StatCard
          icon={<AlertIcon />}
          label="Unread Alerts"
          value={unreadCount}
          color={unreadCount > 0 ? '#dc2626' : '#16a34a'}
          bg={unreadCount > 0 ? '#fef2f2' : '#f0fdf4'}
          delay={0.14}
          trend={unreadCount > 0 ? 'Needs attention' : 'All clear'}
        />
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
              <Link to="/batches" className="btn btn-ghost btn-sm">View all →</Link>
            </div>
            {batches.length === 0 ? (
              <EmptyState
                icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>}
                title="No active batches"
                description="Create a batch on one of your farms to get started."
                action={{ label: 'View farms', to: '/farms' }}
              />
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
                            <Link to={`/batches/${b.id}/detect`} className="btn btn-xs btn-outline-primary">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                            </Link>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
              <EmptyState
                icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>}
                title="No unread alerts"
                description="You're all caught up!"
              />
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
                      <span style={{ width: 28, height: 28, borderRadius: 8, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, color: meta.color, flexShrink: 0 }}>
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
