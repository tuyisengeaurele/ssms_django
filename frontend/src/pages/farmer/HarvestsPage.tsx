import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { harvestService } from '../../services/harvest.service';
import { HarvestRecord, HarvestStats, PageMeta, QualityGrade } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';
import { colorFor } from '../../utils/chartColors';
import { fill } from '../../utils/fill';
import BarList from '../../components/ui/BarList';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import Panel from '../../components/ui/Panel';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import StatTile from '../../components/ui/StatTile';

const GRADES: QualityGrade[] = ['A', 'B', 'C'];

// Django sends decimal fields as strings, and a plain number reads better than "12.50".
const num = (value: unknown) => Number(value) || 0;
const trim = (value: number, places = 2) => parseFloat(value.toFixed(places));

export default function HarvestsPage() {
  const { error: showError } = useToast();
  const { getErrorMessage } = useApiError();
  const { t, locale } = useLanguage();

  const [stats, setStats] = useState<HarvestStats | null>(null);
  const [rows, setRows] = useState<HarvestRecord[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [page, setPage] = useState(1);
  // What is typed, and what was last asked for. The server is asked once typing pauses.
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadStats = useCallback(() => {
    harvestService.getStats()
      .then((r) => setStats(r.data.data))
      .catch(() => setFailed(true));
  }, []);

  const loadPage = useCallback(() => {
    harvestService.getPage(page, term)
      .then((r) => {
        setRows(r.data.data);
        setMeta(r.data.pagination);
        setFailed(false);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [page, term]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadPage(); }, [loadPage]);

  useEffect(() => {
    const next = search.trim();
    if (next === term) return undefined;
    const timer = setTimeout(() => { setTerm(next); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search, term]);

  const retry = () => {
    setLoading(true);
    setFailed(false);
    loadStats();
    loadPage();
  };

  const clearSearch = () => {
    setSearch('');
    setTerm('');
    setPage(1);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await harvestService.exportCsv();
      const url = URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'harvest_records.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const batchName = (id: string) => fill(t('bdTitle'), { id: id.slice(-8).toUpperCase() });

  const total = stats?.recordCount ?? 0;
  const farms = stats?.byFarm ?? [];
  const grades = stats?.byGrade ?? [];

  return (
    <div>
      <PageHeader
        title={t('ptHarvests')}
        subtitle={loading || failed ? undefined : fill(t(total === 1 ? 'hvSubtitleOne' : 'hvSubtitleMany'), { n: total })}
        actions={
          <button className="btn btn-secondary btn-sm" onClick={exportCsv} disabled={exporting || total === 0}>
            <Icon name="download" size={15} />
            {exporting ? t('drExporting') : t('drExport')}
          </button>
        }
      />

      {failed ? (
        <div className="alert alert-error" role="alert">
          <span style={{ flex: 1 }}>{t('hvLoadError')}</span>
          <button type="button" className="btn btn-secondary btn-xs" onClick={retry}>{t('btnRetry')}</button>
        </div>
      ) : loading ? (
        <SkeletonTable rows={5} cols={6} />
      ) : total === 0 ? (
        <Panel title={t('hvAll')} flush>
          <EmptyState icon={<Icon name="harvests" size={22} />} title={t('hvNone')} description={t('hvNoneBody')} />
        </Panel>
      ) : (
        <div className="stack-24">
          <div className="grid-4">
            <StatTile label={t('hpTileRecords')} value={total} />
            <StatTile label={t('hpTileCocoon')} value={`${trim(num(stats?.totalWeightKg))} kg`} />
            <StatTile label={t('hpTileSilk')} value={`${trim(num(stats?.totalSilkG), 1)} g`} />
            <StatTile label={t('hvAvg')} value={`${trim(num(stats?.avgWeightKg))} kg`} />
          </div>

          <div className="split">
            <Panel title={t('hvByFarm')} note={t('hvByFarmNote')}>
              <BarList
                label={t('hvByFarm')}
                rows={farms.map((f) => ({ key: f.farm, label: f.farm, value: f.totalKg, color: colorFor('grade', 'A') }))}
                format={(v) => `${trim(v)} kg`}
              />
            </Panel>
            <Panel title={t('hpGrades')} note={t('hpGradesNote')}>
              <BarList
                label={t('hpGrades')}
                rows={GRADES.map((g) => ({ key: g, label: fill(t('hpGradeName'), { g }), value: grades.find((x) => x.grade === g)?.count ?? 0, color: colorFor('grade', g) }))}
              />
            </Panel>
          </div>

          <Panel
            title={t('hvAll')}
            note={fill(t(meta?.totalItems === 1 ? 'hpCountOne' : 'hpCount'), { n: meta?.totalItems ?? rows.length })}
            flush
            actions={
              <div className="search-box">
                <Icon name="search" size={16} className="icon" />
                <input type="search" aria-label={t('hvSearch')} placeholder={t('hvSearchShort')} value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            }
          >
            {rows.length === 0 ? (
              <EmptyState
                icon={<Icon name="search" size={22} />}
                title={t('hvNoMatch')}
                description={t('hvNoMatchBody')}
                action={{ label: t('hvClear'), onClick: clearSearch }}
              />
            ) : (
              <div className="table-wrapper">
                <table className="table-stack">
                  <thead>
                    <tr>
                      <th>{t('hpColDate')}</th>
                      <th>{t('hvColFarm')}</th>
                      <th>{t('hpColCocoon')}</th>
                      <th>{t('hpColSilk')}</th>
                      <th>{t('hpColGrade')}</th>
                      <th>{t('hpColNotes')}</th>
                      <th><span className="sr-only">{t('hvOpen')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const farm = r.farmName ?? batchName(r.batchId);
                      return (
                        <tr key={r.id} className="tbody-row">
                          <td className="cell-lead cell-muted cell-nowrap">{date.format(new Date(r.harvestedAt))}</td>
                          <td data-label={t('hvColFarm')} className="cell-strong">{farm}</td>
                          <td data-label={t('hpColCocoon')} className="cell-nowrap">{trim(num(r.cocoonWeightKg))} kg</td>
                          <td data-label={t('hpColSilk')} className="cell-nowrap">{r.silkYieldG != null ? `${trim(num(r.silkYieldG), 1)} g` : '-'}</td>
                          <td data-label={t('hpColGrade')}>
                            <span className="badge badge-stage" style={{ '--c': colorFor('grade', r.qualityGrade) } as CSSProperties}>
                              {fill(t('hpGradeName'), { g: r.qualityGrade })}
                            </span>
                          </td>
                          <td data-label={t('hpColNotes')} className="cell-muted">{r.notes ?? '-'}</td>
                          <td data-label="">
                            <Link to={`/batches/${r.batchId}/harvest`} className="btn btn-ghost btn-xs" aria-label={`${t('hvOpen')} ${farm}`}>
                              {t('hvOpen')}
                              <Icon name="forward" size={13} />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          {meta && (
            <div className="panel pager-panel">
              <Pagination meta={meta} onPage={setPage} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
