import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { farmService } from '../../services/farm.service';
import { useApiError } from '../../hooks/useApiError';
import { useToast } from '../../context/ToastContext';

export default function AddFarmPage() {
  const [form,    setForm]    = useState({ name: '', location: '' });
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { getErrorMessage } = useApiError();
  const { success }         = useToast();

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await farmService.create(form);
      success('Farm created successfully!');
      navigate(`/farms/${res.data.data.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Create New Farm</h1>
          <p className="page-subtitle">Add a new silkworm farm to your account</p>
        </div>
        <Link to="/farms" className="btn btn-secondary btn-sm">← Back to Farms</Link>
      </div>

      <motion.div
        style={{ maxWidth: 540 }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="card">
          <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'var(--brand-50)', border: '1px solid var(--brand-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', marginBottom: '1.25rem' }}>
            🌾
          </div>
          <h2 style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.25rem' }}>Farm Details</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Fill in the information about your farm.</p>

          {error && (
            <motion.div className="alert alert-error" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Farm Name <span className="required">*</span></label>
              <input type="text" value={form.name} onChange={set('name')}
                className="form-input" placeholder="e.g. Karame Silk Farm" required maxLength={150} />
              <span className="form-hint">Give your farm a descriptive, unique name</span>
            </div>

            <div className="form-group">
              <label className="form-label">Location <span className="required">*</span></label>
              <div className="input-wrapper">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="input-icon-left"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <input type="text" value={form.location} onChange={set('location')}
                  className="form-input has-left" placeholder="e.g. Gatsibo, Eastern Province, Rwanda" required maxLength={250} />
              </div>
              <span className="form-hint">District, province or full address</span>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? <><span className="spinner" />Creating…</> : '+ Create Farm'}
              </button>
              <Link to="/farms" className="btn btn-secondary">Cancel</Link>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
