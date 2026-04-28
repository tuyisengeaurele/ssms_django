import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { farmService } from '../../services/farm.service';
import { useApiError } from '../../hooks/useApiError';
import Navbar from '../../components/ui/Navbar';
import PageHeader from '../../components/ui/PageHeader';

export default function AddFarmPage() {
  const [form, setForm] = useState({ name: '', location: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { getErrorMessage } = useApiError();

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await farmService.create(form);
      navigate(`/farms/${res.data.data.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar />
      <div className="container page">
        <PageHeader
          title="Create New Farm"
          subtitle="Add a new silkworm farm to your account"
          action={<Link to="/farms" className="btn btn-secondary">← Back</Link>}
        />

        <div style={{ maxWidth: '520px' }}>
          <div className="card">
            {error && <div className="alert alert-error">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Farm Name *</label>
                <input type="text" value={form.name} onChange={set('name')} placeholder="e.g. First name's Farm" required maxLength={150} />
              </div>

              <div className="form-group">
                <label>Location *</label>
                <input type="text" value={form.location} onChange={set('location')} placeholder="e.g. Gatsibo, Rwanda" required maxLength={250} />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Creating…' : 'Create Farm'}
                </button>
                <Link to="/farms" className="btn btn-secondary">Cancel</Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
