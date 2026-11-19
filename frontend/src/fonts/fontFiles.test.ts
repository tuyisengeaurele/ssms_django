import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The app draws with Fraunces (headlines) and Geist (text). The full Latin files are 111.7 KB for the three the first screen
// needs. scripts/fonts/make_fonts.py cuts them to the characters of English, French and Kinyarwanda and to the weights in use,
// and src/fonts/fonts.css declares the cut files after the full ones, so a character outside the cut still draws in the same
// font (from the full file, downloaded only then). These checks hold the pieces together.

const FONTS = __dirname;
const SRC = join(__dirname, '..');
const css = readFileSync(join(FONTS, 'fonts.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const glyphs = readFileSync(join(__dirname, '../../scripts/fonts/glyphs.txt'), 'utf8').trim();

/** The code points of a unicode-range list. */
function codepoints(list: string): Set<number> {
  const found = new Set<number>();
  for (const [, from, to] of list.matchAll(/U\+([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+))?/g)) {
    for (let code = parseInt(from, 16); code <= parseInt(to ?? from, 16); code += 1) found.add(code);
  }
  return found;
}

interface Face {
  family: string;
  style: string;
  weight: string;
  file: string;
  display: string;
  range: string;
}

const faces: Face[] = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => {
  const get = (property: string) => new RegExp(`${property}:\\s*([^;]+);`).exec(body)?.[1].trim() ?? '';
  return {
    family: get('font-family').replace(/['"]/g, ''),
    style: get('font-style'),
    weight: get('font-weight'),
    file: /url\(['"]?\.\/([^'")]+)['"]?\)/.exec(get('src'))?.[1] ?? '',
    display: get('font-display'),
    range: get('unicode-range'),
  };
});

describe('the cut fonts', () => {
  it('declares the three files of the first screen', () => {
    expect(faces.map(({ family, style, weight, file }) => ({ family, style, weight, file }))).toEqual([
      { family: 'Fraunces Variable', style: 'normal', weight: '100 900', file: 'fraunces-latin-normal.woff2' },
      { family: 'Fraunces Variable', style: 'italic', weight: '100 900', file: 'fraunces-latin-italic.woff2' },
      { family: 'Geist Variable', style: 'normal', weight: '100 900', file: 'geist-latin-normal.woff2' },
    ]);
  });

  it('shows text in a fallback at once and swaps the font in when it arrives', () => {
    for (const face of faces) expect(face.display, face.file).toBe('swap');
  });

  // A browser matches the weight range first and the characters second, and it prefers the widest range. A cut file that said
  // "400 700" lost to the full file's "100 900" and the full file (45.7 KB for the italic) was downloaded instead. Saying the same
  // range as the full file makes the two one family of faces, where the one declared later wins for the characters it holds.
  // The files were cut to the weights in use (see make_fonts.py); a request outside them gets the nearest the file holds.
  it.each([
    ['fraunces/wght.css', 'normal', 'fraunces-latin-normal.woff2'],
    ['fraunces/wght-italic.css', 'italic', 'fraunces-latin-italic.woff2'],
    ['geist/wght.css', 'normal', 'geist-latin-normal.woff2'],
  ])('says the same weight range as the full file it stands in for (%s)', (full, _style, file) => {
    const fullCss = readFileSync(join(__dirname, '../../node_modules/@fontsource-variable', full), 'utf8');
    const fullRange = /font-weight:\s*([^;]+);/.exec(fullCss)?.[1].trim();
    expect(fullRange).toBeTruthy();
    expect(faces.find((face) => face.file === file)?.weight).toBe(fullRange);
  });

  it('asks for exactly the characters the files were cut to', () => {
    for (const face of faces) expect(codepoints(face.range), face.file).toEqual(codepoints(glyphs));
  });

  it('keeps the first screen under 60 KB of fonts (it was 111.7 KB)', () => {
    const total = faces.reduce((sum, face) => sum + statSync(join(FONTS, face.file)).size, 0);
    expect(total).toBeLessThan(60 * 1024);
  });

  it('puts the cut files after the full ones, so they win for the characters they have', () => {
    const imports = [...css.matchAll(/@import\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
    expect(imports).toEqual([
      '@fontsource-variable/fraunces/wght.css',
      '@fontsource-variable/fraunces/wght-italic.css',
      '@fontsource-variable/geist/index.css',
    ]);
    expect(css.lastIndexOf('@import')).toBeLessThan(css.indexOf('@font-face'));
  });
});

describe('the characters', () => {
  // Characters no font of ours has ever drawn: the full files do not hold them either, so the system font draws them as before.
  const DRAWN_BY_THE_SYSTEM = new Set([0x2192]);

  const without = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:])\/\/.*$/gm, '$1');

  it('cover every character in the texts of the three languages', () => {
    const allowed = codepoints(glyphs);
    const missing = new Set<string>();
    for (const name of readdirSync(join(SRC, 'i18n'))) {
      if (!/\.ts$/.test(name) || /\.test\.ts$/.test(name)) continue;
      for (const char of without(readFileSync(join(SRC, 'i18n', name), 'utf8'))) {
        const code = char.codePointAt(0)!;
        if (code > 126 && !allowed.has(code) && !DRAWN_BY_THE_SYSTEM.has(code)) missing.add(`U+${code.toString(16).toUpperCase().padStart(4, '0')} ${char}`);
      }
    }
    expect([...missing]).toEqual([]);
  });
});

describe('where the fonts are loaded', () => {
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sources(path);
      return /\.(ts|tsx|css)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
    });
  }

  it('is in one place: only fonts.css reaches for the fontsource files', () => {
    const users = sources(SRC)
      .filter((file) => /@fontsource-variable\/(fraunces|geist)/.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(SRC.length + 1).replace(/\\/g, '/'));
    expect(users).toEqual(['fonts/fonts.css']);
  });

  it.each(['pages/LandingPage.tsx', 'landing/auth/AuthShell.tsx', 'landing/legal/LegalLayout.tsx', 'landing/StatusLayout.tsx', 'components/layout/DashboardLayout.tsx'])(
    '%s loads them through fonts.css',
    (file) => {
      expect(readFileSync(join(SRC, file), 'utf8')).toMatch(/import\s+'(\.\.\/)+fonts\/fonts\.css';/);
    },
  );
});
