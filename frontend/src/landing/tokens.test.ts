import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';

function readTokens(): Record<string, string> {
  const css = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8');
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/--l-([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

describe('contrastRatio', () => {
  it('gives 21 for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('gives 1 for the same color', () => {
    expect(contrastRatio('#2D6A4F', '#2D6A4F')).toBeCloseTo(1, 5);
  });
});

describe('landing palette', () => {
  const t = readTokens();

  it('declares the agreed colors', () => {
    expect(t.ink).toBe('#0B1F17');
    expect(t.paper).toBe('#F6F3EC');
    expect(t.ivory).toBe('#FBF9F4');
    expect(t.leaf).toBe('#2D6A4F');
    expect(t.gold).toBe('#C8923A');
    expect(t.muted).toBeTruthy();
  });

  const pairs: Array<[string, string]> = [
    ['ink', 'paper'],
    ['ink', 'ivory'],
    ['muted', 'paper'],
    ['muted', 'ivory'],
    ['paper', 'ink'],
    ['ivory', 'ink'],
    ['paper', 'leaf'],
    ['ink', 'gold'],
  ];

  it.each(pairs)('%s on %s is at least 4.5 to 1', (fg, bg) => {
    expect(contrastRatio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
  });
});
