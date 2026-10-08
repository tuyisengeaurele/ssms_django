import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { HeroCards } from './HeroCards';
import { useScrollProgress } from './motion/useScrollProgress';
import './hero.css';

const BG_WIDTHS = [640, 1280, 1920, 2560];
const bgSet = (ext: string) => BG_WIDTHS.map((w) => `/images/hero-bg-${w}.${ext} ${w}w`).join(', ');

/** The longest word carries the italic gold accent, whatever the language. */
function accentIndex(words: string[]): number {
  const size = (w: string) => w.replace(/[^\p{L}]/gu, '').length;
  let best = 0;
  words.forEach((word, i) => {
    if (size(word) > size(words[best])) best = i;
  });
  return best;
}

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path d="M4 12L12 4M5.5 4H12v6.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Hero() {
  const { t } = useLanguage();
  // The photo drifts slowly as the page scrolls. The CSS reads --p.
  const cardRef = useScrollProgress<HTMLDivElement>((p) => {
    cardRef.current?.style.setProperty('--p', String(p));
  }, 'leave');

  const words = t('lpHeroTitle').split(' ');
  const accent = accentIndex(words);

  return (
    <section className="l-hero" aria-labelledby="hero-title">
      <div className="l-hero__card" ref={cardRef}>
        <div className="l-hero__layer l-hero__bg">
          <picture>
            <source type="image/avif" srcSet={bgSet('avif')} sizes="(min-width: 1400px) 1360px, 100vw" />
            <source type="image/webp" srcSet={bgSet('webp')} sizes="(min-width: 1400px) 1360px, 100vw" />
            <img
              src="/images/hero-bg-1280.webp"
              alt={t('lpHeroImageAlt')}
              width={1920}
              height={1280}
              decoding="async"
              {...{ fetchpriority: 'high' }}
            />
          </picture>
        </div>
        <div className="l-hero__shade" aria-hidden="true" />

        <div className="l-hero__content">
          <div className="l-hero__copy">
            <p className="l-hero__eyebrow">{t('lpHeroEyebrow')}</p>
            <h1 id="hero-title" className="l-hero__title" aria-label={t('lpHeroTitle')}>
              {words.map((word, i) => (
                <span key={`${word}-${i}`} aria-hidden="true">
                  <span className="l-word">
                    <span style={{ ['--i' as string]: i }} className={i === accent ? 'is-accent' : undefined}>
                      {word}
                    </span>
                  </span>
                  {i < words.length - 1 ? ' ' : null}
                </span>
              ))}
            </h1>
            <p className="l-hero__sub">{t('lpHeroSub')}</p>
            <div className="l-hero__actions">
              <Link to="/register" className="l-hero__cta">
                <span>{t('lpHeroCta')}</span>
                <i className="l-hero__cta-arrow">
                  <Arrow />
                </i>
              </Link>
              <a href="#how" className="l-hero__link">
                {t('lpHeroSecondary')}
              </a>
            </div>
          </div>

          <div className="l-hero__stack">
            <HeroCards />
          </div>
        </div>
      </div>
    </section>
  );
}
