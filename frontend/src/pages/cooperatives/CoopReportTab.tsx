import { AlertType } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { ALERT_TYPE_KEY } from '../../utils/alertTypes';
import { fill } from '../../utils/fill';
import Panel from '../../components/ui/Panel';
import StatTile from '../../components/ui/StatTile';
import { CoopPeriodBar, CoopReportGate } from './CoopReportGate';

const GRADES = ['A', 'B', 'C'];
const trim = (value: number, places = 2) => parseFloat(value.toFixed(places));

/** What happened in a cooperative between two dates: its farms and people in numbers, its harvest, its checks and its alerts. */
export default function CoopReportTab() {
  const { t, locale } = useLanguage();
  const number = new Intl.NumberFormat(locale);

  return (
    <div>
      <CoopPeriodBar />
      <CoopReportGate>
        {({ totals, harvest, checks, alerts }) => {
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
            </div>
          );
        }}
      </CoopReportGate>
    </div>
  );
}
