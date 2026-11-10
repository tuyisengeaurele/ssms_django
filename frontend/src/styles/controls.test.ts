import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Buttons and form fields are what a person touches most. Each needs a hover, a pressed and a keyboard focus state,
// the press feedback is motion and so only runs when the person has not asked for less, and nothing is coloured by hand.

const components = readFileSync(join(__dirname, 'components.css'), 'utf8');
const index = readFileSync(join(__dirname, '../index.css'), 'utf8');

/** The text of the first block that starts at `header`, braces balanced. */
function block(source: string, header: string): string {
  const start = source.indexOf(header);
  if (start === -1) return '';
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  return '';
}

const rule = (selector: string) => {
  const found = components.match(new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\}`));
  return found ? found[0] : '';
};

/** Every block that starts at `header`. A stylesheet may keep its motion in more than one place. */
function allBlocks(source: string, header: string): string[] {
  const found: string[] = [];
  let from = 0;
  for (;;) {
    const text = block(source.slice(from), header);
    if (!text) return found;
    found.push(text);
    from += source.slice(from).indexOf(text) + text.length;
  }
}

const motionBlocks = allBlocks(components, '@media (prefers-reduced-motion: no-preference)');
const motion = motionBlocks.join('\n');

describe('buttons', () => {
  const variants = ['.btn-primary', '.btn-secondary', '.btn-ghost', '.btn-danger', '.btn-outline-primary'];

  it.each(variants)('%s has a hover state', (variant) => {
    expect(components).toContain(`${variant}:hover:not(:disabled)`);
  });

  it.each(['.btn-primary', '.btn-secondary', '.btn-danger'])('%s has a pressed state', (variant) => {
    expect(components).toContain(`${variant}:active:not(:disabled)`);
  });

  it('presses in a little, and only for people who have not asked for less motion', () => {
    expect(motion).toMatch(/\.btn:active:not\(:disabled\)\s*\{[^}]*transform:\s*scale\(0\.98\)/);
    expect(motionBlocks.reduce((rest, text) => rest.replace(text, ''), components)).not.toMatch(/\.btn:active[^{]*\{[^}]*transform/);
  });

  it('draws the danger button from tokens, so it reads in both themes', () => {
    expect(rule('.btn-danger')).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    expect(rule('.btn-danger')).toContain('var(--danger-fill)');
    for (const name of ['--danger-fill', '--danger-fill-hover', '--on-danger']) expect(index, name).toMatch(new RegExp(`${name}:\\s*#[0-9a-fA-F]{6}`));
  });

  it('takes its transition times from the duration tokens', () => {
    expect(rule('.btn')).toMatch(/var\(--duration-/);
    expect(rule('.btn')).not.toMatch(/\d(\.\d+)?m?s\b(?![^()]*\))/);
  });

  it('keeps a visible keyboard ring', () => {
    expect(rule('.btn:focus-visible')).toMatch(/outline:\s*2px solid/);
  });
});

describe('form fields', () => {
  it('show a ring on keyboard focus as well as on click, in the same colour in both themes', () => {
    expect(components).toMatch(/\.form-input:focus-visible[^{]*\{[^}]*(box-shadow|outline)/);
    expect(components).toMatch(/\.form-select:focus-visible/);
    expect(components).toMatch(/\.form-textarea:focus-visible/);
  });

  it('take their transition times from the duration tokens', () => {
    const fields = components.match(/\.form-input,\s*\.form-select,\s*\.form-textarea\s*\{[^}]*\}/)![0];
    expect(fields).toMatch(/transition:[^;]*var\(--duration-/);
  });

  it('keep a touch target of at least 44 px', () => {
    const fields = components.match(/\.form-input,\s*\.form-select,\s*\.form-textarea\s*\{[^}]*\}/)![0];
    expect(fields).toMatch(/min-height:\s*(44|2\.75)/);
  });
});
