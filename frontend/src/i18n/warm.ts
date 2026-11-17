import { prefetchCatalog } from './catalog';
import { detectLocale } from './detectLocale';
import type { Locale } from './locales';

/**
 * The languages of the app that the browser lists besides the one in use, in the order it ranks them. A person who reads
 * French after English may well switch, so these are worth having ready. English is left out: it is always here.
 */
export function likelyLanguages(ranked: readonly string[], current: Locale): Locale[] {
  const found: Locale[] = [];
  for (const tag of ranked) {
    const locale = detectLocale([tag]);
    if (locale && locale !== 'en' && locale !== current && !found.includes(locale)) found.push(locale);
  }
  return found;
}

/** Fetch those languages once the browser has nothing better to do, so it never competes with the page that is loading. */
export function warmLikelyLanguages(current: Locale): void {
  const run = () => {
    const ranked = navigator.languages?.length ? navigator.languages : [navigator.language ?? ''];
    likelyLanguages(ranked, current).forEach((locale) => prefetchCatalog(locale));
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 5000 });
  else setTimeout(run, 2000);
}
