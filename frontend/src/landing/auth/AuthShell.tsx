import '../../fonts/fonts.css';
import '../tokens.css';
import '../landing.css';
import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useLanguagePicker } from '../../hooks/useLanguagePicker';
import { LOCALE_LABELS, type Locale } from '../../i18n/locales';
import LazyAnnouncements from '../../components/announcements/LazyAnnouncements';
import './auth.css';

interface AuthShellProps {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}

/** Split layout shared by sign in, sign up and the account email pages. */
export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  const { t } = useLanguage();
  const { locale, choose, menuIntent } = useLanguagePicker();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="landing l-auth">
      <a className="l-skip" href="#main">
        {t('lpSkip')}
      </a>

      <aside className="l-auth__aside">
        <div className="l-auth__watermark" aria-hidden="true">
          <img src="/logo-on-dark.png" alt="" width="640" height="640" decoding="async" />
        </div>

        <Link to="/" className="l-auth__brand" aria-label={`SSMS, ${t('lpFooterName')}`}>
          <img src="/logo-on-dark.png" alt="" width="44" height="44" decoding="async" />
          <span>SSMS</span>
        </Link>

        <div className="l-auth__pitch">
          <p className="l-auth__eyebrow">{t('lpHeroEyebrow')}</p>
          <p className="l-auth__statement">{t('lpHeroTitle')}</p>
          <p className="l-auth__sub">{t('lpHeroSub')}</p>
        </div>
      </aside>

      <div className="l-auth__side">
        <LazyAnnouncements mode="visitor-live" />
        <div className="l-auth__bar">
          <Link to="/" className="l-auth__back">
            <span aria-hidden="true">&larr;</span> {t('lpAuthBack')}
          </Link>
          <select
            className="l-auth__lang"
            aria-label={t('lpLangLabel')}
            value={locale}
            onChange={(e) => choose(e.target.value as Locale)}
            {...menuIntent}
          >
            {(Object.keys(LOCALE_LABELS) as Locale[]).map((code) => (
              <option key={code} value={code}>
                {LOCALE_LABELS[code]}
              </option>
            ))}
          </select>
        </div>

        <main id="main" tabIndex={-1} className="l-auth__main">
          <div className="l-auth__panel">
            <header className="l-auth__head">
              <h1>{title}</h1>
              {subtitle ? <p>{subtitle}</p> : null}
            </header>
            {children}
          </div>
        </main>

        <footer className="l-auth__foot">
          <Link to="/privacy">{t('lpFooterPrivacy')}</Link>
          <Link to="/terms">{t('lpFooterTerms')}</Link>
        </footer>
      </div>
    </div>
  );
}

interface AuthFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  id: string;
  label: string;
  hint?: string;
  /** A problem with this field, written beside it. The field is marked invalid and points at the message. */
  error?: string;
  /** Shown on the right of the label, for example a forgot password link. */
  aside?: ReactNode;
}

export function AuthField({ id, label, hint, error, aside, type = 'text', ...rest }: AuthFieldProps) {
  const { t } = useLanguage();
  const [shown, setShown] = useState(false);
  const isPassword = type === 'password';

  return (
    <div className="l-field">
      <div className="l-field__row">
        <label htmlFor={id}>{label}</label>
        {aside}
      </div>
      <div className="l-field__control">
        <input
          id={id}
          type={isPassword && shown ? 'text' : type}
          aria-describedby={[error ? `${id}-error` : '', hint ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined}
          aria-invalid={error ? true : undefined}
          {...rest}
        />
        {isPassword ? (
          <button
            type="button"
            className="l-field__toggle"
            aria-label={shown ? t('lpAuthHidePwd') : t('lpAuthShowPwd')}
            onClick={() => setShown((v) => !v)}
          >
            {shown ? (
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                <path d="M3 3l18 18M10.6 6.1A9.6 9.6 0 0 1 12 6c5 0 8.5 4.2 9.6 6a14 14 0 0 1-3 3.4M6.6 7.7A14 14 0 0 0 2.4 12C3.5 13.8 7 18 12 18c1.4 0 2.7-.3 3.8-.8M9.9 9.9a3 3 0 0 0 4.2 4.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                <path d="M2.4 12C3.5 10.2 7 6 12 6s8.5 4.2 9.6 6c-1.1 1.8-4.6 6-9.6 6S3.5 13.8 2.4 12z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            )}
          </button>
        ) : null}
      </div>
      {error ? (
        <p id={`${id}-error`} className="l-field__hint l-field__hint--problem" role="alert">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={`${id}-hint`} className="l-field__hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function AuthAlert({ children }: { children: ReactNode }) {
  return (
    <div className="l-alert" role="alert">
      {children}
    </div>
  );
}

interface AuthButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingLabel?: string;
}

export function AuthButton({ loading, loadingLabel, children, disabled, ...rest }: AuthButtonProps) {
  return (
    <button type="submit" className="l-auth__submit" disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? (
        <>
          <span className="l-auth__spinner" aria-hidden="true" />
          {loadingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
