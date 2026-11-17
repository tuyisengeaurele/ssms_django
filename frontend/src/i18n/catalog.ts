import { shouldSpareData } from '../utils/connection';
import type { Locale } from './locales';
import { translations as english } from './translations?locale=en';

/**
 * The texts of the app, one language at a time. English is always here, so a text is never missing. French and Kinyarwanda are
 * separate files that load when a person reads them, about a third of the size of all three together.
 */
type Catalog = Record<string, string>;

const loaded: Partial<Record<Locale, Catalog>> = { en: english };
const loading: Partial<Record<Locale, Promise<void>>> = {};

const loaders: Record<Exclude<Locale, 'en'>, () => Promise<{ translations: Catalog }>> = {
  fr: () => import('./translations?locale=fr'),
  rw: () => import('./translations?locale=rw'),
};

export function isLoaded(locale: Locale): boolean {
  return locale in loaded;
}

/** A text in a language. Until that language has arrived it is the English text, and a text nobody wrote is its own key. */
export function say(locale: Locale, key: string): string {
  return loaded[locale]?.[key] ?? english[key] ?? key;
}

/**
 * Start fetching a language that has not been asked for yet, because someone is about to ask. It does nothing for a person who
 * is saving data, never reports a failure (nobody chose this download), and the real choice tries again if it failed.
 */
export function prefetchCatalog(locale: Locale): void {
  if (locale === 'en' || loaded[locale] || loading[locale] || shouldSpareData()) return;
  loadCatalog(locale).catch(() => {});
}

/** Fetch a language. Asking again while it is on its way waits for the same download, and a failed one can be tried again. */
export function loadCatalog(locale: Locale): Promise<void> {
  if (locale === 'en' || loaded[locale]) return Promise.resolve();
  loading[locale] ??= loaders[locale]()
    .then((module) => {
      loaded[locale] = module.translations;
    })
    .catch((error) => {
      delete loading[locale];
      throw error;
    });
  return loading[locale]!;
}
