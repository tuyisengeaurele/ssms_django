import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { farmService } from '../../services/farm.service';
import { batchService } from '../../services/batch.service';
import { Farm, Batch } from '../../types';
import Navbar from '../../components/ui/Navbar';
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import StageBadge from '../../components/ui/StageBadge';
import { useAuth } from '../../context/AuthContext';
import { useApiError } from '../../hooks/useApiError';

export default function FarmDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { getErrorMessage } = useApiError();
  const navigate = useNavigate();

  const [farm, setFarm] = useState<Farm | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    Promise.all([farmService.getById(id), batchService.getByFarm(id)])
      .then(([farmRes, batchRes]) => {
        setFarm(farmRes.data.data);
        setBatches(batchRes.data.data);
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!id || !confirm('Delete this farm? All batches will be archived.')) return;
    try {
      await farmService.delete(id);
      navigate('/farms');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const canEdit = user?.role === 'FARMER' || user?.role === 'ADMIN';

  if (loading) return <><Navbar /><LoadingSpinner fullPage /></>;
  if (!farm) return <><Navbar /><div className="container page"><div className="alert alert-error">Farm not found.</div></div></>;

  return (
    <>
      <Navbar />
      <div className="container page">
        <PageHeader
          title={farm.name}
          subtitle={`📍 ${farm.location}`}
          action={
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {canEdit && <Link to={`/farms/${id}/batches/new`} className="btn btn-primary">+ New Batch</Link>}
              {canEdit && <button onClick={handleDelete} className="btn btn-danger btn-sm">Delete Farm</button>}
              <Link to="/farms" className="btn btn-secondary btn-sm">← Back</Link>
            </div>
          }
        />

        {error && <div className="alert alert-error">{error}</div>}

        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Farm Info</h3>
          <div className="grid-3">
            <div><p className="text-muted" style={{ fontSize: '0.8rem' }}>OWNER</p><p style={{ fontWeight: 500, marginTop: '0.25rem' }}>{farm.owner?.name ?? '—'}</p></div>
            <div><p className="text-muted" style={{ fontSize: '0.8rem' }}>BATCHES</p><p style={{ fontWeight: 500, marginTop: '0.25rem' }}>{batches.length}</p></div>
            <div><p className="text-muted" style={{ fontSize: '0.8rem' }}>CREATED</p><p style={{ fontWeight: 500, marginTop: '0.25rem' }}>{new Date(farm.createdAt).toLocaleDateString()}</p></div>
          </div>
        </div>

        <div className="card">
          <div className="flex-between" style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontWeight: 600 }}>Batches ({batches.length})</h3>
            {canEdit && <Link to={`/farms/${id}/batches/new`} className="btn btn-sm btn-primary">+ Add Batch</Link>}
          </div>

          {batches.length === 0 ? (
            <div className="text-center" style={{ padding: '2.5rem 0', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: '2rem' }}></p>
              <p style={{ marginTop: '0.5rem' }}>No batches yet.{canEdit && <> <Link to={`/farms/${id}/batches/new`} style={{ color: 'var(--primary)' }}>Start one</Link></>}</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead><tr><th>ID</th><th>Stage</th><th>Started</th><th>Expected Harvest</th><th>Detections</th><th></th></tr></thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{batch.id.slice(-8)}</td>
                      <td><StageBadge stage={batch.stage} /></td>
                      <td className="text-muted">{new Date(batch.startDate).toLocaleDateString()}</td>
                      <td className="text-muted">{new Date(batch.expectedHarvestDate).toLocaleDateString()}</td>
                      <td>{batch._count?.diseaseDetections ?? 0}</td>
                      <td><Link to={`/batches/${batch.id}`} className="btn btn-sm btn-secondary">Details</Link></td>
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
