import { useEffect, useState } from 'react';
import { healthService, HealthCheck, HealthReport, HealthStatus } from '../../services/health.service';
import { useLanguage } from '../../context/LanguageContext';
import { fill } from '../../utils/fill';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';

const TITLES: Record<HealthCheck['key'], string> = {
  database: 'hlDatabase', aiService: 'hlAi', email: 'hlEmail', errorMonitoring: 'hlErrors', imageStorage: 'hlImages', sensors: 'hlSensors',
};
const STATUS_WORDS: Record<HealthStatus, { text: string; badge: string }> = {
  ok: { text: 'hlOk', badge: 'badge-green' },
  problem: { text: 'hlProblem', badge: 'badge-red' },
  notSetUp: { text: 'hlNotSetUp', badge: 'badge-gray' },
};
const AI_PROBLEMS = { timeout: 'hlAiTimeout', unreachable: 'hlAiUnreachable', badAnswer: 'hlAiBad' } as const;

/** What an admin needs to know to tell whether SSMS is working, asked live each time the page opens. */
export default function AdminHealthPage() {
  const { t, locale } = useLanguage();
  const [report, setReport] = useState<HealthReport | null>(null);
  const [checking, setChecking] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setChecking(true);
    setFailed(false);
    healthService.get()
      .then((res) => live && setReport(res.data.data))
      .catch(() => live && setFailed(true))
      .finally(() => live && setChecking(false));
    return () => { live = false; };
  }, [attempt]);

  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  /** "2 min", "5 hr" or "3 days": the largest unit that is at least one. */
  const span = (minutes: number) => {
    const [unit, value] = minutes < 60 ? ['minute', minutes] : minutes < 2880 ? ['hour', Math.floor(minutes / 60)] : ['day', Math.floor(minutes / 1440)];
    return new Intl.NumberFormat(locale, { style: 'unit', unit: unit as string, unitDisplay: 'short' }).format(value as number);
  };

  /** The sentence that says what a check found. Never more than the server reported. */
  const message = ({ key, status, values: v }: HealthCheck): string => {
    const set = status === 'ok';
    switch (key) {
      case 'database': return set ? fill(t('hlDbOk'), { ms: v.ms ?? 0 }) : t('hlDbBad');
      case 'aiService': return set ? fill(t('hlAiOk'), { ms: v.ms ?? 0 }) : t(AI_PROBLEMS[v.reason ?? 'unreachable']);
      case 'email': return t(set ? 'hlEmailOk' : 'hlEmailNo');
      case 'errorMonitoring': return t(set ? 'hlErrOk' : 'hlErrNo');
      case 'imageStorage': return t(set ? 'hlImgOk' : 'hlImgNo');
      case 'sensors': {
        if (status === 'notSetUp') return t('hlSenNone');
        const counts = fill(t('hlSenCounts'), { online: v.online ?? 0, offline: v.offline ?? 0 });
        if (v.silentMinutes == null) return `${counts} ${t('hlSenNever')}`;
        return `${counts} ${fill(t(set ? 'hlSenLast' : 'hlSenSilent'), { ago: span(v.silentMinutes) })}`;
      }
    }
  };

  const again = (
    <button type="button" className="btn btn-secondary" onClick={() => setAttempt((n) => n + 1)} disabled={checking} aria-busy={checking}>
      {t(checking ? 'hlChecking' : 'hlAgain')}
    </button>
  );

  return (
    <div>
      <PageHeader title={t('ptHealth')} subtitle={t('hlIntro')} actions={again} />

      {failed && (
        <div className="alert alert-error" role="alert">
          <span>{t('hlLoadError')}</span>
          {!report && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAttempt((n) => n + 1)}>{t('hlRetry')}</button>}
        </div>
      )}

      {!report && !failed && <Panel title={t('hlChecks')} flush><SkeletonTable rows={6} cols={2} /></Panel>}

      {report && (
        <>
          <div role="status" className={`alert ${report.overall === 'ok' ? 'alert-success' : 'alert-error'}`}>
            <span>{t(report.overall === 'ok' ? 'hlAllWell' : 'hlSomeProblem')}</span>
            <span className="health-when">{fill(t('hlCheckedAt'), { when: when.format(new Date(report.checkedAt)) })}</span>
          </div>

          <Panel title={t('hlChecks')} note={t('hlNote')} flush>
            <ul className="health-list">
              {report.checks.map((c) => (
                <li key={c.key}>
                  <div className="health-row">
                    <h3 className="health-title">{t(TITLES[c.key])}</h3>
                    <span className={`badge ${STATUS_WORDS[c.status].badge}`}>{t(STATUS_WORDS[c.status].text)}</span>
                  </div>
                  <p className="health-message">{message(c)}</p>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title={t('hlWaiting')}>
            <dl className="health-numbers">
              <div><dt>{t('hlUnread')}</dt><dd>{report.numbers.unreadAlerts}</dd></div>
              <div><dt>{t('hlOpenAir')}</dt><dd>{report.numbers.openAirAlerts}</dd></div>
              <div><dt>{t('hlUnanswered')}</dt><dd>{report.numbers.unansweredMessages}</dd></div>
            </dl>
          </Panel>
        </>
      )}
    </div>
  );
}
