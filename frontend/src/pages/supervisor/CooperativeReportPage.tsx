import { useEffect, useMemo, useState } from 'react';
import { coopReportService, CoopReportParams } from '../../services/coopReport.service';
import { cooperativeService } from '../../services/cooperative.service';
import { AlertType, CoopReport, Cooperative } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useAutoFilters } from '../../hooks/useAutoFilters';
import { ALERT_TYPE_KEY } from '../../utils/alertTypes';
import { LEVEL_KEY } from '../../utils/farmRisk';
import { fill } from '../../utils/fill';
import { useDocumentTitle } from '../../utils/pageTitle';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import StatTile from '../../components/ui/StatTile';

const DEFAULT_DAYS = 30;
const MAX_DAYS = 366;
const GRADES = ['A', 'B', 'C'];

interface Filters {
  from: string;
  to: string;
  /** An admin's choice. Empty means every cooperative. */
  cooperative: string;
}

/** A date as the year-month-day the server asks for, in the person's own calendar day. */
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function lastThirtyDays(): Filters {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (DEFAULT_DAYS - 1));
  return { from: iso(start), to: iso(today), cooperative: '' };
}

/** The key of the sentence that says why these dates cannot make a report, or null when they can. */
function problemWith(f: Filters): 'cpNeedDates' | 'cpEndBefore' | 'cpTooLong' | null {
  if (!f.from || !f.to) return 'cpNeedDates';
  if (f.to < f.from) return 'cpEndBefore';
  const days = Math.round((Date.parse(f.to) - Date.parse(f.from)) / 86_400_000) + 1;
  return days > MAX_DAYS ? 'cpTooLong' : null;
}

const toParams = (f: Filters): CoopReportParams => ({ from: f.from, to: f.to, ...(f.cooperative ? { cooperative: f.cooperative } : {}) });
const trim = (value: number, places = 2) => parseFloat(value.toFixed(places));

/** The farms of a cooperative between two dates, as numbers on the screen and as a PDF or a CSV to keep. */
export default function CooperativeReportPage() {
  const { user } = useAuth();
  const { t, locale } = useLanguage();
  const { error: showError } = useToast();
  useDocumentTitle(t('ptCoopReport'));

  const isAdmin = user?.role === 'ADMIN';
  const [start] = useState(lastThirtyDays);
  const { draft, applied, set, reset, changed } = useAutoFilters<Filters>(start);

  const [report, setReport] = useState<CoopReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [making, setMaking] = useState<'csv' | 'pdf' | null>(null);
  const [coops, setCoops] = useState<Cooperative[]>([]);

  const draftProblem = problemWith(draft);
  const appliedProblem = problemWith(applied);

  useEffect(() => {
    if (!isAdmin) return;
    cooperativeService.getAll().then((res) => setCoops(res.data.data)).catch(() => setCoops([]));
  }, [isAdmin]);

  useEffect(() => {
    if (appliedProblem) return undefined;
    let live = true;
    setLoading(true);
    setFailed(false);
    coopReportService.get(toParams(applied))
      .then((res) => live && setReport(res.data.data))
      .catch(() => live && setFailed(true))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, attempt]);

  const sortedCoops = useMemo(() => [...coops].sort((a, b) => a.name.localeCompare(b.name)), [coops]);

  const download = (kind: 'csv' | 'pdf') => async () => {
    setMaking(kind);
    try {
      await coopReportService.download(toParams(applied), kind, locale);
    } catch {
      showError(t('auExportError'));
    } finally {
      setMaking(null);
    }
  };

  const number = new Intl.NumberFormat(locale);
  const blocked = !!draftProblem || !!appliedProblem || loading || failed || making !== null;

  return (
    <div>
      <PageHeader
        title={t('ptCoopReport')}
        subtitle={t(isAdmin ? 'cpSubtitleAdmin' : 'cpSubtitle')}
        actions={
          <div className="page-actions no-print">
            <button type="button" className="btn btn-secondary btn-sm" onClick={download('pdf')} disabled={blocked}>
              <Icon name="download" size={15} />
              {making === 'pdf' ? t('reportExporting') : t('reportExportPdf')}
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={download('csv')} disabled={blocked}>
              <Icon name="download" size={15} />
              {making === 'csv' ? t('reportExporting') : t('reportExportCsv')}
            </button>
          </div>
        }
      />

      <section className="panel" style={{ marginBottom: 24 }}>
      <form className="filters" onSubmit={(e) => e.preventDefault()}>
        <label className="filter-field">
          <span>{t('cpFrom')}</span>
          <input type="date" className="form-input" value={draft.from} onChange={(e) => set({ from: e.target.value }, true)} />
        </label>
        <label className="filter-field">
          <span>{t('cpTo')}</span>
          <input type="date" className="form-input" value={draft.to} onChange={(e) => set({ to: e.target.value }, true)} />
        </label>
        {isAdmin && (
          <label className="filter-field">
            <span>{t('cpCoop')}</span>
            <select className="form-select" value={draft.cooperative} onChange={(e) => set({ cooperative: e.target.value }, true)}>
              <option value="">{t('crAll')}</option>
              {sortedCoops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        {changed && <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>{t('auClear')}</button>}
      </form>
      </section>

      {draftProblem && <div className="alert alert-warning" role="alert">{t(draftProblem)}</div>}

      {appliedProblem ? null : loading ? (
        <SkeletonTable rows={6} cols={3} />
      ) : failed || !report ? (
        <div className="alert alert-error" role="alert">
          <span>{t('cpLoadError')}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAttempt((n) => n + 1)}>{t('cpRetry')}</button>
        </div>
      ) : (
        <Preview report={report} number={number} />
      )}
    </div>
  );
}

function Preview({ report, number }: { report: CoopReport; number: Intl.NumberFormat }) {
  const { t } = useLanguage();
  const { totals, harvest, checks, alerts, farms } = report;
  const byGrade = Object.fromEntries(harvest.byGrade.map((g) => [g.grade, g.count]));

  return (
    <div className="stack-24">
      <div className="grid-4">
        <StatTile icon="farms" label={t('crFarms')} value={number.format(totals.farms)} />
        <StatTile icon="users" label={t('crFarmers')} value={number.format(totals.farmers)} />
        <StatTile icon="batches" label={t('crBatchesNow')} value={number.format(totals.batchesRunning)} />
        <StatTile icon="activity" label={t('crBatchesStarted')} value={number.format(totals.batchesStarted)} />
      </div>

      <Panel title={t('crHarvest')}>
        {harvest.records === 0 ? (
          <p className="report-line">{t('crHarvestNone')}</p>
        ) : (
          <>
            <p className="report-line">
              {fill(t(harvest.records === 1 ? 'brHarvestSumOne' : 'brHarvestSum'), { n: harvest.records, kg: trim(harvest.totalKg), g: trim(harvest.silkG, 1) })}
            </p>
            <p className="report-line">{GRADES.map((g) => `${fill(t('hpGradeName'), { g })}: ${byGrade[g] ?? 0}`).join(', ')}</p>
          </>
        )}
      </Panel>

      <Panel title={t('crChecks')}>
        {checks.total === 0 ? (
          <p className="report-line">{t('crChecksNone')}</p>
        ) : (
          <>
            <p className="report-line">{fill(t(checks.total === 1 ? 'brChecksSummaryOne' : 'brChecksSummary'), { n: checks.total, p: checks.found })}</p>
            <table className="report-table">
              <thead><tr><th>{t('brColResult')}</th><th>{t('crColCount')}</th></tr></thead>
              <tbody>{checks.byResult.map((r) => <tr key={r.result}><td>{r.result}</td><td>{number.format(r.count)}</td></tr>)}</tbody>
            </table>
          </>
        )}
      </Panel>

      <Panel title={t('crAlerts')}>
        {alerts.total === 0 ? (
          <p className="report-line">{t('crAlertsNone')}</p>
        ) : (
          <>
            <p className="report-line">{fill(t(alerts.total === 1 ? 'crAlertsSumOne' : 'crAlertsSum'), { n: alerts.total, a: alerts.acknowledged, r: alerts.resolved })}</p>
            <table className="report-table">
              <thead><tr><th>{t('crColType')}</th><th>{t('crColCount')}</th></tr></thead>
              <tbody>
                {alerts.byType.map((a) => <tr key={a.type}><td>{t(ALERT_TYPE_KEY[a.type as AlertType] ?? 'alTypeSystem')}</td><td>{number.format(a.count)}</td></tr>)}
              </tbody>
            </table>
          </>
        )}
      </Panel>

      <Panel title={t('crRisk')} note={t('crRiskNote')} flush>
        {farms.length === 0 ? (
          <EmptyState icon={<Icon name="farms" size={22} />} title={t('fkNoFarms')} />
        ) : (
          <div className="table-wrapper">
            <table className="table-stack">
              <thead>
                <tr><th>{t('crColFarm')}</th><th>{t('fsOwner')}</th><th>{t('crColLevel')}</th><th>{t('crColWhy')}</th></tr>
              </thead>
              <tbody>
                {farms.map((f) => (
                  <tr key={f.id} className="tbody-row">
                    <td className="cell-lead cell-strong">{f.name}</td>
                    <td data-label={t('fsOwner')}>{f.ownerName}</td>
                    <td data-label={t('crColLevel')}><span className={`risk-badge risk-${f.level.toLowerCase()}`}>{t(LEVEL_KEY[f.level])}</span></td>
                    <td data-label={t('crColWhy')} className="cell-muted">{whyText(f, t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title={t('crEachFarm')} flush>
        {farms.length === 0 ? (
          <EmptyState icon={<Icon name="farms" size={22} />} title={t('fkNoFarms')} />
        ) : (
          <div className="table-wrapper">
            <table className="table-stack">
              <thead>
                <tr><th>{t('crColFarm')}</th><th>{t('crColBatches')}</th><th>{t('crColKg')}</th><th>{t('crColAlerts')}</th></tr>
              </thead>
              <tbody>
                {farms.map((f) => (
                  <tr key={f.id} className="tbody-row">
                    <td className="cell-lead cell-strong">{f.name}</td>
                    <td data-label={t('crColBatches')}>{number.format(f.activeBatches)}</td>
                    <td data-label={t('crColKg')}>{number.format(trim(f.harvestKg))}</td>
                    <td data-label={t('crColAlerts')}>{number.format(f.alerts)}</td>
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

function whyText(f: CoopReport['farms'][number], t: (k: string) => string): string {
  const parts = [
    f.diseaseAlerts > 0 && fill(t(f.diseaseAlerts === 1 ? 'fkDiseaseOne' : 'fkDisease'), { n: f.diseaseAlerts }),
    f.openAirAlerts > 0 && fill(t(f.openAirAlerts === 1 ? 'fkAirOne' : 'fkAir'), { n: f.openAirAlerts }),
    f.offlineDevices > 0 && fill(t(f.offlineDevices === 1 ? 'fkDevicesOne' : 'fkDevices'), { n: f.offlineDevices }),
  ].filter(Boolean) as string[];
  return parts.join('; ') || '-';
}
