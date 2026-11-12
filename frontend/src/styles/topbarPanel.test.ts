import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The notifications panel hangs under the bell, which sits near the right edge of a phone. A panel 360px wide anchored to
// the bell ran off the left edge, so the first letters of every line were cut. On a phone it spans the screen instead.

const css = readFileSync(join(__dirname, 'shell.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function phoneBlock(): string {
  const start = css.indexOf('@media (max-width: 639px)');
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('\n}\n', start));
}

describe('the notifications panel on a phone', () => {
  it('is pinned to the screen with a gutter on both sides, not to the bell', () => {
    const rule = /\.topbar-panel\s*\{([^}]*)\}/.exec(phoneBlock())?.[1] ?? '';
    expect(rule).toMatch(/position:\s*fixed/);
    expect(rule).toMatch(/left:\s*12px/);
    expect(rule).toMatch(/right:\s*12px/);
    expect(rule).toMatch(/width:\s*auto/);
    expect(rule).toMatch(/top:\s*calc\(var\(--topbar-height\)/);
  });
});
