import { fill } from './fill';

/** "1 box" or "3 boxes" in the person's language. `t` is the translation function of the language context. */
export function boxesText(t: (key: string) => string, n: number): string {
  return n === 1 ? t('alwBoxOne') : fill(t('alwBoxMany'), { n });
}
