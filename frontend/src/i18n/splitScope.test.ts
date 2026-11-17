import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// The three languages together are about 79 KB compressed, and a person reads one. The files that hold all three
// (translations.ts, pages.ts, landing.ts) are only read by the build, which cuts one language out of them. If a screen imported
// them directly, all three languages would travel with the main file again.

const SRC = join(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const rel = (file: string) => relative(SRC, file).replace(/\\/g, '/');
const production = sources(SRC).filter((file) => !rel(file).startsWith('test/') && !file.endsWith('.d.ts'));
const read = (file: string) => readFileSync(file, 'utf8');
const inFolder = (file: string) => rel(file).startsWith('i18n/');

// import { x } from '../i18n/pages'   (not "import type", and not the ?locale= form that the build cuts)
const ALL_LANGUAGES = /import\s+(?!type\b)[^;]*from\s+'[^']*(?:translations|pages|landing)'/;

describe('where the three-language translation files are read', () => {
  it('is nowhere in the app, only the build cuts them', () => {
    const readers = production.filter((file) => !inFolder(file) && ALL_LANGUAGES.test(read(file)));
    expect(readers.map(rel)).toEqual([]);
  });

  it('is by one file inside the translation folder, the one that combines the three', () => {
    const inside = production.filter((file) => inFolder(file) && ALL_LANGUAGES.test(read(file)));
    expect(inside.map(rel)).toEqual(['i18n/translations.ts']);
  });

  it('reaches the texts of one language only through the catalog', () => {
    const users = production.filter((file) => /translations\?locale=/.test(read(file)));
    expect(users.map(rel)).toEqual(['i18n/catalog.ts']);
  });
});
