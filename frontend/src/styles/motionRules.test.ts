import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, '../index.css'), 'utf8');

/** The text of the first block that starts at `header`, braces balanced. */
function block(header: string): string {
  const start = css.indexOf(header);
  if (start === -1) return '';
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
  }
  return '';
}

describe('reduced motion in the stylesheet', () => {
  const reduce = block('@media (prefers-reduced-motion: reduce)');

  it('smooth scrolling is only for people who did not ask for less motion', () => {
    const smooth = block('@media (prefers-reduced-motion: no-preference)');
    expect(smooth).toMatch(/scroll-behavior:\s*smooth/);
    expect(css.replace(smooth, '')).not.toMatch(/scroll-behavior:\s*smooth/);
  });

  it('shortens every animation and transition to nothing', () => {
    expect(reduce).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(reduce).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    expect(reduce).toMatch(/animation-iteration-count:\s*1\s*!important/);
  });

  it('keeps the loading spinner turning, because it is the only sign that something is loading', () => {
    expect(reduce).toMatch(/\.spinner[^{]*\{[^}]*animation-duration:\s*0\.7s\s*!important/);
    expect(reduce).toMatch(/\.spinner[^{]*\{[^}]*animation-iteration-count:\s*infinite\s*!important/);
  });
});
