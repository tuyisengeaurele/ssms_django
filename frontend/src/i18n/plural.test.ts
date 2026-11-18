import { describe, expect, it } from 'vitest';
import { pluralCategory, pluralText } from './plural';

// "1 farm", "2 farms". English says "one" for 1 only. French says it for 0 and 1 and for anything under 2 ("0 ferme", "1,5 ferme").
// Browsers have no plural data for Kinyarwanda, so its rule is set by hand: one for 1 only. The French rule is a draft until a
// native speaker confirms it.

describe('pluralCategory', () => {
  it.each([
    ['en', 0, 'other'],
    ['en', 1, 'one'],
    ['en', 2, 'other'],
    ['en', 1.5, 'other'],
    ['fr', 0, 'one'],
    ['fr', 1, 'one'],
    ['fr', 1.5, 'one'],
    ['fr', 2, 'other'],
    ['fr', 100, 'other'],
    ['rw', 0, 'other'],
    ['rw', 1, 'one'],
    ['rw', 1.5, 'other'],
    ['rw', 2, 'other'],
  ] as const)('%s: %s is %s', (locale, n, expected) => {
    expect(pluralCategory(locale, n)).toBe(expected);
  });

  it('treats a negative count by its size', () => {
    expect(pluralCategory('en', -1)).toBe('one');
    expect(pluralCategory('fr', -0.5)).toBe('one');
  });

  it('never says "one" for a number that is not a number', () => {
    expect(pluralCategory('en', Number.NaN)).toBe('other');
    expect(pluralCategory('fr', Number.NaN)).toBe('other');
    expect(pluralCategory('fr', Infinity)).toBe('other');
  });
});

describe('pluralText', () => {
  const texts: Record<string, string> = {
    farmsOne: '{n} farm',
    farms: '{n} farms',
    boxOne: '1 box',
    boxes: '{n} boxes',
    waitOne: 'Try again in 1 second.',
    wait: 'Try again in {n} seconds.',
    sumOne: '{n} record, {kg} kg.',
    sum: '{n} records, {kg} kg.',
  };
  const t = (key: string) => texts[key] ?? key;

  it('picks the singular text for one and the other text for the rest', () => {
    expect(pluralText(t, 'en', 1, 'farmsOne', 'farms')).toBe('1 farm');
    expect(pluralText(t, 'en', 3, 'farmsOne', 'farms')).toBe('3 farms');
    expect(pluralText(t, 'en', 0, 'farmsOne', 'farms')).toBe('0 farms');
  });

  it('fills the count into the text', () => {
    expect(pluralText(t, 'en', 12, 'farmsOne', 'farms')).toBe('12 farms');
  });

  it('shows a count written the way the screen writes it, when one is given', () => {
    expect(pluralText(t, 'en', 1200, 'farmsOne', 'farms', { n: '1,200' })).toBe('1,200 farms');
  });

  it('fills the other values too', () => {
    expect(pluralText(t, 'en', 1, 'sumOne', 'sum', { kg: 4 })).toBe('1 record, 4 kg.');
  });

  it('uses the singular text for zero in French when that text can show the count', () => {
    expect(pluralText(t, 'fr', 0, 'farmsOne', 'farms')).toBe('0 farm');
    expect(pluralText(t, 'fr', 1.5, 'farmsOne', 'farms')).toBe('1.5 farm');
  });

  it('keeps the plural text for zero when the singular text has the number written in, since it would say "1"', () => {
    expect(pluralText(t, 'fr', 0, 'boxOne', 'boxes')).toBe('0 boxes');
    expect(pluralText(t, 'fr', 1, 'boxOne', 'boxes')).toBe('1 box');
  });

  it('keeps the plural text for zero when the singular text has no number at all', () => {
    expect(pluralText(t, 'fr', 0, 'waitOne', 'wait')).toBe('Try again in 0 seconds.');
    expect(pluralText(t, 'fr', 1, 'waitOne', 'wait')).toBe('Try again in 1 second.');
  });

  it('does not change English or Kinyarwanda for zero', () => {
    expect(pluralText(t, 'rw', 0, 'farmsOne', 'farms')).toBe('0 farms');
  });
});
