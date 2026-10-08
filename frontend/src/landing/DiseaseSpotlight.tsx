import { useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { DiseaseMock } from './mockups/DiseaseMock';
import { Reveal } from './motion/Reveal';
import { useInViewOnce } from './motion/useInViewOnce';
import './spotlight.css';

export function DiseaseSpotlight() {
  const { t } = useLanguage();
  const stageRef = useRef<HTMLDivElement>(null);
  const live = useInViewOnce(stageRef);

  return (
    <section className="l-spot" aria-labelledby="spot-title">
      <div className="l-container l-spot__grid">
        <div className="l-spot__copy">
          <Reveal as="h2" className="l-spot__title">
            <span id="spot-title">{t('lpSpotTitle')}</span>
          </Reveal>
          <Reveal as="p" delay={120} className="l-spot__body">
            {t('lpSpotBody')}
          </Reveal>
          <Reveal as="p" delay={240} className="l-spot__note">
            {t('lpSpotNote')}
          </Reveal>
        </div>
        <div className="l-spot__stage" ref={stageRef}>
          <DiseaseMock className={live ? 'is-live' : undefined} />
        </div>
      </div>
    </section>
  );
}
