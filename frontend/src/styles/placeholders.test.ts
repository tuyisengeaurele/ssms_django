import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../landing/contrast';

// A box with no rule of its own for its hint takes the browser's grey, which is too faint on the dark theme.

const read = (path: string) => readFileSync(join(__dirname, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('the hint in an empty box', () => {
  it('takes the theme colour in every box of the signed in app, not only those with a form class', () => {
    const rule = read('components.css').match(/(?:^|[\r\n])input::placeholder,\s*textarea::placeholder\s*\{([^}]*)\}/);
    expect(rule, 'one rule for every input and text area').not.toBeNull();
    expect(rule![1]).toMatch(/color:\s*var\(--placeholder\)/);
    // Firefox fades a hint unless told not to.
    expect(rule![1]).toMatch(/opacity:\s*1/);
  });

  it('reads at 4.5 to 1 in the sign in and account forms', () => {
    const tokens = read('../landing/tokens.css');
    const value = (name: string) => tokens.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))![1];
    const rule = read('../landing/auth/auth.css').match(/\.landing \.l-field input::placeholder\s*\{([^}]*)\}/)![1];
    const colour = rule.match(/color:\s*var\((--l-[a-z0-9-]+)\)/);
    expect(colour, 'a colour from the public pages’ own tokens').not.toBeNull();
    // These boxes are filled with ivory (auth.css).
    expect(contrastRatio(value(colour![1]), value('--l-ivory'))).toBeGreaterThanOrEqual(4.5);
  });
});
