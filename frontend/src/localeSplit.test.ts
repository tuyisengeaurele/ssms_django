import { describe, expect, it } from 'vitest';
import { pickLocale } from '../scripts/localeSplit.mjs';

// The translation files keep all three languages side by side, so a person adding a text sees them together and the parity test
// can compare them. The build cuts one language out of them, so a visitor downloads only the language they read.

const SOURCE = `
import type { Locale } from './translations';
type Entry = Record<Locale, string>;
const k = (en: string, fr: string, rw: string): Entry => ({ en, fr, rw });

export const pageTranslations = {
  ptUsers: k('Users', 'Utilisateurs', 'Abakoresha'),
  ptQuote: k("It's here", 'C\\'est ici', "Ni hano"),
  ptJoined: k(
    'First part ' + 'and more',
    'Première partie',
    \`Igice cya mbere\`,
  ),
  ptCount: k('{n} farms (all)', '{n} fermes (toutes)', '{n} amahindu (yose)'),
};
export const inline = {
  navFarms: { en: 'Farms', fr: 'Fermes', rw: 'Amahindu' },
};
`;

describe('pickLocale', () => {
  it('keeps the English of every text and drops the rest', () => {
    const out = pickLocale(SOURCE, 'en');
    expect(out).toContain("ptUsers: 'Users',");
    expect(out).toContain("navFarms: 'Farms'");
    expect(out).not.toContain('Utilisateurs');
    expect(out).not.toContain('Abakoresha');
    expect(out).not.toContain('Fermes');
  });

  it('keeps the French or the Kinyarwanda when asked', () => {
    expect(pickLocale(SOURCE, 'fr')).toContain("ptUsers: 'Utilisateurs',");
    expect(pickLocale(SOURCE, 'rw')).toContain("ptUsers: 'Abakoresha',");
    expect(pickLocale(SOURCE, 'rw')).toContain("navFarms: 'Amahindu'");
  });

  it('copes with quotes, joined strings, templates and texts spread over several lines', () => {
    const fr = pickLocale(SOURCE, 'fr');
    expect(fr).toContain("ptQuote: 'C\\'est ici',");
    expect(fr).toContain('ptJoined: \'Première partie\',');
    expect(pickLocale(SOURCE, 'rw')).toContain('ptJoined: `Igice cya mbere`,');
    expect(pickLocale(SOURCE, 'en')).toContain("ptJoined: 'First part ' + 'and more',");
  });

  it('keeps placeholders and brackets inside a text untouched', () => {
    expect(pickLocale(SOURCE, 'fr')).toContain("ptCount: '{n} fermes (toutes)',");
  });

  it('leaves the helper that builds an entry alone, so the file still compiles', () => {
    expect(pickLocale(SOURCE, 'fr')).toContain('({ en, fr, rw })');
  });

  it('leaves an object that only looks like an entry alone', () => {
    const odd = "export const labels = { en: 'English', fr: 'Français' };\nexport const three = { en: 1, fr: 2, rw: 3, de: 4 };";
    expect(pickLocale(odd, 'fr')).toBe(odd);
  });

  it('says which language it was asked for when it does not know it', () => {
    expect(() => pickLocale(SOURCE, 'de')).toThrow(/de/);
  });
});
