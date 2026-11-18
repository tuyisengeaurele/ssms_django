import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';

// The line that offers the page in French or Kinyarwanda must never move the page (it is laid over it, not in the flow), must
// stay inside a 320 pixel screen, must read well, and must not animate for people who asked for less motion.

const css = readFileSync(join(__dirname, 'suggestion.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = readFileSync(join(__dirname, 'tokens.css'), 'utf8');
const color = (name: string) => tokens.match(new RegExp(`--l-${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1] ?? '';

/** The declarations of the first rule that starts with this selector, outside any media query. */
function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', start);
  return css.slice(open + 1, css.indexOf('}', open));
}

describe('the language suggestion line', () => {
  it('is laid over the page, so showing it cannot push the content down', () => {
    expect(rule('.landing .l-suggest')).toMatch(/position:\s*fixed/);
  });

  it('keeps clear of the screen edges and the home indicator of a phone', () => {
    const box = rule('.landing .l-suggest');
    expect(box).toMatch(/left:/);
    expect(box).toMatch(/right:/);
    expect(box).toMatch(/env\(safe-area-inset-bottom/);
    expect(box).toMatch(/max-width:/);
  });

  it('lets its words wrap, so a long text in a small screen does not run off', () => {
    expect(rule('.landing .l-suggest')).toMatch(/flex-wrap:\s*wrap/);
  });

  it('reads at the AA contrast, text and link on the card', () => {
    expect(contrastRatio(color('ink'), color('ivory'))).toBeGreaterThanOrEqual(4.5);
    // The link is the ivory of the card on the ink.
    expect(contrastRatio(color('ivory'), color('ink'))).toBeGreaterThanOrEqual(4.5);
  });

  it('has a clear focus ring on both controls, for people who use the keyboard', () => {
    expect(css).toMatch(/\.l-suggest__yes:focus-visible[\s\S]*outline/);
    expect(css).toMatch(/\.l-suggest__no:focus-visible[\s\S]*outline/);
  });

  it('fades in only for people who have not asked for less motion', () => {
    const outside = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    expect(outside).not.toMatch(/animation:/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)[\s\S]*animation:/);
  });
});
