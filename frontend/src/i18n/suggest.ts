import { detectLocale } from './detectLocale';
import type { Locale } from './locales';

const KEY = 'ssms_lang_hint';

/**
 * The language to offer a visitor, or null. Only a first time visitor on the English page of the landing page whose browser ranks
 * French or Kinyarwanda first, and who has not chosen a language or dismissed the offer. The first language only: a browser that
 * lists English first says English is what they prefer. This is an offer and never a redirect, because a search engine has no
 * language and a guess would hide the English page from people who want it.
 */
export function suggestedLanguage({
  ranked,
  saved,
  dismissed,
  pageLanguage,
}: {
  ranked: readonly string[];
  saved: Locale | null;
  dismissed: boolean;
  pageLanguage: Locale | null;
}): 'fr' | 'rw' | null {
  if (saved || dismissed || pageLanguage !== 'en') return null;
  const first = detectLocale(ranked.slice(0, 1));
  return first === 'fr' || first === 'rw' ? first : null;
}

export function hintDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Remember that the offer was dismissed. It is not a language choice, so the language rules are not touched. */
export function dismissHint(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // Storage can be blocked. The offer still goes away for this visit.
  }
}
