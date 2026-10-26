import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import './footer.css';

export function Footer() {
  const { t } = useLanguage();
  // On the home page a plain #hash scrolls. On other pages it must go home first.
  const base = useLocation().pathname === '/' ? '' : '/';
  const section = (id: string) => `${base}#${id}`;

  return (
    <footer className="l-footer">
      <div className="l-container">
        <div className="l-footer__top">
          <div className="l-footer__about">
            <img className="l-footer__logo" src="/logo-on-dark.png" alt="" width="64" height="64" loading="lazy" decoding="async" />
            <strong className="l-footer__name">{t('lpFooterName')}</strong>
            <p>{t('lpFooterBlurb')}</p>
            <span className="l-footer__tagline">{t('lpFooterTagline')}</span>
          </div>

          <nav className="l-footer__col" aria-label={t('lpFooterExplore')}>
            <h2>{t('lpFooterExplore')}</h2>
            <ul>
              <li>
                <a href={section('about')}>{t('lpNavAbout')}</a>
              </li>
              <li>
                <a href={section('product')}>{t('lpNavProduct')}</a>
              </li>
              <li>
                <a href={section('how')}>{t('lpNavHow')}</a>
              </li>
              <li>
                <a href={section('faq')}>{t('lpNavFaq')}</a>
              </li>
            </ul>
          </nav>

          <nav className="l-footer__col" aria-label={t('lpFooterAccount')}>
            <h2>{t('lpFooterAccount')}</h2>
            <ul>
              <li>
                <Link to="/login">{t('lpNavLogin')}</Link>
              </li>
              <li>
                <Link to="/register">{t('lpFooterCreate')}</Link>
              </li>
              <li>
                <a href={section('contact')}>{t('lpNavContact')}</a>
              </li>
            </ul>
          </nav>

          <nav className="l-footer__col" aria-label={t('lpFooterLegal')}>
            <h2>{t('lpFooterLegal')}</h2>
            <ul>
              <li>
                <Link to="/privacy">{t('lpFooterPrivacy')}</Link>
              </li>
              <li>
                <Link to="/terms">{t('lpFooterTerms')}</Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="l-footer__wordmark" aria-hidden="true">
          SSMS
        </div>

        <div className="l-footer__base">
          <small>{t('lpFooterPhotos')}</small>
          <small>{new Date().getFullYear()}</small>
        </div>
      </div>
    </footer>
  );
}
