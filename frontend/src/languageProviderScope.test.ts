import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// The language of the screen is decided in one place. main.tsx decides it from the address (the landing page has an address in
// each language, and "/" is English whatever the browser says) and from the language the person chose. A second provider further
// in, with no such knowledge, falls back to the browser's language and overrules the first: the page of a first time visitor with
// a French browser was French under the English address, and the page said "en" while reading French.

const SRC = join(__dirname);
const rel = (file: string) => relative(SRC, file).replace(/\\/g, '/');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    // Test helpers (coopTestKit.tsx) build their own providers on purpose, and are not the app.
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !/TestKit\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('where a language provider is created', () => {
  it('is in the entry that starts the app and the entry that draws the pages at build time, and nowhere else', () => {
    const makers = sources(SRC).filter((file) => /<LanguageProvider[\s>]/.test(readFileSync(file, 'utf8')));
    expect(makers.map(rel).sort()).toEqual(['entry-server.tsx', 'main.tsx']);
  });
});
