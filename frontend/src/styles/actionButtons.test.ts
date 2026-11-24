import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Anything a person presses to do something is a real button: a border, an icon before the words, and red for something
// destructive. A bare text button reads as a link. This reads the screens' source, so a new one cannot slip back in.

const SRC = join(__dirname, '..');
const css = readFileSync(join(__dirname, 'components.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

const files = sources(SRC).map((file) => ({ file: relative(SRC, file).replace(/\\/g, '/'), text: readFileSync(file, 'utf8') }));

/** Every element whose class list holds `name`, with the words and icons inside it. */
function elementsWith(name: string): { file: string; line: number; body: string }[] {
  const found: { file: string; line: number; body: string }[] = [];
  for (const { file, text } of files) {
    for (const match of text.matchAll(new RegExp(`className=(?:"[^"]*${name}[^"]*"|\\{\`[^\`]*${name}[^\`]*\`\\})`, 'g'))) {
      const after = text.slice(match.index! + match[0].length);
      const close = after.search(/<\/(?:button|Link|a)>/);
      found.push({ file, line: text.slice(0, match.index).split('\n').length, body: close === -1 ? '' : after.slice(0, close) });
    }
  }
  return found;
}

describe('the actions of the app', () => {
  it('finds the buttons, so an empty scan would not pass these checks', () => {
    expect(elementsWith('btn-secondary').length).toBeGreaterThan(80);
  });

  it('are never a bare text button: the ghost style is not used for an action', () => {
    const ghosts = elementsWith('btn-ghost').filter((e) => !/btn-icon/.test(e.body));
    expect(ghosts.map((e) => `${e.file}:${e.line}`)).toEqual([]);
  });

  it('show something destructive in red with an icon before the words', () => {
    const without = elementsWith('btn-quiet-danger').filter((e) => !/<Icon /.test(e.body));
    expect(without.map((e) => `${e.file}:${e.line}`)).toEqual([]);
  });

  it('outline a destructive button in red, wherever it is', () => {
    const rule = [...css.matchAll(/(^|\n)\s*([^{}@\n][^{}]*)\{([^}]*)\}/g)].filter((m) => m[2].split(',').some((s) => s.trim() === '.btn-secondary.btn-quiet-danger'));
    expect(rule.map((m) => m[3]).join('')).toMatch(/border-color:\s*currentColor/);
  });
});
