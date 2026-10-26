import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A table should fit its card on a laptop screen without a slider. Layout cannot be measured in jsdom, so these
// rules pin the CSS that keeps the tables narrow. The real check is the overflow report in the browser.

const css = readFileSync(join(__dirname, 'components.css'), 'utf8');

function block(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  if (start === -1) return '';
  return source.slice(start, source.indexOf('}', start) + 1);
}

describe('Tables', () => {
  it('tightens cell padding on laptop screens', () => {
    const media = css.match(/@media \(max-width: 1280px\) \{[\s\S]*?\n\}/);
    expect(media).not.toBeNull();
    expect(media![0]).toMatch(/td[^{]*\{[^}]*padding/);
    expect(media![0]).toMatch(/th[^{]*\{[^}]*padding/);
  });

  it('caps the long text columns so they cannot push a table wider than its card', () => {
    const detail = block(css, '.cell-detail');
    const max = Number(detail.match(/max-width:\s*(\d+)px/)?.[1] ?? 9999);
    expect(max).toBeLessThanOrEqual(240);
  });
});
