import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The details of a decision open on a row of their own, as wide as the words and the buttons together, with the history and
// the rooms side by side. Inside the narrow middle column they ran down a strip beside an empty column of buttons.

const css = readFileSync(join(__dirname, 'components.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function rules(selector: string): string {
  const out: string[] = [];
  for (const match of css.matchAll(/(^|\n)\s*([^{}@\n][^{}]*)\{([^}]*)\}/g)) {
    if (match[2].split(',').some((s) => s.trim() === selector)) out.push(match[0]);
  }
  return out.join('\n');
}

const phone = [...css.matchAll(/@media \(max-width: 720px\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)].map((m) => m[1]).join('\n');

describe('the details of a decision', () => {
  it('run under the words and the buttons, across the card', () => {
    expect(rules('.decision-more')).toMatch(/grid-column:\s*2\s*\/\s*-1/);
  });

  it('put the history and the rooms side by side when there is room', () => {
    const evidence = rules('.decision-evidence');
    expect(evidence).toMatch(/display:\s*grid/);
    expect(evidence).toMatch(/grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(\d+px,\s*1fr\)\)/);
  });

  it('take the whole width of a phone card', () => {
    expect(phone).toMatch(/\.decision-more\s*\{[^}]*grid-column:\s*1/);
  });
});
