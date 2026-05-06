import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { farmService } from '../../services/farm.service';
import { alertService, buildAlertStreamUrl } from '../../services/alert.service';
import { sensorService, batchSupervisorService, ActiveBatch, ChartPoint } from '../../services/sensor.service';
import { detectionService2 } from '../../services/sensor.service';
import { Farm, AlertLog, AlertType } from '../../types';
import StageBadge from '../../components/ui/StageBadge';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonStatCard } from '../../components/ui/SkeletonLoader';
import { useToast } from '../../context/ToastContext';

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

function timeAgo(date: Date | string) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

const ALERT_META: Record<AlertType, { color: string; bg: string; label: string }> = {
  TEMPERATURE:  { color: '#d97706', bg: '#fef3c7', label: 'Temp'     },
  HUMIDITY:     { color: '#2563eb', bg: '#dbeafe', label: 'Humidity' },
  DISEASE:      { color: '#dc2626', bg: '#fee2e2', label: 'Disease'  },
  STAGE_CHANGE: { color: '#7c3aed', bg: '#f3e8ff', label: 'Stage'    },
  SYSTEM:       { color: '#4b5563', bg: '#f1f5f9', label: 'System'   },
};

const DISEASE_COLORS: Record<string, string> = {
  Healthy: '#16a34a', Flacherie: '#dc2626', Grasserie: '#d97706',
  Muscardine: '#7c3aed', Pebrine: '#0284c7',
};

interface StatProps { icon: string; label: string; value: number | string; color: string; bg: string; delay: number; }
function StatCard({ icon, label, value, color, bg, delay }: StatProps) {
  const num = typeof value === 'number' ? value : 0;
  const count = useCountUp(num);
  return (
    <motion.div className="stat-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }} style={{ borderTop: `3px solid ${color}` }}>
      <div className="stat-card-glow" style={{ background: color }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-faint)', marginBottom: '0.5rem' }}>{label}</p>
          <p style={{ fontSize: '2rem', fontWeight: 800, color, letterSpacing: '-0.03em', lineHeight: 1 }}>
            {typeof value === 'string' ? value : count}
          </p>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>{icon}</div>
      </div>
    </motion.div>
  );
}

export default function SupervisorDashboard() {
  const { success } = useToast();
  const [farms,      setFarms]      = useState<Farm[]>([]);
  const [batches,    setBatches]    = useState<ActiveBatch[]>([]);
  const [chart,      setChart]      = useState<ChartPoint[]>([]);
  const [alerts,     setAlerts]     = useState<AlertLog[]>([]);
  const [recentDet,  setRecentDet]  = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [lastUpdated,setLastUpdated]= useState<Date | null>(null);
  const unreadCount = alerts.filter(a => !a.isRead).length;

  useEffect(() => {
    Promise.all([
      farmService.getAll(),
      batchSupervisorService.getActive(),
      sensorService.getChart(24),
      alertService.getAll(),
      detectionService2.getRecent(20),
    ]).then(([f, b, c, al, det]) => {
      setFarms(f.data.data);
      setBatches(b.data.data);
      setChart(c.data.data);
      setAlerts(al.data.data);
      setRecentDet(det.data.data);
      setLastUpdated(new Date());
    }).finally(() => setLoading(false));
  }, []);

  // SSE for live alerts
  useEffect(() => {
    let src: EventSource;
    try {
      src = new EventSource(buildAlertStreamUrl());
      src.onmessage = (e) => {
        if (!e.data || e.data === 'ping') return;
        try {
          const data = JSON.parse(e.data);
          if (Array.isArray(data) && data.length > 0) {
            setAlerts(prev => {
              const ids = new Set(prev.map(a => a.id));
              const newOnes = data.filter((a: AlertLog) => !ids.has(a.id));
              if (newOnes.length > 0) {
                success(`${newOnes.length} new alert${newOnes.length > 1 ? 's' : ''}`);
                return [...newOnes, ...prev].slice(0, 50);
              }
              return prev;
            });
            setLastUpdated(new Date());
          }
        } catch {/* noop */}
      };
    } catch {/* noop */}
    return () => { src?.close(); };
  }, []);

  if (loading) {
    return (
      <div>
        <div style={{ marginBottom: '1.75rem' }}>
          <div style={{ height: 28, width: 260, borderRadius: 6 }} className="skeleton" />
        </div>
        <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
          {[0,1,2,3].map(i => <SkeletonStatCard key={i} />)}
        </div>
      </div>
    );
  }

  const totalDetections = batches.reduce((sum, b) => sum + (b.detectionCount ?? 0), 0);

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">System Overview</h1>
          <p className="page-subtitle">
            {lastUpdated ? `Updated ${timeAgo(lastUpdated)}` : 'Real-time farm monitoring & disease intelligence'}
          </p>
        </div>
        <div className="page-actions">
          <Link to="/detections/reports" className="btn btn-secondary btn-sm">🔬 Full Reports</Link>
          {unreadCount > 0 && (
            <Link to="/alerts" className="btn btn-danger btn-sm" style={{ gap: '0.4rem' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', animation: 'pulse-dot 1.5s infinite' }} />
              {unreadCount} Alerts
            </Link>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
        <StatCard icon="🌾" label="Total Farms"       value={farms.length}       color="var(--brand-600)" bg="var(--brand-50)" delay={0}    />
        <StatCard icon="📦" label="Active Batches"    value={batches.length}     color="#1e40af"          bg="#eff6ff"         delay={0.07} />
        <StatCard icon="🚨" label="Unread Alerts"     value={unreadCount}        color="#dc2626"          bg="#fef2f2"         delay={0.14} />
        <StatCard icon="🔬" label="Total Detections"  value={totalDetections}    color="#7c3aed"          bg="#f3e8ff"         delay={0.21} />
      </div>

      {/* Charts */}
      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
        {([
          { title: 'Temperature', unit: '°C', key: 'avgTemp'     as const, color: '#d97706', min: 22, max: 28, label: 'Safe: 22–28°C' },
          { title: 'Humidity',    unit: '%',  key: 'avgHumidity' as const, color: '#2563eb', min: 70, max: 85, label: 'Safe: 70–85%'  },
        ] as const).map((c, i) => (
          <motion.div key={c.key} className="chart-card"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28 + i * 0.08, duration: 0.4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <p className="chart-title">{c.title}</p>
              <span style={{ fontSize: '0.68rem', background: 'var(--brand-50)', color: 'var(--brand-700)', padding: '0.15rem 0.55rem', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>{c.label}</span>
            </div>
            <p className="chart-subtitle">Last 24 hours · all farms</p>
            {chart.length === 0 ? (
              <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: '0.82rem' }}>No sensor data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={chart} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`sg-${c.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c.color} stopOpacity={0.15} />
                      <stop offset="100%" stopColor={c.color} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.78rem', boxShadow: 'var(--shadow-md)' }}
                    formatter={(v) => [`${Number(v).toFixed(1)}${c.unit}`, c.title]} />
                  <ReferenceLine y={c.min} stroke={c.color} strokeDasharray="4 3" strokeOpacity={0.5} strokeWidth={1} />
                  <ReferenceLine y={c.max} stroke={c.color} strokeDasharray="4 3" strokeOpacity={0.5} strokeWidth={1} />
                  <Area type="monotone" dataKey={c.key} stroke={c.color} strokeWidth={2} fill={`url(#sg-${c.key})`} dot={false} activeDot={{ r: 4, fill: c.color }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </motion.div>
        ))}
      </div>

      {/* Batches + Alerts */}
      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
        {/* Active batches */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42, duration: 0.4 }}>
          <div className="table-container">
            <div className="table-header">
              <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>Active Batches ({batches.length})</p>
              <Link to="/farms" className="btn btn-ghost btn-sm">View farms →</Link>
            </div>
            {batches.length === 0 ? (
              <EmptyState icon="📦" title="No active batches" />
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr><th>Farm</th><th>Stage</th><th>Detections</th><th></th></tr>
                  </thead>
                  <tbody>
                    {batches.slice(0, 7).map(b => (
                      <tr key={b.id} className="tbody-row">
                        <td style={{ fontWeight: 500 }}>{b.farm?.name ?? '—'}</td>
                        <td><StageBadge stage={b.stage} /></td>
                        <td><span style={{ fontWeight: 600, color: 'var(--brand-600)' }}>{b.detectionCount ?? 0}</span></td>
                        <td><Link to={`/batches/${b.id}`} className="btn btn-ghost btn-xs">Open →</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </motion.div>

        {/* Live alerts */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.48, duration: 0.4 }}>
          <div className="table-container">
            <div className="table-header">
              <div className="flex-start gap-2">
                <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>Live Alerts</p>
                {unreadCount > 0 && (
                  <span style={{ background: 'var(--danger)', color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: 'var(--radius-full)' }}>
                    {unreadCount}
                  </span>
                )}
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', animation: 'pulse-dot 2s infinite' }} />
              </div>
              <Link to="/alerts" className="btn btn-ghost btn-sm">All alerts →</Link>
            </div>
            {alerts.length === 0 ? (
              <EmptyState icon="🔔" title="No alerts" description="All systems nominal." />
            ) : (
              <div style={{ padding: '0.375rem 0', maxHeight: 320, overflowY: 'auto' }}>
                {alerts.slice(0, 8).map((a) => {
                  const meta = ALERT_META[a.type];
                  return (
                    <div key={a.id} style={{
                      display: 'flex', gap: '0.625rem', padding: '0.65rem 1.25rem',
                      borderLeft: !a.isRead ? `3px solid ${meta.color}` : '3px solid transparent',
                      opacity: a.isRead ? 0.55 : 1,
                    }}>
                      <span style={{ width: 26, height: 26, borderRadius: 7, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, color: meta.color, flexShrink: 0 }}>
                        {meta.label[0]}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '0.78rem', fontWeight: a.isRead ? 400 : 600, color: 'var(--text)', lineHeight: 1.4 }}>{a.message}</p>
                        <p style={{ fontSize: '0.67rem', color: 'var(--text-faint)', marginTop: '0.15rem' }}>{timeAgo(a.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Recent detections */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.54, duration: 0.4 }}>
        <div className="table-container">
          <div className="table-header">
            <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>Recent Disease Detections</p>
            <div className="flex-start gap-2">
              <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)' }}>Powered by ResNet50 AI</span>
              <Link to="/detections/reports" className="btn btn-ghost btn-sm">Full report →</Link>
            </div>
          </div>
          {recentDet.length === 0 ? (
            <EmptyState icon="🔬" title="No detections yet" description="Run your first disease detection from a batch page." />
          ) : (
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Farm</th><th>Result</th><th>Confidence</th><th>Date</th></tr></thead>
                <tbody>
                  {recentDet.slice(0, 8).map((d) => {
                    const col = DISEASE_COLORS[d.result] ?? '#6b7280';
                    const pct = Math.round(d.confidence * 100);
                    return (
                      <tr key={d.id} className="tbody-row">
                        <td style={{ fontWeight: 500, fontSize: '0.82rem' }}>{d.farmName ?? '—'}</td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.18rem 0.55rem', borderRadius: '9999px', fontSize: '0.72rem', fontWeight: 700, background: col + '18', color: col }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: col }} />
                            {d.result}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div className="progress-bar" style={{ width: 60 }}>
                              <div className="progress-fill" style={{ width: `${pct}%`, background: col }} />
                            </div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: col }}>{pct}%</span>
                          </div>
                        </td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                          {new Date(d.detectedAt).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
