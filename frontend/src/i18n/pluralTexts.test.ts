import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pluralPairs } from '../../scripts/usedKeys.mjs';
import { translations } from './translations';

// French says "one" for 0 as well as 1 ("0 ferme"). That only works when the singular text can show the count, so it has {n}
// where the number goes, and not a 1 written in. A singular text without {n} still works, but for 0 it falls back to the plural
// text, which in French reads wrong ("0 fermes").

const SRC = join(__dirname, '..');
const rel = (file: string) => relative(SRC, file).replace(/\\/g, '/');
const LOCALES = ['en', 'fr', 'rw'] as const;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts') ? [path] : [];
  });
}

const pairs = sources(SRC).flatMap((file) => pluralPairs(readFileSync(file, 'utf8'), file).map((pair) => ({ ...pair, file })));

// Singular texts with no number in them, each with the reason.
const NO_NUMBER = new Map<string, string>([['fkShowOne', 'it says "Show the farm", a button for the one farm there is, and never names a count']]);

describe('the texts a count chooses between', () => {
  it('finds a real number of pairs, so an empty scan would not pass these checks', () => {
    expect(pairs.length).toBeGreaterThan(30);
  });

  it('exist in every language, one and other', () => {
    const missing = pairs.flatMap(({ one, other, file, line }) =>
      [one, other].filter((key) => !translations[key]).map((key) => `${rel(file)}:${line} ${key}`),
    );
    expect(missing).toEqual([]);
  });

  it('show the count in the singular text, in every language, so French can use it for 0', () => {
    const without = [
      ...new Set(
        pairs
          .filter(({ one }) => translations[one] && !NO_NUMBER.has(one))
          .flatMap(({ one }) => LOCALES.filter((locale) => !translations[one][locale].includes('{n}')).map((locale) => `${one} (${locale})`)),
      ),
    ];
    expect(without).toEqual([]);
  });

  it('keep the exceptions honest: each one is still used and still has no number', () => {
    const used = new Set(pairs.map(({ one }) => one));
    const stale = [...NO_NUMBER.keys()].filter((key) => !used.has(key) || LOCALES.some((locale) => translations[key]?.[locale].includes('{n}')));
    expect(stale).toEqual([]);
  });
});
