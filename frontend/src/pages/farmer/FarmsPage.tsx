import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { farmService } from '../../services/farm.service';
import { Farm } from '../../types';
import { useAuth } from '../../context/AuthContext';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonCard } from '../../components/ui/SkeletonLoader';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';

export default function FarmsPage() {
  const { user }  = useAuth();
  const { error: showError } = useToast();
  const { getErrorMessage }  = useApiError();
  const [farms,   setFarms]   = useState<Farm[]>([]);
  const [search,  setSearch]  = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    farmService.getAll()
      .then(r => setFarms(r.data.data))
      .catch(e => showError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  const canCreate = user?.role === 'FARMER' || user?.role === 'ADMIN';
  const filtered  = farms.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    f.location.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Farms</h1>
          <p className="page-subtitle">{farms.length} farm{farms.length !== 1 ? 's' : ''} registered</p>
        </div>
        <div className="page-actions">
          {canCreate && <Link to="/farms/new" className="btn btn-primary btn-sm">+ New Farm</Link>}
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: '1.25rem', maxWidth: 340 }}>
        <div className="input-wrapper">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="input-icon-left"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="form-input has-left" placeholder="Search farms…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="grid-auto">
          {[1,2,3,4,5,6].map(i => <SkeletonCard key={i} height={160} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="table-container">
          {farms.length === 0 ? (
            <EmptyState icon="🌾" title="No farms yet"
              description="Get started by creating your first farm."
              action={canCreate ? { label: '+ Create Farm', to: '/farms/new' } : undefined} />
          ) : (
            <EmptyState icon="🔍" title="No results" description={`No farms match "${search}"`} action={{ label: 'Clear search', onClick: () => setSearch('') }} />
          )}
        </div>
      ) : (
        <div className="grid-auto">
          {filtered.map((farm, i) => (
            <motion.div key={farm.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <Link to={`/farms/${farm.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                <div className="card card-hover" style={{ height: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.875rem' }}>
                    <div style={{ width: 42, height: 42, borderRadius: 'var(--radius-md)', background: 'var(--brand-50)', border: '1px solid var(--brand-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>
                      🌾
                    </div>
                    <span style={{ fontSize: '0.68rem', fontWeight: 600, background: 'var(--brand-100)', color: 'var(--brand-700)', padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-full)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Active
                    </span>
                  </div>

                  <h3 style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)', marginBottom: '0.375rem' }}>{farm.name}</h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.25rem' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    {farm.location}
                  </p>
                  {farm.owner && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      {farm.owner.name}
                    </p>
                  )}

                  <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <span style={{ fontWeight: 700, color: 'var(--brand-600)', fontSize: '1rem' }}>{farm.counts?.batches ?? 0}</span> batch{(farm.counts?.batches ?? 0) !== 1 ? 'es' : ''}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--brand-600)', fontWeight: 600 }}>View →</span>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
