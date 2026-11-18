import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dismissHint, hintDismissed, suggestedLanguage } from './suggest';

// A first time visitor whose browser lists French or Kinyarwanda first is offered the page in that language, once, in a line they
// can dismiss. It is never a redirect: a search engine has no language, and a guess would hide the English page from people who
// want it. The visitor's own choice, if there is one, always wins.

const base = { ranked: ['fr-FR', 'en'], saved: null, dismissed: false, pageLanguage: 'en' as const };

describe('suggestedLanguage', () => {
  it.each([
    [['fr-FR', 'en'], 'fr'],
    [['fr'], 'fr'],
    [['FR-ca'], 'fr'],
    [['rw-RW', 'en-US'], 'rw'],
    [['rw'], 'rw'],
    [['kin'], 'rw'],
  ])('suggests the language the browser ranks first: %j', (ranked, expected) => {
    expect(suggestedLanguage({ ...base, ranked })).toBe(expected);
  });

  it.each([
    [['en-US', 'fr'], 'English comes first, so English is what they prefer'],
    [['en'], 'English'],
    [['de-DE', 'fr'], 'a language the app does not speak comes first'],
    [['de'], 'a language the app does not speak'],
    [[], 'no list at all'],
    [[''], 'an empty entry'],
  ])('suggests nothing for %j (%s)', (ranked) => {
    expect(suggestedLanguage({ ...base, ranked })).toBeNull();
  });

  it('suggests nothing to someone who already chose a language, whichever it was', () => {
    for (const saved of ['en', 'fr', 'rw'] as const) expect(suggestedLanguage({ ...base, saved })).toBeNull();
  });

  it('suggests nothing once it was dismissed', () => {
    expect(suggestedLanguage({ ...base, dismissed: true })).toBeNull();
  });

  it.each(['fr', 'rw', null] as const)('suggests nothing anywhere but the English page of the landing page (here: %s)', (pageLanguage) => {
    expect(suggestedLanguage({ ...base, pageLanguage })).toBeNull();
  });
});

describe('remembering that the line was dismissed', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('is not dismissed to start with', () => {
    expect(hintDismissed()).toBe(false);
  });

  it('stays dismissed once it was', () => {
    dismissHint();
    expect(hintDismissed()).toBe(true);
  });

  it('is not a language choice, so it does not change which language the app uses', () => {
    dismissHint();
    expect(localStorage.getItem('ssms_locale')).toBeNull();
  });

  it('is not dismissed, and does not fail, when the browser will not let the app read storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(hintDismissed()).toBe(false);
  });

  it('does not fail when the browser will not let the app write storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => dismissHint()).not.toThrow();
  });
});
