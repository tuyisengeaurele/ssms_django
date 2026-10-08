import { useLanguage } from '../../context/LanguageContext';
import { Paper } from './Paper';

export function DiseaseCard({ className }: { className?: string }) {
  const { t } = useLanguage();
  const scores = [
    { name: t('lpCardHealthy'), score: 96 },
    { name: 'Flacherie', score: 1 },
    { name: 'Grasserie', score: 1 },
    { name: 'Muscardine', score: 1 },
    { name: 'Pebrine', score: 1 },
  ];

  return (
    <Paper
      title={t('lpCardDisease')}
      tag={t('lpCardBatch')}
      tagValue="B-0004"
      label={t('lpAriaDisease')}
      className={className}
    >
      <div className="l-paper__disease">
        <div className="l-paper__photo" aria-hidden="true" />
        <div className="l-paper__result">
          <small>{t('lpCardResult')}</small>
          <strong>{scores[0].name}</strong>
          <span>
            {t('lpCardConfidence')} {scores[0].score} %
          </span>
        </div>
      </div>
      <div className="l-paper__scores">
        {scores.map((s, i) => (
          <div key={s.name} data-score={s.score} className={`l-paper__score${i === 0 ? ' is-top' : ''}`}>
            <span>{s.name}</span>
            <span>{s.score} %</span>
            <i style={{ ['--w' as string]: `${Math.max(s.score, 2)}%` }} />
          </div>
        ))}
      </div>
    </Paper>
  );
}
