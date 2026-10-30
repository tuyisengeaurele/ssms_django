import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { alertService } from '../../services/alert.service';
import { AlertLog, AlertType } from '../../types';
import { useApiError } from '../../hooks/useApiError';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { fill } from '../../utils/fill';
import { timeAgo } from '../../utils/timeAgo';
import { stageLabel } from '../../utils/constants';
import { ALERT_TYPE_KEY } from '../../utils/alertTypes';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import Panel from '../../components/ui/Panel';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import AlertThread from './AlertThread';

const PAGE_SIZE = 15;

export default function AlertsPage() {
  const { getErrorMessage } = useApiError();
  const { user } = useAuth();
  const { success, error: showError } = useToast();
  const { t, locale } = useLanguage();

  const [alerts, setAlerts] = useState<AlertLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [type, setType] = useState<AlertType | ''>('');
  const [page, setPage] = useState(1);
  const [markingAll, setMarkingAll] = useState(false);
  const [askAll, setAskAll] = useState(false);
  // The alerts whose comments are open.
  const [openThreads, setOpenThreads] = useState<Record<string, boolean>>({});
  const canAcknowledge = user?.role === 'SUPERVISOR' || user?.role === 'ADMIN';

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
      success(t('alMarkedRead'), { label: t('alUndo'), onClick: () => handleMarkUnread(id) });
    } catch (e) {
      showError(getErrorMessage(e));
    }
  };

  const handleAcknowledge = async (id: string, undo = false) => {
    try {
      const res = await (undo ? alertService.unacknowledge(id) : alertService.acknowledge(id));
      const { acknowledgedBy, acknowledgedAt } = res.data.data;
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledgedBy: acknowledgedBy ?? null, acknowledgedAt: acknowledgedAt ?? null } : a)));
      success(t(undo ? 'acRemoved' : 'acAcknowledged'));
    } catch {
      showError(t('acAckError'));
    }
  };

  const changeCount = (id: string, delta: number) =>
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, commentCount: Math.max(0, (a.commentCount ?? 0) + delta) } : a)));

  const handleMarkUnread = async (id: string) => {
    try {
      await alertService.markUnread(id);
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: false } : a)));
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
      setAskAll(false);
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
      <Modal
        open={askAll}
        onClose={() => setAskAll(false)}
        title={t('alMarkAllTitle')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setAskAll(false)} disabled={markingAll}>{t('btnCancel')}</button>
            <button className="btn btn-primary" onClick={handleMarkAll} disabled={markingAll}>
              {markingAll ? <span className="spinner" aria-hidden="true" /> : null}
              {t('alMarkAllYes')}
            </button>
          </>
        }
      >
        <p className="modal-text">{t('alMarkAllBody')}</p>
      </Modal>

      <PageHeader
        title={t('ptAlerts')}
        subtitle={subtitle}
        actions={
          unread > 0 ? (
            <button className="btn btn-secondary btn-sm" onClick={() => setAskAll(true)} disabled={markingAll}>
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
                <div className="alert-feed-row">
                <div className="alert-feed-main">
                  <p className="alert-feed-message">{a.message}</p>
                  <p className="alert-feed-meta">
                    <span className="alert-type">{t(ALERT_TYPE_KEY[a.type] ?? 'alTypeSystem')}</span>
                    {a.farmerName ? <span>{a.farmerName}</span> : null}
                    {a.room ? <span className="cell-strong">{a.room.name}</span> : null}
                    {a.batch ? (
                      <Link to={`/batches/${a.batch.id}`} className="cell-link">
                        {t('alBatch')} {a.batch.stage ? (stageLabel(t, a.batch.stage)) : ''}
                      </Link>
                    ) : null}
                    {/* A room alert is about every batch in the room, so each one is a way in. */}
                    {!a.batch && a.batches?.map((b) => (
                      <Link key={b.id} to={`/batches/${b.id}`} className="cell-link">
                        {`#${b.id.slice(-8).toUpperCase()} (${stageLabel(t, b.stage)})`}
                      </Link>
                    ))}
                    <span>{timeAgo(a.createdAt, locale)}</span>
                  </p>
                  {a.acknowledgedBy && a.acknowledgedAt && (
                    <p className="alert-feed-ack">{fill(t('acBy'), { name: a.acknowledgedBy.name, when: timeAgo(a.acknowledgedAt, locale) })}</p>
                  )}
                </div>
                <div className="alert-feed-actions">
                  {canAcknowledge && (
                    a.acknowledgedBy?.id === user?.id ? (
                      <button className="btn btn-ghost btn-xs" onClick={() => handleAcknowledge(a.id, true)}>{t('acUndo')}</button>
                    ) : (
                      <button className="btn btn-ghost btn-xs" onClick={() => handleAcknowledge(a.id)}>
                        {t(a.acknowledgedBy ? 'acTakeOver' : 'acAcknowledge')}
                      </button>
                    )
                  )}
                  <button
                    className="btn btn-ghost btn-xs"
                    aria-expanded={!!openThreads[a.id]}
                    onClick={() => setOpenThreads((prev) => ({ ...prev, [a.id]: !prev[a.id] }))}
                  >
                    {openThreads[a.id] ? t('acHide') : fill(t('acComments'), { n: a.commentCount ?? 0 })}
                  </button>
                  {!a.isRead && (
                    <button className="btn btn-ghost btn-xs" onClick={() => handleMarkRead(a.id)}>{t('alMarkRead')}</button>
                  )}
                </div>
                </div>
                {openThreads[a.id] && <AlertThread alertId={a.id} onCountChange={(delta) => changeCount(a.id, delta)} />}
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
