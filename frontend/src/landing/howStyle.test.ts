import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The still version of "How it works" (reduced motion, phones, short screens) is a plain list, two steps to a row on a wide screen.

const css = readFileSync(join(__dirname, 'how.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of the first rule that starts with this selector. */
function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', start);
  return css.slice(open + 1, css.indexOf('}', open));
}

describe('how it works, the still version', () => {
  it('starts each step at the top of its row, so two steps side by side line up', () => {
    expect(rule('.landing .how--stacked .l-how__step')).toMatch(/align-content:\s*start/);
  });

  it('keeps the heading clear of the first steps', () => {
    expect(rule('.landing .how--stacked .l-how__title')).toMatch(/margin-bottom:\s*clamp\((4\d)px,[^)]*,\s*(5\d|6\d)px\)/);
  });
});
