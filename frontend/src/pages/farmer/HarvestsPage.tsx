import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { harvestService } from '../../services/harvest.service';
import { HarvestRecord, QualityGrade } from '../../types';
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

const GRADES: QualityGrade[] = ['A', 'B', 'C'];

// Django sends decimal fields as strings, and a plain number reads better than "12.50".
const num = (value: unknown) => Number(value) || 0;
const trim = (value: number, places = 2) => parseFloat(value.toFixed(places));

export default function HarvestsPage() {
  const { error: showError } = useToast();
  const { getErrorMessage } = useApiError();
  const { t, locale } = useLanguage();

  const [records, setRecords] = useState<HarvestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    harvestService.getAll()
      .then((r) => setRecords(r.data.data))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

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

  const totalKg = records.reduce((sum, r) => sum + num(r.cocoonWeightKg), 0);
  const totalSilk = records.reduce((sum, r) => sum + num(r.silkYieldG), 0);
  const average = records.length > 0 ? totalKg / records.length : 0;

  const kgByFarm = records.reduce<Record<string, number>>((acc, r) => {
    const name = r.farmName ?? batchName(r.batchId);
    acc[name] = (acc[name] ?? 0) + num(r.cocoonWeightKg);
    return acc;
  }, {});
  const farms = Object.entries(kgByFarm).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const query = search.trim().toLowerCase();
  const visible = records.filter((r) =>
    !query
    || (r.farmName ?? '').toLowerCase().includes(query)
    || r.qualityGrade.toLowerCase().includes(query)
    || (r.notes ?? '').toLowerCase().includes(query),
  );

  return (
    <div>
      <PageHeader
        title={t('ptHarvests')}
        subtitle={loading || failed ? undefined : fill(t(records.length === 1 ? 'hvSubtitleOne' : 'hvSubtitleMany'), { n: records.length })}
        actions={
          <button className="btn btn-secondary btn-sm" onClick={exportCsv} disabled={exporting || records.length === 0}>
            <Icon name="download" size={15} />
            {exporting ? t('drExporting') : t('drExport')}
          </button>
        }
      />

      {failed ? (
        <div className="alert alert-error" role="alert">
          <span style={{ flex: 1 }}>{t('hvLoadError')}</span>
          <button type="button" className="btn btn-secondary btn-xs" onClick={load}>{t('btnRetry')}</button>
        </div>
      ) : loading ? (
        <SkeletonTable rows={5} cols={6} />
      ) : records.length === 0 ? (
        <Panel title={t('hvAll')} flush>
          <EmptyState icon={<Icon name="harvests" size={22} />} title={t('hvNone')} description={t('hvNoneBody')} />
        </Panel>
      ) : (
        <div className="stack-24">
          <div className="grid-4">
            <StatTile label={t('hpTileRecords')} value={records.length} />
            <StatTile label={t('hpTileCocoon')} value={`${trim(totalKg)} kg`} />
            <StatTile label={t('hpTileSilk')} value={`${trim(totalSilk, 1)} g`} />
            <StatTile label={t('hvAvg')} value={`${trim(average)} kg`} />
          </div>

          <div className="split">
            <Panel title={t('hvByFarm')} note={t('hvByFarmNote')}>
              <BarList
                label={t('hvByFarm')}
                rows={farms.map(([name, kg]) => ({ key: name, label: name, value: kg, color: colorFor('grade', 'A') }))}
                format={(v) => `${trim(v)} kg`}
              />
            </Panel>
            <Panel title={t('hpGrades')} note={t('hpGradesNote')}>
              <BarList
                label={t('hpGrades')}
                rows={GRADES.map((g) => ({ key: g, label: fill(t('hpGradeName'), { g }), value: records.filter((r) => r.qualityGrade === g).length, color: colorFor('grade', g) }))}
              />
            </Panel>
          </div>

          <Panel
            title={t('hvAll')}
            note={fill(t('hpCount'), { n: visible.length })}
            flush
            actions={
              <div className="search-box">
                <Icon name="search" size={16} className="icon" />
                <input type="search" aria-label={t('hvSearch')} placeholder={t('hvSearch')} value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            }
          >
            {visible.length === 0 ? (
              <EmptyState
                icon={<Icon name="search" size={22} />}
                title={t('hvNoMatch')}
                description={t('hvNoMatchBody')}
                action={{ label: t('hvClear'), onClick: () => setSearch('') }}
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
                    {visible.map((r) => {
                      const farm = r.farmName ?? batchName(r.batchId);
                      return (
                        <tr key={r.id} className="tbody-row">
                          <td className="cell-lead cell-muted cell-nowrap">{date.format(new Date(r.harvestedAt))}</td>
                          <td data-label={t('hvColFarm')} className="cell-strong">{farm}</td>
                          <td data-label={t('hpColCocoon')} className="cell-nowrap">{trim(num(r.cocoonWeightKg))} kg</td>
                          <td data-label={t('hpColSilk')} className="cell-nowrap">{r.silkYieldG != null ? `${trim(num(r.silkYieldG), 1)} g` : '-'}</td>
                          <td data-label={t('hpColGrade')}>
                            <span className="badge badge-stage badge-dot" style={{ '--c': colorFor('grade', r.qualityGrade) } as CSSProperties}>
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
        </div>
      )}
    </div>
  );
}
