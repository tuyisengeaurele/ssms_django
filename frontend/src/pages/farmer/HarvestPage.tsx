import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';
import { harvestService } from '../../services/harvest.service';
import { batchService } from '../../services/batch.service';
import { HarvestRecord, Batch, QualityGrade } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import { useLanguage } from '../../context/LanguageContext';

const GRADE_META: Record<QualityGrade, { label: string; color: string; bg: string }> = {
  A: { label: 'Grade A', color: '#16a34a', bg: '#f0fdf4' },
  B: { label: 'Grade B', color: '#d97706', bg: '#fef3c7' },
  C: { label: 'Grade C', color: '#dc2626', bg: '#fef2f2' },
};

const INIT_FORM = { cocoonWeightKg: '', silkYieldG: '', qualityGrade: 'A' as QualityGrade, notes: '' };

export default function HarvestPage() {
  const { id: batchId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { success, error: showError } = useToast();
  const { t } = useLanguage();
  const { getErrorMessage } = useApiError();

  const [batch,   setBatch]   = useState<Batch | null>(null);
  const [records, setRecords] = useState<HarvestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form,    setForm]    = useState(INIT_FORM);
  const [saving,  setSaving]  = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const canEdit = user?.role === 'FARMER' || user?.role === 'ADMIN';

  useEffect(() => {
    if (!batchId) return;
    Promise.all([
      batchService.getById(batchId),
      harvestService.getByBatch(batchId),
    ])
      .then(([bRes, hRes]) => { setBatch(bRes.data.data); setRecords(hRes.data.data); })
      .catch(e => showError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [batchId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchId) return;
    setSaving(true);
    try {
      const res = await harvestService.create(batchId, {
        cocoonWeightKg: parseFloat(form.cocoonWeightKg),
        silkYieldG: form.silkYieldG ? parseFloat(form.silkYieldG) : null,
        qualityGrade: form.qualityGrade,
        notes: form.notes || undefined,
      });
      setRecords(prev => [res.data.data, ...prev]);
      setShowAdd(false);
      setForm(INIT_FORM);
      success('Harvest record saved.');
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await harvestService.delete(id);
      setRecords(prev => prev.filter(r => r.id !== id));
      success('Record deleted.');
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setDeleting(null);
    }
  };

  // Django serializes DecimalField as strings for JSON precision — always coerce to Number.
  const toNum = (v: unknown) => Number(v) || 0;

  // Chart data
  const weightByDate = records.reduce<Record<string, number>>((acc, r) => {
    const d = r.harvestedAt.slice(0, 10);
    acc[d] = (acc[d] || 0) + toNum(r.cocoonWeightKg);
    return acc;
  }, {});
  const weightChartData = Object.entries(weightByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, kg]) => ({ date: date.slice(5), kg: parseFloat(kg.toFixed(2)) }));

  const gradeData = (['A', 'B', 'C'] as QualityGrade[]).map(g => ({
    name: GRADE_META[g].label,
    value: records.filter(r => r.qualityGrade === g).length,
    color: GRADE_META[g].color,
  })).filter(d => d.value > 0);

  const totalKg   = records.reduce((s, r) => s + toNum(r.cocoonWeightKg), 0);
  const totalSilk = records.reduce((s, r) => s + toNum(r.silkYieldG), 0);

  if (loading) return <div><SkeletonTable rows={4} cols={5} /></div>;

  return (
    <div>
      {/* Add Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={t('harvestLogRecord')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn btn-primary" form="harvest-form" type="submit" disabled={saving}>
              {saving ? <><span className="spinner" />Saving…</> : t('harvestSaveRecord')}
            </button>
          </>
        }
      >
        <form id="harvest-form" onSubmit={handleAdd}>
          <div className="form-group">
            <label className="form-label">{t('labelCocoonWeight')} *</label>
            <input type="number" step="0.01" min="0.01" required className="form-input"
              value={form.cocoonWeightKg}
              onChange={e => setForm(f => ({ ...f, cocoonWeightKg: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('labelSilkYield')} <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>optional</span></label>
            <input type="number" step="0.01" min="0" className="form-input"
              value={form.silkYieldG}
              onChange={e => setForm(f => ({ ...f, silkYieldG: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('labelQualityGrade')} *</label>
            <select className="form-input" value={form.qualityGrade}
              onChange={e => setForm(f => ({ ...f, qualityGrade: e.target.value as QualityGrade }))}>
              <option value="A">{t('harvestGradeA')}</option>
              <option value="B">{t('harvestGradeB')}</option>
              <option value="C">{t('harvestGradeC')}</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Notes <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>optional</span></label>
            <textarea className="form-input" rows={3} style={{ resize: 'vertical' }}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </form>
      </Modal>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('pageTitleHarvest')}</h1>
          <p className="page-subtitle">
            Batch #{batchId?.slice(-8).toUpperCase()} · {batch?.farm?.name ?? '…'}
          </p>
        </div>
        <div className="page-actions">
          {canEdit && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
              + Log Harvest
            </button>
          )}
          <Link to={`/batches/${batchId}`} className="btn btn-ghost btn-sm">← Batch</Link>
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
        {[
          { label: t('harvestTotalRecords'), value: records.length,                         unit: '',    color: '#2563eb', bg: '#eff6ff' },
          { label: t('harvestTotalCocoon'),  value: parseFloat(totalKg.toFixed(2)),         unit: ' kg', color: '#16a34a', bg: '#f0fdf4' },
          { label: t('harvestTotalSilk'),    value: parseFloat(totalSilk.toFixed(1)),       unit: ' g',  color: '#7c3aed', bg: '#f3e8ff' },
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

      {records.length > 0 && (
        <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
          {/* Weight over time */}
          <motion.div className="chart-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22, duration: 0.35 }}>
            <p className="chart-title">Cocoon Weight per Harvest Day</p>
            <p className="chart-subtitle">kg</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weightChartData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} />
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
          <motion.div className="chart-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.35 }}>
            <p className="chart-title">Quality Grade Distribution</p>
            <p className="chart-subtitle">Records by grade</p>
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
          </motion.div>
        </div>
      )}

      {/* Records table */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38, duration: 0.35 }}>
        <div className="table-container">
          <div className="table-header">
            <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>Records ({records.length})</p>
          </div>
          {records.length === 0 ? (
            <EmptyState
              icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22V12M3.5 8.5C3.5 5.46 6.46 3 10 3c2.12 0 4 .9 5.28 2.33A6.5 6.5 0 0 1 21 11.5c0 3.58-2.91 6.5-6.5 6.5H5a1.5 1.5 0 0 1 0-3"/></svg>}
              title="No harvest records"
              description="Log your first harvest to track cocoon yield and silk production."
              action={canEdit ? { label: '+ Log Harvest', onClick: () => setShowAdd(true) } : undefined}
            />
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Cocoon (kg)</th>
                    <th>Silk (g)</th>
                    <th>Grade</th>
                    <th>Notes</th>
                    {canEdit && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => {
                    const gm = GRADE_META[r.qualityGrade];
                    return (
                      <motion.tr key={r.id} className="tbody-row"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                        <td style={{ fontSize: '0.78rem', color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                          {new Date(r.harvestedAt).toLocaleDateString()}
                        </td>
                        <td style={{ fontWeight: 700, color: '#16a34a' }}>{toNum(r.cocoonWeightKg).toFixed(2)} kg</td>
                        <td style={{ fontWeight: 600, color: '#7c3aed' }}>{r.silkYieldG != null ? `${toNum(r.silkYieldG).toFixed(1)} g` : <span style={{ color: 'var(--text-faint)' }}>—</span>}</td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.55rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 700, background: gm.bg, color: gm.color }}>
                            {gm.label}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.notes ?? <span style={{ color: 'var(--text-faint)' }}>—</span>}
                        </td>
                        {canEdit && (
                          <td>
                            <button className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }}
                              onClick={() => handleDelete(r.id)} disabled={deleting === r.id}>
                              {deleting === r.id ? '…' : 'Delete'}
                            </button>
                          </td>
                        )}
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
