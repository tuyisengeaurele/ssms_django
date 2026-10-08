import { useLanguage } from '../context/LanguageContext';
import { Reveal } from './motion/Reveal';
import './spotlight.css';

export function Rwanda() {
  const { t } = useLanguage();
  return (
    <section id="rwanda" className="l-rwanda" aria-labelledby="rwanda-title">
      <div className="l-container l-rwanda__grid">
        <div>
          <Reveal as="h2" className="l-rwanda__title">
            <span id="rwanda-title">{t('lpRwandaTitle')}</span>
          </Reveal>
          <Reveal as="p" delay={120} className="l-rwanda__body">
            {t('lpRwandaBody')}
          </Reveal>
        </div>
        <Reveal className="l-rwanda__photo" delay={100}>
          <picture>
            <source type="image/avif" srcSet="/images/hero-bg-1280.avif 1280w, /images/hero-bg-1920.avif 1920w" sizes="(min-width: 960px) 560px, 100vw" />
            <img src="/images/hero-bg-1280.webp" alt="" loading="lazy" decoding="async" width={1280} height={853} />
          </picture>
        </Reveal>
      </div>
    </section>
  );
}
