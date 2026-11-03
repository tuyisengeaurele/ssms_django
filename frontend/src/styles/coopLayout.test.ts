import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const components = readFileSync(join(__dirname, 'components.css'), 'utf8');

function rule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) return '';
  return css.slice(start, css.indexOf('}', start) + 1);
}

describe('Cooperative page', () => {
  it('has a note under a name that wraps, for text that must be read in full', () => {
    const wrap = rule(components, '.cell-sub--wrap');
    expect(wrap).not.toBe('');
    expect(wrap).toMatch(/white-space:\s*normal/);
    expect(wrap).not.toMatch(/text-overflow:\s*ellipsis/);
  });

  it('shows the whole list of people, without the small scroll box of the old window', () => {
    expect(rule(components, '.people-list--open')).toMatch(/max-height:\s*none/);
  });
});
