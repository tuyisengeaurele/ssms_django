import type { PluralText } from '../i18n/plural';

/** "1 box" or "3 boxes" in the person's language. `tn` is the plural function of the language context. */
export function boxesText(tn: PluralText, n: number): string {
  return tn(n, 'alwBoxOne', 'alwBoxMany');
}
