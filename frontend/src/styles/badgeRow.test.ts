import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Two badges in one cell sit in a row with a gap (so "Disease found" and "Open alert" are two things, not one word),
// and a row of five tiles inside a stacked page takes its spacing from the stack, not from a second margin.

const css = readFileSync(join(__dirname, 'components.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function rules(selector: string): string {
  const out: string[] = [];
  for (const match of css.matchAll(/(^|\n)\s*([^{}@\n][^{}]*)\{([^}]*)\}/g)) {
    if (match[2].split(',').some((s) => s.trim() === selector)) out.push(match[0]);
  }
  return out.join('\n');
}

describe('badge rows', () => {
  it('lay badges out in a wrapping row with a gap', () => {
    const row = rules('.badge-row');
    expect(row).toMatch(/display:\s*flex/);
    expect(row).toMatch(/flex-wrap:\s*wrap/);
    expect(Number(/gap:\s*(\d+)px/.exec(row)?.[1] ?? 0)).toBeGreaterThanOrEqual(6);
  });
});

describe('a row of five tiles in a stack', () => {
  it('adds no margin of its own under the row', () => {
    expect(rules('.stack-24 > .grid-5')).toMatch(/margin-bottom:\s*0/);
  });
});
