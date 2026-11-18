import { fill } from '../utils/fill';
import type { Locale } from './locales';

export type PluralCategory = 'one' | 'other';

/** The shape of `tn` on the language context, for a function that is handed it. */
export type PluralText = (n: number, oneKey: string, otherKey: string, params?: Record<string, string | number>) => string;

/**
 * Which form a count takes. English says "one" for 1 only. French says it for anything under 2, so "0 ferme" and "1,5 ferme"
 * (the standard rule). Kinyarwanda is set by hand to 1 only, because browsers carry no plural data for it. The French rule is
 * a draft until a native speaker confirms it.
 */
export function pluralCategory(locale: Locale, n: number): PluralCategory {
  if (!Number.isFinite(n)) return 'other';
  const size = Math.abs(n);
  if (locale === 'fr') return size < 2 ? 'one' : 'other';
  return size === 1 ? 'one' : 'other';
}

/**
 * The text for a count: the singular text for "one", the other text for the rest, with {n} and any other values filled in.
 * `params.n` overrides the number shown, for a count the screen formats (1,200).
 *
 * French uses the singular for 0 too, but a singular text that has the number written in ("1 box") or none at all would then be
 * wrong for 0. So the singular is used for a count other than 1 only when its text has {n}. Otherwise the other text is used, as it
 * always was.
 */
export function pluralText(
  t: (key: string) => string,
  locale: Locale,
  n: number,
  oneKey: string,
  otherKey: string,
  params: Record<string, string | number> = {},
): string {
  let text = t(pluralCategory(locale, n) === 'one' ? oneKey : otherKey);
  if (n !== 1 && text === t(oneKey) && !text.includes('{n}')) text = t(otherKey);
  return fill(text, { n, ...params });
}
