import { FormEvent, useCallback, useEffect, useState } from 'react';
import { auditLogService, AuditLogEntry } from '../../services/admin.service';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { fill } from '../../utils/fill';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import Panel from '../../components/ui/Panel';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'OTHER'] as const;

const ACTION_LABEL: Record<string, string> = {
  CREATE: 'auCreate',
  UPDATE: 'auUpdate',
  DELETE: 'auDelete',
  LOGIN: 'auLogin',
  LOGOUT: 'auLogout',
  OTHER: 'auOther',
};

const ACTION_BADGE: Record<string, string> = {
  CREATE: 'badge-green',
  UPDATE: 'badge-blue',
  DELETE: 'badge-red',
  LOGIN: 'badge-teal',
  LOGOUT: 'badge-yellow',
  OTHER: 'badge-gray',
};

/** Record ids can be long. Show the end of them, and the whole id on hover. */
const shortId = (id: string) => (id.length > 8 ? `…${id.slice(-6)}` : id);

interface Filters {
  search: string;
  action: string;
  resource: string;
}

const NO_FILTERS: Filters = { search: '', action: '', resource: '' };

export default function AdminAuditLogPage() {
  const { t, locale } = useLanguage();
  const { success, error: showError } = useToast();

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [meta, setMeta] = useState({ page: 1, pageSize: 25, totalItems: 0, totalPages: 1, hasNext: false, hasPrev: false });

  const [draft, setDraft] = useState<Filters>(NO_FILTERS);
  const [applied, setApplied] = useState<Filters>(NO_FILTERS);

  const load = useCallback(
    async (page: number, filters: Filters) => {
      setLoading(true);
      setFailed(false);
      try {
        const res = await auditLogService.getList({ page, ...filters });
        setEntries(res.data.data);
        setMeta(res.data.pagination);
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    load(1, applied);
  }, [load, applied]);

  const apply = (next: Filters) => {
    setDraft(next);
    setApplied(next);
  };

  const onFilter = (e: FormEvent) => {
    e.preventDefault();
    setApplied(draft);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await auditLogService.exportCsv(applied);
      success(t('auExported'));
    } catch {
      showError(t('auExportError'));
    } finally {
      setExporting(false);
    }
  };

  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div>
      <PageHeader
        title={t('ptAudit')}
        subtitle={loading && entries.length === 0 ? undefined : fill(t(meta.totalItems === 1 ? 'auSummaryOne' : 'auSummary'), { n: meta.totalItems.toLocaleString(locale) })}
        actions={
          <button className="btn btn-primary btn-sm" onClick={handleExport} disabled={exporting}>
            <Icon name="download" size={15} />
            {exporting ? t('auExporting') : t('auExport')}
          </button>
        }
      />

      <Panel title={t('auRecent')} flush>
        <form className="filters" onSubmit={onFilter}>
          <div className="search-box">
            <Icon name="search" size={16} className="icon" />
            <input
              type="search"
              aria-label={t('auSearch')}
              placeholder={t('auSearch')}
              value={draft.search}
              onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
            />
          </div>

          <label className="filter-field">
            <span>{t('auFieldAction')}</span>
            <select
              className="inline-select"
              value={draft.action}
              onChange={(e) => apply({ ...draft, action: e.target.value })}
            >
              <option value="">{t('auAllActions')}</option>
              {ACTIONS.map((a) => <option key={a} value={a}>{t(ACTION_LABEL[a])}</option>)}
            </select>
          </label>

          <label className="filter-field">
            <span>{t('auFieldResource')}</span>
            <input
              className="form-input filter-input"
              placeholder={t('auResourcePlaceholder')}
              value={draft.resource}
              onChange={(e) => setDraft((d) => ({ ...d, resource: e.target.value }))}
            />
          </label>

          <div className="filter-buttons">
            <button type="submit" className="btn btn-secondary btn-sm">{t('auFilter')}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => apply(NO_FILTERS)}>{t('auClear')}</button>
          </div>
        </form>

        {failed ? (
          <div className="alert alert-error panel-alert" role="alert">
            <span style={{ flex: 1 }}>{t('auLoadError')}</span>
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => load(meta.page, applied)}>{t('btnRetry')}</button>
          </div>
        ) : loading ? (
          <SkeletonTable rows={8} cols={6} />
        ) : entries.length === 0 ? (
          <EmptyState icon={<Icon name="audit" size={22} />} title={t('auNone')} description={t('auNoneBody')} />
        ) : (
          <div className="table-wrapper">
            <table className="table-stack">
              <thead>
                <tr>
                  <th>{t('auColWho')}</th>
                  <th>{t('auColAction')}</th>
                  <th>{t('auColResource')}</th>
                  <th>{t('auColDetail')}</th>
                  <th>{t('auColIp')}</th>
                  <th>{t('auColWhen')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="tbody-row">
                    <td className="cell-lead">
                      <div className="cell-stack">
                        <span className="cell-strong">{e.userName || t('auSystem')}</span>
                        {e.userEmail ? <span className="cell-sub">{e.userEmail}</span> : null}
                      </div>
                    </td>
                    <td data-label={t('auColAction')}>
                      <span className={`badge ${ACTION_BADGE[e.action] ?? 'badge-gray'}`}>{t(ACTION_LABEL[e.action] ?? 'auOther')}</span>
                    </td>
                    <td data-label={t('auColResource')} className="cell-muted" title={e.resourceId || undefined}>
                      {e.resource}{e.resourceId ? ` #${shortId(e.resourceId)}` : ''}
                    </td>
                    <td data-label={t('auColDetail')} className="cell-trim cell-detail">{e.detail || '-'}</td>
                    <td data-label={t('auColIp')} className="cell-muted cell-mono">{e.ipAddress || '-'}</td>
                    <td data-label={t('auColWhen')} className="cell-muted cell-nowrap">{when.format(new Date(e.createdAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!failed && !loading && <Pagination meta={meta} onPage={(p) => load(p, applied)} />}
      </Panel>
    </div>
  );
}
