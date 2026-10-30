import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { batchService } from '../../services/batch.service';
import { detectionService } from '../../services/detection.service';
import { harvestService } from '../../services/harvest.service';
import { alertService } from '../../services/alert.service';
import { sensorService, type SeriesPoint, type StageRange } from '../../services/sensor.service';
import { Batch, DiseaseDetection, HarvestRecord, MortalityEntry, QualityGrade } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { stageLabel } from '../../utils/constants';
import { summariseConditions } from '../../utils/batchReport';
import { fill } from '../../utils/fill';
import { useDocumentTitle } from '../../utils/pageTitle';
import { Icon } from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';

// The usual range, for when the server cannot give the one for a stage.
const USUAL_RANGE = { tempMin: 22, tempMax: 28, humMin: 70, humMax: 85 };
const GRADES: QualityGrade[] = ['A', 'B', 'C'];
const THIRTY_DAYS = 720;
// The server averages a month into six hour buckets.
const BUCKET_HOURS = 6;
// A report is one page. Longer logs show their newest rows and say how many are left out.
const MAX_DEATH_ROWS = 8;
const MAX_CHECK_ROWS = 5;

// Django sends decimals as strings.
const num = (value: unknown) => Number(value) || 0;
const trim = (value: number, places = 2) => parseFloat(value.toFixed(places));

export default function BatchReportPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { t, locale } = useLanguage();
  const { error: showError } = useToast();
  const [downloading, setDownloading] = useState(false);

  const [batch, setBatch] = useState<Batch | null>(null);
  const [deaths, setDeaths] = useState<MortalityEntry[]>([]);
  const [checks, setChecks] = useState<DiseaseDetection[]>([]);
  const [harvests, setHarvests] = useState<HarvestRecord[]>([]);
  const [points, setPoints] = useState<SeriesPoint[]>([]);
  const [ranges, setRanges] = useState<StageRange[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const code = (id ?? '').slice(-8).toUpperCase();
  useDocumentTitle(fill(t('brDocTitle'), { id: code }));

  useEffect(() => {
    if (!id) return;
    // Every part is needed. A report with a section missing would say "none" about something that was never loaded.
    Promise.all([
      batchService.getById(id),
      batchService.getMortality(id),
      detectionService.getByBatch(id),
      harvestService.getByBatch(id),
      sensorService.getBatchSeries(id, THIRTY_DAYS),
    ])
      .then(([batchRes, deathRes, checkRes, harvestRes, seriesRes]) => {
        setBatch(batchRes.data.data);
        setDeaths(deathRes.data.data);
        setChecks(checkRes.data.data);
        setHarvests(harvestRes.data.data);
        setPoints(seriesRes.data.data);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
    // The ranges only decide how the readings are judged, so the usual ones will do without them.
    alertService.getThresholds().then((r) => setRanges(r.data.data)).catch(() => {});
  }, [id]);

  const downloadPdf = async () => {
    if (!id) return;
    setDownloading(true);
    try {
      await batchService.downloadReport(id, locale);
    } catch {
      showError(t('brPdfError'));
    } finally {
      setDownloading(false);
    }
  };

  const back = (
    <Link to={`/batches/${id}`} className="btn btn-ghost btn-sm">
      <Icon name="back" size={15} />
      {t('hpBack')}
    </Link>
  );

  if (loading) {
    return (
      <div>
        <PageHeader title={t('ptBatchReport')} />
        <SkeletonTable rows={4} cols={3} />
      </div>
    );
  }

  if (failed || !batch) {
    return (
      <div>
        <PageHeader title={t('ptBatchReport')} actions={<div className="no-print">{back}</div>} />
        <div className="alert alert-error" role="alert">{t('brLoadError')}</div>
      </div>
    );
  }

  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const number = new Intl.NumberFormat(locale);
  const day = (iso: string) => date.format(new Date(iso));
  const dayOnly = (ymd: string) => date.format(new Date(`${ymd}T00:00:00`));

  const range = ranges.find((r) => r.stage === batch.stage) ?? USUAL_RANGE;
  const conditions = summariseConditions(points, range, BUCKET_HOURS);

  const stays = [...(batch.roomStays ?? [])].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const quantityText = batch.quantity
    ? batch.quantityUnit === 'WORMS'
      ? fill(t('bdQtyWorms'), { n: number.format(batch.quantity) })
      : fill(t(batch.quantity === 1 ? 'bdQtyBoxesOne' : 'bdQtyBoxes'), { n: number.format(batch.quantity) })
    : '';

  const startMs = new Date(batch.startDate).getTime();
  const expectedMs = new Date(batch.expectedHarvestDate).getTime();
  const dayNumber = Math.floor((Date.now() - startMs) / 86_400_000) + 1;
  const totalDays = Math.round((expectedMs - startMs) / 86_400_000);
  const dayLine = batch.stage === 'HARVEST' ? '' : fill(t(dayNumber > totalDays ? 'bdDayLate' : 'bdDay'), { n: dayNumber, total: totalDays, date: day(batch.expectedHarvestDate) });

  const deathsTotal = deaths.reduce((sum, e) => sum + e.count, 0);
  const deathRows = [...deaths].sort((a, b) => b.recordedOn.localeCompare(a.recordedOn)).slice(0, MAX_DEATH_ROWS);
  const deathsTotalText = batch.quantity && batch.quantityUnit === 'WORMS'
    ? fill(t('bdDeathsTotalOf'), { n: number.format(deathsTotal), q: number.format(batch.quantity), pct: ((deathsTotal / batch.quantity) * 100).toFixed(1) })
    : fill(t('bdDeathsTotal'), { n: number.format(deathsTotal) });

  const checkRows = [...checks].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)).slice(0, MAX_CHECK_ROWS);
  const found = checks.filter((c) => c.result !== 'Healthy').length;

  const unseen = batch.alertLogs?.filter((a) => !a.isRead).length ?? 0;

  const harvestKg = harvests.reduce((sum, r) => sum + num(r.cocoonWeightKg), 0);
  const harvestSilk = harvests.reduce((sum, r) => sum + num(r.silkYieldG), 0);
  const gradeLine = GRADES.map((g) => `${fill(t('hpGradeName'), { g })}: ${harvests.filter((r) => r.qualityGrade === g).length}`).join(', ');

  return (
    <div className="report">
      <PageHeader
        title={t('ptBatchReport')}
        subtitle={fill(t('hpSubtitle'), { id: code, farm: batch.farm?.name ?? '-' })}
        actions={
          <div className="no-print report-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={downloadPdf} disabled={downloading}>
              <Icon name="download" size={15} />
              {downloading ? t('reportExporting') : t('brDownloadPdf')}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
              <Icon name="print" size={15} />
              {t('brPrint')}
            </button>
            {back}
          </div>
        }
      />

      <section className="report-section">
        <h2>{t('brBatch')}</h2>
        <dl className="facts facts--pairs">
          <div><dt>{t('bdStage')}</dt><dd>{stageLabel(t, batch.stage)}</dd></div>
          <div><dt>{t('bdFarm')}</dt><dd>{batch.farm?.name ?? '-'}</dd></div>
          {batch.farm?.location && <div><dt>{t('bdPlace')}</dt><dd>{batch.farm.location}</dd></div>}
          <div><dt>{t('bdStarted')}</dt><dd>{day(batch.startDate)}</dd></div>
          <div><dt>{t('bdExpected')}</dt><dd>{day(batch.expectedHarvestDate)}</dd></div>
          {batch.breed && <div><dt>{t('bdBreed')}</dt><dd>{batch.breed}</dd></div>}
          {quantityText && <div><dt>{t('brStartedWith')}</dt><dd>{quantityText}</dd></div>}
          {batch.notes && <div><dt>{t('bdNotes')}</dt><dd>{batch.notes}</dd></div>}
        </dl>
        {dayLine && <p className="report-line">{dayLine}</p>}
        {stays.length > 0 && (
          <>
            <h3 className="subhead">{t('brRooms')}</h3>
            <ul className="report-list" aria-label={t('brRooms')}>
              {stays.map((s) => (
                <li key={`${s.roomId}-${s.startedAt}`}>
                  {s.endedAt
                    ? fill(t('brRoomSpan'), { room: s.roomName, from: day(s.startedAt), to: day(s.endedAt) })
                    : fill(t('brRoomFrom'), { room: s.roomName, from: day(s.startedAt) })}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="report-section">
        <h2>{t('brConditions')}</h2>
        {conditions ? (
          <>
            <p className="report-line">{fill(t('brTemp'), { min: number.format(conditions.tempMin), avg: number.format(conditions.tempAvg), max: number.format(conditions.tempMax) })}</p>
            <p className="report-line">{fill(t('brHum'), { min: number.format(conditions.humMin), avg: number.format(conditions.humAvg), max: number.format(conditions.humMax) })}</p>
            <p className="report-line">
              {fill(t('brInRange'), {
                pct: conditions.inRangePct, n: conditions.hours, stage: stageLabel(t, batch.stage),
                tmin: range.tempMin, tmax: range.tempMax, hmin: range.humMin, hmax: range.humMax,
              })}
            </p>
          </>
        ) : (
          <p className="report-line">{t('brNoReadings')}</p>
        )}
      </section>

      <section className="report-section">
        <h2>{t('brDeaths')}</h2>
        {deaths.length === 0 ? (
          <p className="report-line">{t('brDeathsNone')}</p>
        ) : (
          <>
            <p className="report-line">{deathsTotalText}</p>
            <table className="report-table">
              <thead>
                <tr><th>{t('bdDeathsDay')}</th><th>{t('brColWorms')}</th><th>{t('bdDeathsNote')}</th></tr>
              </thead>
              <tbody>
                {deathRows.map((e) => (
                  <tr key={e.id}><td>{dayOnly(e.recordedOn)}</td><td>{number.format(e.count)}</td><td>{e.note}</td></tr>
                ))}
              </tbody>
            </table>
            {deaths.length > MAX_DEATH_ROWS && <p className="report-more">{fill(t('brMoreEntries'), { n: deaths.length - MAX_DEATH_ROWS })}</p>}
          </>
        )}
      </section>

      <section className="report-section">
        <h2>{t('brChecks')}</h2>
        {checks.length === 0 ? (
          <p className="report-line">{t('brChecksNone')}</p>
        ) : (
          <>
            <p className="report-line">{fill(t(checks.length === 1 ? 'brChecksSummaryOne' : 'brChecksSummary'), { n: checks.length, p: found })}</p>
            <table className="report-table">
              <thead>
                <tr><th>{t('hpColDate')}</th><th>{t('brColResult')}</th><th>{t('brColConfidence')}</th></tr>
              </thead>
              <tbody>
                {checkRows.map((c) => (
                  <tr key={c.id}><td>{day(c.detectedAt)}</td><td>{c.result}</td><td>{Math.round(c.confidence * 100)} %</td></tr>
                ))}
              </tbody>
            </table>
            {checks.length > MAX_CHECK_ROWS && <p className="report-more">{fill(t('brMoreChecks'), { n: checks.length - MAX_CHECK_ROWS })}</p>}
          </>
        )}
      </section>

      <section className="report-section">
        <h2>{t('brAlerts')}</h2>
        <p className="report-line">
          {unseen === 0 ? t('brAlertsNone') : fill(t(unseen === 1 ? 'brAlertsWaitingOne' : 'brAlertsWaiting'), { n: unseen })}
        </p>
      </section>

      <section className="report-section">
        <h2>{t('brHarvest')}</h2>
        {harvests.length === 0 ? (
          <p className="report-line">{t('brHarvestNone')}</p>
        ) : (
          <>
            <p className="report-line">
              {fill(t(harvests.length === 1 ? 'brHarvestSumOne' : 'brHarvestSum'), { n: harvests.length, kg: trim(harvestKg), g: trim(harvestSilk, 1) })}
            </p>
            <p className="report-line">{gradeLine}</p>
          </>
        )}
      </section>

      <p className="report-foot">{fill(t('brPrepared'), { date: date.format(new Date()), name: user?.name ?? '' })}</p>
    </div>
  );
}
