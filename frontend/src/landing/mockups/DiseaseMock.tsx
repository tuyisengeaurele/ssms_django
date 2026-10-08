import { useLanguage } from '../../context/LanguageContext';
import { Window } from './Window';

const SCORES = [
  { name: 'Grasserie', score: 94 },
  { name: 'Healthy', score: 3 },
  { name: 'Flacherie', score: 1 },
  { name: 'Muscardine', score: 1 },
  { name: 'Pebrine', score: 1 },
];

export function DiseaseMock({ className }: { className?: string }) {
  const { t } = useLanguage();
  return (
    <Window title={t('lpPreviewDisease')} label={t('lpMockAriaDisease')} className={className}>
      <div className="l-mock__disease">
        <div className="l-mock__photo" aria-hidden="true" />
        <div className="l-mock__result">
          <small>{t('lpMockResult')}</small>
          <strong>{SCORES[0].name}</strong>
          <span>
            {t('lpMockConfidence')} {SCORES[0].score} %
          </span>
          <div className="l-mock__bars">
            {SCORES.map((s, i) => (
              <div key={s.name} data-score={s.score} className="l-mock__bar-row">
                <span>{s.name}</span>
                <i style={{ ['--w' as string]: `${Math.max(s.score, 3)}%` }} data-top={i === 0 ? 'true' : undefined} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Window>
  );
}
