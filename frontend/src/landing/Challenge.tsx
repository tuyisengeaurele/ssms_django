import { useLanguage } from '../context/LanguageContext';
import { Reveal } from './motion/Reveal';
import './story.css';

const ITEMS = [1, 2, 3] as const;

export function Challenge() {
  const { t } = useLanguage();
  return (
    <section id="challenge" className="l-challenge" aria-labelledby="challenge-title">
      <div className="l-container">
        <div className="l-challenge__head">
          <Reveal as="p" className="l-eyebrow">
            {t('lpChallengeEyebrow')}
          </Reveal>
          <Reveal as="h2" className="l-challenge__title" delay={80}>
            <span id="challenge-title">{t('lpChallengeTitle')}</span>
          </Reveal>
          <Reveal as="p" className="l-challenge__intro" delay={160}>
            {t('lpChallengeIntro')}
          </Reveal>
        </div>

        <ol className="l-challenge__list">
          {ITEMS.map((n) => (
            <Reveal key={n} as="li" delay={n * 80} className="l-challenge__row">
              <span className="l-challenge__num" aria-hidden="true">{`0${n}`}</span>
              <h3>{t(`lpChallenge${n}Title`)}</h3>
              <p>{t(`lpChallenge${n}Body`)}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
