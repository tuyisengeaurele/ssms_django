import { landingAddress, languageOfLandingPath } from './i18n/landingAddress';
import type { Locale } from './i18n/locales';

export interface Start {
  /** Where to go instead of drawing this address, or null. */
  redirectTo: string | null;
  /** The language to start in, or undefined to use the usual rules (the saved choice, then the browser). */
  initialLocale: Locale | undefined;
  /** A language the address asked for, to keep as the person's choice, or null. */
  remember: Locale | null;
}

/**
 * What the app does before it draws anything, from the address and the language the person chose earlier.
 *
 * The landing page has an address in each language, and the address says which language it is: "/" is English, "/fr" French,
 * "/rw" Kinyarwanda. Opening a language address is a choice, so the rest of the app follows it. Someone who chose French and
 * opens "/" is sent to "/fr" (the host does this first by the cookie, this covers those with only browser storage). The browser's
 * own language is never used to decide, here or on the host: a search engine has none.
 */
export function decideStart({ pathname, search, hash, saved }: { pathname: string; search: string; hash: string; saved: Locale | null }): Start {
  const rest = `${search}${hash}`;
  if (pathname === '/en' || pathname === '/en/') return { redirectTo: `/${rest}`, initialLocale: 'en', remember: 'en' };

  const language = languageOfLandingPath(pathname);
  if (language === null) return { redirectTo: null, initialLocale: undefined, remember: null };
  if (language !== 'en') return { redirectTo: null, initialLocale: language, remember: language };
  if (saved && saved !== 'en') return { redirectTo: `${landingAddress(saved)}${rest}`, initialLocale: saved, remember: null };
  return { redirectTo: null, initialLocale: 'en', remember: null };
}
