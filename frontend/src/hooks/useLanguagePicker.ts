import { useLanguage } from '../context/LanguageContext';
import { prefetchCatalog } from '../i18n/catalog';
import { LOCALE_LABELS, type Locale } from '../i18n/locales';

const OTHER_THAN_ENGLISH = (Object.keys(LOCALE_LABELS) as Locale[]).filter((code) => code !== 'en');

/**
 * What every language control shares. It tells the page what the person is about to do, so the language is already downloaded
 * when they choose it:
 * - `intentFor(code)`: props for a control that stands for one language. Hover, keyboard focus and touch fetch that language.
 * - `menuIntent`: props for a menu of languages. A pointer passing over it is not intent, but focusing or pressing it is, and
 *   any language could be picked, so the others are fetched.
 */
export function useLanguagePicker() {
  const { locale, setLocale } = useLanguage();

  const intentFor = (code: Locale) => {
    const warm = () => prefetchCatalog(code);
    return { onPointerEnter: warm, onFocus: warm, onPointerDown: warm };
  };

  const warmOthers = () => {
    OTHER_THAN_ENGLISH.filter((code) => code !== locale).forEach((code) => prefetchCatalog(code));
  };

  return { locale, choose: setLocale, intentFor, menuIntent: { onFocus: warmOthers, onPointerDown: warmOthers } };
}
