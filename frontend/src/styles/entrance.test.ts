import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Content rises in softly when a page opens: a short fade and a 6 px lift, one item after another. It is motion, so it
// only runs when the person has not asked for less, it moves only opacity and position, and it takes its time and
// curve from the tokens. A loading placeholder looks like the card that will replace it, so nothing jumps.

const css = readFileSync(join(__dirname, 'components.css'), 'utf8');

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

const keyframes = block(css, '@keyframes rise');
const calmBlocks = css.split('@media (prefers-reduced-motion: no-preference)').slice(1).map((part) => block(`@media (prefers-reduced-motion: no-preference)${part}`, '@media'));
const calm = calmBlocks.join('\n');

describe('entrance', () => {
  it('rises by fading in and moving up 6 px, and touches nothing else', () => {
    expect(keyframes).not.toBe('');
    expect(keyframes).toMatch(/from\s*\{[^}]*opacity:\s*0[^}]*translateY\(6px\)/);
    expect(keyframes).toMatch(/to\s*\{[^}]*opacity:\s*1/);
    expect(keyframes.replace(/opacity|transform/g, '')).not.toMatch(/(width|height|top|left|margin|padding)\s*:/);
  });

  it('applies to the content stacks of a page and to anything marked as a stagger', () => {
    expect(calm).toMatch(/\.stagger > \*,\s*\.app-content \.stack-24 > \*\s*\{[^}]*animation:\s*rise var\(--duration-slow\) var\(--ease-out\) both/);
  });

  it('only runs for people who have not asked for less motion', () => {
    expect(calmBlocks.reduce((rest, text) => rest.replace(text, ''), css)).not.toMatch(/animation:\s*rise/);
  });

  it('steps by 40 ms for the first eight items and then holds', () => {
    for (let n = 2; n <= 8; n += 1) {
      expect(calm, `item ${n}`).toMatch(new RegExp(`:nth-child\\(${n}\\)\\s*\\{[^}]*animation-delay:\\s*${(n - 1) * 40}ms`));
    }
    expect(calm).toMatch(/:nth-child\(n \+ 9\)\s*\{[^}]*animation-delay:\s*320ms/);
  });
});

describe('loading', () => {
  it('draws a skeleton from the skeleton tokens', () => {
    const skeleton = css.match(/\.skeleton\s*\{[^}]*\}/)![0];
    expect(skeleton).toContain('var(--skel-a)');
    expect(skeleton).toContain('var(--skel-b)');
  });

  it('stops the shimmer for people who asked for less motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*\.skeleton\s*\{\s*animation:\s*none/);
  });

  it('draws a skeleton card exactly like the card that replaces it', () => {
    const card = css.match(/\.skeleton-card\s*\{[^}]*\}/)![0];
    expect(card).toContain('var(--elev-raised)');
    expect(card).toMatch(/border:\s*0/);
  });
});
