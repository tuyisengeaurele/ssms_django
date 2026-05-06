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
        <Link to="/farms" className="btn btn-secondary btn-sm">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Back to Farms
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', maxWidth: 860 }}>
        {/* Form */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--brand-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brand-600)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
              </div>
              <div>
                <h2 style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.1rem' }}>Farm Details</h2>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Fill in the information below</p>
              </div>
            </div>

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
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="input-icon-left">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                  <input type="text" value={form.location} onChange={set('location')}
                    className="form-input has-left" placeholder="e.g. Gatsibo, Eastern Province, Rwanda" required maxLength={250} />
                </div>
                <span className="form-hint">District, province or full address</span>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? (
                    <><span className="spinner" />Creating…</>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Create Farm
                    </>
                  )}
                </button>
                <Link to="/farms" className="btn btn-secondary">Cancel</Link>
              </div>
            </form>
          </div>
        </motion.div>

        {/* Tips / info sidebar */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.35 }}
        >
          <div className="card">
            <h3 style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: '1.25rem' }}>Getting Started</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              {[
                {
                  icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                  ),
                  title: 'Create your farm',
                  desc: 'Register the farm with a name and location to start tracking.',
                },
                {
                  icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    </svg>
                  ),
                  title: 'Add batches',
                  desc: 'Create silkworm batches within the farm to track lifecycle stages.',
                },
                {
                  icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                  ),
                  title: 'Run AI detections',
                  desc: 'Upload silkworm images for disease diagnosis using ResNet50 AI.',
                },
                {
                  icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                    </svg>
                  ),
                  title: 'Monitor sensors',
                  desc: 'Track temperature and humidity readings for optimal conditions.',
                },
              ].map(item => (
                <div key={item.title} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 'var(--radius)', background: 'var(--brand-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-600)', flexShrink: 0 }}>
                    {item.icon}
                  </div>
                  <div>
                    <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.15rem' }}>{item.title}</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '1.25rem', padding: '0.875rem', background: 'var(--brand-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--brand-100)' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--brand-700)', lineHeight: 1.6 }}>
                <strong>Tip:</strong> You can register multiple farms. Each farm can have several batches running simultaneously.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
