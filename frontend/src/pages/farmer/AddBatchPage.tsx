import { useState, FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { batchService } from '../../services/batch.service';
import { useApiError } from '../../hooks/useApiError';
import Navbar from '../../components/ui/Navbar';
import PageHeader from '../../components/ui/PageHeader';

export default function AddBatchPage() {
  const { farmId } = useParams<{ farmId: string }>();
  const navigate = useNavigate();
  const { getErrorMessage } = useApiError();
  const [form, setForm] = useState({ expectedHarvestDate: '', notes: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!farmId) return;
    setError('');
    setLoading(true);
    try {
      await batchService.create({ farmId, expectedHarvestDate: form.expectedHarvestDate, notes: form.notes || undefined });
      navigate(`/farms/${farmId}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 7);

  return (
    <>
      <Navbar />
      <div className="container page">
        <PageHeader
          title="Add New Batch"
          subtitle="Start tracking a new silkworm batch"
          action={<Link to={`/farms/${farmId}`} className="btn btn-secondary">← Back to Farm</Link>}
        />

        <div style={{ maxWidth: '520px' }}>
          <div className="card">
            {error && <div className="alert alert-error">{error}</div>}

            <div className="alert" style={{ background: 'var(--primary-light)', border: '1px solid #86efac', color: 'var(--primary-dark)', marginBottom: '1.25rem' }}>
              <strong>Stage:</strong> A new batch starts at <strong>EGG</strong> stage automatically.
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Expected Harvest Date *</label>
                <input
                  type="date"
                  value={form.expectedHarvestDate}
                  onChange={set('expectedHarvestDate')}
                  min={minDate.toISOString().split('T')[0]}
                  required
                />
              </div>

              <div className="form-group">
                <label>Notes (optional)</label>
                <textarea
                  value={form.notes}
                  onChange={set('notes')}
                  placeholder="Any initial observations or notes…"
                  rows={3}
                  maxLength={500}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Creating…' : 'Create Batch'}
                </button>
                <Link to={`/farms/${farmId}`} className="btn btn-secondary">Cancel</Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
