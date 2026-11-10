import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The small line under a name in a table is kept to one line with an ellipsis where there is room. On a phone it wraps
// instead, because a cut "Dernière mesure: 25.5 °C, 75 ..." hides the very number the line is there to show, and the
// French and Kinyarwanda words are longer than the English ones.

const css = readFileSync(join(__dirname, 'components.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('the small line under a name', () => {
  it('is cut with an ellipsis by default, to keep rows even where there is room', () => {
    expect(css).toMatch(/\.cell-sub\s*\{[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/);
  });

  it('wraps on a phone, so none of it is hidden', () => {
    const phone = [...css.matchAll(/@media \(max-width: 640px\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)].map((m) => m[1]).join('\n');
    expect(phone).toMatch(/\.cell-sub\s*\{[^}]*white-space:\s*normal/);
    expect(phone).toMatch(/\.cell-sub\s*\{[^}]*overflow:\s*visible/);
    expect(phone).toMatch(/\.cell-sub\s*\{[^}]*overflow-wrap:\s*anywhere/);
  });
});
