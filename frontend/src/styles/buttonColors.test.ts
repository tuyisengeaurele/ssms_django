import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../landing/contrast';

// Every button has a colour of its own, so it reads as a button and not as text: the main action is solid green, the others are
// soft green with a green edge, and a destructive one is red. Each has a hover that is clearly different, in both themes.

const index = readFileSync(join(__dirname, '../index.css'), 'utf8');
const components = readFileSync(join(__dirname, 'components.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function block(selector: string): Record<string, string> {
  const start = index.indexOf(`${selector} {`);
  const body = index.slice(index.indexOf('{', start) + 1, index.indexOf('\n}', start));
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

function rules(selector: string): string {
  const found: string[] = [];
  for (const match of components.matchAll(/(^|\n)\s*([^{}@\n][^{}]*)\{([^}]*)\}/g)) {
    if (match[2].split(',').some((s) => s.trim() === selector)) found.push(match[3]);
  }
  return found.join('\n');
}

describe.each(THEMES)('the button colours in the %s theme', (_name, tokens) => {
  it('read well: the words of each button against its fill, at rest and on hover', () => {
    for (const [fg, bg] of [
      ['--btn-primary-fg', '--btn-primary-bg'], ['--btn-primary-fg', '--btn-primary-hover'],
      ['--btn-soft-fg', '--btn-soft-bg'], ['--btn-soft-fg', '--btn-soft-hover'], ['--btn-soft-fg', '--btn-soft-active'],
      ['--btn-danger-fg', '--btn-danger-bg'], ['--on-danger', '--danger-fill'], ['--on-danger', '--danger-fill-hover'],
    ]) expect(ratio(tokens, fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it('are visible against the card they sit on: the edge of a soft button and the fill of a solid one', () => {
    expect(ratio(tokens, '--btn-soft-line', '--surface')).toBeGreaterThanOrEqual(3);
    expect(ratio(tokens, '--btn-primary-bg', '--surface')).toBeGreaterThanOrEqual(3);
    expect(ratio(tokens, '--btn-danger-bg', '--surface') >= 1.05 || ratio(tokens, '--danger-ink', '--surface') >= 3).toBe(true);
  });

  it('change on hover: the hover fill is not the resting fill', () => {
    expect(resolve(tokens, '--btn-primary-hover')).not.toBe(resolve(tokens, '--btn-primary-bg'));
    expect(resolve(tokens, '--btn-soft-hover')).not.toBe(resolve(tokens, '--btn-soft-bg'));
    expect(resolve(tokens, '--btn-soft-active')).not.toBe(resolve(tokens, '--btn-soft-hover'));
  });
});

describe('the button rules', () => {
  it('draw the main and the soft button from the colour tokens, with no colour written in', () => {
    for (const selector of ['.btn-primary', '.btn-secondary', '.btn-primary:hover:not(:disabled)', '.btn-secondary:hover:not(:disabled)']) {
      expect(rules(selector), selector).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    }
    expect(rules('.btn-primary')).toContain('var(--btn-primary-bg)');
    expect(rules('.btn-secondary')).toContain('var(--btn-soft-bg)');
    expect(rules('.btn-secondary')).toMatch(/border-color:\s*var\(--btn-soft-line\)/);
  });

  it('turn a soft destructive button red, and solid red on hover', () => {
    expect(rules('.btn-secondary.btn-quiet-danger')).toContain('var(--btn-danger-bg)');
    expect(rules('.btn-secondary.btn-quiet-danger:hover:not(:disabled)')).toContain('var(--danger-fill)');
  });

  it('lift a little on hover, only for people who have not asked for less motion', () => {
    const motion = components.match(/@media \(prefers-reduced-motion: no-preference\)\s*\{([^@]*)\}\s*\n/g)?.join('\n') ?? '';
    expect(motion).toMatch(/\.btn:hover:not\(:disabled\)\s*\{[^}]*translateY\(-1px\)/);
  });
});
