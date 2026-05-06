import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { farmService } from '../../services/farm.service';
import { Farm } from '../../types';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonStatCard } from '../../components/ui/SkeletonLoader';

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

interface StatProps { icon: React.ReactNode; label: string; value: number | string; color: string; bg: string; delay: number; trend?: string; }
function StatCard({ icon, label, value, color, bg, delay, trend }: StatProps) {
  const num = typeof value === 'number' ? value : 0;
  const count = useCountUp(num);
  return (
    <motion.div className="stat-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
      <div className="stat-card-glow" style={{ background: color }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: '0.75rem' }}>{label}</p>
          <p style={{ fontSize: '2.1rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em', lineHeight: 1 }}>
            {typeof value === 'string' ? value : count}
          </p>
          {trend && <p style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginTop: '0.375rem' }}>{trend}</p>}
        </div>
        <div className="stat-card-icon" style={{ background: bg, marginLeft: '1rem' }}>
          <div style={{ color, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${color}60, ${color}10)`, borderRadius: '0 0 16px 16px' }} />
    </motion.div>
  );
}

const QUICK_ACTIONS = [
  { to: '/admin/users',        svgPath: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75', label: 'User Management',   desc: 'Create accounts, assign roles, manage access',  color: 'var(--brand-600)' },
  { to: '/detections/reports', svgPath: 'M18 20V10M12 20V4M6 20v-6',                                                                               label: 'Detection Reports', desc: 'Disease history, frequency analysis',            color: '#7c3aed'          },
  { to: '/supervisor',         svgPath: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',                        label: 'System Overview',   desc: 'Cross-farm metrics, real-time monitoring',      color: '#2563eb'          },
  { to: '/farms/new',          svgPath: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',                                           label: 'Create Farm',       desc: 'Register a new farm in the system',             color: '#d97706'          },
  { to: '/farms',              svgPath: 'M21 10.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l2.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z', label: 'Manage Farms', desc: 'View, edit and organise all farms', color: '#0891b2' },
  { to: '/alerts',             svgPath: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0',                                  label: 'View Alerts',       desc: 'Review all system alerts and notifications',    color: '#dc2626'          },
];

export default function AdminDashboard() {
  const [farms,   setFarms]   = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    farmService.getAll()
      .then(r => setFarms(r.data.data))
      .finally(() => setLoading(false));
  }, []);

  const totalBatches  = farms.reduce((s, f) => s + (f.counts?.batches ?? 0), 0);
  const uniqueFarmers = new Set(farms.map(f => f.ownerId)).size;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Dashboard</h1>
          <p className="page-subtitle">Full system oversight and management</p>
        </div>
        <div className="page-actions">
          <Link to="/admin/users" className="btn btn-secondary btn-sm">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Users
          </Link>
          <Link to="/supervisor" className="btn btn-primary btn-sm">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
            Overview
          </Link>
        </div>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
          {[0,1,2,3].map(i => <SkeletonStatCard key={i} />)}
        </div>
      ) : (
        <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
          <StatCard icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>} label="Total Farms"    value={farms.length}  color="var(--brand-600)" bg="var(--brand-50)" delay={0}    trend={`${farms.length} registered`} />
          <StatCard icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>} label="Total Batches"  value={totalBatches}  color="#1e40af"          bg="#eff6ff"         delay={0.07} trend="Across all farms" />
          <StatCard icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>} label="Unique Farmers" value={uniqueFarmers} color="#7c3aed"          bg="#f3e8ff"         delay={0.14} trend="Active accounts" />
          <StatCard icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>} label="System Status"  value="Online"        color="#16a34a"          bg="#f0fdf4"         delay={0.21} trend="All services healthy" />
        </div>
      )}

      {/* Quick actions + Farm list */}
      <div className="grid-2">
        {/* Quick actions */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28, duration: 0.4 }}>
          <div className="table-container">
            <div className="table-header">
              <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>Quick Actions</p>
            </div>
            <div style={{ padding: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {QUICK_ACTIONS.map(a => (
                <Link key={a.to} to={a.to}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.75rem 0.875rem', borderRadius: 'var(--radius-md)', transition: 'background 0.12s, transform 0.12s', textDecoration: 'none' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--gray-50)'; e.currentTarget.style.transform = 'translateX(2px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'translateX(0)'; }}
                >
                  <span style={{ width: 36, height: 36, borderRadius: 10, background: a.color + '14', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={a.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={a.svgPath} />
                    </svg>
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>{a.label}</p>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{a.desc}</p>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-faint)', flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
                </Link>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Farm registry */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.34, duration: 0.4 }}>
          <div className="table-container">
            <div className="table-header">
              <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>Farm Registry ({farms.length})</p>
              <Link to="/farms/new" className="btn btn-primary btn-sm">+ Add Farm</Link>
            </div>
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-faint)' }}>Loading…</div>
            ) : farms.length === 0 ? (
              <EmptyState icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>} title="No farms registered" action={{ label: '+ Create Farm', to: '/farms/new' }} />
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead><tr><th>Farm</th><th>Owner</th><th>Location</th><th>Batches</th></tr></thead>
                  <tbody>
                    {farms.slice(0, 8).map(f => (
                      <tr key={f.id} className="tbody-row">
                        <td>
                          <Link to={`/farms/${f.id}`} style={{ fontWeight: 600, color: 'var(--primary)' }}>
                            {f.name}
                          </Link>
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{f.owner?.name ?? '—'}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.location}</td>
                        <td style={{ fontWeight: 600, color: 'var(--brand-600)' }}>{f.counts?.batches ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
