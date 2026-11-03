import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The sidebar is one list that scrolls as one.

const shell = readFileSync(join(__dirname, 'shell.css'), 'utf8');

function rule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) return '';
  return css.slice(start, css.indexOf('}', start) + 1);
}

describe('Sidebar', () => {
  it('does not pin the last group, so Settings and Sign Out scroll with the rest of the menu', () => {
    expect(rule(shell, '.sidebar-nav > .sidebar-group:last-child')).toBe('');
    expect(rule(shell, '.sidebar-nav')).not.toMatch(/sticky/);
    expect(shell).not.toMatch(/\.sidebar-group:last-child[^{]*\{[^}]*position:\s*sticky/);
  });
});
