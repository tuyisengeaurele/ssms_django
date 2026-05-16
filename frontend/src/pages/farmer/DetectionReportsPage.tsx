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

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  bg: string;
  delay: number;
}
function StatCard({ icon, label, value, color, bg, delay }: StatCardProps) {
  const count = useCountUp(value);
  return (
    <motion.div className="stat-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
      <div className="stat-card-glow" style={{ background: color }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: '0.75rem' }}>{label}</p>
          <p style={{ fontSize: '2.1rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em', lineHeight: 1 }}>{count}</p>
        </div>
        <div className="stat-card-icon" style={{ background: bg }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {icon}
          </svg>
        </div>
      </div>
      <div style={{ marginTop: '1rem', height: 3, borderRadius: 2, background: `linear-gradient(90deg, ${color}60, ${color}10)` }} />
    </motion.div>
  );
}

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

  const [farms,       setFarms]       = useState<Farm[]>([]);
  const [farmId,      setFarmId]      = useState('');
  const [dateFrom,    setDateFrom]    = useState(monthAgoStr());
  const [dateTo,      setDateTo]      = useState(todayStr());
  const [history,     setHistory]     = useState<DetectionHistoryItem[]>([]);
  const [stats,       setStats]       = useState<DetectionStat[]>([]);
  const [loadingH,    setLoadingH]    = useState(true);
  const [loadingS,    setLoadingS]    = useState(true);
  const [exporting,   setExporting]   = useState(false);

  useEffect(() => {
    if (me?.role !== 'FARMER') {
      farmService.getAll().then(r => setFarms(r.data.data)).catch(() => {});
    }
  }, [me]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await detectionReportService.exportCsv({
        farmId: farmId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        limit: 500,
      });
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setExporting(false);
    }
  };

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
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleExport}
            disabled={exporting || loadingH}
            title="Export filtered results as CSV"
          >
            {exporting ? (
              <><span className="spinner" />Exporting…</>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Export CSV
              </>
            )}
          </button>
          <Link to={backPath} className="btn btn-secondary btn-sm">← Back</Link>
        </div>
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
        {loadingH ? (
          [0,1,2].map(i => <SkeletonStatCard key={i} />)
        ) : (
          <>
            <StatCard
              label="Total Detections" value={totalDetections} color="#2563eb" bg="#eff6ff" delay={0}
              icon={<><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>}
            />
            <StatCard
              label="Healthy" value={healthyCount} color="#16a34a" bg="#f0fdf4" delay={0.07}
              icon={<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>}
            />
            <StatCard
              label="Diseased" value={diseaseCount} color="#dc2626" bg="#fef2f2" delay={0.14}
              icon={<><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>}
            />
          </>
        )}
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
              <EmptyState icon={<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>} title="No data" description="No detections in the selected range." />
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
            <EmptyState icon={<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>} title="No detections" description="No data for the selected range." />
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
            <EmptyState icon={<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>} title="No detections found" description="No records match the selected filters." />
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
