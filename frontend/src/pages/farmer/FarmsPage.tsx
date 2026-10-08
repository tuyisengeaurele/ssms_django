import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { farmService } from '../../services/farm.service';
import { Farm } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';
import { fill } from '../../utils/fill';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import { SkeletonCard } from '../../components/ui/SkeletonLoader';

interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export default function FarmsPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { error: showError } = useToast();
  const { getErrorMessage } = useApiError();

  const [farms, setFarms] = useState<Farm[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);

  useEffect(() => {
    setLoading(true);
    farmService.getAll(page)
      .then((r) => {
        // A page of farms arrives as { data, pagination }. A flat list has no pagination.
        const body = r.data as unknown as { data?: Farm[]; pagination?: PaginationMeta };
        setFarms(body.data ?? (r.data as unknown as Farm[]));
        if (body.pagination) setMeta(body.pagination);
      })
      .catch((e) => showError(getErrorMessage(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const canCreate = user?.role === 'FARMER' || user?.role === 'ADMIN';
  const query = search.trim().toLowerCase();
  const visible = farms.filter((f) => !query || f.name.toLowerCase().includes(query) || f.location.toLowerCase().includes(query));

  return (
    <div>
      <PageHeader
        title={t('ptFarms')}
        subtitle={loading ? undefined : fill(t(farms.length === 1 ? 'fmSubtitleOne' : 'fmSubtitleMany'), { n: farms.length })}
        actions={
          canCreate ? (
            <Link to="/farms/new" className="btn btn-primary btn-sm">
              <Icon name="add" size={15} />
              {t('fmNew')}
            </Link>
          ) : undefined
        }
      />

      <div className="search-box search-box--spaced">
        <Icon name="search" size={16} className="icon" />
        <input type="search" aria-label={t('fmSearch')} placeholder={t('fmSearch')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="grid-auto">
          {[1, 2, 3, 4, 5, 6].map((i) => <SkeletonCard key={i} height={150} />)}
        </div>
      ) : farms.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<Icon name="farms" size={22} />}
            title={t('fmNone')}
            description={t('fmNoneBody')}
            action={canCreate ? { label: t('fmCreateFirst'), to: '/farms/new' } : undefined}
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<Icon name="search" size={22} />}
            title={t('fmNoMatch')}
            description={fill(t('fmNoMatchBody'), { q: search.trim() })}
            action={{ label: t('fmClear'), onClick: () => setSearch('') }}
          />
        </div>
      ) : (
        <>
          <div className="grid-auto farm-grid">
            {visible.map((farm) => {
              const n = farm.counts?.batches ?? 0;
              return (
                <Link key={farm.id} to={`/farms/${farm.id}`} className="farm-card">
                  <h2 className="farm-card-name">{farm.name}</h2>
                  <p className="farm-card-line">
                    <Icon name="location" size={15} />
                    <span>{farm.location}</span>
                  </p>
                  {farm.owner ? (
                    <p className="farm-card-line">
                      <Icon name="profile" size={15} />
                      <span>{farm.owner.name}</span>
                    </p>
                  ) : null}
                  <p className="farm-card-foot">
                    <span>{n === 1 ? t('fmBatchOne') : fill(t('fmBatchMany'), { n })}</span>
                    <span className="farm-card-open">
                      {t('fmOpen')}
                      <Icon name="forward" size={14} />
                    </span>
                  </p>
                </Link>
              );
            })}
          </div>
          {meta && meta.totalPages > 1 && (
            <div className="panel pager-panel">
              <Pagination meta={meta} onPage={setPage} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
