import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { reportService, ReportSummary } from '../../services/admin.service';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';

const STAGE_COLORS: Record<string, string> = {
  EGG: '#a3e635', LARVA: '#34d399', PUPA: '#60a5fa',
  COCOON: '#f59e0b', HARVEST: '#f97316',
};
const GRADE_COLORS: Record<string, string> = { A: '#16a34a', B: '#2563eb', C: '#d97706' };
const ACTION_COLORS: Record<string, string> = {
  CREATE: '#16a34a', UPDATE: '#2563eb', DELETE: '#dc2626',
  LOGIN: '#7c3aed', LOGOUT: '#d97706', OTHER: '#6b7280',
};
const RESULT_COLORS = ['#dc2626', '#16a34a', '#d97706', '#2563eb', '#7c3aed', '#6b7280'];

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem 1.5rem' }}>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.375rem' }}>{label}</p>
      <p style={{ fontSize: '1.9rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.5rem' }}>
      <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)', marginBottom: '1.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</h3>
      {children}
    </div>
  );
}

export default function AdminReportsPage() {
  const [data,      setData]      = useState<ReportSummary | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();
  const { t }     = useLanguage();
  const printRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    reportService.getSummary()
      .then(res => setData(res.data.data))
      .catch(() => toast('Failed to load report data.', 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  const handlePrintPdf = () => window.print();

  const handleCsvExport = async () => {
    setExporting(true);
    try {
      await reportService.exportCsv();
    } catch {
      toast('CSV export failed.', 'error');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
      </div>
    );
  }

  if (!data) return null;

  const { users, farms, batches, harvests, detections, audit, topFarmers } = data;

  return (
    <>
      {/* Print-only header */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-page { padding: 0 !important; }
          body { background: white !important; }
          .recharts-wrapper { break-inside: avoid; }
        }
      `}</style>

      <motion.div
        ref={printRef}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        style={{ maxWidth: 1100, margin: '0 auto' }}
        className="print-page"
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: '0.25rem' }}>
              {t('reportTitle')}
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {t('reportGenerated')} {new Date(data.generatedAt).toLocaleString()}
            </p>
          </div>
          <div className="no-print" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={handlePrintPdf}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 1rem', borderRadius: 10, border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              {t('reportExportPdf')}
            </button>
            <button
              onClick={handleCsvExport}
              disabled={exporting}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 1rem', borderRadius: 10, border: 'none', background: 'var(--brand-600)', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
            >
              {exporting ? <><span className="spinner" />{t('reportExporting')}</> : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  {t('reportExportCsv')}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Summary stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <StatCard label={t('reportTotalUsers')}      value={users.total} sub={`${users.byRole.find(r => r.role === 'FARMER')?.count ?? 0} farmers`} />
          <StatCard label={t('reportTotalFarms')}      value={farms.total} />
          <StatCard label={t('reportTotalBatches')}    value={batches.total} />
          <StatCard label={t('reportTotalHarvests')}   value={harvests.total} sub={`${harvests.totalKg.toFixed(1)} kg total`} />
          <StatCard label={t('reportTotalDetections')} value={detections.total} />
        </div>

        {/* Charts row 1 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>

          {/* Registrations bar chart */}
          <ChartCard title={t('reportRegistrations30d')}>
            {users.registrations30d.length === 0 ? (
              <p style={{ color: 'var(--text-faint)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>No registrations in the last 30 days.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={users.registrations30d} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip formatter={(v) => [v, 'Users']} labelFormatter={l => `Date: ${l}`} />
                  <Bar dataKey="count" fill="#16a34a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Batches by stage pie */}
          <ChartCard title={t('reportBatchesByStage')}>
            {batches.byStage.length === 0 ? (
              <p style={{ color: 'var(--text-faint)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>No active batches.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={batches.byStage} dataKey="count" nameKey="stage" cx="50%" cy="50%" outerRadius={75} label={({ stage, count }) => `${stage} (${count})`} labelLine={false}>
                    {batches.byStage.map(entry => (
                      <Cell key={entry.stage} fill={STAGE_COLORS[entry.stage] ?? '#94a3b8'} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip formatter={(v, n) => [v, n]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* Charts row 2 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>

          {/* Detections over time */}
          <ChartCard title={t('reportDetections30d')}>
            {detections.detections30d.length === 0 ? (
              <p style={{ color: 'var(--text-faint)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>No detections in the last 30 days.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={detections.detections30d} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip formatter={(v) => [v, 'Detections']} />
                  <Bar dataKey="count" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Detection results pie */}
          <ChartCard title={t('reportDetectionResults')}>
            {detections.byResult.length === 0 ? (
              <p style={{ color: 'var(--text-faint)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>No detections yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={detections.byResult} dataKey="count" nameKey="result" cx="50%" cy="50%" outerRadius={75}>
                    {detections.byResult.map((entry, i) => (
                      <Cell key={entry.result} fill={RESULT_COLORS[i % RESULT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip formatter={(v, n) => [v, n]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* Charts row 3 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>

          {/* Harvest by grade bar */}
          <ChartCard title={t('reportHarvestByGrade')}>
            {harvests.byGrade.length === 0 ? (
              <p style={{ color: 'var(--text-faint)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>No harvest records.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={harvests.byGrade} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="grade" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v, n) => [n === 'totalKg' ? `${v} kg` : v, n === 'totalKg' ? 'Total weight' : 'Records']} />
                  <Bar dataKey="count" name="Records" radius={[4, 4, 0, 0]}>
                    {harvests.byGrade.map(entry => (
                      <Cell key={entry.grade} fill={GRADE_COLORS[entry.grade] ?? '#94a3b8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Audit actions pie */}
          <ChartCard title={t('reportAuditActions')}>
            {audit.actions30d.length === 0 ? (
              <p style={{ color: 'var(--text-faint)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>No audit events in the last 30 days.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={audit.actions30d} dataKey="count" nameKey="action" cx="50%" cy="50%" outerRadius={75}>
                    {audit.actions30d.map(entry => (
                      <Cell key={entry.action} fill={ACTION_COLORS[entry.action] ?? '#94a3b8'} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip formatter={(v, n) => [v, n]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* Top Farmers table */}
        {topFarmers.length > 0 && (
          <ChartCard title={t('reportTopFarmers')}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid var(--border)' }}>
                  {['#', 'Name', 'Email', 'Farms'].map(h => (
                    <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-faint)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topFarmers.map((f, i) => (
                  <tr key={f.email} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)' }}>
                    <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-faint)', fontWeight: 700 }}>{i + 1}</td>
                    <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text)', fontWeight: 600 }}>{f.name}</td>
                    <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)' }}>{f.email}</td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <span style={{ fontWeight: 700, color: 'var(--brand-600)' }}>{f.farmCount}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ChartCard>
        )}

        {/* Harvest summary numbers */}
        <div style={{ marginTop: '1.25rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
          <StatCard label={t('reportTotalCocoonKg')}  value={`${harvests.totalKg.toFixed(1)} kg`} />
          <StatCard label={t('reportTotalSilkG')}     value={`${harvests.totalSilkG.toFixed(0)} g`} />
          <StatCard label={t('reportAvgCocoonKg')}    value={`${harvests.avgKg.toFixed(2)} kg`} />
          <StatCard label={t('reportUsersByRole')}    value={users.byRole.map(r => `${r.role}: ${r.count}`).join(' · ')} />
        </div>
      </motion.div>
    </>
  );
}
