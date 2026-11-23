import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The phone number screen has a "Sign out" that is a button, because it does something and goes nowhere. It wears the link
// class, which only styled anchors, so on production it showed the browser's grey outset button. A button with that class
// has to look like the links around it.

const css = readFileSync(join(__dirname, '..', 'landing', 'auth', 'auth.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function rule(selector: string): string {
  const open = css.indexOf(`${selector} {`);
  expect(open, selector).toBeGreaterThan(-1);
  return css.slice(open, css.indexOf('}', open));
}

describe('a button with the auth link class', () => {
  const body = rule('.landing button.l-auth__link');

  it('has no browser border or grey background', () => {
    expect(body).toMatch(/background:\s*none/);
    expect(body).toMatch(/border:\s*0/);
  });

  it('has no padding of its own and takes the font of the text around it', () => {
    expect(body).toMatch(/padding:\s*0/);
    expect(body).toMatch(/font:\s*inherit/);
  });

  it('keeps the link weight and shows a pointer', () => {
    expect(body).toMatch(/font-weight:\s*600/);
    expect(body).toMatch(/cursor:\s*pointer/);
  });
});
