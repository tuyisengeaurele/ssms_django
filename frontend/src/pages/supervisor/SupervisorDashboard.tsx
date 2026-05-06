import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { farmService } from '../../services/farm.service';
import { alertService, buildAlertStreamUrl } from '../../services/alert.service';
import { Farm, AlertLog, AlertType } from '../../types';
import Navbar from '../../components/ui/Navbar';
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

// ── alert type styling ────────────────────────────────────────────────────────
const ALERT_STYLES: Record<AlertType, { bg: string; color: string; label: string }> = {
  TEMPERATURE: { bg: '#fef3c7', color: '#d97706', label: 'Temp' },
  HUMIDITY:    { bg: '#dbeafe', color: '#2563eb', label: 'Humidity' },
  DISEASE:     { bg: '#fee2e2', color: '#dc2626', label: 'Disease' },
  STAGE_CHANGE:{ bg: '#f3e8ff', color: '#7c3aed', label: 'Stage' },
  SYSTEM:      { bg: '#f1f5f9', color: '#64748b', label: 'System' },
};

function AlertBadge({ type }: { type: AlertType }) {
  const s = ALERT_STYLES[type] ?? ALERT_STYLES.SYSTEM;
  return (
    <span style={{
      display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '9999px',
      fontSize: '0.7rem', fontWeight: 700, background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  );
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function SupervisorDashboard() {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);

  // alert state
  const [alerts, setAlerts] = useState<AlertLog[]>([]);
  const [sseStatus, setSseStatus] = useState<'connecting' | 'live' | 'error'>('connecting');
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const esRef = useRef<EventSource | null>(null);

  const totalBatches = farms.reduce((s, f) => s + (f.counts?.batches ?? 0), 0);
  const unreadCount  = alerts.filter((a) => !a.isRead).length;

  // ── farms ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    farmService.getAll().then((r) => setFarms(r.data.data)).finally(() => setLoading(false));
  }, []);

  // ── load existing unread alerts on mount ──────────────────────────────────
  useEffect(() => {
    alertService.getAll(true).then((r) => setAlerts(r.data.data)).catch(() => {});
  }, []);

  // ── SSE connection ────────────────────────────────────────────────────────
  useEffect(() => {
    const url = buildAlertStreamUrl();
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setSseStatus('live');

    es.onmessage = (e) => {
      try {
        const alert: AlertLog = JSON.parse(e.data);
        setAlerts((prev) => {
          if (prev.some((a) => a.id === alert.id)) return prev;   // deduplicate
          return [alert, ...prev];
        });
        // highlight new alert briefly
        setNewIds((prev) => new Set(prev).add(alert.id));
        setTimeout(() => setNewIds((prev) => { const n = new Set(prev); n.delete(alert.id); return n; }), 4000);
      } catch { /* ignore malformed */ }
    };

    es.onerror = () => setSseStatus('error');

    return () => { es.close(); esRef.current = null; };
  }, []);

  // ── mark all read ─────────────────────────────────────────────────────────
  const handleMarkAllRead = async () => {
    await alertService.markAllRead();
    setAlerts((prev) => prev.map((a) => ({ ...a, isRead: true })));
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      <Navbar />
      <div className="container page">
        <PageHeader
          title="Supervisor Overview"
          subtitle="Monitor all farms and batches across the system"
        />

        {/* ── stats ── */}
        <div className="grid-3" style={{ marginBottom: '2rem' }}>
          {[
            { label: 'All Farms',     value: farms.length,   color: 'var(--primary)' },
            { label: 'Total Batches', value: totalBatches,   color: 'var(--secondary)' },
            { label: 'Farmers',       value: new Set(farms.map((f) => f.ownerId)).size, color: 'var(--warning)' },
          ].map((stat) => (
            <div key={stat.label} className="card" style={{ borderTop: `3px solid ${stat.color}` }}>
              <p className="text-muted" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>{stat.label}</p>
              <p style={{ fontSize: '1.75rem', fontWeight: 700, color: stat.color, marginTop: '0.25rem' }}>{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="grid-2" style={{ marginBottom: '2rem', alignItems: 'start' }}>

          {/* ── farm table ── */}
          <div className="card">
            <h2 style={{ fontWeight: 600, marginBottom: '1rem' }}>All Farms</h2>
            {loading ? <LoadingSpinner /> : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr><th>Farm</th><th>Location</th><th>Owner</th><th>Batches</th><th></th></tr>
                  </thead>
                  <tbody>
                    {farms.map((farm) => (
                      <tr key={farm.id}>
                        <td style={{ fontWeight: 500 }}>{farm.name}</td>
                        <td className="text-muted">{farm.location}</td>
                        <td>{farm.owner?.name ?? '—'}</td>
                        <td>{farm.counts?.batches ?? 0}</td>
                        <td><Link to={`/farms/${farm.id}`} className="btn btn-sm btn-secondary">View</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── live alerts ── */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

            {/* header */}
            <div className="flex-between" style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h2 style={{ fontWeight: 600 }}>Live Alerts</h2>
                {unreadCount > 0 && (
                  <span style={{
                    background: 'var(--danger, #dc2626)', color: '#fff',
                    borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 700,
                    padding: '0.1rem 0.45rem', lineHeight: 1.4,
                  }}>
                    {unreadCount}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {/* SSE status dot */}
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  <span style={{
                    display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
                    background: sseStatus === 'live' ? '#22c55e' : sseStatus === 'error' ? '#dc2626' : '#f59e0b',
                    marginRight: '4px',
                  }} />
                  {sseStatus === 'live' ? 'Live' : sseStatus === 'error' ? 'Disconnected' : 'Connecting…'}
                </span>
                {unreadCount > 0 && (
                  <button className="btn btn-sm btn-secondary" onClick={handleMarkAllRead}>
                    Mark all read
                  </button>
                )}
              </div>
            </div>

            {/* alert feed */}
            <div style={{ maxHeight: '420px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {alerts.length === 0 ? (
                <div className="text-center" style={{ padding: '2.5rem 0', color: 'var(--text-muted)' }}>
                  <p style={{ fontSize: '2rem' }}>✅</p>
                  <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>No alerts — all readings in range.</p>
                </div>
              ) : (
                alerts.slice(0, 50).map((alert) => {
                  const s = ALERT_STYLES[alert.type] ?? ALERT_STYLES.SYSTEM;
                  const isNew = newIds.has(alert.id);
                  return (
                    <div
                      key={alert.id}
                      style={{
                        padding: '0.625rem 0.75rem',
                        borderRadius: 'var(--radius)',
                        borderLeft: `3px solid ${s.color}`,
                        background: isNew ? s.bg : alert.isRead ? 'var(--bg)' : s.bg + '88',
                        transition: 'background 0.6s ease',
                        opacity: alert.isRead ? 0.6 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                            <AlertBadge type={alert.type} />
                            {isNew && (
                              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#22c55e' }}>NEW</span>
                            )}
                          </div>
                          <p style={{ fontSize: '0.82rem', margin: 0 }}>{alert.message}</p>
                          <p className="text-muted" style={{ fontSize: '0.72rem', marginTop: '0.2rem' }}>
                            Batch …{alert.batchId.slice(-8)} &nbsp;·&nbsp; {timeAgo(alert.createdAt)}
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
