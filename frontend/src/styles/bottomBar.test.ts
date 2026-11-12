import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// "Ibiburaniswa" (Alerts in Kinyarwanda) needs 73px at 12px and each of the five slots gave it 71px, so the bar broke it
// into "Ibiburanisw" and "a". The bar keeps its sides tight, and on the narrowest phones the labels get a little smaller.

const css = readFileSync(join(__dirname, 'shell.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the first rule that opens with `selector {` at or after `from`. */
function body(selector: string, from: number): string {
  const open = css.indexOf(`${selector} {`, from);
  expect(open, selector).toBeGreaterThan(-1);
  return css.slice(open, css.indexOf('}', open));
}

describe('the bottom bar on a phone', () => {
  const phone = css.indexOf('@media (max-width: 768px)');

  it('keeps its sides tight so a long label fits its slot', () => {
    expect(body('.bottom-nav', phone)).toMatch(/padding:\s*6px 2px calc/);
    expect(body('.bottom-nav-item', phone)).toMatch(/padding:\s*6px 0;/);
  });

  it('makes the labels smaller on the narrowest phones instead of breaking a word', () => {
    const narrow = css.indexOf('@media (max-width: 374px)');
    expect(narrow).toBeGreaterThan(phone);
    expect(body('.bottom-nav-label', narrow)).toMatch(/font-size:\s*0\.7rem/);
  });
});
