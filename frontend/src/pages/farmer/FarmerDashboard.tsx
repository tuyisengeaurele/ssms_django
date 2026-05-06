import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';

import { useAuth } from '../../context/AuthContext';
import { farmService } from '../../services/farm.service';
import { alertService } from '../../services/alert.service';
import { sensorService, batchSupervisorService, ActiveBatch, ChartPoint } from '../../services/sensor.service';
import { Farm, AlertLog, AlertType } from '../../types';
import { BatchStage } from '../../types';
import Navbar from '../../components/ui/Navbar';
import StageBadge from '../../components/ui/StageBadge';

// ── helpers ───────────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 800) {
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
  }, [target]);
  return val;
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

const ALERT_META: Record<AlertType, { color: string; label: string; bg: string }> = {
  TEMPERATURE:  { color: '#d97706', label: 'Temp',     bg: '#fef3c7' },
  HUMIDITY:     { color: '#2563eb', label: 'Humidity', bg: '#dbeafe' },
  DISEASE:      { color: '#dc2626', label: 'Disease',  bg: '#fee2e2' },
  STAGE_CHANGE: { color: '#7c3aed', label: 'Stage',    bg: '#f3e8ff' },
  SYSTEM:       { color: '#64748b', label: 'System',   bg: '#f1f5f9' },
};

// ── stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color, delay }: {
  icon: string; label: string; value: number | string;
  color: string; delay: number;
}) {
  const num = typeof value === 'number' ? value : 0;
  const count = useCountUp(num);
  return (
    <div className="anim-in" style={{
      animationDelay: `${delay}ms`,
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: '12px',
      borderTop: `3px solid ${color}`,
      padding: '1.2rem 1.4rem',
      boxShadow: '0 1px 3px rgba(0,0,0,.07)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <p style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280' }}>{label}</p>
        <span style={{ fontSize: '1.3rem' }}>{icon}</span>
      </div>
      <p style={{ fontSize: '1.9rem', fontWeight: 800, color, lineHeight: 1 }}>
        {typeof value === 'string' ? value : count}
      </p>
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function FarmerDashboard() {
  const { user } = useAuth();

  const [farms,   setFarms]   = useState<Farm[]>([]);
  const [batches, setBatches] = useState<ActiveBatch[]>([]);
  const [alerts,  setAlerts]  = useState<AlertLog[]>([]);
  const [chart,   setChart]   = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const unreadCount = alerts.filter(a => !a.isRead).length;

  useEffect(() => {
    Promise.all([
      farmService.getAll(),
      batchSupervisorService.getActive(),
      alertService.getAll(false),
      sensorService.getChart(24),
    ]).then(([f, b, a, c]) => {
      setFarms(f.data.data);
      setBatches(b.data.data);
      setAlerts(a.data.data.slice(0, 30));
      setChart(c.data.data);
    }).finally(() => setLoading(false));
  }, []);

  const handleMarkRead = async (id: string) => {
    await alertService.markRead(id);
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, isRead: true } : a));
  };

  const gradId = 'farmer-temp-grad';
  const humGradId = 'farmer-hum-grad';

  return (
    <>
      <Navbar />
      <div className="container page" style={{ maxWidth: '1200px' }}>

        {/* ── header ── */}
        <div className="anim-in flex-between" style={{ marginBottom: '1.75rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
              Welcome back, {user?.name?.split(' ')[0]} 👋
            </h1>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.2rem' }}>
              Here's what's happening on your farms today
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <Link to="/farms/new" className="btn btn-secondary btn-sm">+ New Farm</Link>
            <Link to="/farms" className="btn btn-primary btn-sm">My Farms</Link>
          </div>
        </div>

        {/* ── stat cards ── */}
        <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
          <StatCard icon="🌾" label="My Farms"      value={farms.length}   color="var(--primary)" delay={0} />
          <StatCard icon="📦" label="Active Batches" value={batches.length} color="#1e40af"         delay={80} />
          <StatCard icon="🚨" label="Unread Alerts"  value={unreadCount}    color="#dc2626"         delay={160} />
        </div>

        {/* ── charts row ── */}
        <div className="grid-2" style={{ marginBottom: '1.5rem' }}>

          {/* Temperature chart */}
          <div className="anim-in" style={{ animationDelay: '100ms', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.25rem 1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,.07)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
              <p style={{ fontWeight: 700, fontSize: '0.9rem' }}>Temperature — last 24 h</p>
              <span style={{ fontSize: '0.7rem', color: '#6b7280', background: '#f1f5f9', padding: '0.15rem 0.45rem', borderRadius: '6px' }}>Safe: 22–28°C</span>
            </div>
            {chart.length === 0 ? (
              <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '0.82rem' }}>
                No readings yet — start the simulator
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={chart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="10%" stopColor="#16a34a" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                  <YAxis domain={[18, 32]} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '0.78rem' }} formatter={(v) => [`${v}°C`, 'Avg Temp']} />
                  <ReferenceLine y={22} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5} />
                  <ReferenceLine y={28} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="avgTemp" stroke="#16a34a" strokeWidth={2.5} fill={`url(#${gradId})`} dot={false} activeDot={{ r: 4 }} connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Humidity chart */}
          <div className="anim-in" style={{ animationDelay: '160ms', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.25rem 1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,.07)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
              <p style={{ fontWeight: 700, fontSize: '0.9rem' }}>Humidity — last 24 h</p>
              <span style={{ fontSize: '0.7rem', color: '#6b7280', background: '#f1f5f9', padding: '0.15rem 0.45rem', borderRadius: '6px' }}>Safe: 70–85%</span>
            </div>
            {chart.length === 0 ? (
              <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '0.82rem' }}>
                No readings yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={chart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id={humGradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="10%" stopColor="#2563eb" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                  <YAxis domain={[60, 95]} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '0.78rem' }} formatter={(v) => [`${v}%`, 'Avg Humidity']} />
                  <ReferenceLine y={70} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5} />
                  <ReferenceLine y={85} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="avgHumidity" stroke="#2563eb" strokeWidth={2.5} fill={`url(#${humGradId})`} dot={false} activeDot={{ r: 4 }} connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ── batches + alerts ── */}
        <div className="grid-2" style={{ alignItems: 'start' }}>

          {/* My active batches */}
          <div className="anim-in" style={{ animationDelay: '200ms', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.25rem 1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,.07)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>My Batches ({batches.length})</p>
            </div>

            {loading ? (
              <p style={{ color: '#9ca3af', fontSize: '0.85rem', textAlign: 'center', padding: '1.5rem 0' }}>Loading…</p>
            ) : batches.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 0', color: '#9ca3af' }}>
                <p style={{ fontSize: '2rem' }}>📦</p>
                <p style={{ fontSize: '0.85rem', marginTop: '0.4rem' }}>No active batches yet.</p>
                <p style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>
                  Go to a <Link to="/farms" style={{ color: 'var(--primary)' }}>farm</Link> and add one.
                </p>
              </div>
            ) : (
              <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Farm', 'Stage', 'Started', ''].map(h => (
                        <th key={h} style={{ padding: '0.45rem 0.6rem', textAlign: 'left', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb', background: '#f9fafb', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b) => (
                      <tr key={b.id}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        style={{ transition: 'background 0.12s' }}
                      >
                        <td style={{ padding: '0.6rem 0.6rem', fontSize: '0.82rem', fontWeight: 500 }}>
                          <Link to={`/farms/${b.farmId}`} style={{ color: 'var(--primary)' }}>
                            {b.farm?.name ?? '—'}
                          </Link>
                        </td>
                        <td style={{ padding: '0.6rem 0.6rem' }}>
                          <StageBadge stage={b.stage as BatchStage} />
                        </td>
                        <td style={{ padding: '0.6rem 0.6rem', fontSize: '0.78rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                          {new Date(b.startDate).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '0.6rem 0.6rem', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            <Link to={`/batches/${b.id}`} className="btn btn-sm btn-secondary" style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem' }}>
                              Details
                            </Link>
                            <Link to={`/batches/${b.id}/detect`} className="btn btn-sm btn-primary" style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem' }}>
                              🔬 Detect
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

          {/* Alerts */}
          <div className="anim-in" style={{ animationDelay: '260ms', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.25rem 1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,.07)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>My Alerts</p>
                {unreadCount > 0 && (
                  <span style={{ background: '#dc2626', color: '#fff', borderRadius: '9999px', fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.4rem' }}>
                    {unreadCount}
                  </span>
                )}
              </div>
            </div>

            <div style={{ maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {alerts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 0', color: '#9ca3af' }}>
                  <p style={{ fontSize: '2rem' }}>✅</p>
                  <p style={{ fontSize: '0.82rem', marginTop: '0.4rem' }}>All readings in safe range</p>
                </div>
              ) : (
                alerts.map((alert) => {
                  const m = ALERT_META[alert.type] ?? ALERT_META.SYSTEM;
                  return (
                    <div
                      key={alert.id}
                      style={{
                        padding: '0.6rem 0.75rem',
                        borderRadius: '8px',
                        borderLeft: `3px solid ${m.color}`,
                        background: alert.isRead ? '#f9fafb' : m.bg,
                        opacity: alert.isRead ? 0.6 : 1,
                        transition: 'all 0.2s',
                        cursor: alert.isRead ? 'default' : 'pointer',
                      }}
                      onClick={() => !alert.isRead && handleMarkRead(alert.id)}
                      title={!alert.isRead ? 'Click to mark as read' : undefined}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.15rem' }}>
                            <span style={{ fontSize: '0.67rem', fontWeight: 700, color: m.color, background: m.bg, border: `1px solid ${m.color}30`, padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
                              {m.label}
                            </span>
                            {!alert.isRead && (
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color, display: 'inline-block' }} />
                            )}
                          </div>
                          <p style={{ fontSize: '0.8rem', color: '#374151', margin: 0, lineHeight: 1.4 }}>{alert.message}</p>
                          <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.15rem' }}>
                            Batch …{alert.batchId.slice(-8)} · {timeAgo(alert.createdAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
