import { describe, expect, it } from 'vitest';
import { translations } from './translations';
import { translations as en } from './translations?locale=en';
import { translations as fr } from './translations?locale=fr';
import { translations as rw } from './translations?locale=rw';

// The app downloads English and one other language, cut out of the files that hold all three. These checks make sure the cut
// is faithful: nothing lost, nothing swapped, nothing left over from another language.

const cut = { en, fr, rw };

describe.each(['en', 'fr', 'rw'] as const)('the %s texts cut out at build time', (locale) => {
  it('hold every key, and only those keys', () => {
    expect(Object.keys(cut[locale]).sort()).toEqual(Object.keys(translations).sort());
  });

  it('say what the full files say in that language', () => {
    const wrong = Object.entries(translations).filter(([key, entry]) => cut[locale][key] !== entry[locale]).map(([key]) => key);
    expect(wrong).toEqual([]);
  });
});
