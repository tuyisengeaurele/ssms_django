import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { LOCALE_LABELS, type Locale } from '../i18n/translations';
import './nav.css';

const LINKS = [
  { href: '#product', key: 'lpNavProduct' },
  { href: '#how', key: 'lpNavHow' },
  { href: '#contact', key: 'lpNavContact' },
] as const;

const FOCUSABLE = 'a[href], button:not([disabled]), select, [tabindex]:not([tabindex="-1"])';

function Mark() {
  return (
    <svg className="l-nav__mark" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false">
      <ellipse cx="16" cy="17" rx="8.5" ry="11" fill="#2D6A4F" />
      <path d="M16 6c3 3 4.5 7 4.5 11.5S19 25.5 16 28" fill="none" stroke="#FBF9F4" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16 6c-3 3-4.5 7-4.5 11.5S13 25.5 16 28" fill="none" stroke="#FBF9F4" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
      <circle cx="24.5" cy="7" r="3" fill="#C8923A" />
    </svg>
  );
}

export function Nav() {
  const { t, locale, setLocale } = useLanguage();
  const [condensed, setCondensed] = useState(false);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setCondensed(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Keep Tab inside the open menu.
  const trapTab = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const languageSelect = (
    <select
      className="l-nav__lang"
      aria-label={t('lpLangLabel')}
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
    >
      {(Object.keys(LOCALE_LABELS) as Locale[]).map((code) => (
        <option key={code} value={code}>
          {LOCALE_LABELS[code]}
        </option>
      ))}
    </select>
  );

  return (
    <header className={`l-nav${condensed ? ' is-condensed' : ''}`}>
      <nav className="l-nav__pill" aria-label="Main">
        <Link to="/" className="l-nav__brand" aria-label={`SSMS, ${t('lpFooterName')}`}>
          <Mark />
          <span className="l-nav__word">SSMS</span>
        </Link>

        <ul className="l-nav__links">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a href={link.href}>{t(link.key)}</a>
            </li>
          ))}
        </ul>

        <div className="l-nav__actions">
          {languageSelect}
          <Link to="/login" className="l-nav__login">
            {t('lpNavLogin')}
          </Link>
          <Link to="/register" className="l-btn l-btn--small">
            {t('lpNavStart')}
          </Link>
        </div>

        <button
          ref={buttonRef}
          type="button"
          className="l-nav__menu"
          aria-expanded={open}
          aria-controls="l-mobile-menu"
          aria-label={open ? t('lpNavClose') : t('lpNavMenu')}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="l-nav__bars" aria-hidden="true" />
        </button>
      </nav>

      {open && (
        <div
          id="l-mobile-menu"
          ref={dialogRef}
          className="l-nav__sheet"
          role="dialog"
          aria-modal="true"
          aria-label={t('lpNavMenu')}
          onKeyDown={trapTab}
        >
          <ul>
            {LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} onClick={() => setOpen(false)}>
                  {t(link.key)}
                </a>
              </li>
            ))}
          </ul>
          <div className="l-nav__sheet-actions">
            {languageSelect}
            <Link to="/login" onClick={() => setOpen(false)}>
              {t('lpNavLogin')}
            </Link>
            <Link to="/register" className="l-btn" onClick={() => setOpen(false)}>
              {t('lpNavStart')}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
