import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import './contact.css';

export function Footer() {
  const { t } = useLanguage();
  return (
    <footer className="l-footer">
      <div className="l-container l-footer__inner">
        <div className="l-footer__brand">
          <strong>{t('lpFooterName')}</strong>
          <span>{t('lpFooterTagline')}</span>
        </div>
        <nav aria-label="Legal" className="l-footer__links">
          <Link to="/privacy">{t('lpFooterPrivacy')}</Link>
          <Link to="/terms">{t('lpFooterTerms')}</Link>
        </nav>
      </div>
      <div className="l-container l-footer__base">
        <small>{t('lpFooterPhotos')}</small>
        <small>{new Date().getFullYear()}</small>
      </div>
    </footer>
  );
}
