import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The buttons at the end of a filter bar ("Télécharger le PDF" and "Exporter CSV" on the cooperative report) sat in one row that
// could not break. In French at 320 pixels the second button ran off the right edge of the screen. The row now wraps, so the
// buttons go under each other when they do not fit side by side.

const css = readFileSync(join(__dirname, 'styles', 'components.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of the first rule that starts with this selector, outside any media query. */
function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', start);
  return css.slice(open + 1, css.indexOf('}', open));
}

describe('the buttons at the end of a filter bar', () => {
  it('wrap onto a second line when the row is too narrow', () => {
    expect(rule('.filter-buttons')).toMatch(/flex-wrap:\s*wrap/);
  });

  it('never grow wider than the bar', () => {
    expect(rule('.filter-buttons')).toMatch(/max-width:\s*100%/);
  });
});
