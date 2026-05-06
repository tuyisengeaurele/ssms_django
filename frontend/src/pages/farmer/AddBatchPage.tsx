import { useState, FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { batchService } from '../../services/batch.service';
import { useApiError } from '../../hooks/useApiError';
import { useToast } from '../../context/ToastContext';

export default function AddBatchPage() {
  const { farmId } = useParams<{ farmId: string }>();
  const navigate   = useNavigate();
  const { getErrorMessage } = useApiError();
  const { success }         = useToast();
  const [form,    setForm]    = useState({ expectedHarvestDate: '', notes: '' });
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!farmId) return;
    setError('');
    setLoading(true);
    try {
      await batchService.create({ farmId, expectedHarvestDate: form.expectedHarvestDate, notes: form.notes || undefined });
      success('Batch created! Starting at EGG stage.');
      navigate(`/farms/${farmId}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 7);

  const STAGES = ['EGG', 'LARVA', 'PUPA', 'COCOON', 'HARVEST'];
  const STAGE_COLORS: Record<string, string> = { EGG: '#d97706', LARVA: '#10b981', PUPA: '#3b82f6', COCOON: '#8b5cf6', HARVEST: '#ec4899' };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Add New Batch</h1>
          <p className="page-subtitle">Start tracking a new silkworm batch</p>
        </div>
        <Link to={`/farms/${farmId}`} className="btn btn-secondary btn-sm">← Back to Farm</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', maxWidth: 860 }}>
        {/* Form */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <div className="card">
            <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'var(--brand-50)', border: '1px solid var(--brand-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', marginBottom: '1.25rem' }}>
              📦
            </div>
            <h2 style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.25rem' }}>Batch Details</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>New batches start automatically at the <strong>EGG</strong> stage.</p>

            {error && (
              <motion.div className="alert alert-error" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                {error}
              </motion.div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Expected Harvest Date <span className="required">*</span></label>
                <input type="date" value={form.expectedHarvestDate} onChange={set('expectedHarvestDate')}
                  className="form-input" min={minDate.toISOString().split('T')[0]} required />
                <span className="form-hint">Allow at least 7 days from today</span>
              </div>

              <div className="form-group">
                <label className="form-label">Notes <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>(optional)</span></label>
                <textarea value={form.notes} onChange={set('notes')}
                  className="form-textarea" placeholder="Initial observations, breed notes, conditions…"
                  rows={3} maxLength={500} />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? <><span className="spinner" />Creating…</> : '+ Create Batch'}
                </button>
                <Link to={`/farms/${farmId}`} className="btn btn-secondary">Cancel</Link>
              </div>
            </form>
          </div>
        </motion.div>

        {/* Stage lifecycle info */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.35 }}>
          <div className="card">
            <h3 style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: '1.25rem', color: 'var(--text)' }}>Silkworm Lifecycle Stages</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {STAGES.map((s, i) => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 'var(--radius)', background: STAGE_COLORS[s] + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.72rem', color: STAGE_COLORS[s], flexShrink: 0 }}>
                    {i + 1}
                  </div>
                  <div>
                    <p style={{ fontSize: '0.82rem', fontWeight: i === 0 ? 700 : 500, color: i === 0 ? 'var(--brand-600)' : 'var(--text)' }}>
                      {s}{i === 0 && ' ← Starts here'}
                    </p>
                  </div>
                  {i < STAGES.length - 1 && (
                    <div style={{ marginLeft: 16, width: 1, height: 16, background: 'var(--border)', position: 'absolute', marginTop: 42 }} />
                  )}
                </div>
              ))}
            </div>
            <div style={{ marginTop: '1.25rem', padding: '0.875rem', background: 'var(--brand-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--brand-100)' }}>
              <p style={{ fontSize: '0.78rem', color: 'var(--brand-700)', lineHeight: 1.6 }}>
                <strong>Tip:</strong> You can advance the batch stage manually from the batch detail page once the silkworms progress.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
