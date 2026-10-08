import { useLanguage } from '../../context/LanguageContext';
import { Window } from './Window';

interface DashboardMockProps {
  className?: string;
  variant?: 'batches' | 'harvest';
}

const BATCHES = [
  { name: 'A', stage: 'Larva', temp: '24.6', hum: '78', line: [6, 5, 7, 4, 5, 3, 4, 3] },
  { name: 'B', stage: 'Pupa', temp: '25.1', hum: '74', line: [5, 6, 5, 6, 4, 5, 4, 4] },
  { name: 'C', stage: 'Egg', temp: '26.0', hum: '81', line: [7, 6, 6, 5, 6, 4, 5, 5] },
];

const HARVESTS = [
  { name: 'A', weight: '42.5 kg', grade: 'A' },
  { name: 'B', weight: '38.0 kg', grade: 'A' },
  { name: 'C', weight: '27.4 kg', grade: 'B' },
];

function Spark({ points }: { points: number[] }) {
  const step = 60 / (points.length - 1);
  const d = points.map((y, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)} ${y * 3}`).join(' ');
  return (
    <svg className="l-mock__spark" viewBox="0 0 60 28" aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DashboardMock({ className, variant = 'batches' }: DashboardMockProps) {
  const { t } = useLanguage();

  if (variant === 'harvest') {
    return (
      <Window title={t('lpMockHarvestTitle')} label={t('lpMockAriaHarvest')} className={className}>
        <div className="l-mock__head l-mock__head--three">
          <span>{t('lpMockBatch')}</span>
          <span>{t('lpMockWeight')}</span>
          <span>{t('lpMockGrade')}</span>
        </div>
        {HARVESTS.map((row) => (
          <div key={row.name} data-row className="l-mock__row l-mock__row--three">
            <strong>
              {t('lpMockBatch')} {row.name}
            </strong>
            <span>{row.weight}</span>
            <span className={`l-mock__chip l-mock__chip--${row.grade === 'A' ? 'good' : 'warn'}`}>{row.grade}</span>
          </div>
        ))}
      </Window>
    );
  }

  return (
    <Window title={`${t('lpPreviewDashboard')} / ${t('lpMockToday')}`} label={t('lpMockAriaDashboard')} className={className}>
      <div className="l-mock__head l-mock__head--batches">
        <span>{t('lpMockBatch')}</span>
        <span>{t('lpMockTemperature')}</span>
        <span>{t('lpMockHumidity')}</span>
        <span />
      </div>
      {BATCHES.map((row) => (
        <div key={row.name} data-row className="l-mock__row l-mock__row--batches">
          <span className="l-mock__cell-name">
            <strong>
              {t('lpMockBatch')} {row.name}
            </strong>
            <em>{row.stage}</em>
          </span>
          <span>{row.temp} °C</span>
          <span>{row.hum} %</span>
          <span className="l-mock__ok">
            <Spark points={row.line} />
            <small>{t('lpMockInRange')}</small>
          </span>
        </div>
      ))}
    </Window>
  );
}
