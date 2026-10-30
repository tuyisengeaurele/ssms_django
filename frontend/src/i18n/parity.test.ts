import { describe, expect, it } from 'vitest';
import { landingTranslations } from './landing';
import { pageTranslations } from './pages';
import { translations } from './translations';

// The app speaks English, French and Kinyarwanda. Every text needs all three, so a gap shows up here and not on a
// farmer's screen.

const LOCALES = ['en', 'fr', 'rw'] as const;
const entries = Object.entries(translations);

// The product name is the same in every language.
const SAME_IN_EVERY_LANGUAGE = new Set(['lpHeroEyebrow', 'lpFooterName', 'ptDefault']);

const tokens = (text: string) => [...text.matchAll(/\{[a-zA-Z0-9_]+\}/g)].map((m) => m[0]).sort().join(' ');

describe('translations', () => {
  it('holds a real number of texts, so an empty import would not pass these checks', () => {
    expect(entries.length).toBeGreaterThan(1000);
  });

  it('has a text in all three languages for every key', () => {
    const missing = entries.flatMap(([key, entry]) => LOCALES.filter((l) => typeof entry[l] !== 'string' || !entry[l].trim()).map((l) => `${key}.${l}`));
    expect(missing).toEqual([]);
  });

  it('keeps the same placeholders in every language, so a name or a number is never dropped', () => {
    const broken = entries.filter(([, entry]) => tokens(entry.fr) !== tokens(entry.en) || tokens(entry.rw) !== tokens(entry.en)).map(([key]) => key);
    expect(broken).toEqual([]);
  });

  it('uses no en dash or em dash', () => {
    const dashed = entries.flatMap(([key, entry]) => LOCALES.filter((l) => /[\u2013\u2014]/.test(entry[l])).map((l) => `${key}.${l}`));
    expect(dashed).toEqual([]);
  });

  it('has no placeholder text left in', () => {
    const left = entries.flatMap(([key, entry]) => LOCALES.filter((l) => /\b(todo|tbd|xxx|lorem)\b/i.test(entry[l])).map((l) => `${key}.${l}`));
    expect(left).toEqual([]);
  });

  it('has no sentence left in English in French or Kinyarwanda', () => {
    const copied = entries
      .filter(([key, entry]) => !SAME_IN_EVERY_LANGUAGE.has(key) && entry.en.trim().split(/\s+/).length > 3)
      .flatMap(([key, entry]) => (['fr', 'rw'] as const).filter((l) => entry[l] === entry.en).map((l) => `${key}.${l}`));
    expect(copied).toEqual([]);
  });

  it('does not let the landing texts and the page texts share a key, since one would quietly replace the other', () => {
    const shared = Object.keys(landingTranslations).filter((key) => key in pageTranslations);
    expect(shared).toEqual([]);
  });
});
