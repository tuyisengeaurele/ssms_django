import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The Settings sections are tabs along the top, like the tabs of any other page, so the page does not carry a second
// menu beside the main one.

const components = readFileSync(join(__dirname, 'components.css'), 'utf8');

function rule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) return '';
  return css.slice(start, css.indexOf('}', start) + 1);
}

describe('Settings tabs', () => {
  it('puts the sections in one row above the content', () => {
    expect(rule(components, '.tab-nav ul')).toMatch(/display:\s*flex/);
    expect(rule(components, '.settings-layout')).not.toMatch(/grid-template-columns/);
  });

  it('keeps the row reachable on a narrow screen by letting it scroll sideways', () => {
    expect(rule(components, '.tab-nav ul')).toMatch(/overflow-x:\s*auto/);
  });

  it('draws a line under the tabs and marks the open one with a stronger line, not a filled pill', () => {
    expect(rule(components, '.tab-nav')).toMatch(/border-bottom:/);
    const open = rule(components, '.tab-link.is-on');
    expect(open).toMatch(/border-bottom-color/);
    expect(open).not.toMatch(/background/);
  });

  it('uses the whole width of the page like the other pages, not a narrow strip on the left', () => {
    expect(rule(components, '.settings-layout')).not.toMatch(/max-width/);
  });

  it('puts every section on its own full width row, never two side by side', () => {
    expect(rule(components, '.profile-stack')).not.toMatch(/grid-template-columns/);
    expect(components).not.toMatch(/\.profile-stack\s*\{[^}]*repeat\(2/);
    expect(components).not.toMatch(/\.profile-stack > \.identity/);
  });

  it('keeps the account card compact', () => {
    expect(rule(components, '.settings-body .identity-avatar')).toMatch(/width:\s*(5\d|6\d)px/);
  });
});
