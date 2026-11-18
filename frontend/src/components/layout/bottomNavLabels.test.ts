import { describe, expect, it } from 'vitest';
import { translations } from '../../i18n/translations';
import { TABS } from './BottomNav';

// The tab bar at the bottom of a phone gives each of its five tabs about 70 pixels, and a label may take two lines, then it is
// cut with "...". Measured at 360 pixels in the built app: a single word of 12 characters fits ("Ibiburaniswa" took 68 of 70
// pixels), and a line of several words fits about 11 characters. A label that needs three lines ("Contrôles des maladies") is cut
// off, so each tab has to be named in few and short words in every language. A 320 pixel phone has less room and breaks the
// longest word in two, still within two lines.

const SINGLE_WORD = 12;
const SEVERAL_WORDS = 11;
const LINES = 2;

const fits = (line: string) => line.length <= (line.includes(' ') ? SEVERAL_WORDS : SINGLE_WORD);

/** The lines a label breaks into at the width of a tab, breaking between words. */
function wrap(label: string): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of label.split(/\s+/)) {
    if (line && !fits(`${line} ${word}`)) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const tabs = Object.entries(TABS).flatMap(([role, list]) => list.map((tab) => ({ role, key: tab.labelKey })));

describe('the labels in the tab bar at the bottom of a phone', () => {
  it('exist, for every role and every language', () => {
    expect(tabs.length).toBeGreaterThanOrEqual(12);
    const missing = tabs.flatMap(({ role, key }) => (['en', 'fr', 'rw'] as const).filter((l) => !translations[key]?.[l]).map((l) => `${role} ${key}.${l}`));
    expect(missing).toEqual([]);
  });

  it(`fit in ${LINES} lines, in every language, so none is cut off`, () => {
    const tooLong = tabs.flatMap(({ role, key }) =>
      (['en', 'fr', 'rw'] as const)
        .map((l) => ({ l, lines: wrap(translations[key][l]) }))
        .filter(({ lines }) => lines.length > LINES || !lines.every(fits))
        .map(({ l, lines }) => `${role} ${key}.${l}: ${lines.join(' / ')}`),
    );
    expect(tooLong).toEqual([]);
  });

  it('breaks a long label the way the screen does, as a check on the check', () => {
    expect(wrap('Contrôles des maladies')).toEqual(['Contrôles', 'des', 'maladies']);
    expect(wrap('Tableau de bord')).toEqual(['Tableau de', 'bord']);
    expect(wrap('Isuzuma ry\'indwara')).toEqual(["Isuzuma", "ry'indwara"]);
  });
});
