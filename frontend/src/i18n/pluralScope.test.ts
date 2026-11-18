import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { singularChecks } from '../../scripts/usedKeys.mjs';

// "1 farm" or "2 farms" is decided by the plural helper, tn() or pluralText(), because the rule for "one" differs by language:
// French says it for 0 and 1. A screen that decides with `n === 1` reads wrong in French. These checks fail on a new one.

const SRC = join(__dirname, '..');
const rel = (file: string) => relative(SRC, file).replace(/\\/g, '/');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts') ? [path] : [];
  });
}

// A comparison with 1 that is not a count of things, each with the reason.
const NOT_A_COUNT = new Map<string, string>([['components/ui/LocationPicker.tsx: error.code === 1', 'the browser gives code 1 for "permission denied"']]);

describe('a text chosen by hand because a count is 1', () => {
  it('is nowhere in the app', () => {
    const found = sources(SRC).flatMap((file) =>
      singularChecks(readFileSync(file, 'utf8'), file)
        .filter(({ condition }) => !NOT_A_COUNT.has(`${rel(file)}: ${condition}`))
        .map(({ line, condition }) => `${rel(file)}:${line} ${condition}`),
    );
    expect(found).toEqual([]);
  });

  it('keeps its list of exceptions honest: each one still exists', () => {
    const present = new Set(
      sources(SRC).flatMap((file) => singularChecks(readFileSync(file, 'utf8'), file).map(({ condition }) => `${rel(file)}: ${condition}`)),
    );
    expect([...NOT_A_COUNT.keys()].filter((key) => !present.has(key))).toEqual([]);
  });
});
