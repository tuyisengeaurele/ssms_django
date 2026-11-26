import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The reply box slides and fades open under a message. It is quick, and it does not move at all for people who asked for
// less motion.

const css = readFileSync(join(__dirname, 'components.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The block that starts at `header`, braces balanced. */
function block(start: number): string {
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
  }
  return '';
}

const calm = Array.from(css.matchAll(/@media \(prefers-reduced-motion: no-preference\)/g), (m) => block(m.index!)).join('\n');
const rest = Array.from(css.matchAll(/@media \(prefers-reduced-motion: no-preference\)/g), (m) => block(m.index!)).reduce(
  (left, part) => left.replace(part, ''),
  css,
);

describe('the reply box', () => {
  it('moves only for people who did not ask for less motion', () => {
    expect(calm).toMatch(/\.reply-box\s*\{[^}]*animation:\s*reply-open/);
    expect(calm).toMatch(/\.reply-box\[data-leaving\]\s*\{[^}]*animation:\s*reply-close/);
    expect(rest).not.toMatch(/\.reply-box[^{]*\{[^}]*animation:/);
  });

  it('opens and closes at the fast duration', () => {
    expect(calm).toMatch(/reply-open var\(--duration-fast\)/);
    expect(calm).toMatch(/reply-close var\(--duration-fast\)/);
  });

  it('slides by growing, and fades', () => {
    expect(css).toMatch(/@keyframes reply-open\s*\{\s*from\s*\{[^}]*grid-template-rows:\s*0fr[^}]*opacity:\s*0/);
  });
});
