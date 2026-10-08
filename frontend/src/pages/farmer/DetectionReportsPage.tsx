import { FormEvent, useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { detectionReportService, DetectionHistoryItem, DetectionStat } from '../../services/admin.service';
import { farmService } from '../../services/farm.service';
import { Farm } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';
import { colorFor } from '../../utils/chartColors';
import { fill } from '../../utils/fill';
import BarList from '../../components/ui/BarList';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import StatTile from '../../components/ui/StatTile';

interface Filters {
  farmId: string;
  dateFrom: string;
  dateTo: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const monthAgo = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
};
const defaults = (): Filters => ({ farmId: '', dateFrom: monthAgo(), dateTo: today() });

const HOME: Record<string, string> = { ADMIN: '/admin', SUPERVISOR: '/supervisor', FARMER: '/farmer' };

export default function DetectionReportsPage() {
  const { user: me } = useAuth();
  const { t, locale } = useLanguage();
  const { getErrorMessage } = useApiError();
  const { error: showError } = useToast();

  const [farms, setFarms] = useState<Farm[]>([]);
  const [draft, setDraft] = useState<Filters>(defaults);
  const [applied, setApplied] = useState<Filters>(draft);
  const [history, setHistory] = useState<DetectionHistoryItem[]>([]);
  const [stats, setStats] = useState<DetectionStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState(false);

  const isFarmer = me?.role === 'FARMER';

  useEffect(() => {
    if (!isFarmer) farmService.getAll().then((r) => setFarms(r.data.data)).catch(() => setFarms([]));
  }, [isFarmer]);

  const load = useCallback((filters: Filters) => {
    const params = { farmId: filters.farmId || undefined, dateFrom: filters.dateFrom || undefined, dateTo: filters.dateTo || undefined };
    setLoading(true);
    setFailed(false);
    Promise.all([detectionReportService.getHistory({ ...params, limit: 200 }), detectionReportService.getStats(params)])
      .then(([historyRes, statsRes]) => {
        setHistory(historyRes.data.data);
        setStats(statsRes.data.data);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(applied); }, [applied, load]);

  const apply = (e: FormEvent) => {
    e.preventDefault();
    setApplied(draft);
  };

  const reset = () => {
    const fresh = defaults();
    setDraft(fresh);
    setApplied(fresh);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await detectionReportService.exportCsv({
        farmId: applied.farmId || undefined,
        dateFrom: applied.dateFrom || undefined,
        dateTo: applied.dateTo || undefined,
        limit: 500,
      });
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const healthy = history.filter((h) => h.result === 'Healthy').length;
  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const found = [...stats].sort((a, b) => b.count - a.count);

  return (
    <div>
      <PageHeader
        title={t('ptDetectionReports')}
        subtitle={t('drSubtitle')}
        actions={
          <>
            <button className="btn btn-secondary btn-sm" onClick={exportCsv} disabled={exporting || loading}>
              <Icon name="download" size={15} />
              {exporting ? t('drExporting') : t('drExport')}
            </button>
            <Link to={HOME[me?.role ?? 'FARMER'] ?? '/farmer'} className="btn btn-ghost btn-sm">
              <Icon name="back" size={15} />
              {t('drBackDash')}
            </Link>
          </>
        }
      />

      <div className="stack-24">
        <Panel title={t('drShow')} flush>
          <form className="filters" onSubmit={apply}>
            {!isFarmer && (
              <label className="filter-field">
                <span>{t('drFarm')}</span>
                <select className="inline-select" value={draft.farmId} onChange={(e) => setDraft((d) => ({ ...d, farmId: e.target.value }))}>
                  <option value="">{t('drAllFarms')}</option>
                  {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </label>
            )}
            <label className="filter-field">
              <span>{t('drFrom')}</span>
              <input type="date" className="form-input filter-input" value={draft.dateFrom} max={draft.dateTo || undefined} onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))} />
            </label>
            <label className="filter-field">
              <span>{t('drTo')}</span>
              <input type="date" className="form-input filter-input" value={draft.dateTo} min={draft.dateFrom || undefined} onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))} />
            </label>
            <div className="filter-buttons">
              <button type="submit" className="btn btn-secondary btn-sm">{t('drApply')}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>{t('drReset')}</button>
            </div>
          </form>
        </Panel>

        {failed ? (
          <div className="alert alert-error" role="alert">
            <span style={{ flex: 1 }}>{t('drLoadError')}</span>
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => load(applied)}>{t('btnRetry')}</button>
          </div>
        ) : (
          <>
            <div className="grid-3">
              <StatTile label={t('drTotal')} value={history.length} />
              <StatTile label={t('drHealthy')} value={healthy} good />
              <StatTile label={t('drAttention')} value={history.length - healthy} />
            </div>

            <Panel title={t('drFound')} note={t('drFoundNote')}>
              {loading ? (
                <SkeletonTable rows={3} cols={2} />
              ) : found.length === 0 ? (
                <EmptyState icon={<Icon name="systemReport" size={22} />} title={t('drNoStats')} description={t('drNoStatsBody')} />
              ) : (
                <BarList
                  label={t('drFound')}
                  rows={found.map((s) => ({ key: s.result, label: s.result, value: s.count, color: colorFor('result', s.result) }))}
                />
              )}
            </Panel>

            <Panel title={t('drHistory')} note={loading ? undefined : fill(t(history.length === 1 ? 'drHistoryCountOne' : 'drHistoryCount'), { n: history.length })} flush>
              {loading ? (
                <SkeletonTable rows={6} cols={6} />
              ) : history.length === 0 ? (
                <EmptyState icon={<Icon name="detections" size={22} />} title={t('drNone')} description={t('drNoneBody')} />
              ) : (
                <div className="table-wrapper">
                  <table className="table-stack">
                    <thead>
                      <tr>
                        <th>{t('drColFarm')}</th>
                        <th>{t('drColBatch')}</th>
                        <th>{t('drColResult')}</th>
                        <th>{t('drColSure')}</th>
                        <th>{t('drColWhen')}</th>
                        <th>{t('drColNotes')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((d) => (
                        <tr key={d.id} className="tbody-row">
                          <td className="cell-lead cell-strong">
                            {d.farmId ? <Link to={`/farms/${d.farmId}`} className="link">{d.farmName}</Link> : '-'}
                          </td>
                          <td data-label={t('drColBatch')} className="cell-mono">
                            <Link to={`/batches/${d.batchId}`} className="link">#{d.batchId.slice(-8).toUpperCase()}</Link>
                          </td>
                          <td data-label={t('drColResult')}>
                            <span className="badge badge-stage badge-dot" style={{ '--c': colorFor('result', d.result) } as CSSProperties}>{d.result}</span>
                          </td>
                          <td data-label={t('drColSure')} className="cell-nowrap">{Math.round(d.confidence * 100)}%</td>
                          <td data-label={t('drColWhen')} className="cell-muted cell-nowrap">{when.format(new Date(d.detectedAt))}</td>
                          <td data-label={t('drColNotes')} className="cell-muted">{d.notes ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}
