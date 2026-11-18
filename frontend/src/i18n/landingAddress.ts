import type { Locale } from './locales';

/** The address of the landing page in a language: English at the root, the others with a short prefix. */
export function landingAddress(locale: Locale): string {
  return locale === 'en' ? '/' : `/${locale}`;
}

/**
 * The language of a landing page address: "/" is English, "/fr" French, "/rw" Kinyarwanda, with or without a slash at the end.
 * Anything else is not a landing page address, and "/en" is not one either: it is sent to "/".
 */
export function languageOfLandingPath(pathname: string): Locale | null {
  const found = /^\/(?:(fr|rw)\/?)?$/.exec(pathname);
  if (!found) return null;
  return (found[1] as Locale | undefined) ?? 'en';
}

export const isLandingPath = (pathname: string): boolean => languageOfLandingPath(pathname) !== null;
