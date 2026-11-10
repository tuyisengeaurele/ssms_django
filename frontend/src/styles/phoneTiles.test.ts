import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// On a phone a group of stat tiles stays two across, so three or four counts take two rows and not a long column in front
// of the content. A group with an odd number of tiles lets the last one run across.

const css = readFileSync(join(__dirname, '../index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const phone = /@media \(max-width: 420px\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;
const phoneRules = [...css.matchAll(phone)].map((m) => m[1]).join('\n');

describe('stat tiles on a phone', () => {
  it('stay two across even at the narrowest width', () => {
    expect(phoneRules).toMatch(/\.grid-3:has\(>\s*\.stat-tile\),\s*\.grid-4:has\(>\s*\.stat-tile\)\s*\{[^}]*grid-template-columns:\s*1fr 1fr/);
  });

  it('let a last tile that would sit alone run across the row', () => {
    expect(phoneRules).toMatch(/\.stat-tile:last-child:nth-child\(odd\)\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
  });

  it('leave other groups (cards, forms) in one column', () => {
    expect(phoneRules).toMatch(/\.grid-3,\s*\.grid-4\s*\{[^}]*grid-template-columns:\s*1fr\s*;/);
  });
});
