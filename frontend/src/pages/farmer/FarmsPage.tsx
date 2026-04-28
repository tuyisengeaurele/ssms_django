import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { farmService } from '../../services/farm.service';
import { Farm } from '../../types';
import Navbar from '../../components/ui/Navbar';
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useAuth } from '../../context/AuthContext';

export default function FarmsPage() {
  const { user } = useAuth();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    farmService.getAll()
      .then((r) => setFarms(r.data.data))
      .catch(() => setError('Failed to load farms.'))
      .finally(() => setLoading(false));
  }, []);

  const canCreate = user?.role === 'FARMER' || user?.role === 'ADMIN';

  return (
    <>
      <Navbar />
      <div className="container page">
        <PageHeader
          title="Farms"
          subtitle={`${farms.length} farm${farms.length !== 1 ? 's' : ''} found`}
          action={canCreate ? <Link to="/farms/new" className="btn btn-primary">+ New Farm</Link> : undefined}
        />

        {error && <div className="alert alert-error">{error}</div>}

        {loading ? <LoadingSpinner /> : farms.length === 0 ? (
          <div className="card text-center" style={{ padding: '4rem 2rem' }}>
            <p style={{ fontSize: '3rem' }}>🌾</p>
            <h3 style={{ marginTop: '1rem', fontWeight: 600 }}>No farms yet</h3>
            <p className="text-muted" style={{ marginTop: '0.5rem' }}>Get started by creating your first farm.</p>
            {canCreate && <Link to="/farms/new" className="btn btn-primary" style={{ marginTop: '1.5rem', display: 'inline-flex' }}>+ Create Farm</Link>}
          </div>
        ) : (
          <div className="grid-3">
            {farms.map((farm) => (
              <Link key={farm.id} to={`/farms/${farm.id}`} style={{ textDecoration: 'none' }}>
                <div className="card" style={{ height: '100%', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.boxShadow = 'var(--shadow-md)')}
                  onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'var(--shadow)')}>
                  <div className="flex-between">
                    <h3 style={{ fontWeight: 600 }}>{farm.name}</h3>
                    <span style={{ fontSize: '1.25rem' }}>🏡</span>
                  </div>
                  <p className="text-muted" style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>📍 {farm.location}</p>
                  {farm.owner && (
                    <p className="text-muted" style={{ marginTop: '0.25rem', fontSize: '0.8rem' }}>👤 {farm.owner.name}</p>
                  )}
                  <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.875rem' }}>
                      <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{farm._count?.batches ?? 0}</span> active batches
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
