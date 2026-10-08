import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useLanguage } from '../context/LanguageContext';
import { AlertsMock } from './mockups/AlertsMock';
import { DashboardMock } from './mockups/DashboardMock';
import { DiseaseMock } from './mockups/DiseaseMock';
import { useCountUp } from './motion/useCountUp';
import { useMagnetic } from './motion/useMagnetic';
import { prefersReducedMotion, usePrefersReducedMotion } from './motion/usePrefersReducedMotion';
import './hero.css';

const BG_WIDTHS = [640, 1280, 1920, 2560];
const WORM_WIDTHS = [640, 1280, 1600];
const bgSet = (ext: string) => BG_WIDTHS.map((w) => `/images/hero-bg-${w}.${ext} ${w}w`).join(', ');
const wormSet = (ext: string) => WORM_WIDTHS.map((w) => `/images/worm-${w}.${ext} ${w}w`).join(', ');

const SCREEN_MS = 5000;

/** The longest word carries the italic gold accent, whatever the language. */
function accentIndex(words: string[]): number {
  let best = 0;
  words.forEach((word, i) => {
    if (word.replace(/[^\p{L}]/gu, '').length > words[best].replace(/[^\p{L}]/gu, '').length) best = i;
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

function Stat({ value, label, play }: { value: string; label: string; play: boolean }) {
  const shown = useCountUp(Number(value), { play });
  return (
    <li>
      <strong>{shown}</strong>
      <span>{label}</span>
    </li>
  );
}

export function Hero() {
  const { t } = useLanguage();
  const reduced = usePrefersReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const primaryRef = useMagnetic<HTMLAnchorElement>(0.28);

  // Three layers move at three speeds as the page scrolls.
  const { scrollYProgress } = useScroll({ target: cardRef, offset: ['start start', 'end start'] });
  const bgY = useTransform(scrollYProgress, [0, 1], ['0%', '9%']);
  const ghostY = useTransform(scrollYProgress, [0, 1], ['0%', '26%']);
  const wormY = useTransform(scrollYProgress, [0, 1], ['0%', '-9%']);
  const layer = (y: typeof bgY) => (reduced ? undefined : { y });

  const [live, setLive] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setLive(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Pointer parallax writes two CSS variables. The layers read them.
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion() || event.pointerType === 'touch') return;
    const card = cardRef.current;
    if (!card) return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const box = card.getBoundingClientRect();
      card.style.setProperty('--px', String(((event.clientX - box.left) / box.width - 0.5) * 2));
      card.style.setProperty('--py', String(((event.clientY - box.top) / box.height - 0.5) * 2));
    });
  };

  const screens = [
    { name: t('lpPreviewDashboard'), node: <DashboardMock /> },
    { name: t('lpPreviewDisease'), node: <DiseaseMock /> },
    { name: t('lpPreviewAlerts'), node: <AlertsMock /> },
  ];
  const [index, setIndex] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [chosen, setChosen] = useState(false);
  const paused = reduced || hovering || chosen;

  useEffect(() => {
    if (paused) return;
    const id = setTimeout(() => setIndex((i) => (i + 1) % screens.length), SCREEN_MS);
    return () => clearTimeout(id);
  }, [index, paused, screens.length]);

  const words = t('lpHeroTitle').split(' ');
  const accent = accentIndex(words);

  return (
    <section className="l-hero" aria-labelledby="hero-title">
      <div className="l-hero__card" ref={cardRef} onPointerMove={onPointerMove}>
        <motion.div className="l-hero__layer l-hero__bg" style={layer(bgY)}>
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
        </motion.div>
        <div className="l-hero__shade" aria-hidden="true" />

        <motion.div className="l-hero__layer" style={layer(ghostY)}>
          <div className="l-hero__ghost" aria-hidden="true">
            {t('lpGhostWord')}
          </div>
        </motion.div>

        <motion.div className="l-hero__layer l-hero__layer--worm" style={layer(wormY)}>
          <picture className="l-hero__worm">
            <source type="image/avif" srcSet={wormSet('avif')} sizes="(min-width: 900px) 40vw, 70vw" />
            <img src="/images/worm-1280.webp" srcSet={wormSet('webp')} sizes="(min-width: 900px) 40vw, 70vw" alt="" width={1600} height={1664} decoding="async" />
          </picture>
        </motion.div>

        <div className="l-hero__content">
          <div className="l-hero__copy">
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
              <Link ref={primaryRef} to="/register" className="l-hero__cta">
                <span>{t('lpHeroCta')}</span>
                <i className="l-hero__cta-arrow">
                  <Arrow />
                </i>
              </Link>
              <a href="#how" className="l-hero__link">
                {t('lpHeroSecondary')}
              </a>
            </div>
            <ul className="l-hero__stats" aria-label={t('lpStatsLabel')}>
              <Stat value={t('lpStat1Value')} label={t('lpStat1Label')} play={live} />
              <Stat value={t('lpStat2Value')} label={t('lpStat2Label')} play={live} />
              <Stat value={t('lpStat3Value')} label={t('lpStat3Label')} play={live} />
            </ul>
          </div>

          <aside
            className="l-hero__preview"
            aria-label={t('lpPreviewLabel')}
            onPointerEnter={() => setHovering(true)}
            onPointerLeave={() => setHovering(false)}
          >
            <div className="l-hero__screen" key={index}>
              {screens[index].node}
            </div>
            <div className="l-hero__preview-foot">
              <span className="l-hero__counter">{`0${index + 1} / 0${screens.length}`}</span>
              <span className="l-hero__track" aria-hidden="true">
                {!reduced && (
                  <i
                    key={`${index}-${paused}`}
                    className="l-hero__fill"
                    style={{ animationDuration: `${SCREEN_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }}
                  />
                )}
              </span>
              <span className="l-hero__dots">
                {screens.map((screen, i) => (
                  <button
                    key={screen.name}
                    type="button"
                    aria-label={t('lpPreviewShow').replace('{name}', screen.name)}
                    aria-current={i === index ? 'true' : undefined}
                    onClick={() => {
                      setIndex(i);
                      setChosen(true);
                    }}
                  />
                ))}
              </span>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
