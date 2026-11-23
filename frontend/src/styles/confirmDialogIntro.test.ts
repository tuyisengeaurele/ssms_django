import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The line that opens a typed confirmation dialog ran straight into the first label on production ("...is signed out." and
// then "New email address" with no gap). The intro is wrapped, and the wrapper keeps a gap under it.

const css = readFileSync(join(__dirname, 'components.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function rule(selector: string): string {
  const open = css.indexOf(`${selector} {`);
  expect(open, selector).toBeGreaterThan(-1);
  return css.slice(open, css.indexOf('}', open));
}

describe('the intro of a typed confirmation dialog', () => {
  it('keeps a gap under it, so the first label does not touch it', () => {
    expect(rule('.cbt-intro')).toMatch(/margin-bottom:\s*16px/);
  });

  it('does not add a second gap under its last paragraph', () => {
    expect(rule('.cbt-intro > :last-child')).toMatch(/margin-bottom:\s*0/);
  });
});
