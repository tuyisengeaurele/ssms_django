import { describe, expect, it } from 'vitest';
import { translations } from './translations';

// The top bar of a phone shows the page title in the little room left between the menu button and the icons: about 83 pixels at
// 320 pixels wide, so two short lines. "Tableau de bord de l'administration" needs four and is cut off after two. The longest
// title today is 22 characters, so 24 leaves a little room and still catches a title written as a sentence. The name of the
// product (ptDefault) is the title of the browser tab, not of a page, and is not shown in the bar.

const LONGEST = 24;
const titles = Object.keys(translations).filter((key) => /^pt[A-Z]/.test(key) && !key.startsWith('ptSection') && key !== 'ptDefault');

describe('page titles', () => {
  it('are a real number, so an empty list would not pass the checks below', () => {
    expect(titles.length).toBeGreaterThan(30);
  });

  it(`are at most ${LONGEST} characters in every language, so the top bar of a phone can show them`, () => {
    const tooLong = titles.flatMap((key) =>
      (['en', 'fr', 'rw'] as const).filter((l) => translations[key][l].length > LONGEST).map((l) => `${key}.${l} (${translations[key][l].length}): ${translations[key][l]}`),
    );
    expect(tooLong).toEqual([]);
  });

  it('do not repeat the name of the section above them in the bar', () => {
    const repeats = titles.flatMap((key) =>
      (['en', 'fr', 'rw'] as const)
        .filter((l) => ['ptSectionAdmin', 'ptSectionFarming', 'ptSectionMonitoring', 'ptSectionAccount'].some((s) => translations[s][l] === translations[key][l]))
        .map((l) => `${key}.${l}: ${translations[key][l]}`),
    );
    expect(repeats).toEqual([]);
  });
});
