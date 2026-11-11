import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The small line under a name in a table is kept to one line with an ellipsis where there is room. On a phone it wraps
// instead, because a cut "Dernière mesure: 25.5 °C, 75 ..." hides the very number the line is there to show, and the
// French and Kinyarwanda words are longer than the English ones.

const css = readFileSync(join(__dirname, 'components.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('a row of filter pills', () => {
  const phone = [...css.matchAll(/@media \(max-width: 640px\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)].map((m) => m[1]).join('\n');

  // Four pills wrapped onto a second row inside their rounded container. On a phone they are one row that swipes.
  it('stay on one row on a phone and swipe sideways, with no scrollbar', () => {
    expect(phone).toMatch(/\.segmented\s*\{[^}]*max-width:\s*100%/);
    expect(phone).toMatch(/\.segmented\s*\{[^}]*flex-wrap:\s*nowrap/);
    expect(phone).toMatch(/\.segmented\s*\{[^}]*overflow-x:\s*auto/);
    expect(phone).toMatch(/\.segmented\s*\{[^}]*scrollbar-width:\s*none/);
    expect(phone).toMatch(/\.segmented::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
    expect(phone).toMatch(/\.segmented button\s*\{[^}]*flex:\s*none/);
    expect(phone).toMatch(/\.segmented button\s*\{[^}]*white-space:\s*nowrap/);
  });

  // A phone rule that comes before the base rule loses to it (the same weight, and the later one wins).
  it('come after the base rule, or they would not win', () => {
    const base = css.indexOf('.segmented { display: inline-flex');
    const onPhone = css.indexOf('.segmented { max-width: 100%');
    expect(base).toBeGreaterThan(-1);
    expect(onPhone).toBeGreaterThan(base);
  });
});

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
