import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { farmService } from '../../services/farm.service';
import { Farm } from '../../types';
import Navbar from '../../components/ui/Navbar';
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

export default function FarmerDashboard() {
  const { user } = useAuth();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    farmService.getAll().then((r) => setFarms(r.data.data)).finally(() => setLoading(false));
  }, []);

  const totalBatches = farms.reduce((s, f) => s + (f._count?.batches ?? 0), 0);

  return (
    <>
      <Navbar />
      <div className="container page">
        <PageHeader
          title={`Welcome, ${user?.name}`}
          subtitle="Manage your silkworm farms and batches"
          action={<Link to="/farms/new" className="btn btn-primary">+ New Farm</Link>}
        />

        <div className="grid-3" style={{ marginBottom: '2rem' }}>
          {[
            { label: 'Total Farms', value: farms.length, color: 'var(--primary)' },
            { label: 'Active Batches', value: totalBatches, color: 'var(--secondary)' },
            { label: 'Role', value: user?.role, color: 'var(--warning)' },
          ].map((stat) => (
            <div key={stat.label} className="card" style={{ borderTop: `3px solid ${stat.color}` }}>
              <p className="text-muted" style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</p>
              <p style={{ fontSize: '1.75rem', fontWeight: 700, color: stat.color, marginTop: '0.25rem' }}>{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="flex-between mb-4" style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontWeight: 600 }}>Your Farms</h2>
            <Link to="/farms" className="text-muted" style={{ fontSize: '0.875rem', color: 'var(--primary)' }}>View all →</Link>
          </div>

          {loading ? <LoadingSpinner /> : farms.length === 0 ? (
            <div className="text-center" style={{ padding: '3rem 0', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: '2rem' }}>🌾</p>
              <p style={{ marginTop: '0.5rem' }}>No farms yet. <Link to="/farms/new" style={{ color: 'var(--primary)' }}>Create your first farm</Link></p>
            </div>
          ) : (
            <div className="grid-2">
              {farms.slice(0, 4).map((farm) => (
                <Link key={farm.id} to={`/farms/${farm.id}`} style={{ textDecoration: 'none' }}>
                  <div className="card" style={{ cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.boxShadow = 'var(--shadow-md)')}
                    onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'var(--shadow)')}>
                    <h3 style={{ fontWeight: 600 }}>{farm.name}</h3>
                    <p className="text-muted" style={{ marginTop: '0.25rem', fontSize: '0.875rem' }}>📍 {farm.location}</p>
                    <p style={{ marginTop: '0.75rem', fontSize: '0.875rem' }}>
                      <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{farm._count?.batches ?? 0}</span> batches
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
