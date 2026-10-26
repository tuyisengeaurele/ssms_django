import { useEffect, useState } from 'react';
import { DiseaseCard } from './cards/DiseaseCard';
import { ReadingsCard } from './cards/ReadingsCard';
import { ReportCard } from './cards/ReportCard';
import { prefersReducedMotion } from './motion/usePrefersReducedMotion';
import './herocards.css';

/** Time each card stays in the window, in milliseconds. */
export const HERO_CARD_INTERVAL = 5200;

const CARDS = [ReportCard, ReadingsCard, DiseaseCard];

/** One small window that swaps between three paper cards on its own. */
export function HeroCards() {
  const [view, setView] = useState({ active: 0, previous: -1 });
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || prefersReducedMotion()) return;
    const id = window.setInterval(() => {
      setView((v) => ({ active: (v.active + 1) % CARDS.length, previous: v.active }));
    }, HERO_CARD_INTERVAL);
    return () => window.clearInterval(id);
  }, [paused]);

  return (
    <div className="l-herocards" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {CARDS.map((Card, i) => {
        const state = i === view.active ? ' is-active' : i === view.previous ? ' is-leaving' : '';
        return (
          <div key={i} className={`l-herocards__slot${state}`} aria-hidden={i === view.active ? undefined : true}>
            <Card />
          </div>
        );
      })}
    </div>
  );
}
