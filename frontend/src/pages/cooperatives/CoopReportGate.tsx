import { ReactNode } from 'react';
import { CoopReport } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { Icon } from '../../components/ui/Icon';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import { useCoop } from './coopContext';

/** The dates and the downloads that sit at the top of every section that shows the report. */
export function CoopPeriodBar() {
  const { t } = useLanguage();
  const { period } = useCoop();

  return (
    <>
      <section className="panel coop-period no-print">
        <form className="filters" onSubmit={(e) => e.preventDefault()}>
          <label className="filter-field">
            <span>{t('cpFrom')}</span>
            <input type="date" className="form-input" value={period.draft.from} onChange={(e) => period.set({ from: e.target.value }, true)} />
          </label>
          <label className="filter-field">
            <span>{t('cpTo')}</span>
            <input type="date" className="form-input" value={period.draft.to} onChange={(e) => period.set({ to: e.target.value }, true)} />
          </label>
          {period.changed && <button type="button" className="btn btn-ghost btn-sm" onClick={period.reset}>{t('auClear')}</button>}
          <div className="filter-buttons">
            <button type="button" className="btn btn-secondary btn-sm" onClick={period.download('pdf')} disabled={period.blocked}>
              <Icon name="download" size={15} />
              {period.making === 'pdf' ? t('reportExporting') : t('reportExportPdf')}
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={period.download('csv')} disabled={period.blocked}>
              <Icon name="download" size={15} />
              {period.making === 'csv' ? t('reportExporting') : t('reportExportCsv')}
            </button>
          </div>
        </form>
      </section>
      {period.draftProblem && <div className="alert alert-warning" role="alert">{t(period.draftProblem)}</div>}
    </>
  );
}

/** What to show while the report loads, when it cannot be had, and nothing at all while the dates cannot make one. */
export function CoopReportGate({ children }: { children: (report: CoopReport) => ReactNode }) {
  const { t } = useLanguage();
  const { period } = useCoop();

  if (period.appliedProblem) return null;
  if (period.loading) return <SkeletonTable rows={6} cols={3} />;
  if (period.failed || !period.report) {
    return (
      <div className="alert alert-error" role="alert">
        <span>{t('cpLoadError')}</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={period.retry}>{t('cpRetry')}</button>
      </div>
    );
  }
  return <>{children(period.report)}</>;
}
