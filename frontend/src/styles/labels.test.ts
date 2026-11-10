import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../landing/contrast';

// The app names things in plain sentence case. Small labels are quiet, not shouted: no capitals, no wide tracking, no
// text too small to read. Every transition takes its time from a token, and the controls of the shell have a pressed
// state. The group label of the sidebar is the faintest text on a dark ground, so its contrast is held at AA.

const read = (name: string) => readFileSync(join(__dirname, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const sheets = (['../index.css', 'components.css', 'shell.css', 'toast.css', 'support.css'] as const).map((name) => [name, read(name)] as const);
const shell = read('shell.css');
const index = read('../index.css');

describe('labels', () => {
  it.each(sheets)('%s has no capitals', (_name, css) => {
    expect(css.match(/text-transform:\s*uppercase/g) ?? []).toEqual([]);
  });

  it.each(sheets)('%s tracks no label wider than 0.1em', (_name, css) => {
    const wide = [...css.matchAll(/letter-spacing:\s*(-?[\d.]+)em/g)].map((m) => Number(m[1])).filter((n) => n > 0.1);
    expect(wide).toEqual([]);
  });

  it.each(sheets)('%s sets no text smaller than 11 px', (_name, css) => {
    const small = [...css.matchAll(/font(?:-size)?:[^;{}]*?(?<![\d.])(0?\.\d+)rem/g)].map((m) => Number(m[1])).filter((n) => n < 0.7);
    expect(small).toEqual([]);
  });
});

describe('the sidebar group label', () => {
  const blend = (alpha: number, over: string) => {
    const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    const mix = [246, 243, 236].map((c, i) => Math.round(c * alpha + channel(over, i) * (1 - alpha)));
    return `#${mix.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  };

  it('reads at 4.5 to 1 on the sidebar in both themes', () => {
    const alpha = Number(shell.match(/\.sidebar-section-label\s*\{[^}]*rgba\(246,\s*243,\s*236,\s*([\d.]+)\)/)![1]);
    // Light theme sidebar is forest ink, dark theme is a touch darker. Both are checked against the lighter of the two.
    const ground = index.match(/--sidebar-bg:\s*(#[0-9a-fA-F]{6})/)![1];
    expect(contrastRatio(blend(alpha, ground), ground)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the bottom bar', () => {
  const label = shell.match(/\.bottom-nav-label\s*\{[^}]*\}/)![0];

  it('lets a name wrap onto a second line before it is ever cut with an ellipsis', () => {
    expect(label).not.toMatch(/text-overflow:\s*ellipsis/);
    expect(label).not.toMatch(/white-space:\s*nowrap/);
    expect(label).toMatch(/-webkit-line-clamp:\s*2/);
  });
});

describe('the shell', () => {
  const declarations = (css: string) => css.split('\n').filter((l) => /^\s*transition\s*:/.test(l) && !/transition:\s*none/.test(l));

  it.each(sheets.filter(([name]) => name !== '../index.css'))('%s takes every transition time from the duration tokens', (_name, css) => {
    const multi = [...css.matchAll(/transition:\s*([^;]+);/g)].map((m) => m[1]).filter((v) => !/^none$/.test(v.trim()));
    for (const value of multi) {
      for (const part of value.split(/,(?![^(]*\))/)) expect(part, part).toMatch(/var\(--duration-/);
    }
    expect(declarations(css).length).toBeGreaterThanOrEqual(0);
  });

  it.each(['.sidebar-item', '.topbar-icon-btn', '.topbar-toggle', '.topbar-user', '.bottom-nav-item'])('%s has a pressed state', (selector) => {
    expect(shell).toContain(`${selector}:active`);
  });

  it('presses in by a pixel only for people who have not asked for less motion', () => {
    const calm = shell.split('@media (prefers-reduced-motion: no-preference)').slice(1).join('\n');
    expect(calm).toMatch(/\.sidebar-item:active[^{]*\{[^}]*transform/);
  });
});
