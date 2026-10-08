import { useLanguage } from '../context/LanguageContext';
import { Reveal } from './motion/Reveal';
import './story.css';

const STAGES = ['lpStage1', 'lpStage2', 'lpStage3', 'lpStage4', 'lpStage5'] as const;

export function About() {
  const { t } = useLanguage();
  return (
    <section id="about" className="l-about" aria-labelledby="about-title">
      <div className="l-container l-about__grid">
        <div>
          <Reveal as="p" className="l-eyebrow">
            {t('lpAboutEyebrow')}
          </Reveal>
          <Reveal as="h2" className="l-about__title" delay={80}>
            <span id="about-title">{t('lpAboutTitle')}</span>
          </Reveal>
        </div>
        <div className="l-about__text">
          <Reveal as="p" delay={120}>
            {t('lpAboutBody1')}
          </Reveal>
          <Reveal as="p" delay={200}>
            {t('lpAboutBody2')}
          </Reveal>
          <Reveal as="p" delay={280} className="l-about__rwanda">
            {t('lpAboutBody3')}
          </Reveal>
        </div>
      </div>

      <div className="l-container">
        <ol className="l-stages" aria-label={t('lpStagesLabel')}>
          {STAGES.map((key, i) => (
            <Reveal key={key} as="li" delay={i * 90} className="l-stages__item">
              <span aria-hidden="true">{`0${i + 1}`}</span>
              <b>{t(key)}</b>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
