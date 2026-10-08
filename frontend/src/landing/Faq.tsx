import { useRef, useState, type KeyboardEvent } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { Reveal } from './motion/Reveal';
import './faq.css';

const COUNT = 6;

export function Faq() {
  const { t } = useLanguage();
  const [open, setOpen] = useState<number | null>(0);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = COUNT - 1;
    const target =
      event.key === 'ArrowDown' ? (index + 1) % COUNT
      : event.key === 'ArrowUp' ? (index - 1 + COUNT) % COUNT
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null;
    if (target === null) return;
    event.preventDefault();
    buttons.current[target]?.focus();
  };

  return (
    <section id="faq" className="l-faq" aria-labelledby="faq-title">
      <div className="l-container l-faq__grid">
        <Reveal as="h2" className="l-faq__title">
          <span id="faq-title">{t('lpFaqTitle')}</span>
        </Reveal>

        <div className="l-faq__list">
          {Array.from({ length: COUNT }, (_, i) => {
            const n = i + 1;
            const isOpen = open === i;
            return (
              <div key={n} className={`l-faq__item${isOpen ? ' is-open' : ''}`}>
                <h3>
                  <button
                    ref={(el) => {
                      buttons.current[i] = el;
                    }}
                    id={`faq-q-${n}`}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`faq-a-${n}`}
                    onClick={() => setOpen(isOpen ? null : i)}
                    onKeyDown={(e) => move(e, i)}
                  >
                    <span>{t(`lpFaq${n}Q`)}</span>
                    <i className="l-faq__icon" aria-hidden="true" />
                  </button>
                </h3>
                <div id={`faq-a-${n}`} role="region" aria-labelledby={`faq-q-${n}`} hidden={!isOpen}>
                  <p>{t(`lpFaq${n}A`)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
