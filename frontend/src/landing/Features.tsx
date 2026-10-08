import type { PointerEvent, ReactNode } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { LOCALE_LABELS } from '../i18n/translations';
import { Reveal } from './motion/Reveal';
import { prefersReducedMotion } from './motion/usePrefersReducedMotion';
import './features.css';

/** A soft light follows the pointer across a tile. Desktop mouse only. */
function spotlight(event: PointerEvent<HTMLElement>) {
  if (prefersReducedMotion() || event.pointerType === 'touch') return;
  const el = event.currentTarget;
  const box = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${event.clientX - box.left}px`);
  el.style.setProperty('--my', `${event.clientY - box.top}px`);
}

function Live() {
  return (
    <div className="l-feat__viz l-feat__live" aria-hidden="true">
      <div className="l-feat__numbers">
        <b>
          24.6<small>°C</small>
        </b>
        <b>
          78<small>%</small>
        </b>
        <i className="l-feat__pulse" />
      </div>
      <svg viewBox="0 0 320 90" preserveAspectRatio="none" focusable="false">
        <path
          className="l-feat__line"
          pathLength="1"
          d="M0 62 C30 58 40 30 70 36 S110 70 140 52 S190 14 220 30 S270 56 320 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function Chips() {
  const names = ['Healthy', 'Flacherie', 'Grasserie', 'Muscardine', 'Pebrine'];
  return (
    <div className="l-feat__viz l-feat__chips" aria-hidden="true">
      {names.map((name) => (
        <span key={name} className={name === 'Grasserie' ? 'is-hit' : undefined}>
          {name}
        </span>
      ))}
    </div>
  );
}

function Mail() {
  const { t } = useLanguage();
  return (
    <div className="l-feat__viz l-feat__mail" aria-hidden="true">
      <i />
      <span>{t('lpMockAlert1')}</span>
      <small>{t('lpMockAgo1')}</small>
    </div>
  );
}

function Crew() {
  return (
    <div className="l-feat__viz l-feat__crew" aria-hidden="true">
      {['A', 'B', 'C', 'D', 'E'].map((letter) => (
        <span key={letter}>{letter}</span>
      ))}
    </div>
  );
}

function Bars() {
  const bars = [
    { grade: 'A', h: 78 },
    { grade: 'A', h: 62 },
    { grade: 'B', h: 40 },
  ];
  return (
    <div className="l-feat__viz l-feat__bars" aria-hidden="true">
      {bars.map((bar, i) => (
        <span key={i} style={{ ['--h' as string]: bar.h }}>
          <i />
          <small>{bar.grade}</small>
        </span>
      ))}
    </div>
  );
}

function Tongues() {
  return (
    <div className="l-feat__viz l-feat__tongues" aria-hidden="true">
      {(['en', 'fr', 'rw'] as const).map((code) => (
        <span key={code}>
          <b>{code.toUpperCase()}</b>
          {LOCALE_LABELS[code]}
        </span>
      ))}
    </div>
  );
}

export function Features() {
  const { t } = useLanguage();
  const tiles: Array<{ id: string; title: string; body: string; viz: ReactNode }> = [
    { id: 'live', title: t('lpFeat1Title'), body: t('lpFeat1Body'), viz: <Live /> },
    { id: 'disease', title: t('lpFeat2Title'), body: t('lpFeat2Body'), viz: <Chips /> },
    { id: 'mail', title: t('lpFeat3Title'), body: t('lpFeat3Body'), viz: <Mail /> },
    { id: 'coop', title: t('lpFeat4Title'), body: t('lpFeat4Body'), viz: <Crew /> },
    { id: 'harvest', title: t('lpFeat5Title'), body: t('lpFeat5Body'), viz: <Bars /> },
    { id: 'tongues', title: t('lpFeat6Title'), body: t('lpFeat6Body'), viz: <Tongues /> },
  ];

  return (
    <section id="product" className="l-features" aria-labelledby="features-title">
      <div className="l-container">
        <Reveal as="h2" className="l-features__title">
          <span id="features-title">{t('lpFeaturesTitle')}</span>
        </Reveal>

        <div className="l-feat-grid">
          {tiles.map((tile, i) => (
            <Reveal
              key={tile.id}
              as="article"
              delay={(i % 3) * 110}
              className={`l-feat l-feat--${tile.id}`}
              onPointerMove={spotlight}
            >
              <div className="l-feat__inner">
                {tile.viz}
                <h3>{tile.title}</h3>
                <p>{tile.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
