import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { batchSupervisorService, ActiveBatch } from '../../services/sensor.service';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import StageBadge from '../../components/ui/StageBadge';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';

const STAGE_ORDER = ['EGG', 'LARVA', 'PUPA', 'COCOON', 'HARVEST'];

export default function BatchesPage() {
  const { error: showError } = useToast();
  const { getErrorMessage }  = useApiError();
  const { t } = useLanguage();
  const [batches,  setBatches]  = useState<ActiveBatch[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [filter,   setFilter]   = useState<string>('ALL');

  useEffect(() => {
    batchSupervisorService.getActive()
      .then(r => setBatches(r.data.data))
      .catch(e => showError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  const stages = ['ALL', ...STAGE_ORDER];

  const filtered = batches.filter(b => {
    const matchSearch = b.farm?.name?.toLowerCase().includes(search.toLowerCase()) ?? true;
    const matchStage  = filter === 'ALL' || b.stage === filter;
    return matchSearch && matchStage;
  });

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('pageTitleBatches')}</h1>
          <p className="page-subtitle">
            {batches.length} active batch{batches.length !== 1 ? 'es' : ''} across your farms
          </p>
        </div>
        <div className="page-actions">
          <Link to="/farms" className="btn btn-primary btn-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Batch
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem', alignItems: 'center' }}>
        {/* Search */}
        <div className="input-wrapper" style={{ maxWidth: 280 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="input-icon-left">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input className="form-input has-left" placeholder="Search by farm…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Stage filter pills */}
        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
          {stages.map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              style={{
                padding: '0.35rem 0.875rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 600,
                border: '1.5px solid',
                cursor: 'pointer',
                transition: 'all 0.15s',
                background: filter === s ? 'var(--brand-600)' : 'transparent',
                color: filter === s ? '#fff' : 'var(--text-muted)',
                borderColor: filter === s ? 'var(--brand-600)' : 'var(--border)',
              }}
            >
              {s === 'ALL' ? 'All Stages' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="table-container"><SkeletonTable rows={6} cols={5} /></div>
      ) : filtered.length === 0 ? (
        <div className="table-container">
          {batches.length === 0 ? (
            <EmptyState
              icon={
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                </svg>
              }
              title="No active batches"
              description="Create a batch from one of your farms to start tracking silkworm lifecycle progress."
              action={{ label: 'Go to My Farms', to: '/farms' }}
            />
          ) : (
            <EmptyState
              icon={
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              }
              title="No results"
              description="No batches match your current search or filter."
              action={{ label: 'Clear filters', onClick: () => { setSearch(''); setFilter('ALL'); } }}
            />
          )}
        </div>
      ) : (
        <motion.div
          className="table-container"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Batch ID</th>
                  <th>Farm</th>
                  <th>Stage</th>
                  <th>Started</th>
                  <th>Expected Harvest</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b, i) => (
                  <motion.tr key={b.id} className="tbody-row"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.04 }}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', background: 'var(--gray-100)', padding: '0.15rem 0.5rem', borderRadius: 'var(--radius)', color: 'var(--text-2)' }}>
                        #{b.id.slice(-8).toUpperCase()}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{b.farm?.name ?? '—'}</td>
                    <td><StageBadge stage={b.stage} /></td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-faint)' }}>
                      {new Date(b.startDate).toLocaleDateString()}
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-faint)' }}>
                      {new Date(b.expectedHarvestDate).toLocaleDateString()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <Link to={`/batches/${b.id}`} className="btn btn-ghost btn-xs">
                          View
                        </Link>
                        <Link to={`/batches/${b.id}/detect`} className="btn btn-xs btn-outline-primary">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                          </svg>
                          Detect
                        </Link>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border-light)', fontSize: '0.75rem', color: 'var(--text-faint)' }}>
            Showing {filtered.length} of {batches.length} batches
          </div>
        </motion.div>
      )}
    </div>
  );
}
