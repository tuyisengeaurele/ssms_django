import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { farmService } from '../../services/farm.service';
import { Farm } from '../../types';
import Navbar from '../../components/ui/Navbar';
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

export default function AdminDashboard() {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    farmService.getAll().then((r) => setFarms(r.data.data)).finally(() => setLoading(false));
  }, []);

  const stats = [
    { label: 'Total Farms', value: farms.length, color: 'var(--primary)' },
    { label: 'Total Batches', value: farms.reduce((s, f) => s + (f._count?.batches ?? 0), 0), color: 'var(--secondary)' },
    { label: 'Registered Farmers', value: new Set(farms.map((f) => f.ownerId)).size, color: '#7c3aed' },
    { label: 'System Status', value: 'Online', color: '#059669' },
  ];

  return (
    <>
      <Navbar />
      <div className="container page">
        <PageHeader title="Admin Dashboard" subtitle="Full system oversight and management" />

        <div className="grid-4" style={{ marginBottom: '2rem' }}>
          {stats.map((s) => (
            <div key={s.label} className="card" style={{ borderTop: `3px solid ${s.color}` }}>
              <p className="text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>{s.label}</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: s.color, marginTop: '0.25rem' }}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="grid-2">
          <div className="card">
            <div className="flex-between" style={{ marginBottom: '1rem' }}>
              <h2 style={{ fontWeight: 600 }}>Farm Registry</h2>
              <Link to="/farms/new" className="btn btn-sm btn-primary">+ Add Farm</Link>
            </div>
            {loading ? <LoadingSpinner /> : (
              <div className="table-wrapper">
                <table>
                  <thead><tr><th>Farm</th><th>Owner</th><th>Batches</th></tr></thead>
                  <tbody>
                    {farms.slice(0, 8).map((f) => (
                      <tr key={f.id}>
                        <td><Link to={`/farms/${f.id}`} style={{ color: 'var(--primary)', fontWeight: 500 }}>{f.name}</Link></td>
                        <td className="text-muted">{f.owner?.name ?? '—'}</td>
                        <td>{f._count?.batches ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h2 style={{ fontWeight: 600, marginBottom: '1rem' }}>Quick Actions</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                { to: '/farms/new', label: '+ Create New Farm', desc: 'Add a farm to the system' },
                { to: '/farms', label: '🌾 Manage Farms', desc: 'View and edit all farms' },
                { to: '/supervisor', label: '📊 System Overview', desc: 'Cross-farm metrics' },
              ].map((a) => (
                <Link key={a.to} to={a.to} className="card" style={{ display: 'block', padding: '0.875rem 1rem', cursor: 'pointer' }}>
                  <p style={{ fontWeight: 500 }}>{a.label}</p>
                  <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.15rem' }}>{a.desc}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
