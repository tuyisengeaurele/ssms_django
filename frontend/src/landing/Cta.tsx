import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { Reveal } from './motion/Reveal';
import './contact.css';

export function Cta() {
  const { t } = useLanguage();
  return (
    <section className="l-cta" aria-labelledby="cta-title">
      <div className="l-container l-cta__inner">
        <Reveal as="h2" className="l-cta__title">
          <span id="cta-title">{t('lpCtaTitle')}</span>
        </Reveal>
        <Reveal delay={140}>
          <Link to="/register" className="l-hero__cta">
            <span>{t('lpCtaButton')}</span>
            <i className="l-hero__cta-arrow">
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
                <path d="M4 12L12 4M5.5 4H12v6.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </i>
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
