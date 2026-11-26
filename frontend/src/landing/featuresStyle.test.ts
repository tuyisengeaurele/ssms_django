import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Side by side, the "what it does" cards share a minimum height so their titles sit low and level. In one column there is
// nothing to be level with, and the minimum height only leaves a blank band on top of the shorter cards.

const css = readFileSync(join(__dirname, 'features.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const phone = css.match(/@media \(max-width: 640px\)\s*\{[\s\S]*?\n\}/)?.[0] ?? '';

describe('the feature cards on a phone', () => {
  it('are only as tall as what is in them', () => {
    expect(phone).toMatch(/\.landing \.l-feat__inner\s*\{[^}]*min-height:\s*0/);
  });
});
