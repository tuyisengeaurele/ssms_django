import { describe, expect, it } from 'vitest';
import { detectLocale } from './detectLocale';

describe('detectLocale', () => {
  it.each([
    [['en-US'], 'en'],
    [['fr'], 'fr'],
    [['fr-CA'], 'fr'],
    [['FR-be'], 'fr'],
    [['rw'], 'rw'],
    [['rw-RW'], 'rw'],
  ])('reads %j as %s', (languages, expected) => {
    expect(detectLocale(languages)).toBe(expected);
  });

  it('reads the three letter code some systems use for Kinyarwanda', () => {
    expect(detectLocale(['kin'])).toBe('rw');
    expect(detectLocale(['kin-RW'])).toBe('rw');
  });

  it('takes the first language the app speaks, in the order the person ranked them', () => {
    expect(detectLocale(['de-DE', 'fr-CA', 'en'])).toBe('fr');
    expect(detectLocale(['rw-RW', 'en-US'])).toBe('rw');
    expect(detectLocale(['en-GB', 'fr'])).toBe('en');
  });

  it('gives nothing when no language is one the app speaks, so the caller can pick its default', () => {
    expect(detectLocale(['de', 'es-MX', 'sw'])).toBeNull();
    expect(detectLocale([])).toBeNull();
  });

  it('does not mistake a longer code that only starts the same way', () => {
    expect(detectLocale(['fra'])).toBeNull();
    expect(detectLocale(['enm'])).toBeNull();
    expect(detectLocale(['rwk'])).toBeNull();
  });

  it('skips empty and odd entries', () => {
    expect(detectLocale(['', '  ', 'fr'])).toBe('fr');
  });
});
