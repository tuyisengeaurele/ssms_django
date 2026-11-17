import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A language control whose language is still downloading says so: a progress cursor and a dimmed look, and a slow pulse for
// people who have not asked for less motion. The rule is in the global stylesheet because the control appears on the landing
// page, the sign in pages and inside the app.

const css = readFileSync(join(__dirname, 'index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const BUSY = "[data-lang-control][aria-busy='true']";

/** The text between the braces of the first rule that starts with this selector, outside any media query. */
function topLevelRule(selector: string): string {
  const start = css.indexOf(selector);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', start);
  return css.slice(open + 1, css.indexOf('}', open));
}

/** The stylesheet with every @media block removed, however deeply its braces nest. */
function withoutMediaBlocks(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('@media', i)) {
      let depth = 0;
      i = text.indexOf('{', i);
      do {
        if (text[i] === '{') depth += 1;
        if (text[i] === '}') depth -= 1;
        i += 1;
      } while (depth > 0 && i < text.length);
    } else {
      out += text[i];
      i += 1;
    }
  }
  return out;
}

describe('a language control that is waiting for its language', () => {
  it('shows a progress cursor and a dimmed look', () => {
    const rule = topLevelRule(BUSY);
    expect(rule).toMatch(/cursor:\s*progress/);
    expect(rule).toMatch(/opacity:/);
  });

  it('pulses only for people who have not asked for less motion', () => {
    expect(withoutMediaBlocks(css)).not.toMatch(/lang-busy/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)[\s\S]*animation:[^;]*lang-busy/);
  });
});
