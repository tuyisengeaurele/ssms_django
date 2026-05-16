import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { farmService } from '../../services/farm.service';
import { Farm } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonCard } from '../../components/ui/SkeletonLoader';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';
import Pagination from '../../components/ui/Pagination';

interface PaginationMeta { page: number; pageSize: number; totalItems: number; totalPages: number; hasNext: boolean; hasPrev: boolean; }

export default function FarmsPage() {
  const { user }  = useAuth();
  const { t } = useLanguage();
  const { error: showError } = useToast();
  const { getErrorMessage }  = useApiError();
  const [farms,   setFarms]   = useState<Farm[]>([]);
  const [search,  setSearch]  = useState('');
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);
  const [paginationMeta, setPaginationMeta] = useState<PaginationMeta | null>(null);

  const load = (p = 1) => {
    setLoading(true);
    farmService.getAll(p)
      .then(r => {
        const res = r.data as any;
        // Paginated response: { data: [...], pagination: {...} }
        // Flat response (no ?page):  { data: [...] }
        setFarms(res.data ?? res);
        if (res.pagination) setPaginationMeta(res.pagination);
      })
      .catch(e => showError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(page); }, [page]);

  const canCreate = user?.role === 'FARMER' || user?.role === 'ADMIN';
  const filtered  = farms.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    f.location.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('pageTitleFarms')}</h1>
          <p className="page-subtitle">{farms.length} farm{farms.length !== 1 ? 's' : ''} registered</p>
        </div>
        <div className="page-actions">
          {canCreate && <Link to="/farms/new" className="btn btn-primary btn-sm">{t('btnNewFarm')}</Link>}
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: '1.25rem', maxWidth: 340 }}>
        <div className="input-wrapper">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="input-icon-left"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="form-input has-left" placeholder={t('labelSearchFarms')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="grid-auto">
          {[1,2,3,4,5,6].map(i => <SkeletonCard key={i} height={160} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="table-container">
          {farms.length === 0 ? (
            <EmptyState
              icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>}
              title="No farms yet"
              description="Get started by creating your first farm."
              action={canCreate ? { label: '+ Create Farm', to: '/farms/new' } : undefined}
            />
          ) : (
            <EmptyState
              icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>}
              title="No results"
              description={`No farms match "${search}"`}
              action={{ label: 'Clear search', onClick: () => setSearch('') }}
            />
          )}
        </div>
      ) : (
        <>
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
                    <div style={{ width: 42, height: 42, borderRadius: 'var(--radius-md)', background: 'var(--brand-50)', border: '1px solid var(--brand-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-600)' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
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
        {paginationMeta && paginationMeta.totalPages > 1 && (
          <div className="table-container" style={{ marginTop: '1rem' }}>
            <Pagination meta={paginationMeta} onPage={setPage} />
          </div>
        )}
        </>
      )}
    </div>
  );
}
