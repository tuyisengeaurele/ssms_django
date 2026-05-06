import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts';
import { detectionReportService, DetectionHistoryItem, DetectionStat } from '../../services/admin.service';
import { farmService } from '../../services/farm.service';
import { Farm } from '../../types';
import Navbar from '../../components/ui/Navbar';
import { useApiError } from '../../hooks/useApiError';
import { useAuth } from '../../context/AuthContext';

// ── disease colour palette ────────────────────────────────────────────────────
const DISEASE_COLORS: Record<string, string> = {
  Healthy:     '#16a34a',
  Flacherie:   '#dc2626',
  Grasserie:   '#d97706',
  Muscardine:  '#7c3aed',
  Pebrine:     '#0284c7',
};

function getColor(result: string) {
  return DISEASE_COLORS[result] ?? '#6b7280';
}

// ── confidence pill ───────────────────────────────────────────────────────────
function ConfidencePill({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? '#16a34a' : pct >= 55 ? '#d97706' : '#dc2626';
  return (
    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '9999px', background: `${color}18`, color }}>
      {pct}%
    </span>
  );
}

// ── today helper ──────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }
function monthAgoStr() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────

export default function DetectionReportsPage() {
  const { user: me } = useAuth();
  const { getErrorMessage } = useApiError();

  // farms dropdown
  const [farms, setFarms]   = useState<Farm[]>([]);

  // filters
  const [farmId, setFarmId]     = useState('');
  const [dateFrom, setDateFrom] = useState(monthAgoStr());
  const [dateTo, setDateTo]     = useState(todayStr());

  // data
  const [history, setHistory]   = useState<DetectionHistoryItem[]>([]);
  const [stats, setStats]       = useState<DetectionStat[]>([]);
  const [loadingH, setLoadingH] = useState(true);
  const [loadingS, setLoadingS] = useState(true);
  const [error, setError]       = useState('');

  // load farms for filter dropdown (SUPERVISOR/ADMIN only)
  useEffect(() => {
    if (me?.role !== 'FARMER') {
      farmService.getAll()
        .then(r => setFarms(r.data.data))
        .catch(() => {});
    }
  }, [me]);

  const fetchData = useCallback(() => {
    setLoadingH(true);
    setLoadingS(true);
    setError('');

    const params = {
      farmId:   farmId   || undefined,
      dateFrom: dateFrom || undefined,
      dateTo:   dateTo   || undefined,
    };

    detectionReportService.getHistory({ ...params, limit: 200 })
      .then(r => setHistory(r.data.data))
      .catch(e => setError(getErrorMessage(e)))
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

  const inputStyle: React.CSSProperties = {
    padding: '0.55rem 0.8rem', border: '1px solid #e5e7eb', borderRadius: '8px',
    fontSize: '0.85rem', background: '#fff', outline: 'none',
  };

  const backPath = me?.role === 'ADMIN'
    ? '/admin'
    : me?.role === 'SUPERVISOR'
    ? '/supervisor'
    : '/farmer';

  return (
    <>
      <Navbar />

      <div className="container page" style={{ maxWidth: '1100px' }}>

        {/* header */}
        <div className="anim-in flex-between" style={{ marginBottom: '1.75rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Detection Reports</h1>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.2rem' }}>
              Disease detection history and frequency analysis
            </p>
          </div>
          <Link to={backPath} className="btn btn-secondary btn-sm">← Back</Link>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

        {/* filters */}
        <div className="anim-in" style={{ animationDelay: '40ms', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.25rem 1.5rem', marginBottom: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
          <p style={{ fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', marginBottom: '1rem' }}>Filters</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.875rem', alignItems: 'flex-end' }}>

            {/* farm dropdown — supervisors/admins only */}
            {me?.role !== 'FARMER' && (
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem', color: '#374151' }}>Farm</label>
                <select value={farmId} onChange={e => setFarmId(e.target.value)} style={{ ...inputStyle, minWidth: '160px' }}>
                  <option value="">All farms</option>
                  {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
            )}

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem', color: '#374151' }}>From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem', color: '#374151' }}>To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
            </div>

            <button className="btn btn-primary btn-sm" onClick={fetchData} style={{ height: '36px', alignSelf: 'flex-end' }}>
              Apply
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setFarmId(''); setDateFrom(monthAgoStr()); setDateTo(todayStr()); }} style={{ height: '36px', alignSelf: 'flex-end' }}>
              Reset
            </button>
          </div>
        </div>

        {/* summary cards */}
        <div className="grid-3 anim-in" style={{ animationDelay: '80ms', marginBottom: '1.5rem' }}>
          {[
            { label: 'Total Detections', value: totalDetections, color: '#2563eb' },
            { label: 'Healthy',          value: healthyCount,    color: '#16a34a' },
            { label: 'Diseased',         value: diseaseCount,    color: '#dc2626' },
          ].map(c => (
            <div key={c.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1rem 1.25rem', borderTop: `3px solid ${c.color}`, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
              <p style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280' }}>{c.label}</p>
              <p style={{ fontSize: '1.75rem', fontWeight: 800, color: c.color, marginTop: '0.2rem' }}>
                {loadingH ? '—' : c.value}
              </p>
            </div>
          ))}
        </div>

        {/* chart + history side by side on wide screens */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }} className="anim-in">

          {/* Frequency bar chart */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
            <p style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '1rem' }}>Detection Frequency by Disease</p>
            {loadingS ? (
              <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>Loading…</div>
            ) : stats.length === 0 ? (
              <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats} margin={{ top: 4, right: 12, left: -10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="result" tick={{ fontSize: 11, fill: '#6b7280' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}
                    formatter={(v) => [v, 'Detections']}
                  />
                  <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                  <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]}>
                    {stats.map((entry) => (
                      <Cell key={entry.result} fill={getColor(entry.result)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Disease breakdown list */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
            <p style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '1rem' }}>Disease Breakdown</p>
            {loadingS ? (
              <div style={{ color: '#9ca3af', textAlign: 'center', padding: '3rem 0' }}>Loading…</div>
            ) : stats.length === 0 ? (
              <div style={{ color: '#9ca3af', textAlign: 'center', padding: '3rem 0' }}>No detections in range</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {stats.map(s => {
                  const total = stats.reduce((a, b) => a + b.count, 0);
                  const pct   = total > 0 ? Math.round((s.count / total) * 100) : 0;
                  const col   = getColor(s.result);
                  return (
                    <div key={s.result}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: col }}>{s.result}</span>
                        <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>{s.count} ({pct}%)</span>
                      </div>
                      <div style={{ background: '#f3f4f6', borderRadius: '9999px', height: '6px', overflow: 'hidden' }}>
                        <div style={{ background: col, width: `${pct}%`, height: '100%', borderRadius: '9999px', transition: 'width 0.6s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* history table */}
        <div className="anim-in" style={{ animationDelay: '160ms', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,.07)', overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>Detection History ({history.length})</p>
          </div>

          {loadingH ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>Loading…</div>
          ) : history.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>No detections found for the selected filters.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Farm', 'Batch', 'Result', 'Confidence', 'Date', 'Notes'].map(h => (
                      <th key={h} style={{ padding: '0.65rem 1rem', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', fontWeight: 600, background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map(d => (
                    <tr key={d.id}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      style={{ transition: 'background 0.12s' }}
                    >
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.82rem', fontWeight: 500 }}>
                        {d.farmId ? (
                          <Link to={`/farms/${d.farmId}`} style={{ color: '#2563eb', textDecoration: 'none' }}>{d.farmName}</Link>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: '#6b7280', fontFamily: 'monospace' }}>
                        <Link to={`/batches/${d.batchId}`} style={{ color: '#6b7280', textDecoration: 'none' }}>
                          {d.batchId.slice(-8)}
                        </Link>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '9999px', background: `${getColor(d.result)}18`, color: getColor(d.result) }}>
                          {d.result}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <ConfidencePill value={d.confidence} />
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: '#9ca3af' }}>
                        {new Date(d.detectedAt).toLocaleDateString()} {new Date(d.detectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: '#6b7280', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.notes ?? <span style={{ color: '#d1d5db' }}>—</span>}
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
