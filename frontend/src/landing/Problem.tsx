import { useLanguage } from '../context/LanguageContext';
import { Reveal } from './motion/Reveal';
import './problem.css';

export function Problem() {
  const { t } = useLanguage();
  const lines = ['lpProblem1', 'lpProblem2', 'lpProblem3'] as const;

  return (
    <section className="l-problem">
      <div className="l-container">
        {lines.map((key, i) => (
          <Reveal key={key} as="p" delay={i * 160} y={32} className="l-problem__line">
            {t(key)}
          </Reveal>
        ))}
      </div>
    </section>
  );
}
