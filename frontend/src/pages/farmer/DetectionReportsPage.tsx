import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { detectionReportService, DetectionHistoryItem, DetectionStat } from '../../services/admin.service';
import { farmService } from '../../services/farm.service';
import { Farm } from '../../types';
import { useAuth } from '../../context/AuthContext';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonTable, SkeletonStatCard } from '../../components/ui/SkeletonLoader';
import { useApiError } from '../../hooks/useApiError';
import { useToast } from '../../context/ToastContext';

const DISEASE_COLORS: Record<string, string> = {
  Healthy: '#16a34a', Flacherie: '#dc2626', Grasserie: '#d97706',
  Muscardine: '#7c3aed', Pebrine: '#0284c7',
};
const gc = (r: string) => DISEASE_COLORS[r] ?? '#6b7280';

function todayStr()    { return new Date().toISOString().slice(0, 10); }
function monthAgoStr() { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); }

function ConfidencePill({ value }: { value: number }) {
  const pct   = Math.round(value * 100);
  const color = pct >= 80 ? '#16a34a' : pct >= 55 ? '#d97706' : '#dc2626';
  return (
    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '9999px', background: color + '18', color }}>
      {pct}%
    </span>
  );
}

export default function DetectionReportsPage() {
  const { user: me }   = useAuth();
  const { getErrorMessage } = useApiError();
  const { error: showError } = useToast();

  const [farms,    setFarms]    = useState<Farm[]>([]);
  const [farmId,   setFarmId]   = useState('');
  const [dateFrom, setDateFrom] = useState(monthAgoStr());
  const [dateTo,   setDateTo]   = useState(todayStr());
  const [history,  setHistory]  = useState<DetectionHistoryItem[]>([]);
  const [stats,    setStats]    = useState<DetectionStat[]>([]);
  const [loadingH, setLoadingH] = useState(true);
  const [loadingS, setLoadingS] = useState(true);

  useEffect(() => {
    if (me?.role !== 'FARMER') {
      farmService.getAll().then(r => setFarms(r.data.data)).catch(() => {});
    }
  }, [me]);

  const fetchData = useCallback(() => {
    const params = { farmId: farmId || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined };
    setLoadingH(true); setLoadingS(true);

    detectionReportService.getHistory({ ...params, limit: 200 })
      .then(r => setHistory(r.data.data))
      .catch(e => showError(getErrorMessage(e)))
      .finally(() => setLoadingH(false));

    detectionReportService.getStats(params)
      .then(r => setStats(r.data.data))
      .catch(() => {})
      .finally(() => setLoadingS(false));
  }, [farmId, dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalDetections = history.length;
  const healthyCount    = history.filter(h => h.result === 'Healthy').length;
  const diseaseCount    = totalDetections - healthyCount;

  const backPath = me?.role === 'ADMIN' ? '/admin' : me?.role === 'SUPERVISOR' ? '/supervisor' : '/farmer';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Detection Reports</h1>
          <p className="page-subtitle">Disease detection history and frequency analysis</p>
        </div>
        <Link to={backPath} className="btn btn-secondary btn-sm">← Back</Link>
      </div>

      {/* Filters */}
      <motion.div className="card" style={{ marginBottom: '1.5rem', padding: '1.125rem 1.5rem' }}
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <p style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: '0.875rem' }}>Filters</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.875rem', alignItems: 'flex-end' }}>
          {me?.role !== 'FARMER' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-2)' }}>Farm</label>
              <select value={farmId} onChange={e => setFarmId(e.target.value)} className="form-select" style={{ minWidth: 160, height: 36 }}>
                <option value="">All farms</option>
                {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          )}
          {[
            { label: 'From', val: dateFrom, set: setDateFrom },
            { label: 'To',   val: dateTo,   set: setDateTo },
          ].map(f => (
            <div key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-2)' }}>{f.label}</label>
              <input type="date" value={f.val} onChange={e => f.set(e.target.value)} className="form-input" style={{ height: 36, width: 150 }} />
            </div>
          ))}
          <button className="btn btn-primary btn-sm" onClick={fetchData} style={{ height: 36 }}>Apply</button>
          <button className="btn btn-secondary btn-sm" onClick={() => { setFarmId(''); setDateFrom(monthAgoStr()); setDateTo(todayStr()); }} style={{ height: 36 }}>Reset</button>
        </div>
      </motion.div>

      {/* Summary cards */}
      <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Detections', val: totalDetections, color: '#2563eb', bg: '#eff6ff'  },
          { label: 'Healthy',          val: healthyCount,    color: '#16a34a', bg: '#f0fdf4'  },
          { label: 'Diseased',         val: diseaseCount,    color: '#dc2626', bg: '#fef2f2'  },
        ].map((c, i) => (
          loadingH ? <SkeletonStatCard key={i} /> : (
            <motion.div key={c.label} className="stat-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.35 }} style={{ borderTop: `3px solid ${c.color}` }}>
              <p style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-faint)', marginBottom: '0.4rem' }}>{c.label}</p>
              <p style={{ fontSize: '2rem', fontWeight: 800, color: c.color, lineHeight: 1 }}>{c.val}</p>
            </motion.div>
          )
        ))}
      </div>

      {/* Chart + breakdown */}
      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
        {/* Bar chart */}
        <motion.div className="chart-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22, duration: 0.35 }}>
          <p className="chart-title">Detection Frequency by Disease</p>
          <p className="chart-subtitle">Selected date range</p>
          {loadingS ? (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)' }}>Loading…</div>
          ) : stats.length === 0 ? (
            <div style={{ height: 220 }}>
              <EmptyState icon="📊" title="No data" description="No detections in the selected range." />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats} margin={{ top: 4, right: 4, left: -16, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                <XAxis dataKey="result" tick={{ fontSize: 11, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.78rem', boxShadow: 'var(--shadow-md)' }}
                  formatter={v => [v, 'Detections']} />
                <Bar dataKey="count" name="Count" radius={[5, 5, 0, 0]}>
                  {stats.map(e => <Cell key={e.result} fill={gc(e.result)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        {/* Breakdown */}
        <motion.div className="chart-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28, duration: 0.35 }}>
          <p className="chart-title">Disease Breakdown</p>
          <p className="chart-subtitle">Proportion of each class</p>
          {loadingS ? (
            <div style={{ color: 'var(--text-faint)', padding: '3rem 0', textAlign: 'center' }}>Loading…</div>
          ) : stats.length === 0 ? (
            <EmptyState icon="🔬" title="No detections" description="No data for the selected range." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingTop: '0.25rem' }}>
              {stats.map(s => {
                const total = stats.reduce((a, b) => a + b.count, 0);
                const pct   = total > 0 ? Math.round((s.count / total) * 100) : 0;
                const col   = gc(s.result);
                return (
                  <div key={s.result}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: col }}>{s.result}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.count} ({pct}%)</span>
                    </div>
                    <div className="progress-bar">
                      <motion.div className="progress-fill" style={{ background: col }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>

      {/* History table */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.34, duration: 0.35 }}>
        <div className="table-container">
          <div className="table-header">
            <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>Detection History ({history.length})</p>
          </div>
          {loadingH ? (
            <SkeletonTable rows={6} cols={5} />
          ) : history.length === 0 ? (
            <EmptyState icon="📋" title="No detections found" description="No records match the selected filters." />
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr><th>Farm</th><th>Batch</th><th>Result</th><th>Confidence</th><th>Date</th><th>Notes</th></tr>
                </thead>
                <tbody>
                  {history.map((d, i) => (
                    <motion.tr key={d.id} className="tbody-row"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                      <td style={{ fontWeight: 500, fontSize: '0.82rem' }}>
                        {d.farmId
                          ? <Link to={`/farms/${d.farmId}`} style={{ color: 'var(--primary)' }}>{d.farmName}</Link>
                          : <span style={{ color: 'var(--text-faint)' }}>—</span>
                        }
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-faint)' }}>
                        <Link to={`/batches/${d.batchId}`} style={{ color: 'var(--text-faint)' }}>#{d.batchId.slice(-8)}</Link>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.18rem 0.55rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 700, background: gc(d.result) + '18', color: gc(d.result) }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: gc(d.result) }} />
                          {d.result}
                        </span>
                      </td>
                      <td><ConfidencePill value={d.confidence} /></td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                        {new Date(d.detectedAt).toLocaleDateString()}{' '}
                        {new Date(d.detectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.notes ?? <span style={{ color: 'var(--text-faint)' }}>—</span>}
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
