import { useEffect, useState } from 'react';
import { reportService, ReportSummary } from '../../services/admin.service';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { fill } from '../../utils/fill';
import { colorFor } from '../../utils/chartColors';
import { STAGE_LABELS, STAGE_ORDER } from '../../utils/constants';
import { ROLE_LABEL_KEY } from '../../components/layout/Sidebar';
import { Role } from '../../types';
import BarList from '../../components/ui/BarList';
import { Icon } from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import StatTile from '../../components/ui/StatTile';
import TimeSeries from '../../components/ui/TimeSeries';

const ACTION_LABEL: Record<string, string> = {
  CREATE: 'auCreate', UPDATE: 'auUpdate', DELETE: 'auDelete', LOGIN: 'auLogin', LOGOUT: 'auLogout', OTHER: 'auOther',
};

const stageRank = (stage: string) => {
  const i = (STAGE_ORDER as readonly string[]).indexOf(stage);
  return i === -1 ? STAGE_ORDER.length : i;
};

export default function AdminReportsPage() {
  const { t, locale } = useLanguage();
  const { error: showError } = useToast();
  const [data, setData] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = () => {
    setLoading(true);
    setFailed(false);
    reportService.getSummary()
      .then((res) => setData(res.data.data))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCsv = async () => {
    setExporting(true);
    try {
      await reportService.exportCsv();
    } catch {
      showError(t('rpCsvError'));
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title={t('ptSystemReport')} />
        <p className="panel-loading"><span className="spinner" /></p>
      </div>
    );
  }

  if (failed || !data) {
    return (
      <div>
        <PageHeader title={t('ptSystemReport')} />
        <div className="alert alert-error" role="alert">
          <span style={{ flex: 1 }}>{t('rpLoadError')}</span>
          <button type="button" className="btn btn-secondary btn-xs" onClick={load}>{t('btnRetry')}</button>
        </div>
      </div>
    );
  }

  const { users, farms, batches, harvests, detections, audit, topFarmers } = data;
  const farmers = users.byRole.find((r) => r.role === 'FARMER')?.count ?? 0;
  const generated = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.generatedAt));

  return (
    <div className="print-page">
      <PageHeader
        title={t('ptSystemReport')}
        subtitle={`${t('reportGenerated')} ${generated}`}
        actions={
          <div className="page-actions no-print">
            <button className="btn btn-secondary btn-sm" onClick={() => window.print()}>
              <Icon name="print" size={15} />
              {t('reportExportPdf')}
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleCsv} disabled={exporting}>
              <Icon name="download" size={15} />
              {exporting ? t('reportExporting') : t('reportExportCsv')}
            </button>
          </div>
        }
      />

      <div className="grid-5">
        <StatTile label={t('reportTotalUsers')} value={users.total} hint={fill(t('rpFarmersHint'), { n: farmers })} />
        <StatTile label={t('reportTotalFarms')} value={farms.total} />
        <StatTile label={t('reportTotalBatches')} value={batches.total} />
        <StatTile label={t('reportTotalHarvests')} value={harvests.total} hint={fill(t('rpKgHint'), { kg: harvests.totalKg.toFixed(1) })} />
        <StatTile label={t('reportTotalDetections')} value={detections.total} />
      </div>

      <div className="report-grid">
        <Panel title={t('rpRegistrations')}>
          {users.registrations30d.length === 0 ? (
            <p className="chart-empty">{t('rpNoRegistrations')}</p>
          ) : (
            <TimeSeries label={t('rpRegistrations')} unit={t('rpUnitUsers')} data={users.registrations30d} color={colorFor('role', 'FARMER')} />
          )}
        </Panel>

        <Panel title={t('rpChecks')}>
          {detections.detections30d.length === 0 ? (
            <p className="chart-empty">{t('rpNoChecks')}</p>
          ) : (
            <TimeSeries label={t('rpChecks')} unit={t('rpUnitChecks')} data={detections.detections30d} color={colorFor('stage', 'PUPA')} />
          )}
        </Panel>

        <Panel title={t('reportBatchesByStage')}>
          {batches.byStage.length === 0 ? (
            <p className="chart-empty">{t('rpNoBatches')}</p>
          ) : (
            <BarList
              label={t('reportBatchesByStage')}
              rows={[...batches.byStage]
                .sort((a, b) => stageRank(a.stage) - stageRank(b.stage))
                .map((s) => ({ key: s.stage, label: STAGE_LABELS[s.stage] ?? s.stage, value: s.count, color: colorFor('stage', s.stage) }))}
            />
          )}
        </Panel>

        <Panel title={t('reportDetectionResults')}>
          {detections.byResult.length === 0 ? (
            <p className="chart-empty">{t('rpNoResults')}</p>
          ) : (
            <BarList
              label={t('reportDetectionResults')}
              rows={detections.byResult.map((r) => ({ key: r.result, label: r.result, value: r.count, color: colorFor('result', r.result) }))}
            />
          )}
        </Panel>

        <Panel title={t('reportHarvestByGrade')} note={t('rpHarvestNote')}>
          {harvests.byGrade.length === 0 ? (
            <p className="chart-empty">{t('rpNoHarvests')}</p>
          ) : (
            <BarList
              label={t('reportHarvestByGrade')}
              rows={harvests.byGrade.map((g) => ({ key: g.grade, label: fill(t('rpGrade'), { g: g.grade }), value: g.count, color: colorFor('grade', g.grade) }))}
            />
          )}
          <dl className="facts facts--spaced">
            <div><dt>{t('reportTotalCocoonKg')}</dt><dd>{harvests.totalKg.toFixed(1)} kg</dd></div>
            <div><dt>{t('reportTotalSilkG')}</dt><dd>{harvests.totalSilkG.toFixed(0)} g</dd></div>
            <div><dt>{t('reportAvgCocoonKg')}</dt><dd>{harvests.avgKg.toFixed(2)} kg</dd></div>
          </dl>
        </Panel>

        <Panel title={t('reportUsersByRole')}>
          {users.byRole.length === 0 ? (
            <p className="chart-empty">{t('rpNoUsers')}</p>
          ) : (
            <BarList
              label={t('reportUsersByRole')}
              rows={users.byRole.map((r) => ({
                key: r.role,
                label: ROLE_LABEL_KEY[r.role as Role] ? t(ROLE_LABEL_KEY[r.role as Role]) : r.role,
                value: r.count,
                color: colorFor('role', r.role),
              }))}
            />
          )}
        </Panel>

        <Panel title={t('reportAuditActions')}>
          {audit.actions30d.length === 0 ? (
            <p className="chart-empty">{t('rpNoActivity')}</p>
          ) : (
            <BarList
              label={t('reportAuditActions')}
              rows={audit.actions30d.map((a) => ({
                key: a.action,
                label: t(ACTION_LABEL[a.action] ?? 'auOther'),
                value: a.count,
                color: colorFor('action', a.action),
              }))}
            />
          )}
        </Panel>

        {topFarmers.length > 0 && (
          <Panel title={t('reportTopFarmers')} flush>
            <div className="table-wrapper">
              <table className="table-stack">
                <thead>
                  <tr>
                    <th>{t('rpColRank')}</th>
                    <th>{t('rpColName')}</th>
                    <th>{t('rpColEmail')}</th>
                    <th>{t('rpColFarms')}</th>
                  </tr>
                </thead>
                <tbody>
                  {topFarmers.map((f, i) => (
                    <tr key={f.email} className="tbody-row">
                      <td className="cell-lead cell-muted">{i + 1}</td>
                      <td data-label={t('rpColName')} className="cell-strong">{f.name}</td>
                      <td data-label={t('rpColEmail')} className="cell-muted">{f.email}</td>
                      <td data-label={t('rpColFarms')} className="cell-strong">{f.farmCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
