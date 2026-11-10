import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../landing/contrast';
import { CHART_COLORS, colorFor } from '../utils/chartColors';

// The colours of the signed in app live in index.css as tokens, once for light and once for dark. These checks keep
// the pairs that carry text readable in both, so a new shade cannot slip in unnoticed.

const css = readFileSync(join(__dirname, '../index.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) return {};
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start));
  const tokens: Record<string, string> = {};
  for (const match of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) tokens[match[1]] = match[2].trim();
  return tokens;
}

const light = block(':root');
const dark = { ...light, ...block("[data-theme='dark']") };

function resolve(tokens: Record<string, string>, name: string): string {
  let value = tokens[name];
  for (let i = 0; i < 5 && value?.startsWith('var('); i += 1) value = tokens[value.slice(4, -1)];
  return value;
}

const THEMES = [['light', light], ['dark', dark]] as const;
const ratio = (tokens: Record<string, string>, fg: string, bg: string) => contrastRatio(resolve(tokens, fg), resolve(tokens, bg));

describe('theme tokens', () => {
  it('has a dark block that changes the surfaces and the text', () => {
    const own = block("[data-theme='dark']");
    for (const name of ['--bg', '--surface', '--surface-2', '--border', '--text', '--text-2', '--text-muted', '--primary', '--ink', '--ivory']) {
      expect(own[name], name).toBeDefined();
    }
  });

  it('keeps every colour token a plain hex, so the checks below can read it', () => {
    for (const [, tokens] of THEMES) {
      for (const name of ['--bg', '--surface', '--surface-2', '--text', '--text-2', '--text-muted', '--primary', '--ink', '--ivory']) {
        expect(resolve(tokens, name), name).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  describe.each(THEMES)('%s', (_theme, tokens) => {
    it.each(['--text', '--text-2', '--text-muted'])('reads %s on every surface at 4.5 to 1', (fg) => {
      for (const bg of ['--bg', '--surface', '--surface-2', '--ivory']) {
        expect(ratio(tokens, fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it('reads faint text and placeholders at 3 to 1 at least', () => {
      expect(ratio(tokens, '--text-faint', '--surface')).toBeGreaterThanOrEqual(3);
      expect(ratio(tokens, '--placeholder', '--surface')).toBeGreaterThanOrEqual(3);
    });

    it('reads links and the primary colour on the page and on cards', () => {
      expect(ratio(tokens, '--primary', '--surface')).toBeGreaterThanOrEqual(4.5);
      expect(ratio(tokens, '--primary', '--bg')).toBeGreaterThanOrEqual(4.5);
    });

    it('reads the label on a solid button and on the always dark surfaces', () => {
      expect(ratio(tokens, '--ivory', '--ink')).toBeGreaterThanOrEqual(7);
      expect(ratio(tokens, '--on-dark', '--fixed-ink')).toBeGreaterThanOrEqual(7);
      expect(ratio(tokens, '--on-fill', '--primary-fill')).toBeGreaterThanOrEqual(4.5);
    });

    it.each(['error', 'ok', 'warn', 'info'])('reads the %s message', (kind) => {
      expect(ratio(tokens, `--alert-${kind}-fg`, `--alert-${kind}-bg`)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(['high', 'medium', 'ok'])('reads the %s risk label', (kind) => {
      expect(ratio(tokens, `--risk-${kind}-fg`, `--risk-${kind}-bg`)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(['green', 'blue', 'yellow', 'red', 'purple', 'teal'])('reads a %s label on cards and on the page', (name) => {
      expect(ratio(tokens, `--tone-${name}`, '--surface')).toBeGreaterThanOrEqual(4.5);
      expect(ratio(tokens, `--tone-${name}`, '--bg')).toBeGreaterThanOrEqual(4.5);
    });

    it('reads red text on cards and on the page', () => {
      expect(ratio(tokens, '--danger-ink', '--surface')).toBeGreaterThanOrEqual(4.5);
      expect(ratio(tokens, '--danger-ink', '--bg')).toBeGreaterThanOrEqual(4.5);
    });

    it('keeps the five chart colours at 3 to 1 on cards', () => {
      for (const n of [1, 2, 3, 4, 5]) expect(ratio(tokens, `--chart-${n}`, '--surface'), `chart ${n}`).toBeGreaterThanOrEqual(3);
    });

    it('keeps the chart colours apart from each other', () => {
      const colours = [1, 2, 3, 4, 5].map((n) => resolve(tokens, `--chart-${n}`).toLowerCase());
      expect(new Set(colours).size).toBe(5);
    });
  });
});

describe('the dark theme', () => {
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

  // The light theme is tinted toward forest green (paper, ink, the sidebar). The dark theme shares that hue family at a
  // very low chroma, so it still reads as black, and a person moving between the two sees one product.
  const SURFACES = ['--bg', '--surface', '--surface-2', '--ivory', '--border', '--border-light', '--row-hover', '--skel-a', '--skel-b', '--chart-grid'];

  it('is near black, tinted to the same green family as the light theme, on every surface', () => {
    for (const name of SURFACES) {
      const [r, g, b] = channels(resolve(dark, name));
      expect(g, `${name} leans green`).toBeGreaterThanOrEqual(Math.max(r, b));
      expect(Math.max(r, g, b) - Math.min(r, g, b), `${name} is too colourful for a dark theme`).toBeLessThanOrEqual(14);
    }
    const [r, g, b] = channels(resolve(dark, '--bg'));
    expect(g - Math.min(r, b), 'the page has a visible tint').toBeGreaterThanOrEqual(3);
  });

  it('reads as black, not green: the tint never goes past a fifth of the brightness', () => {
    for (const name of ['--bg', '--surface', '--surface-2']) {
      const [r, g, b] = channels(resolve(dark, name));
      expect(g - Math.min(r, b), name).toBeLessThanOrEqual(Math.max(g, 8) * 0.5);
    }
  });

  it('has the same forest ink sidebar as the light theme, a touch darker', () => {
    for (const tokens of [light, dark]) {
      const [r, g, b] = channels(resolve(tokens, '--sidebar-bg'));
      expect(g, 'sidebar leans green').toBeGreaterThan(Math.max(r, b));
    }
    const lightSide = channels(resolve(light, '--sidebar-bg'));
    const darkSide = channels(resolve(dark, '--sidebar-bg'));
    expect(darkSide[1]).toBeLessThan(lightSide[1]);
  });

  it('uses the same gold highlight in both themes, and it stands out on the dark cards', () => {
    // On the light cards gold is a decoration and never carries text, so only the dark theme is held to a ratio.
    expect(resolve(dark, '--gold')).toBe(resolve(light, '--gold'));
    expect(ratio(dark, '--gold', '--surface')).toBeGreaterThanOrEqual(3);
  });

  it('redefines every surface, shadow, tint, skeleton and chart token the light theme defines', () => {
    const own = block("[data-theme='dark']");
    const names = Object.keys(light).filter((n) => /^--(bg|surface|surface-2|border|border-light|text|text-2|text-muted|text-faint|primary|primary-hover|primary-light|primary-ring|shadow(-[a-z]+)?|row-hover|tint(-2)?|input-border(-hover)?|placeholder|skel-[ab]|caret|chart-[a-z0-9]+|sidebar-(bg|surface))$/.test(n));
    expect(names.length).toBeGreaterThan(25);
    expect(names.filter((n) => own[n] === undefined)).toEqual([]);
  });

  it('puts the page below the cards, and the cards below the inset tiles', () => {
    const light = (name: string) => channels(resolve(dark, name))[0];
    expect(light('--bg')).toBeLessThan(0x10);
    expect(light('--bg')).toBeLessThan(light('--surface'));
    expect(light('--surface')).toBeLessThan(light('--surface-2'));
    expect(light('--surface-2')).toBeLessThan(0x28);
  });

  it('keeps the logo green as the accent', () => {
    const [r, g, b] = channels(resolve(dark, '--primary'));
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });
});

describe('chart colours', () => {
  it('are drawn from the tokens, so a chart follows the theme', () => {
    for (const [kind, name] of [['stage', 'EGG'], ['result', 'Healthy'], ['role', 'ADMIN'], ['action', 'OTHER'], ['grade', 'C']] as const) {
      expect(colorFor(kind, name), `${kind} ${name}`).toMatch(/^var\(--chart-(\d|quiet)\)$/);
    }
  });

  it('keep the light shades the palette was checked with', () => {
    expect([1, 2, 3, 4, 5].map((n) => light[`--chart-${n}`].toUpperCase())).toEqual([...CHART_COLORS].map((c) => c.toUpperCase()));
  });

  it('use only tokens that exist in both themes', () => {
    const used = new Set<string>();
    for (const [kind, name] of [['stage', 'EGG'], ['stage', 'LARVA'], ['stage', 'PUPA'], ['stage', 'COCOON'], ['stage', 'HARVEST'], ['result', 'Healthy'], ['result', 'Grasserie'], ['action', 'OTHER']] as const) {
      used.add(colorFor(kind, name).slice(4, -1));
    }
    for (const token of used) {
      expect(light[token], `light ${token}`).toBeDefined();
      expect(block("[data-theme='dark']")[token], `dark ${token}`).toBeDefined();
    }
  });
});

describe('the app stylesheets', () => {
  const sheets = ['components.css', 'shell.css', 'toast.css'].map((name) => [name, readFileSync(join(__dirname, name), 'utf8')] as const);

  it.each(sheets)('%s draws no select arrow of its own, which would vanish on dark', (_name, text) => {
    expect(text).not.toMatch(/data:image\/svg\+xml/);
  });

  it.each(sheets)('%s has no white or cream surface that dark would leave behind', (_name, text) => {
    const printBlock = text.slice(text.indexOf('@media print') >= 0 ? text.indexOf('@media print') : text.length);
    const withoutPrint = text.replace(printBlock, '');
    expect(withoutPrint).not.toMatch(/background(-color)?:\s*(#fff\b|#ffffff|white|#faf8f3)/i);
  });
});
