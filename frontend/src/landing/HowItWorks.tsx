import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useMotionValueEvent, useScroll } from 'framer-motion';
import { useLanguage } from '../context/LanguageContext';
import { AlertsMock } from './mockups/AlertsMock';
import { DashboardMock } from './mockups/DashboardMock';
import { DiseaseMock } from './mockups/DiseaseMock';
import { Reveal } from './motion/Reveal';
import { usePrefersReducedMotion } from './motion/usePrefersReducedMotion';
import './how.css';

const STEP_COUNT = 4;

/** Which step is active for a scroll progress between 0 and 1. */
export function stepForProgress(progress: number, count: number): number {
  if (!Number.isFinite(progress)) return 0;
  const clamped = Math.min(Math.max(progress, 0), 0.9999);
  return Math.floor(clamped * count);
}

const isSmallScreen = () => window.innerWidth < 860 || window.innerHeight < 640;

/** Pinning needs room. Reduced motion, narrow and short screens get a plain list. */
function useStacked(): boolean {
  const reduced = usePrefersReducedMotion();
  const [small, setSmall] = useState(isSmallScreen);

  useEffect(() => {
    const onResize = () => setSmall(isSmallScreen());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return reduced || small;
}

interface Step {
  title: string;
  body: string;
  screen: ReactNode;
}

function useSteps(): Step[] {
  const { t } = useLanguage();
  return [
    { title: t('lpStep1Title'), body: t('lpStep1Body'), screen: <DashboardMock /> },
    { title: t('lpStep2Title'), body: t('lpStep2Body'), screen: <AlertsMock /> },
    { title: t('lpStep3Title'), body: t('lpStep3Body'), screen: <DiseaseMock /> },
    { title: t('lpStep4Title'), body: t('lpStep4Body'), screen: <DashboardMock variant="harvest" /> },
  ];
}

function Title() {
  const { t } = useLanguage();
  return (
    <h2 id="how-title" className="l-how__title">
      {t('lpHowTitle')}
    </h2>
  );
}

function Stacked() {
  const steps = useSteps();
  return (
    <section id="how" className="l-how how--stacked" aria-labelledby="how-title">
      <div className="l-container">
        <Title />
        <ol className="l-how__steps">
          {steps.map((step, i) => (
            <Reveal key={step.title} as="li" className="l-how__step">
              <span className="l-how__num" aria-hidden="true">
                {`0${i + 1}`}
              </span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <div className="l-how__inline-screen">{step.screen}</div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Pinned() {
  const steps = useSteps();
  const outerRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  const { scrollYProgress } = useScroll({ target: outerRef, offset: ['start start', 'end end'] });
  useMotionValueEvent(scrollYProgress, 'change', (value) => setActive(stepForProgress(value, STEP_COUNT)));

  return (
    <section id="how" ref={outerRef} className="l-how" aria-labelledby="how-title" style={{ ['--steps' as string]: STEP_COUNT }}>
      <div className="l-how__sticky">
        <div className="l-container l-how__grid">
          <div className="l-how__text">
            <Title />
            <div className="l-how__list">
              <span className="l-how__rail" aria-hidden="true">
                <motion.i style={{ scaleY: scrollYProgress }} />
              </span>
              <ol className="l-how__steps">
                {steps.map((step, i) => (
                  <li key={step.title} className="l-how__step" aria-current={i === active ? 'step' : undefined}>
                    <span className="l-how__num" aria-hidden="true">
                      {`0${i + 1}`}
                    </span>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="l-how__screens">
            {steps.map((step, i) => (
              <div
                key={step.title}
                className={`l-how__screen${i === active ? ' is-active' : ''}`}
                aria-hidden={i === active ? undefined : true}
              >
                {step.screen}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function HowItWorks() {
  return useStacked() ? <Stacked /> : <Pinned />;
}
