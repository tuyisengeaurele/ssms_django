import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useAutoFilters } from '../../hooks/useAutoFilters';
import { JobRow, LogFilters, logsService, LogStream, RequestRow, SecurityRow } from '../../services/logs.service';
import { fill } from '../../utils/fill';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import Pagination from '../../components/ui/Pagination';
import Panel from '../../components/ui/Panel';
import SectionHeader from '../../components/ui/SectionHeader';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import { dateFormat } from '../../utils/dateFormat';

type Row = SecurityRow | RequestRow | JobRow;

const SECURITY_KINDS = [
  'login_ok', 'login_failed', 'lockout', 'password_changed', 'reset_requested', 'new_device',
  'session_revoked', 'session_reused', 'session_idle', 'permission_denied', 'throttled',
  'support_requested', 'support_allowed', 'support_rejected', 'support_started', 'support_ended', 'support_expired', 'support_refused',
];
const JOB_KINDS = ['email_failed', 'device_rejected', 'device_offline', 'command_started', 'command_finished', 'command_failed'];
const STATUS_CLASSES = ['2xx', '3xx', '4xx', '5xx'];

const KINDS: Record<LogStream, string[]> = { security: SECURITY_KINDS, jobs: JOB_KINDS, requests: [] };

/** The filters each stream has. A date range and a reference are on all of them. */
const SEARCHABLE: LogStream[] = ['security', 'jobs'];

const NO_FILTERS: LogFilters = { search: '', kind: '', status: '', route: '', reference: '', from: '', to: '' };

const statusBadge = (status: number) => (status >= 500 ? 'badge-red' : status >= 400 ? 'badge-yellow' : 'badge-green');

interface Props {
  stream: LogStream;
}

/** One of the logs that is not the audit log: a filter bar, a table, pages and an export. */
export default function LogStreamPanel({ stream }: Props) {
  const { t, locale } = useLanguage();
  const { success, error: showError } = useToast();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [meta, setMeta] = useState({ page: 1, pageSize: 25, totalItems: 0, totalPages: 1, hasNext: false, hasPrev: false });

  const { draft, applied, set, reset, changed } = useAutoFilters<LogFilters>(NO_FILTERS);

  const load = useCallback(async (page: number, filters: LogFilters) => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await logsService.list<Row>(stream, { ...filters, page });
      setRows(res.data.data);
      setMeta(res.data.pagination);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [stream]);

  useEffect(() => {
    load(1, applied);
  }, [load, applied]);

  const download = async () => {
    setExporting(true);
    try {
      await logsService.exportCsv(stream, applied);
      success(t('lgExported'));
    } catch {
      showError(t('lgExportError'));
    } finally {
      setExporting(false);
    }
  };

  const when = dateFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const kindWord = (kind: string) => {
    const key = `lgKind_${kind}`;
    const word = t(key);
    return word === key ? kind : word;
  };
  const kinds = KINDS[stream];

  const head = (labels: string[]) => (
    <thead>
      <tr>{labels.map((l) => <th key={l}>{t(l)}</th>)}</tr>
    </thead>
  );
  const reference = (id: string) => (id ? <code className="cell-mono">{id}</code> : '-');

  return (
    <div>
      <SectionHeader
        title={t(`lgStream_${stream}`)}
        subtitle={loading && rows.length === 0 ? undefined : fill(t(meta.totalItems === 1 ? 'lgSummaryOne' : 'lgSummary'), { n: meta.totalItems.toLocaleString(locale) })}
        actions={
          <button type="button" className="btn btn-primary btn-sm" onClick={download} disabled={exporting}>
            <Icon name="download" size={15} />
            {exporting ? t('lgExporting') : t('lgExport')}
          </button>
        }
      />

      <Panel title={t(`lgStream_${stream}`)} flush>
        <form className="filters" onSubmit={(e) => e.preventDefault()}>
          {SEARCHABLE.includes(stream) && (
            <div className="search-box">
              <Icon name="search" size={16} className="icon" />
              <input type="search" aria-label={t('lgSearch')} placeholder={t('lgSearch')} value={draft.search} onChange={(e) => set({ search: e.target.value })} />
            </div>
          )}

          {kinds.length > 0 && (
            <label className="filter-field">
              <span>{t('lgKind')}</span>
              <select className="inline-select" value={draft.kind} onChange={(e) => set({ kind: e.target.value }, true)}>
                <option value="">{t('lgAllKinds')}</option>
                {kinds.map((k) => <option key={k} value={k}>{kindWord(k)}</option>)}
              </select>
            </label>
          )}

          {stream === 'requests' && (
            <>
              <label className="filter-field">
                <span>{t('lgStatus')}</span>
                <select className="inline-select" value={draft.status} onChange={(e) => set({ status: e.target.value }, true)}>
                  <option value="">{t('lgAllStatuses')}</option>
                  {STATUS_CLASSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="filter-field">
                <span>{t('lgRoute')}</span>
                <input className="form-input filter-input" value={draft.route} onChange={(e) => set({ route: e.target.value })} />
              </label>
            </>
          )}

          <label className="filter-field">
            <span>{t('lgReference')}</span>
            <input className="form-input filter-input" value={draft.reference} onChange={(e) => set({ reference: e.target.value.trim() })} />
          </label>
          <label className="filter-field">
            <span>{t('lgFrom')}</span>
            <input type="date" className="form-input filter-input" value={draft.from} onChange={(e) => set({ from: e.target.value }, true)} />
          </label>
          <label className="filter-field">
            <span>{t('lgTo')}</span>
            <input type="date" className="form-input filter-input" value={draft.to} onChange={(e) => set({ to: e.target.value }, true)} />
          </label>

          {changed && (
            <div className="filter-buttons">
              <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>{t('lgClear')}</button>
            </div>
          )}
        </form>

        {failed ? (
          <div className="alert alert-error panel-alert" role="alert">
            <span style={{ flex: 1 }}>{t('lgLoadError')}</span>
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => load(meta.page, applied)}>{t('btnRetry')}</button>
          </div>
        ) : loading ? (
          <SkeletonTable rows={8} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Icon name="audit" size={22} />} title={t('lgNone')} description={t('lgNoneBody')} />
        ) : (
          <div className="table-wrapper">
            <table className="table-stack">
              {stream === 'security' && head(['lgColWhen', 'lgColEvent', 'lgColPerson', 'lgColAddress', 'lgColDetail', 'lgColReference'])}
              {stream === 'requests' && head(['lgColWhen', 'lgColMethod', 'lgColRoute', 'lgColStatus', 'lgColTime', 'lgColRole', 'lgColAddress', 'lgColReference'])}
              {stream === 'jobs' && head(['lgColWhen', 'lgColWhat', 'lgColSubject', 'lgColDetail', 'lgColReference'])}
              <tbody>
                {stream === 'security' && (rows as SecurityRow[]).map((r) => (
                  <tr key={r.id} className="tbody-row">
                    <td className="cell-muted cell-nowrap cell-lead">{when.format(new Date(r.createdAt))}</td>
                    <td data-label={t('lgColEvent')}><span className="badge badge-gray">{kindWord(r.kind)}</span></td>
                    <td data-label={t('lgColPerson')} className="cell-muted">{r.userEmail || '-'}</td>
                    <td data-label={t('lgColAddress')} className="cell-muted cell-mono">{r.ipAddress || '-'}</td>
                    <td data-label={t('lgColDetail')} className="cell-trim cell-detail">{r.detail || '-'}</td>
                    <td data-label={t('lgColReference')}>{reference(r.requestId)}</td>
                  </tr>
                ))}
                {stream === 'requests' && (rows as RequestRow[]).map((r) => (
                  <tr key={r.id} className="tbody-row">
                    <td className="cell-muted cell-nowrap cell-lead">{when.format(new Date(r.createdAt))}</td>
                    <td data-label={t('lgColMethod')} className="cell-mono">{r.method}</td>
                    <td data-label={t('lgColRoute')} className="cell-trim cell-detail cell-mono">{r.route}</td>
                    <td data-label={t('lgColStatus')}><span className={`badge ${statusBadge(r.status)}`}>{r.status}</span></td>
                    <td data-label={t('lgColTime')} className="cell-muted cell-nowrap">{r.durationMs} ms</td>
                    <td data-label={t('lgColRole')} className="cell-muted">{r.role || '-'}</td>
                    <td data-label={t('lgColAddress')} className="cell-muted cell-mono">{r.ipAddress || '-'}</td>
                    <td data-label={t('lgColReference')}>{reference(r.requestId)}</td>
                  </tr>
                ))}
                {stream === 'jobs' && (rows as JobRow[]).map((r) => (
                  <tr key={r.id} className="tbody-row">
                    <td className="cell-muted cell-nowrap cell-lead">{when.format(new Date(r.createdAt))}</td>
                    <td data-label={t('lgColWhat')}><span className="badge badge-gray">{kindWord(r.kind)}</span></td>
                    <td data-label={t('lgColSubject')} className="cell-strong">{r.subject || '-'}</td>
                    <td data-label={t('lgColDetail')} className="cell-trim cell-detail">{r.detail || '-'}</td>
                    <td data-label={t('lgColReference')}>{reference(r.requestId)}</td>
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
