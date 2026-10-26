import { useLanguage } from '../context/LanguageContext';
import { Reveal } from './motion/Reveal';
import './story.css';

export function Cooperatives() {
  const { t } = useLanguage();
  return (
    <section id="cooperatives" className="l-coop" aria-labelledby="coop-title">
      <div className="l-container l-coop__grid">
        <div>
          <Reveal as="p" className="l-eyebrow">
            {t('lpCoopEyebrow')}
          </Reveal>
          <Reveal as="h2" className="l-coop__title" delay={80}>
            <span id="coop-title">{t('lpCoopTitle')}</span>
          </Reveal>
          <Reveal as="p" className="l-coop__body" delay={160}>
            {t('lpCoopBody')}
          </Reveal>
          <ul className="l-coop__points">
            <Reveal as="li" delay={220}>
              {t('lpCoopPoint1')}
            </Reveal>
            <Reveal as="li" delay={280}>
              {t('lpCoopPoint2')}
            </Reveal>
          </ul>
        </div>
        <Reveal className="l-coop__photo" delay={100}>
          <picture>
            <source type="image/avif" srcSet="/images/hero-bg-1280.avif 1280w, /images/hero-bg-1920.avif 1920w" sizes="(min-width: 960px) 560px, 100vw" />
            <img src="/images/hero-bg-1280.webp" alt="" loading="lazy" decoding="async" width={1280} height={853} />
          </picture>
        </Reveal>
      </div>
    </section>
  );
}
