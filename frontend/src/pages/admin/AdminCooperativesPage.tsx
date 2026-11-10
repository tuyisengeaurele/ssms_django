import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { cooperativeService } from '../../services/cooperative.service';
import { Cooperative } from '../../types';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { fill } from '../../utils/fill';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import CooperativeFormModal from '../cooperatives/CooperativeFormModal';
import { dateFormat } from '../../utils/dateFormat';

/**
 * The cooperatives, active and deleted. A cooperative opens as its own page with its report, farms, members and details,
 * and the first row opens every cooperative together.
 */
export default function AdminCooperativesPage() {
  const { t, locale } = useLanguage();
  const { getErrorMessage } = useApiError();
  const { success, error: showError } = useToast();

  const [coops, setCoops] = useState<Cooperative[]>([]);
  const [deletedCoops, setDeletedCoops] = useState<Cooperative[]>([]);
  const [tab, setTab] = useState<'active' | 'deleted'>('active');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<Cooperative | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([cooperativeService.getAll(), cooperativeService.getDeleted()])
      .then(([active, deleted]) => {
        setCoops(active.data.data);
        setDeletedCoops(deleted.data.data);
      })
      .catch((e) => showError(getErrorMessage(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRestore = async () => {
    if (!confirmRestore) return;
    setRestoring(true);
    try {
      const res = await cooperativeService.restore(confirmRestore.id);
      setDeletedCoops((prev) => prev.filter((c) => c.id !== confirmRestore.id));
      setCoops((prev) => [res.data.data, ...prev]);
      success(t('coRestored'));
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setRestoring(false);
      setConfirmRestore(null);
    }
  };

  const query = search.trim().toLowerCase();
  const shownCoops = tab === 'active' ? coops : deletedCoops;
  const filtered = shownCoops.filter((c) => !query || c.name.toLowerCase().includes(query) || (c.location ?? '').toLowerCase().includes(query));
  const totalMembers = coops.reduce((sum, c) => sum + c.memberCount, 0);
  const totalFarms = coops.reduce((sum, c) => sum + c.farmCount, 0);
  const created = dateFormat(locale, { dateStyle: 'medium' });
  const showAll = tab === 'active' && !query && coops.length > 0;

  return (
    <div>
      <CooperativeFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(saved) => setCoops((prev) => [saved, ...prev])}
      />

      <Modal
        open={!!confirmRestore}
        onClose={() => setConfirmRestore(null)}
        title={t('coRestoreTitle')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmRestore(null)}>{t('btnCancel')}</button>
            <button className="btn btn-primary" onClick={handleRestore} disabled={restoring}>
              {restoring ? <><span className="spinner" />{t('coRestoreBusy')}</> : t('coRestoreConfirm')}
            </button>
          </>
        }
      >
        <p className="modal-text">{confirmRestore ? fill(t('coRestoreBody'), { name: confirmRestore.name }) : ''}</p>
      </Modal>

      <PageHeader
        title={t('ptCooperatives')}
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
            <Icon name="add" size={15} />
            {t('coNew')}
          </button>
        }
      />

      <Panel
        title={`${t('ptCooperatives')} (${coops.length})`}
        flush
        actions={
          <div className="search-box">
            <Icon name="search" size={16} className="icon" />
            <input type="search" aria-label={t('coSearch')} placeholder={t('coSearch')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        }
      >
        <div className="tabs" role="tablist">
          {(['active', 'deleted'] as const).map((id) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)}>
              {id === 'active' ? t('coTabActive') : t('coTabDeleted')} ({id === 'active' ? coops.length : deletedCoops.length})
            </button>
          ))}
        </div>

        {loading ? (
          <SkeletonTable rows={4} cols={5} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Icon name="cooperatives" size={22} />}
            title={query ? t('coNoMatch') : tab === 'deleted' ? t('coNoDeleted') : t('coNone')}
            description={query ? fill(t('coNoMatchBody'), { q: search.trim() }) : tab === 'deleted' ? t('coNoDeletedBody') : t('coNoneBody')}
            action={!query && tab === 'active' ? { label: t('coCreateFirst'), onClick: () => setCreating(true) } : undefined}
          />
        ) : (
          <div className="table-wrapper">
            <table className="table-stack">
              <thead>
                <tr>
                  <th>{t('coColName')}</th>
                  <th>{t('coColLocation')}</th>
                  <th>{t('coColMembers')}</th>
                  <th>{t('coColFarms')}</th>
                  <th>{t('coColCreated')}</th>
                  <th><span className="sr-only">{t('coView')}</span></th>
                </tr>
              </thead>
              <tbody>
                {showAll && (
                  <tr className="tbody-row">
                    <td className="cell-lead">
                      <div className="cell-person">
                        <span className="row-avatar" aria-hidden="true"><Icon name="cooperatives" size={16} /></span>
                        <div className="cell-stack">
                          <Link to="/admin/cooperatives/all" className="cell-strong">{t('crAll')}</Link>
                          <span className="cell-sub">{t('cpAllRowNote')}</span>
                        </div>
                      </div>
                    </td>
                    <td data-label={t('coColLocation')} className="cell-muted">-</td>
                    <td data-label={t('coColMembers')} className="cell-strong">{totalMembers}</td>
                    <td data-label={t('coColFarms')} className="cell-strong">{totalFarms}</td>
                    <td data-label={t('coColCreated')} className="cell-muted">-</td>
                    <td data-label="">
                      <div className="table-actions">
                        <Link to="/admin/cooperatives/all" className="btn btn-ghost btn-xs" aria-label={`${t('coView')} ${t('crAll')}`}>{t('coView')}</Link>
                      </div>
                    </td>
                  </tr>
                )}
                {filtered.map((c) => (
                  <tr key={c.id} className="tbody-row">
                    <td className="cell-lead">
                      <div className="cell-person">
                        <span className="row-avatar" aria-hidden="true"><Icon name="cooperatives" size={16} /></span>
                        <div className="cell-stack">
                          {tab === 'active' ? <Link to={`/admin/cooperatives/${c.id}`} className="cell-strong">{c.name}</Link> : <span className="cell-strong">{c.name}</span>}
                          {c.description ? <span className="cell-sub cell-trim">{c.description}</span> : null}
                        </div>
                      </div>
                    </td>
                    <td data-label={t('coColLocation')} className="cell-muted">{c.location || '-'}</td>
                    <td data-label={t('coColMembers')} className="cell-strong">{c.memberCount}</td>
                    <td data-label={t('coColFarms')} className="cell-strong">{c.farmCount}</td>
                    <td data-label={t('coColCreated')} className="cell-muted cell-nowrap">{created.format(new Date(c.createdAt))}</td>
                    <td data-label="">
                      <div className="table-actions">
                        {tab === 'active' ? (
                          <Link to={`/admin/cooperatives/${c.id}`} className="btn btn-ghost btn-xs" aria-label={`${t('coView')} ${c.name}`}>{t('coView')}</Link>
                        ) : (
                          <button className="btn btn-ghost btn-xs" aria-label={`${t('coRestore')} ${c.name}`} onClick={() => setConfirmRestore(c)}>{t('coRestore')}</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
