import { useLanguage } from '../../context/LanguageContext';
import { LOCALE_LABELS, type Locale } from '../../i18n/translations';

interface LanguageSwitcherProps {
  /** Inside a menu the choices are radio items, and the control takes the look of the other menu choices. */
  inMenu?: boolean;
}

const CODES = Object.keys(LOCALE_LABELS) as Locale[];

/**
 * A small row of language codes, EN FR RW, always on screen. The full name sits in the tooltip and the accessible name,
 * and each button carries its own lang, so a screen reader says "Français" in French.
 */
export default function LanguageSwitcher({ inMenu = false }: LanguageSwitcherProps) {
  const { t, locale, setLocale } = useLanguage();
  return (
    <div role="group" aria-label={t('lpLangLabel')} className={inMenu ? 'segmented' : 'lang-pill'}>
      {CODES.map((code) => {
        const on = code === locale;
        const state = inMenu ? { role: 'menuitemradio', 'aria-checked': on } : { 'aria-pressed': on };
        return (
          <button
            key={code}
            type="button"
            lang={code}
            title={LOCALE_LABELS[code]}
            aria-label={LOCALE_LABELS[code]}
            className={on ? 'is-on' : ''}
            onClick={() => setLocale(code)}
            {...state}
          >
            {code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
