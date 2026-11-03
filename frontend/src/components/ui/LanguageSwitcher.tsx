import { useLanguage } from '../../context/LanguageContext';
import { LOCALE_LABELS, type Locale } from '../../i18n/translations';

const CODES = Object.keys(LOCALE_LABELS) as Locale[];

/**
 * A small row of language codes, EN FR RW, always on screen. The full name sits in the tooltip and the accessible name,
 * and each button carries its own lang, so a screen reader says "Français" in French.
 */
export default function LanguageSwitcher() {
  const { t, locale, setLocale } = useLanguage();
  return (
    <div role="group" aria-label={t('lpLangLabel')} className="lang-pill">
      {CODES.map((code) => {
        const on = code === locale;
        return (
          <button
            key={code}
            type="button"
            lang={code}
            title={LOCALE_LABELS[code]}
            aria-label={LOCALE_LABELS[code]}
            className={on ? 'is-on' : ''}
            aria-pressed={on}
            onClick={() => setLocale(code)}
          >
            {code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
