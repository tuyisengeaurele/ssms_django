import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The scales the app draws with: type, spacing and elevation. New work uses these tokens, so a page can only be
// spaced or lifted in the steps below, and the two themes lift things the same way.

const css = readFileSync(join(__dirname, '../index.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) return {};
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start));
  const tokens: Record<string, string> = {};
  for (const match of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) tokens[match[1]] = match[2].trim();
  return tokens;
}

const root = block(':root');
const dark = block("[data-theme='dark']");
const rem = (value: string) => parseFloat(value) * (value.endsWith('rem') ? 16 : 1);

describe('the type scale', () => {
  const steps = ['xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl', '3xl'];

  it('has eight steps, each larger than the one before', () => {
    const sizes = steps.map((s) => rem(root[`--text-${s}`]));
    expect(sizes.every((n) => Number.isFinite(n))).toBe(true);
    for (let i = 1; i < sizes.length; i += 1) expect(sizes[i], steps[i]).toBeGreaterThan(sizes[i - 1]);
  });

  it('keeps body text at 15 px and never lets small text go under 12 px', () => {
    expect(rem(root['--text-base'])).toBe(15);
    expect(rem(root['--text-xs'])).toBeGreaterThanOrEqual(12);
  });

  it('has line heights from tight (for display type) to body', () => {
    const heights = ['tight', 'snug', 'body'].map((n) => parseFloat(root[`--leading-${n}`]));
    expect(heights[0]).toBeLessThan(heights[1]);
    expect(heights[1]).toBeLessThan(heights[2]);
  });
});

describe('the spacing scale', () => {
  it('has twelve steps on a 4 px grid', () => {
    for (let n = 1; n <= 12; n += 1) expect(rem(root[`--space-${n}`]), `--space-${n}`).toBe(n * 4);
  });
});

describe('elevation', () => {
  it('has a flat, a raised and a floating level, and an edge highlight', () => {
    for (const name of ['--elev-flat', '--elev-raised', '--elev-floating', '--edge']) expect(root[name], name).toBeDefined();
  });

  it('draws every level with a one pixel edge from a border token, so cards separate by line and not only by shadow', () => {
    for (const name of ['--elev-flat', '--elev-raised', '--elev-floating']) expect(root[name], name).toMatch(/0 0 0 1px var\(--border(-light)?\)/);
  });

  it('lifts a card with the shadow tokens, which each theme changes, and never with a raw colour', () => {
    expect(root['--elev-raised']).toContain('var(--shadow-sm)');
    expect(root['--elev-floating']).toContain('var(--shadow-lg)');
    for (const name of ['--elev-raised', '--elev-floating']) expect(root[name], name).not.toMatch(/rgba?\(/);
  });

  it('has an edge highlight in each theme, brighter on light and subtler on dark', () => {
    const alpha = (v: string) => parseFloat(v.match(/rgba\([^)]*,\s*([\d.]+)\)/)![1]);
    expect(dark['--edge']).toBeDefined();
    expect(alpha(dark['--edge'])).toBeLessThan(alpha(root['--edge']));
  });
});
