import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { harvestService } from '../../services/harvest.service';
import { HarvestRecord, QualityGrade } from '../../types';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';

const GRADE_META: Record<QualityGrade, { label: string; color: string; bg: string }> = {
  A: { label: 'Grade A', color: '#16a34a', bg: '#f0fdf4' },
  B: { label: 'Grade B', color: '#d97706', bg: '#fef3c7' },
  C: { label: 'Grade C', color: '#dc2626', bg: '#fef2f2' },
};

export default function HarvestsPage() {
  const { error: showError } = useToast();
  const { getErrorMessage }  = useApiError();
  const [records, setRecords] = useState<HarvestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');

  useEffect(() => {
    harvestService.getAll()
      .then(r => setRecords(r.data.data))
      .catch(e => showError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  // Stats
  const totalKg   = records.reduce((s, r) => s + Number(r.cocoonWeightKg), 0);
  const totalSilk = records.reduce((s, r) => s + Number(r.silkYieldG ?? 0), 0);
  const avgKg     = records.length > 0 ? totalKg / records.length : 0;

  // Grade pie
  const gradeData = (['A', 'B', 'C'] as QualityGrade[]).map(g => ({
    name: GRADE_META[g].label,
    value: records.filter(r => r.qualityGrade === g).length,
    color: GRADE_META[g].color,
  })).filter(d => d.value > 0);

  // Weight by farm bar chart
  const weightByFarm = records.reduce<Record<string, number>>((acc, r) => {
    const key = r.farmName ?? `Batch ${r.batchId.slice(-6).toUpperCase()}`;
    acc[key] = (acc[key] || 0) + Number(r.cocoonWeightKg);
    return acc;
  }, {});
  const farmChartData = Object.entries(weightByFarm)
    .map(([farm, kg]) => ({ farm, kg: parseFloat(kg.toFixed(2)) }))
    .sort((a, b) => b.kg - a.kg)
    .slice(0, 8);

  // Filtered list
  const filtered = records.filter(r => {
    const q = search.toLowerCase();
    return (
      (r.farmName ?? '').toLowerCase().includes(q) ||
      r.qualityGrade.toLowerCase().includes(q) ||
      (r.notes ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Harvest Records</h1>
          <p className="page-subtitle">{records.length} record{records.length !== 1 ? 's' : ''} across all batches</p>
        </div>
      </div>

      {loading ? (
        <SkeletonTable rows={5} cols={6} />
      ) : records.length === 0 ? (
        <div className="table-container">
          <EmptyState
            icon={
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22V12M3.5 8.5C3.5 5.46 6.46 3 10 3c2.12 0 4 .9 5.28 2.33A6.5 6.5 0 0 1 21 11.5c0 3.58-2.91 6.5-6.5 6.5H5a1.5 1.5 0 0 1 0-3"/>
              </svg>
            }
            title="No harvest records yet"
            description="Harvest records will appear here once batches reach the harvest stage."
          />
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
            {[
              { label: 'Total Records',    value: records.length,                  unit: '',    color: '#2563eb', bg: '#eff6ff' },
              { label: 'Total Cocoon',     value: parseFloat(totalKg.toFixed(2)),  unit: ' kg', color: '#16a34a', bg: '#f0fdf4' },
              { label: 'Total Silk Yield', value: parseFloat(totalSilk.toFixed(1)), unit: ' g', color: '#7c3aed', bg: '#f3e8ff' },
              { label: 'Avg per Record',   value: parseFloat(avgKg.toFixed(2)),    unit: ' kg', color: '#d97706', bg: '#fef3c7' },
            ].map((s, i) => (
              <motion.div key={s.label} className="stat-card"
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
                <div className="stat-card-glow" style={{ background: s.color }} />
                <p style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: '0.6rem' }}>{s.label}</p>
                <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em' }}>
                  {s.value}<span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-muted)' }}>{s.unit}</span>
                </p>
              </motion.div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
            {/* Weight by farm */}
            <motion.div className="chart-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.35 }}>
              <p className="chart-title">Cocoon Weight by Farm</p>
              <p className="chart-subtitle">kg total per farm</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={farmChartData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                  <XAxis dataKey="farm" tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.78rem', boxShadow: 'var(--shadow-md)' }}
                    formatter={v => [`${v} kg`, 'Cocoon Weight']}
                  />
                  <Bar dataKey="kg" radius={[5, 5, 0, 0]} fill="#16a34a" />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Grade distribution */}
            <motion.div className="chart-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.33, duration: 0.35 }}>
              <p className="chart-title">Quality Grade Distribution</p>
              <p className="chart-subtitle">All records by grade</p>
              {gradeData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={gradeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} paddingAngle={3}
                      label={({ name, percent }: any) => `${name ?? ''} ${Math.round((percent ?? 0) * 100)}%`}
                      labelLine={{ stroke: 'var(--text-faint)' }}>
                      {gradeData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.75rem' }} />
                    <Tooltip formatter={v => [v, 'Records']} contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.78rem' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: '0.8rem' }}>No data</div>
              )}
            </motion.div>
          </div>

          {/* Records table */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.35 }}>
            <div className="table-container">
              <div className="table-header">
                <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>All Records ({filtered.length})</p>
                <div style={{ maxWidth: 280 }}>
                  <div className="input-wrapper">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="input-icon-left"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input className="form-input has-left" placeholder="Search records…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingBlock: '0.4rem' }} />
                  </div>
                </div>
              </div>

              {filtered.length === 0 ? (
                <EmptyState
                  icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>}
                  title="No results"
                  description={`No records match "${search}"`}
                  action={{ label: 'Clear search', onClick: () => setSearch('') }}
                />
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Farm</th>
                        <th>Cocoon (kg)</th>
                        <th>Silk (g)</th>
                        <th>Grade</th>
                        <th>Notes</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r, i) => {
                        const gm = GRADE_META[r.qualityGrade];
                        return (
                          <motion.tr key={r.id} className="tbody-row"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}>
                            <td style={{ fontSize: '0.78rem', color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                              {new Date(r.harvestedAt).toLocaleDateString()}
                            </td>
                            <td style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                              {r.farmName ?? <span style={{ color: 'var(--text-faint)' }}>—</span>}
                            </td>
                            <td style={{ fontWeight: 700, color: '#16a34a' }}>{r.cocoonWeightKg} kg</td>
                            <td style={{ fontWeight: 600, color: '#7c3aed' }}>
                              {r.silkYieldG != null ? `${r.silkYieldG} g` : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                            </td>
                            <td>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.55rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 700, background: gm.bg, color: gm.color }}>
                                {gm.label}
                              </span>
                            </td>
                            <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.notes ?? <span style={{ color: 'var(--text-faint)' }}>—</span>}
                            </td>
                            <td>
                              {r.farmId && (
                                <Link
                                  to={`/batches/${r.batchId}/harvest`}
                                  className="btn btn-ghost btn-xs"
                                  style={{ whiteSpace: 'nowrap' }}
                                >
                                  View Batch →
                                </Link>
                              )}
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
