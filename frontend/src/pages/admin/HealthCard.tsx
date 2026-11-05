import { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { HealthCheck, HealthStatus, HealthTestName, healthService, HealthTestResult, ServiceHistory, Uptime } from '../../services/health.service';
import { fill } from '../../utils/fill';
import TimeSeries from '../../components/ui/TimeSeries';

const STATUS_WORDS: Record<HealthStatus, { text: string; badge: string }> = {
  ok: { text: 'hlOk', badge: 'badge-green' },
  problem: { text: 'hlProblem', badge: 'badge-red' },
  notSetUp: { text: 'hlNotSetUp', badge: 'badge-gray' },
};

/** The services that can be tried safely, and the test each one runs. */
const TEST_OF: Partial<Record<HealthCheck['key'], HealthTestName>> = {
  database: 'database-write',
  aiService: 'disease-check',
  email: 'email',
  imageStorage: 'storage',
  sensors: 'device-ingest',
};

const WINDOWS: Array<['day' | 'week' | 'month', string]> = [['day', 'hlUptimeDay'], ['week', 'hlUptimeWeek'], ['month', 'hlUptimeMonth']];

interface Props {
  check: HealthCheck;
  title: string;
  message: string;
  history?: ServiceHistory;
}

/** One service: how it is, how it did over the last day, how often it was up, and a button to try it. */
export default function HealthCard({ check, title, message, history }: Props) {
  const { t, locale } = useLanguage();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<HealthTestResult | 'error' | null>(null);

  const test = TEST_OF[check.key];
  const points = history?.points ?? [];
  const timed = points.some((p) => p.ms !== null);

  const clock = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  const stamp = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  const run = async () => {
    if (!test) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await healthService.runTest(test);
      setResult(res.data.data);
    } catch {
      setResult('error');
    } finally {
      setRunning(false);
    }
  };

  const figure = (u: Uptime | undefined) =>
    !u || u.percent === null
      ? <dd className="cell-muted">{t('hlUptimeNone')}</dd>
      : <dd title={fill(t('hlUptimeFrom'), { n: u.samples })}>{`${u.percent}%`}</dd>;

  const trouble = points.filter((p) => p.status === 'problem').length;

  return (
    <li className="health-card">
      <div className="health-row">
        <h3 className="health-title">{title}</h3>
        <span className={`badge ${STATUS_WORDS[check.status].badge}`}>{t(STATUS_WORDS[check.status].text)}</span>
      </div>
      <p className="health-message">{message}</p>

      <div className="health-trend">
        {timed ? (
          <TimeSeries
            label={fill(t('hlTrendAria'), { name: title })}
            unit="ms"
            color="var(--chart-1)"
            height={90}
            data={points.filter((p) => p.ms !== null).map((p) => ({ day: clock.format(new Date(p.at)), count: p.ms as number }))}
            formatTick={(d) => d}
          />
        ) : points.length > 0 ? (
          <div>
            <div className="health-strip" aria-hidden="true">
              {points.map((p) => <span key={p.at} className={`health-cell is-${p.status}`} />)}
            </div>
            <p className="health-strip-text">{fill(t('hlStrip'), { n: points.length, bad: trouble })}</p>
          </div>
        ) : (
          <p className="health-strip-text">{t('hlTrendNone')}</p>
        )}
      </div>

      <dl className="health-uptime">
        {WINDOWS.map(([name, label]) => (
          <div key={name}>
            <dt>{t(label)}</dt>
            {figure(history?.uptime[name])}
          </div>
        ))}
      </dl>

      {test && (
        <div className="health-test">
          <button type="button" className="btn btn-secondary btn-sm" onClick={run} disabled={running} aria-busy={running}>
            {t(running ? 'hlRunning' : 'hlRunTest')}
          </button>
          {result === 'error' && <p role="status" className="health-test-result">{t('hlTestError')}</p>}
          {result && result !== 'error' && (
            <div role="status" className="health-test-result">
              <span className={`badge ${result.ok ? 'badge-green' : 'badge-red'}`}>{t(result.ok ? 'hlTestOk' : 'hlTestBad')}</span>
              <span>{t(`hlO_${result.name}_${result.outcome}`)}</span>
              <span className="cell-muted">{fill(t('hlTestMs'), { ms: result.milliseconds, when: stamp.format(new Date(result.ranAt)) })}</span>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
