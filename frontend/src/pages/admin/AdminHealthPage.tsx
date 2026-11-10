import { useCallback, useEffect, useState } from 'react';
import { healthService, HealthCheck, HealthHistory, HealthReport } from '../../services/health.service';
import { useLanguage } from '../../context/LanguageContext';
import { fill } from '../../utils/fill';
import SectionHeader from '../../components/ui/SectionHeader';
import Panel from '../../components/ui/Panel';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import HealthCard from './HealthCard';
import { dateFormat } from '../../utils/dateFormat';

const TITLES: Record<HealthCheck['key'], string> = {
  web: 'hlWeb', database: 'hlDatabase', aiService: 'hlAi', email: 'hlEmail', errorMonitoring: 'hlErrors',
  imageStorage: 'hlImages', sensors: 'hlSensors', jobs: 'hlJobs', alertStream: 'hlStream', website: 'hlWebsite',
};
const AI_PROBLEMS = { timeout: 'hlAiTimeout', unreachable: 'hlAiUnreachable', badAnswer: 'hlAiBad' } as const;
const WEB_PROBLEMS = { timeout: 'hlWebTimeout', unreachable: 'hlWebUnreachable', badAnswer: 'hlWebBad' } as const;
const WEBSITE_PROBLEMS = { timeout: 'hlWebsiteTimeout', unreachable: 'hlWebsiteUnreachable', badAnswer: 'hlWebsiteBad' } as const;

/** The page asks again this often while it is open on screen. */
const REFRESH_MS = 60_000;

/** What an admin needs to know to tell whether SSMS is working: live answers, the last day and the uptime. */
export default function AdminHealthPage() {
  const { t, locale } = useLanguage();
  const [report, setReport] = useState<HealthReport | null>(null);
  const [history, setHistory] = useState<HealthHistory | null>(null);
  const [checking, setChecking] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  /** Ask for the live answer and for the history. The history is a bonus: without it the cards still show the live answer. */
  const load = useCallback((quiet: boolean) => {
    let live = true;
    if (!quiet) {
      setChecking(true);
      setFailed(false);
    }
    healthService.history().then((res) => live && setHistory(res.data.data)).catch(() => {});
    healthService.get()
      .then((res) => live && setReport(res.data.data))
      .catch(() => live && !quiet && setFailed(true))
      .finally(() => live && !quiet && setChecking(false));
    return () => { live = false; };
  }, []);

  useEffect(() => load(false), [load, attempt]);

  // It also asks again by itself, but only while somebody can see the page, so a forgotten tab costs nothing.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load(true);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const when = dateFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  /** "2 min", "5 hr" or "3 days": the largest unit that is at least one. */
  const span = (minutes: number) => {
    const [unit, value] = minutes < 60 ? ['minute', minutes] : minutes < 2880 ? ['hour', Math.floor(minutes / 60)] : ['day', Math.floor(minutes / 1440)];
    return new Intl.NumberFormat(locale, { style: 'unit', unit: unit as string, unitDisplay: 'short' }).format(value as number);
  };

  /** The sentence that says what a check found. Never more than the server reported. */
  const message = ({ key, status, values: v }: HealthCheck): string => {
    const set = status === 'ok';
    const reason = v.reason === 'timeout' || v.reason === 'badAnswer' ? v.reason : 'unreachable';
    switch (key) {
      case 'web': return set ? fill(t('hlWebOk'), { ms: v.ms ?? 0 }) : status === 'notSetUp' ? t('hlWebNo') : t(WEB_PROBLEMS[reason]);
      case 'database': return set ? fill(t('hlDbOk'), { ms: v.ms ?? 0 }) : t('hlDbBad');
      case 'aiService': return set ? fill(t('hlAiOk'), { ms: v.ms ?? 0 }) : t(AI_PROBLEMS[v.reason === 'timeout' || v.reason === 'badAnswer' ? v.reason : 'unreachable']);
      case 'email': return t(set ? 'hlEmailOk' : 'hlEmailNo');
      case 'errorMonitoring': return t(set ? 'hlErrOk' : 'hlErrNo');
      case 'imageStorage': return t(set ? 'hlImgOk' : 'hlImgNo');
      case 'sensors': {
        if (status === 'notSetUp') return t('hlSenNone');
        const counts = fill(t('hlSenCounts'), { online: v.online ?? 0, offline: v.offline ?? 0 });
        if (v.silentMinutes == null) return `${counts} ${t('hlSenNever')}`;
        return `${counts} ${fill(t(set ? 'hlSenLast' : 'hlSenSilent'), { ago: span(v.silentMinutes) })}`;
      }
      case 'jobs':
        if (status === 'notSetUp') return t('hlJobsNo');
        return fill(t(set ? 'hlJobsOk' : 'hlJobsStale'), { ago: span((v.hours ?? 0) * 60) });
      case 'alertStream': return set ? fill(t('hlStreamOk'), { ms: v.ms ?? 0 }) : t(status === 'notSetUp' ? 'hlStreamNo' : 'hlStreamBad');
      case 'website': return set ? fill(t('hlWebsiteOk'), { ms: v.ms ?? 0 }) : status === 'notSetUp' ? t('hlWebsiteNo') : t(WEBSITE_PROBLEMS[reason]);
      default: return '';
    }
  };

  const again = (
    <button type="button" className="btn btn-secondary" onClick={() => setAttempt((n) => n + 1)} disabled={checking} aria-busy={checking}>
      {t(checking ? 'hlChecking' : 'hlAgain')}
    </button>
  );

  return (
    <div>
      <SectionHeader title={t('ptHealth')} actions={again} />

      {failed && (
        <div className="alert alert-error" role="alert">
          <span>{t('hlLoadError')}</span>
          {!report && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAttempt((n) => n + 1)}>{t('hlRetry')}</button>}
        </div>
      )}

      {!report && !failed && <Panel title={t('hlChecks')} flush><SkeletonTable rows={6} cols={2} /></Panel>}

      {report && (
        <div className="stack-24">
          <div role="status" className={`alert ${report.overall === 'ok' ? 'alert-success' : 'alert-error'}`}>
            <span>{t(report.overall === 'ok' ? 'hlAllWell' : 'hlSomeProblem')}</span>
            <span className="health-when">{fill(t('hlCheckedAt'), { when: when.format(new Date(report.checkedAt)) })}</span>
          </div>

          <p className="health-note">{t('hlNote')}</p>

          <ul className="health-grid" aria-label={t('hlChecks')}>
            {report.checks.map((c) => (
              <HealthCard key={c.key} check={c} title={t(TITLES[c.key])} message={message(c)} history={history?.services[c.key]} />
            ))}
          </ul>

          <Panel title={t('hlWaiting')}>
            <dl className="health-numbers">
              <div><dt>{t('hlUnread')}</dt><dd>{report.numbers.unreadAlerts}</dd></div>
              <div><dt>{t('hlOpenAir')}</dt><dd>{report.numbers.openAirAlerts}</dd></div>
              <div><dt>{t('hlUnanswered')}</dt><dd>{report.numbers.unansweredMessages}</dd></div>
            </dl>
          </Panel>
        </div>
      )}
    </div>
  );
}
