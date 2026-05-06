import { useEffect, useRef, useState, CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';

import { farmService } from '../../services/farm.service';
import { alertService, buildAlertStreamUrl } from '../../services/alert.service';
import {
  sensorService, detectionService2, batchSupervisorService,
  ChartPoint, RecentDetection, ActiveBatch,
} from '../../services/sensor.service';
import { Farm, AlertLog, AlertType } from '../../types';
import Navbar from '../../components/ui/Navbar';
import StageBadge from '../../components/ui/StageBadge';
import { BatchStage } from '../../types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target) { setVal(0); return; }
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(ease * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function isToday(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

const DISEASE_COLORS: Record<string, string> = {
  Healthy: '#059669', Flacherie: '#dc2626',
  Grasserie: '#d97706', Muscardine: '#7c3aed', Pebrine: '#db2777',
};
const dc = (label: string) => DISEASE_COLORS[label] ?? '#6b7280';

const ALERT_META: Record<AlertType, { color: string; label: string; bg: string }> = {
  TEMPERATURE:  { color: '#d97706', label: 'Temp',    bg: '#fef3c7' },
  HUMIDITY:     { color: '#2563eb', label: 'Humidity', bg: '#dbeafe' },
  DISEASE:      { color: '#dc2626', label: 'Disease',  bg: '#fee2e2' },
  STAGE_CHANGE: { color: '#7c3aed', label: 'Stage',   bg: '#f3e8ff' },
  SYSTEM:       { color: '#64748b', label: 'System',  bg: '#f1f5f9' },
};

// ── Stat card ─────────────────────────────────────────────────────────────────
interface StatCardProps {
  icon: string; label: string; value: number;
  color: string; delay: number;
  suffix?: string;
}
function StatCard({ icon, label, value, color, delay, suffix = '' }: StatCardProps) {
  const count = useCountUp(value);
  return (
    <div
      className="anim-in"
      style={{
        animationDelay: `${delay}ms`,
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '1.25rem 1.5rem',
        borderTop: `3px solid ${color}`,
        boxShadow: '0 1px 3px rgba(0,0,0,.07)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <p style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280' }}>{label}</p>
        <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{icon}</span>
      </div>
      <p style={{ fontSize: '2rem', fontWeight: 800, color, lineHeight: 1 }}>
        {count}{suffix}
      </p>
    </div>
  );
}

// ── Sensor chart ──────────────────────────────────────────────────────────────
interface SensorChartProps {
  data: ChartPoint[];
  dataKey: 'avgTemp' | 'avgHumidity';
  label: string;
  color: string;
  unit: string;
  refMin: number;
  refMax: number;
  domain: [number, number];
}
function SensorChart({ data, dataKey, label, color, unit, refMin, refMax, domain }: SensorChartProps) {
  const gradId = `grad-${dataKey}`;
  return (
    <div className="anim-in" style={{ animationDelay: '200ms', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.25rem 1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,.07)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>{label}</p>
        <span style={{ fontSize: '0.72rem', color: '#6b7280', background: '#f1f5f9', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
          Safe: {refMin}–{refMax}{unit}
        </span>
      </div>
      {data.length === 0 ? (
        <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>
          No readings yet — start the simulator
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="10%" stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
            <YAxis domain={domain} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '0.8rem', boxShadow: '0 4px 12px rgba(0,0,0,.08)' }}
              formatter={(v) => [`${v}${unit}`, label]}
              labelStyle={{ color: '#6b7280', fontWeight: 600 }}
            />
            <ReferenceLine y={refMin} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5} />
            <ReferenceLine y={refMax} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5} />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2.5}
              fill={`url(#${gradId})`}
              dot={false}
              activeDot={{ r: 4, fill: color }}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main dashboard
// ─────────────────────────────────────────────────────────────────────────────

export default function SupervisorDashboard() {
  const [farms, setFarms]                 = useState<Farm[]>([]);
  const [batches, setBatches]             = useState<ActiveBatch[]>([]);
  const [chartData, setChartData]         = useState<ChartPoint[]>([]);
  const [detections, setDetections]       = useState<RecentDetection[]>([]);
  const [alerts, setAlerts]               = useState<AlertLog[]>([]);
  const [sseStatus, setSseStatus]         = useState<'connecting' | 'live' | 'error'>('connecting');
  const [newAlertIds, setNewAlertIds]     = useState<Set<string>>(new Set());
  const [lastUpdated, setLastUpdated]     = useState<Date | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const unreadCount    = alerts.filter(a => !a.isRead).length;
  const detectionsToday = detections.filter(d => isToday(d.detectedAt)).length;

  // ── initial data load ──────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      farmService.getAll(),
      batchSupervisorService.getActive(),
      sensorService.getChart(24),
      detectionService2.getRecent(20),
      alertService.getAll(true),
    ]).then(([f, b, c, d, a]) => {
      setFarms(f.data.data);
      setBatches(b.data.data);
      setChartData(c.data.data);
      setDetections(d.data.data);
      setAlerts(a.data.data);
      setLastUpdated(new Date());
    }).catch(() => {});
  }, []);

  // ── SSE alerts stream ──────────────────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource(buildAlertStreamUrl());
    esRef.current = es;
    es.onopen = () => setSseStatus('live');
    es.onmessage = (e) => {
      try {
        const alert: AlertLog = JSON.parse(e.data);
        setAlerts(prev => {
          if (prev.some(a => a.id === alert.id)) return prev;
          return [alert, ...prev];
        });
        setNewAlertIds(prev => new Set(prev).add(alert.id));
        setTimeout(() => setNewAlertIds(prev => { const n = new Set(prev); n.delete(alert.id); return n; }), 5000);
      } catch { /* ignore */ }
    };
    es.onerror = () => setSseStatus('error');
    return () => { es.close(); esRef.current = null; };
  }, []);

  const handleMarkAllRead = async () => {
    await alertService.markAllRead();
    setAlerts(prev => prev.map(a => ({ ...a, isRead: true })));
  };

  // ── SSE status dot ────────────────────────────────────────────────────────
  const sseDot: CSSProperties = {
    display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 5,
    background: sseStatus === 'live' ? '#22c55e' : sseStatus === 'error' ? '#dc2626' : '#f59e0b',
    animation: sseStatus === 'live' ? 'pulse-dot 2s ease infinite' : 'none',
  };

  return (
    <>
      <Navbar />
      <div className="container page" style={{ maxWidth: '1280px' }}>

        {/* ── header ── */}
        <div className="flex-between anim-in" style={{ marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Supervisor Overview</h1>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.2rem' }}>
              Real-time farm monitoring &amp; disease intelligence
            </p>
          </div>
          {lastUpdated && (
            <p style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
              Updated {timeAgo(lastUpdated.toISOString())}
            </p>
          )}
        </div>

        {/* ── stat cards ── */}
        <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
          <StatCard icon="🌾" label="Total Farms"      value={farms.length}           color="var(--primary)"     delay={0} />
          <StatCard icon="📦" label="Active Batches"   value={batches.length}          color="#1e40af"            delay={80} />
          <StatCard icon="🚨" label="Unread Alerts"    value={unreadCount}             color="#dc2626"            delay={160} />
          <StatCard icon="🔬" label="Detections Today" value={detectionsToday}         color="#7c3aed"            delay={240} />
        </div>

        {/* ── charts ── */}
        <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
          <SensorChart
            data={chartData}
            dataKey="avgTemp"
            label="Temperature (last 24 h)"
            color="#16a34a"
            unit="°C"
            refMin={22} refMax={28}
            domain={[18, 32]}
          />
          <SensorChart
            data={chartData}
            dataKey="avgHumidity"
            label="Humidity (last 24 h)"
            color="#2563eb"
            unit="%"
            refMin={70} refMax={85}
            domain={[60, 95]}
          />
        </div>

        {/* ── active batches + alerts ── */}
        <div className="grid-2" style={{ marginBottom: '1.5rem', alignItems: 'start' }}>

          {/* Active batches */}
          <div className="anim-in" style={{ animationDelay: '120ms', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.25rem 1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,.07)' }}>
            <div className="flex-between" style={{ marginBottom: '1rem' }}>
              <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>Active Batches ({batches.length})</p>
              <Link to="/farms" className="btn btn-sm btn-secondary">View all farms</Link>
            </div>
            {batches.length === 0 ? (
              <p style={{ color: '#9ca3af', fontSize: '0.85rem', padding: '1.5rem 0', textAlign: 'center' }}>No active batches</p>
            ) : (
              <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Farm', 'Stage', 'Started', 'Detections'].map(h => (
                        <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b) => (
                      <tr key={b.id} style={{ transition: 'background 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '0.6rem 0.75rem', fontSize: '0.82rem', fontWeight: 500 }}>
                          <Link to={`/farms/${b.farmId}`} style={{ color: 'var(--primary)' }}>{b.farm?.name ?? '—'}</Link>
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>
                          <StageBadge stage={b.stage as BatchStage} />
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem', fontSize: '0.78rem', color: '#6b7280' }}>
                          {new Date(b.startDate).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem', fontSize: '0.82rem', fontWeight: 600, color: '#7c3aed' }}>
                          {b.detectionCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Live alerts */}
          <div className="anim-in" style={{ animationDelay: '180ms', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.25rem 1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,.07)' }}>
            <div className="flex-between" style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>Live Alerts</p>
                {unreadCount > 0 && (
                  <span style={{ background: '#dc2626', color: '#fff', borderRadius: '9999px', fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.4rem' }}>
                    {unreadCount}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.7rem', color: '#6b7280', display: 'flex', alignItems: 'center' }}>
                  <span style={sseDot} />
                  {sseStatus === 'live' ? 'Live' : sseStatus === 'error' ? 'Disconnected' : 'Connecting…'}
                </span>
                {unreadCount > 0 && (
                  <button className="btn btn-sm btn-secondary" onClick={handleMarkAllRead} style={{ fontSize: '0.72rem' }}>
                    Mark all read
                  </button>
                )}
              </div>
            </div>

            <div style={{ maxHeight: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {alerts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 0', color: '#9ca3af' }}>
                  <p style={{ fontSize: '2rem' }}>✅</p>
                  <p style={{ fontSize: '0.82rem', marginTop: '0.4rem' }}>All readings in safe range</p>
                </div>
              ) : (
                alerts.slice(0, 40).map((alert) => {
                  const m = ALERT_META[alert.type] ?? ALERT_META.SYSTEM;
                  const isNew = newAlertIds.has(alert.id);
                  return (
                    <div
                      key={alert.id}
                      className={isNew ? 'anim-in' : ''}
                      style={{
                        padding: '0.6rem 0.75rem',
                        borderRadius: '8px',
                        borderLeft: `3px solid ${m.color}`,
                        background: alert.isRead ? '#f9fafb' : m.bg,
                        opacity: alert.isRead ? 0.65 : 1,
                        transition: 'background 0.4s ease, opacity 0.4s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.15rem' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: m.color, background: m.bg, padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{m.label.toUpperCase()}</span>
                        {isNew && <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#22c55e' }}>NEW</span>}
                      </div>
                      <p style={{ fontSize: '0.8rem', color: '#374151', margin: 0 }}>{alert.message}</p>
                      <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.15rem' }}>
                        Batch …{alert.batchId.slice(-8)} · {timeAgo(alert.createdAt)}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ── disease detection history ── */}
        <div className="anim-in" style={{ animationDelay: '280ms', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.25rem 1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,.07)' }}>
          <div className="flex-between" style={{ marginBottom: '1rem' }}>
            <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>Detection History (last 20)</p>
            <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Powered by ResNet50 AI</span>
          </div>

          {detections.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: '#9ca3af' }}>
              <p style={{ fontSize: '2rem' }}>🔬</p>
              <p style={{ fontSize: '0.85rem', marginTop: '0.4rem' }}>No detections yet. Open a batch and run a detection.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Diagnosis', 'Confidence', 'Farm', 'Batch', 'Time'].map(h => (
                      <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detections.map((d) => (
                    <tr key={d.id}
                      style={{ transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.78rem', fontWeight: 700, background: `${dc(d.result)}18`, color: dc(d.result) }}>
                          {d.result === 'Healthy' ? '✅' : '⚠️'} {d.result}
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: 80, height: 6, background: '#e5e7eb', borderRadius: 9999, overflow: 'hidden' }}>
                            <div style={{ width: `${(d.confidence * 100).toFixed(0)}%`, height: '100%', background: dc(d.result), borderRadius: 9999 }} />
                          </div>
                          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: dc(d.result) }}>
                            {(d.confidence * 100).toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.82rem', fontWeight: 500 }}>
                        <Link to={`/farms/${d.farmId}`} style={{ color: 'var(--primary)' }}>{d.farmName}</Link>
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.78rem', color: '#6b7280', fontFamily: 'monospace' }}>
                        <Link to={`/batches/${d.batchId}`} style={{ color: '#6b7280' }}>…{d.batchId.slice(-8)}</Link>
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.78rem', color: '#9ca3af' }}>
                        {timeAgo(d.detectedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </>
  );
}
