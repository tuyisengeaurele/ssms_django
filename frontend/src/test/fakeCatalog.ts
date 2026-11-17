import { vi } from 'vitest';

// A stand-in for i18n/catalog where a test decides when a language arrives or fails, so it can look at the screen while a
// download is under way. Use it with: vi.mock('../i18n/catalog', async () => (await import('../test/fakeCatalog')).fakeCatalogModule)

const texts: Record<string, Record<string, string>> = {
  en: {
    hello: 'Hello',
    lpLangLabel: 'Language',
    lpLangBusy: 'Loading {language}',
    lpLangChanged: 'Language changed to {language}',
    lpLangFailed: 'Could not load {language}. Check your connection and try again.',
    lpLangRetry: 'Try again',
  },
  fr: {
    hello: 'Bonjour',
    lpLangLabel: 'Langue',
    lpLangBusy: 'Chargement : {language}',
    lpLangChanged: 'Langue changée : {language}',
    lpLangFailed: 'Impossible de charger {language}.',
    lpLangRetry: 'Réessayer',
  },
  rw: {
    hello: 'Muraho',
    lpLangLabel: 'Ururimi',
    lpLangBusy: 'Kuremera : {language}',
    lpLangChanged: 'Ururimi rwahindutse : {language}',
    lpLangFailed: 'Ntibishobotse gushyiraho {language}.',
    lpLangRetry: 'Ongera ugerageze',
  },
};

const have = new Set<string>(['en']);
const waiting = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();

export const fakeCatalog = {
  reset() {
    have.clear();
    have.add('en');
    waiting.clear();
  },
  /** Make a language available at once, as if it had been fetched earlier. */
  preload(locale: string) {
    have.add(locale);
  },
  /** The download of a language finishes. */
  arrive(locale: string) {
    waiting.get(locale)?.resolve();
    waiting.delete(locale);
  },
  /** The download of a language fails. */
  fail(locale: string) {
    waiting.get(locale)?.reject(new Error('offline'));
    waiting.delete(locale);
  },
};

export const fakeCatalogModule = {
  isLoaded: (locale: string) => have.has(locale),
  say: (locale: string, key: string) => (have.has(locale) ? texts[locale]?.[key] : undefined) ?? texts.en[key] ?? key,
  loadCatalog: (locale: string) =>
    have.has(locale)
      ? Promise.resolve()
      : new Promise<void>((resolve, reject) => {
          waiting.set(locale, {
            resolve: () => {
              have.add(locale);
              resolve();
            },
            reject,
          });
        }),
  prefetchCatalog: vi.fn(),
};
