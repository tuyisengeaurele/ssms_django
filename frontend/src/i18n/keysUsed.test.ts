import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calledKeys, definedValues, tableUses, templateFamilies } from '../../scripts/usedKeys.mjs';
import { translations } from './translations';

// The app asks for a text by name, t('navFarms'). A misspelt or removed name does not stop the build: the farmer sees the raw
// name on the screen. These checks read the source and fail on a name that has no text, so it is caught here.
//
// What is checked: names written out in full (t('x'), either answer of a choice, a fallback after ??), names built from a number
// or a word (lpFaq${n}Q must match at least one text), texts kept in tables (t(ROLE_LABEL_KEY[role])) and texts kept in fields
// (t(tab.labelKey), read from the same file). What is not: a name passed on as a plain variable, t(key), about twenty calls,
// because the name comes from a function parameter and only running the code knows it.

const SRC = join(__dirname, '..');
const rel = (file: string) => relative(SRC, file).replace(/\\/g, '/');

/** Source files of the app. The files that hold the texts are left out, they define names and do not ask for them. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    const skip = /\.test\.(ts|tsx)$/.test(name) || name.endsWith('.d.ts') || !/\.(ts|tsx)$/.test(name);
    return skip ? [] : [path];
  });
}

const files = sources(SRC).filter((file) => !['i18n/translations.ts', 'i18n/pages.ts', 'i18n/landing.ts'].includes(rel(file)));
const known = new Set(Object.keys(translations));
const read = (file: string) => readFileSync(file, 'utf8');

describe('the texts the code asks for', () => {
  it('reads a real number of files and calls, so an empty scan would not pass these checks', () => {
    expect(files.length).toBeGreaterThan(200);
    const calls = files.flatMap((file) => calledKeys(read(file), file));
    expect(calls.length).toBeGreaterThan(2000);
  });

  it('all exist: every t() and say() with a name written out in full', () => {
    const missing = files.flatMap((file) =>
      calledKeys(read(file), file)
        .filter(({ key }) => !known.has(key))
        .map(({ key, line }) => `${rel(file)}:${line} ${key}`),
    );
    expect(missing).toEqual([]);
  });

  it('all have a family: every name built from a number or a word matches at least one text', () => {
    const orphans = files.flatMap((file) =>
      templateFamilies(read(file), file)
        .filter(({ pattern }) => ![...known].some((key) => pattern.test(key)))
        .map(({ text, line }) => `${rel(file)}:${line} ${text}`),
    );
    expect(orphans).toEqual([]);
  });
});

describe('texts looked up in tables and fields, t(ROLE_LABEL_KEY[role]) and t(tab.labelKey)', () => {
  const defined = files.map((file) => ({ file, ...definedValues(read(file), file) }));
  const uses = files.flatMap((file) => tableUses(read(file), file).map((use) => ({ ...use, file })));

  const valuesOf = (kind: 'tables' | 'fields', name: string) => defined.flatMap((d) => (d[kind].get(name) ?? []).map((value) => ({ ...value, file: d.file })));

  it('finds the tables and fields the code reads, so an empty scan would not pass these checks', () => {
    expect(uses.filter((use) => use.kind === 'table').length).toBeGreaterThan(30);
    expect(uses.filter((use) => use.kind === 'field').length).toBeGreaterThan(10);
  });

  it('finds every table that is read, written out in the source', () => {
    const lost = [...new Set(uses.filter((use) => use.kind === 'table' && valuesOf('tables', use.name).length === 0).map((use) => use.name))];
    expect(lost).toEqual([]);
  });

  it('all exist: every text in a table that is read with t()', () => {
    const tables = [...new Set(uses.filter((use) => use.kind === 'table').map((use) => use.name))];
    const missing = tables.flatMap((name) =>
      valuesOf('tables', name)
        .filter(({ text }) => !known.has(text))
        .map(({ file, line, text }) => `${rel(file)}:${line} ${text} (in ${name})`),
    );
    expect(missing).toEqual([]);
  });

  it('all exist: every text assigned to a field that is read with t()', () => {
    // A field such as `key` also holds codes that are not texts, so the values are taken from the file that reads the field,
    // where the list it comes from is normally kept. Only when that file writes none are all files read.
    const missing = new Set<string>();
    for (const use of uses.filter((u) => u.kind === 'field')) {
      const here = defined.find((d) => d.file === use.file)?.fields.get(use.name) ?? [];
      const values = here.length > 0 ? here.map((value) => ({ ...value, file: use.file })) : valuesOf('fields', use.name);
      for (const { file, line, text } of values) if (!known.has(text)) missing.add(`${rel(file)}:${line} ${text} (field ${use.name})`);
    }
    expect([...missing]).toEqual([]);
  });
});
