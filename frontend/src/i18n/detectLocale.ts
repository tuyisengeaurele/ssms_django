import type { Locale } from './translations';

// The two letter codes the app speaks. Some systems give Kinyarwanda as its three letter code, "kin".
const LANGUAGE_CODES: Record<string, Locale> = { en: 'en', fr: 'fr', rw: 'rw', kin: 'rw' };

/**
 * The first language in the browser's ranked list that the app speaks, or null when it speaks none of them.
 * "fr-CA" counts as French. A longer code that only starts the same way, such as "fra", does not count.
 */
export function detectLocale(languages: readonly string[]): Locale | null {
  for (const entry of languages) {
    const code = entry.trim().split('-')[0].toLowerCase();
    if (code in LANGUAGE_CODES) return LANGUAGE_CODES[code];
  }
  return null;
}
