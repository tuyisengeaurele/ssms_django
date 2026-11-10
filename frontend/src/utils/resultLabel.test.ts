import { describe, expect, it } from 'vitest';
import { translations } from '../i18n/translations';
import { resultLabel } from './resultLabel';

// A disease check answers "Healthy" or the name of a disease. "Healthy" is a word of the screen's language. A disease keeps
// the name the model gives it (Grasserie), which is a name and not a translation.

const say = (locale: 'en' | 'fr' | 'rw') => (key: string) => translations[key]?.[locale] ?? key;

describe('resultLabel', () => {
  it.each([
    ['en', 'Healthy'],
    ['fr', 'Sains'],
    ['rw', 'Bizima'],
  ] as const)('says healthy in %s', (locale, word) => {
    expect(resultLabel(say(locale), 'Healthy')).toBe(word);
  });

  it('keeps the name of a disease as the model gave it, in every language', () => {
    for (const locale of ['en', 'fr', 'rw'] as const) expect(resultLabel(say(locale), 'Grasserie')).toBe('Grasserie');
  });

  it('shows a result it does not know as it came, rather than nothing', () => {
    expect(resultLabel(say('rw'), 'Something new')).toBe('Something new');
    expect(resultLabel(say('rw'), '')).toBe('');
  });
});
