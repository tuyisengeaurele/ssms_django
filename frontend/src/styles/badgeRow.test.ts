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

describe('filter bars', () => {
  // A search box, a select and two kinds of input each had their own padding, so they came out at four heights and
  // did not line up.
  it('give the search box, the selects and the inputs one height', () => {
    const heights = ['.filters .search-box input', '.filters .inline-select', '.filters .filter-input'].map((selector) => {
      const rule = rules(selector);
      expect(rule, selector).toMatch(/box-sizing:\s*border-box/);
      return /height:\s*(\d+)px/.exec(rule)?.[1];
    });
    expect(new Set(heights).size).toBe(1);
    expect(Number(heights[0])).toBeGreaterThanOrEqual(40);
  });
});

describe('a message that an admin reads', () => {
  // The hint "After you have sent your answer, mark it as answered" sat right on the first line of the message.
  it('has room between a hint above it and its first line', () => {
    expect(rules('.form-hint + .message-body')).toMatch(/margin-top:\s*(1[0-9]|2[0-9])px/);
  });
});

describe('a section that a link jumps to', () => {
  // The room's "1 sensor" link jumps to the Devices list. It lands with room above it, not glued to the top of the screen.
  it('keeps clear of the top edge when it is scrolled to', () => {
    expect(Number(/scroll-margin-top:\s*(\d+)px/.exec(rules('.anchor-target'))?.[1] ?? 0)).toBeGreaterThanOrEqual(72);
  });
});

describe('the batch report', () => {
  // The sentence "Day 14 of 28..." sat right against the tiles above it.
  it('leaves room between a block of facts and the line that follows it', () => {
    expect(rules('.facts + .report-line')).toMatch(/margin-top:\s*(1[2-9]|2\d)px/);
  });
});

describe('a row of five tiles in a stack', () => {
  it('adds no margin of its own under the row', () => {
    expect(rules('.stack-24 > .grid-5')).toMatch(/margin-bottom:\s*0/);
  });
});
