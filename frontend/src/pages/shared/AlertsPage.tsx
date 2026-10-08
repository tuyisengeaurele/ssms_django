import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { alertService } from '../../services/alert.service';
import { AlertLog, AlertType } from '../../types';
import { useApiError } from '../../hooks/useApiError';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { fill } from '../../utils/fill';
import { timeAgo } from '../../utils/timeAgo';
import { STAGE_LABELS } from '../../utils/constants';
import { ALERT_DOT, ALERT_TYPE_KEY } from '../../utils/alertTypes';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import Panel from '../../components/ui/Panel';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';

const PAGE_SIZE = 15;

export default function AlertsPage() {
  const { getErrorMessage } = useApiError();
  const { success, error: showError } = useToast();
  const { t, locale } = useLanguage();

  const [alerts, setAlerts] = useState<AlertLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [type, setType] = useState<AlertType | ''>('');
  const [page, setPage] = useState(1);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    setLoading(true);
    alertService.getAll(tab === 'unread')
      .then((r) => setAlerts(r.data.data))
      .catch((e) => showError(getErrorMessage(e)))
      .finally(() => setLoading(false));
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleMarkRead = async (id: string) => {
    try {
      await alertService.markRead(id);
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: true } : a)));
    } catch (e) {
      showError(getErrorMessage(e));
    }
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      await alertService.markAllRead();
      setAlerts((prev) => prev.map((a) => ({ ...a, isRead: true })));
      success(t('alMarkedAll'));
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setMarkingAll(false);
    }
  };

  const unread = alerts.filter((a) => !a.isRead).length;
  const shown = type ? alerts.filter((a) => a.type === type) : alerts;
  const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageItems = shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const subtitle = loading
    ? undefined
    : unread === 0 ? t('alCaughtUp') : fill(t(unread === 1 ? 'alUnreadOne' : 'alUnreadMany'), { n: unread });

  return (
    <div>
      <PageHeader
        title={t('ptAlerts')}
        subtitle={subtitle}
        actions={
          unread > 0 ? (
            <button className="btn btn-secondary btn-sm" onClick={handleMarkAll} disabled={markingAll}>
              <Icon name="check" size={15} />
              {t('alMarkAll')}
            </button>
          ) : undefined
        }
      />

      <Panel
        title={t('ptAlerts')}
        flush
        actions={
          <label className="filter-field filter-field--inline">
            <span className="sr-only">{t('alFieldType')}</span>
            <select
              className="inline-select"
              aria-label={t('alFieldType')}
              value={type}
              onChange={(e) => { setType(e.target.value as AlertType | ''); setPage(1); }}
            >
              <option value="">{t('alAllTypes')}</option>
              {(Object.keys(ALERT_TYPE_KEY) as AlertType[]).map((k) => <option key={k} value={k}>{t(ALERT_TYPE_KEY[k])}</option>)}
            </select>
          </label>
        }
      >
        <div className="tabs" role="tablist">
          {(['all', 'unread'] as const).map((id) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)}>
              {id === 'all' ? t('alTabAll') : t('alTabUnread')}
            </button>
          ))}
        </div>

        {loading ? (
          <SkeletonTable rows={6} cols={3} />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={<Icon name="alerts" size={22} />}
            title={type ? t('alNoMatch') : tab === 'unread' ? t('alNoneUnread') : t('alNone')}
            description={type ? undefined : t('alNoneBody')}
          />
        ) : (
          <ul className="alert-feed">
            {pageItems.map((a) => (
              <li key={a.id} className={a.isRead ? 'is-read' : ''}>
                <span className={`note-dot note-dot--${ALERT_DOT[a.type] ?? 'system'}`} aria-hidden="true" />
                <div className="alert-feed-main">
                  <p className="alert-feed-message">{a.message}</p>
                  <p className="alert-feed-meta">
                    <span className="alert-type">{t(ALERT_TYPE_KEY[a.type] ?? 'alTypeSystem')}</span>
                    {a.farmerName ? <span>{a.farmerName}</span> : null}
                    {a.batch ? (
                      <Link to={`/batches/${a.batch.id}`} className="cell-link">
                        {t('alBatch')} {a.batch.stage ? (STAGE_LABELS[a.batch.stage] ?? a.batch.stage) : ''}
                      </Link>
                    ) : null}
                    <span>{timeAgo(a.createdAt, locale)}</span>
                  </p>
                </div>
                {!a.isRead && (
                  <button className="btn btn-ghost btn-xs" onClick={() => handleMarkRead(a.id)}>{t('alMarkRead')}</button>
                )}
              </li>
            ))}
          </ul>
        )}

        {!loading && shown.length > PAGE_SIZE && (
          <Pagination
            meta={{ page: current, pageSize: PAGE_SIZE, totalItems: shown.length, totalPages, hasNext: current < totalPages, hasPrev: current > 1 }}
            onPage={setPage}
          />
        )}
      </Panel>
    </div>
  );
}
