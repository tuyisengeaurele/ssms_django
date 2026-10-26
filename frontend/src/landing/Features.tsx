import type { PointerEvent, ReactNode } from 'react';
import { useLanguage } from '../context/LanguageContext';
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
      </div>
      <svg viewBox="0 0 320 70" preserveAspectRatio="none" focusable="false">
        <path
          className="l-feat__line"
          pathLength="1"
          d="M0 46 C30 44 40 22 70 28 S110 54 140 40 S190 10 220 22 S270 42 320 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function Result() {
  const { t } = useLanguage();
  return (
    <div className="l-feat__viz l-feat__result" aria-hidden="true">
      <small>{t('lpCardResult')}</small>
      <b>{t('lpCardHealthy')}</b>
      <span>
        {t('lpCardConfidence')} 96 %
      </span>
    </div>
  );
}

function Mail() {
  const { t } = useLanguage();
  return (
    <div className="l-feat__viz l-feat__mail" aria-hidden="true">
      <small>SSMS</small>
      <b>{t('lpMockAlert1')}</b>
      <span>{t('lpMockAgo1')}</span>
    </div>
  );
}

function Total() {
  const { t } = useLanguage();
  return (
    <div className="l-feat__viz l-feat__total" aria-hidden="true">
      <small>{t('lpMockTotal')}</small>
      <b>107.9 kg</b>
    </div>
  );
}

function Farms() {
  const { t } = useLanguage();
  const rows = [
    { name: 'Huye Farm', ok: true },
    { name: 'Musanze Farm', ok: true },
    { name: 'Gasabo Farm', ok: false },
  ];
  return (
    <div className="l-feat__viz l-feat__farms" aria-hidden="true">
      {rows.map((row) => (
        <div key={row.name} className={row.ok ? undefined : 'is-watch'}>
          <span>{row.name}</span>
          <span>{row.ok ? t('lpCardInRange') : t('lpMockAttention')}</span>
        </div>
      ))}
    </div>
  );
}

export function Features() {
  const { t } = useLanguage();
  const tiles: Array<{ id: string; title: string; body: string; viz: ReactNode }> = [
    { id: 'live', title: t('lpFeat1Title'), body: t('lpFeat1Body'), viz: <Live /> },
    { id: 'disease', title: t('lpFeat2Title'), body: t('lpFeat2Body'), viz: <Result /> },
    { id: 'mail', title: t('lpFeat3Title'), body: t('lpFeat3Body'), viz: <Mail /> },
    { id: 'harvest', title: t('lpFeat4Title'), body: t('lpFeat4Body'), viz: <Total /> },
    { id: 'coop', title: t('lpFeat5Title'), body: t('lpFeat5Body'), viz: <Farms /> },
  ];

  return (
    <section id="product" className="l-features" aria-labelledby="features-title">
      <div className="l-container">
        <Reveal as="p" className="l-eyebrow">
          {t('lpSolutionEyebrow')}
        </Reveal>
        <Reveal as="h2" className="l-features__title" delay={80}>
          <span id="features-title">{t('lpSolutionTitle')}</span>
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
