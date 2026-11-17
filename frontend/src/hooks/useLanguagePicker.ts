import { useLanguage } from '../context/LanguageContext';
import { useOptionalToast } from '../context/ToastContext';
import { prefetchCatalog } from '../i18n/catalog';
import { LOCALE_LABELS, type Locale } from '../i18n/locales';
import { fill } from '../utils/fill';

const OTHER_THAN_ENGLISH = (Object.keys(LOCALE_LABELS) as Locale[]).filter((code) => code !== 'en');

/**
 * What every language control shares. It tells the page what the person is about to do, so the language is already downloaded
 * when they choose it, and it says so when a switch is waiting or fails:
 * - `intentFor(code)`: props for a control that stands for one language. Hover, keyboard focus and touch fetch that language,
 *   and the control is marked busy while it downloads.
 * - `menuIntent`: props for a menu of languages. A pointer passing over it is not intent, but focusing or pressing it is, and
 *   any language could be picked, so the others are fetched. The menu is busy while any download is under way.
 * - `choose(code)`: switch. If the download fails the language stays as it was and a toast says so, with a way to try again.
 */
export function useLanguagePicker() {
  const { t, locale, setLocale, pending } = useLanguage();
  const toasts = useOptionalToast();

  const choose = async (code: Locale): Promise<'ok' | 'failed'> => {
    const result = await setLocale(code);
    if (result === 'failed') {
      toasts?.toast(fill(t('lpLangFailed'), { language: LOCALE_LABELS[code] }), 'error', {
        label: t('lpLangRetry'),
        onClick: () => void choose(code),
      });
    }
    return result;
  };

  const intentFor = (code: Locale) => {
    const warm = () => prefetchCatalog(code);
    return { onPointerEnter: warm, onFocus: warm, onPointerDown: warm, 'aria-busy': pending === code ? (true as const) : undefined, 'data-lang-control': '' };
  };

  const warmOthers = () => {
    OTHER_THAN_ENGLISH.filter((code) => code !== locale).forEach((code) => prefetchCatalog(code));
  };

  const menuIntent = {
    onFocus: warmOthers,
    onPointerDown: warmOthers,
    'aria-busy': pending ? (true as const) : undefined,
    'data-lang-control': '',
  };

  return { locale, choose, pending, intentFor, menuIntent };
}
