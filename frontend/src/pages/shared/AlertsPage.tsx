import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { alertService } from '../../services/alert.service';
import { AlertLog, AlertType } from '../../types';
import { useApiError } from '../../hooks/useApiError';
import { useToast } from '../../context/ToastContext';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';

const ALERT_META: Record<AlertType, { color: string; bg: string; label: string; icon: string }> = {
  TEMPERATURE:  { color: '#d97706', bg: '#fef3c7', label: 'Temperature', icon: '🌡️' },
  HUMIDITY:     { color: '#2563eb', bg: '#dbeafe', label: 'Humidity',    icon: '💧' },
  DISEASE:      { color: '#dc2626', bg: '#fee2e2', label: 'Disease',     icon: '🦠' },
  STAGE_CHANGE: { color: '#7c3aed', bg: '#f3e8ff', label: 'Stage',       icon: '🔄' },
  SYSTEM:       { color: '#4b5563', bg: '#f1f5f9', label: 'System',      icon: '⚙️' },
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function AlertsPage() {
  const { getErrorMessage } = useApiError();
  const { success, error: showError } = useToast();
  const [alerts, setAlerts]     = useState<AlertLog[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<'all' | 'unread'>('all');
  const [markingAll, setMarkingAll] = useState(false);

  const fetchAlerts = () => {
    setLoading(true);
    alertService.getAll(filter === 'unread' ? true : undefined)
      .then(r => setAlerts(r.data.data))
      .catch(e => showError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAlerts(); }, [filter]);

  const handleMarkRead = async (id: string) => {
    try {
      await alertService.markRead(id);
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, isRead: true } : a));
    } catch (e) {
      showError(getErrorMessage(e));
    }
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      await alertService.markAllRead();
      setAlerts(prev => prev.map(a => ({ ...a, isRead: true })));
      success('All alerts marked as read.');
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setMarkingAll(false);
    }
  };

  const unreadCount = alerts.filter(a => !a.isRead).length;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Alerts</h1>
          <p className="page-subtitle">
            {unreadCount > 0 ? `${unreadCount} unread alert${unreadCount !== 1 ? 's' : ''}` : 'All caught up'}
          </p>
        </div>
        <div className="page-actions">
          {/* Filter tabs */}
          <div style={{ display: 'flex', background: 'var(--gray-100)', borderRadius: 'var(--radius-md)', padding: '3px', gap: '2px' }}>
            {(['all', 'unread'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{
                  padding: '0.35rem 0.875rem',
                  borderRadius: 'var(--radius)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  background: filter === f ? 'var(--surface)' : 'transparent',
                  color: filter === f ? 'var(--text)' : 'var(--text-muted)',
                  boxShadow: filter === f ? 'var(--shadow-xs)' : 'none',
                  textTransform: 'capitalize',
                }}>
                {f}
              </button>
            ))}
          </div>
          {unreadCount > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={handleMarkAll} disabled={markingAll}>
              {markingAll ? 'Marking…' : 'Mark all read'}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <SkeletonTable rows={6} cols={4} />
      ) : alerts.length === 0 ? (
        <div className="table-container">
          <EmptyState icon="🔔" title="No alerts" description="You have no alerts at the moment. We'll notify you when something needs attention." />
        </div>
      ) : (
        <div className="table-container">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Message</th>
                  <th>Time</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a, i) => {
                  const meta = ALERT_META[a.type] ?? { color: '#4b5563', bg: '#f3f4f6', label: a.type, icon: '📢' };
                  return (
                    <motion.tr key={a.id} className="tbody-row"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03, duration: 0.25 }}
                      style={{ opacity: a.isRead ? 0.6 : 1 }}
                    >
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                          padding: '0.2rem 0.6rem', borderRadius: '9999px',
                          fontSize: '0.7rem', fontWeight: 700,
                          background: meta.bg, color: meta.color,
                        }}>
                          {meta.icon} {meta.label}
                        </span>
                      </td>
                      <td style={{ fontWeight: a.isRead ? 400 : 500, color: a.isRead ? 'var(--text-muted)' : 'var(--text)' }}>
                        {a.message}
                      </td>
                      <td style={{ color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                        {timeAgo(a.createdAt)}
                      </td>
                      <td>
                        {a.isRead ? (
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)', fontWeight: 500 }}>Read</span>
                        ) : (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                            fontSize: '0.72rem', fontWeight: 700,
                            color: 'var(--primary)',
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', display: 'inline-block', animation: 'pulse-dot 1.5s ease infinite' }} />
                            Unread
                          </span>
                        )}
                      </td>
                      <td>
                        {!a.isRead && (
                          <button className="btn btn-ghost btn-xs" onClick={() => handleMarkRead(a.id)}>
                            Mark read
                          </button>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
