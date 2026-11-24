import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A photo in a round avatar has to fill the circle and be cut by it, whatever its shape, in every place a circle is used.

const css = readFileSync(join(__dirname, 'components.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const CIRCLES = ['.row-avatar', '.identity-avatar', '.topbar-avatar', '.photo-preview'];

/** Everything declared for a selector, from every rule that names it. */
function rule(selector: string): string {
  const found: string[] = [];
  for (const match of css.matchAll(/(^|\n)\s*([^{}@\n][^{}]*)\{([^}]*)\}/g)) {
    if (match[2].split(',').some((s) => s.trim() === selector)) found.push(match[3]);
  }
  return found.join('\n');
}

describe('a photo in a round avatar', () => {
  it('is cut by the circle, in every circle', () => {
    for (const circle of CIRCLES) expect(rule(circle), circle).toMatch(/overflow:\s*hidden/);
  });

  it('fills the circle without being squeezed, in every circle', () => {
    for (const circle of CIRCLES) {
      const fills = rule(`${circle} img`);
      expect(fills, circle).toMatch(/width:\s*100%/);
      expect(fills, circle).toMatch(/height:\s*100%/);
      expect(fills, circle).toMatch(/object-fit:\s*cover/);
    }
  });

  it('makes the preview in the photo dialog a round circle big enough to judge a face by', () => {
    const preview = rule('.photo-preview');
    expect(preview).toMatch(/border-radius:\s*50%/);
    expect(Number(/width:\s*(\d+)px/.exec(preview)?.[1] ?? 0)).toBeGreaterThanOrEqual(80);
  });
});
