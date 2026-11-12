import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// "I agree to the Terms of Service and the Privacy Policy." sat in a grid, so each piece of text and each link became its
// own row and the full stop stood alone on the last line. The sentence runs as text, and only a hint goes on its own line.

const css = readFileSync(join(__dirname, 'auth.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function body(selector: string): string {
  const open = css.indexOf(`${selector} {`);
  expect(open, selector).toBeGreaterThan(-1);
  return css.slice(open, css.indexOf('}', open));
}

describe('the tick box with its sentence', () => {
  it('runs the sentence as text, not as rows of a grid', () => {
    expect(body('.landing .l-check label')).not.toMatch(/display:\s*grid/);
  });

  it('puts a hint under the sentence on its own line', () => {
    expect(body('.landing .l-check__hint')).toMatch(/display:\s*block/);
  });
});
