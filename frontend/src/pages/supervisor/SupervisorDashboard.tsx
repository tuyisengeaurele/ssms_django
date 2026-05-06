import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { farmService } from '../../services/farm.service';
import { Farm } from '../../types';
import Navbar from '../../components/ui/Navbar';
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

export default function SupervisorDashboard() {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    farmService.getAll().then((r) => setFarms(r.data.data)).finally(() => setLoading(false));
  }, []);

  const totalBatches = farms.reduce((s, f) => s + (f.counts?.batches ?? 0), 0);

  return (
    <>
      <Navbar />
      <div className="container page">
        <PageHeader title="Supervisor Overview" subtitle="Monitor all farms and batches across the system" />

        <div className="grid-3" style={{ marginBottom: '2rem' }}>
          {[
            { label: 'All Farms', value: farms.length, color: 'var(--primary)' },
            { label: 'Total Batches', value: totalBatches, color: 'var(--secondary)' },
            { label: 'Farmers', value: new Set(farms.map((f) => f.ownerId)).size, color: 'var(--warning)' },
          ].map((stat) => (
            <div key={stat.label} className="card" style={{ borderTop: `3px solid ${stat.color}` }}>
              <p className="text-muted" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>{stat.label}</p>
              <p style={{ fontSize: '1.75rem', fontWeight: 700, color: stat.color, marginTop: '0.25rem' }}>{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="card">
          <h2 style={{ fontWeight: 600, marginBottom: '1rem' }}>All Farms</h2>
          {loading ? <LoadingSpinner /> : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Farm</th><th>Location</th><th>Owner</th><th>Batches</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {farms.map((farm) => (
                    <tr key={farm.id}>
                      <td style={{ fontWeight: 500 }}>{farm.name}</td>
                      <td className="text-muted">{farm.location}</td>
                      <td>{farm.owner?.name ?? '—'}</td>
                      <td>{farm.counts?.batches ?? 0}</td>
                      <td><Link to={`/farms/${farm.id}`} className="btn btn-sm btn-secondary">View</Link></td>
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
