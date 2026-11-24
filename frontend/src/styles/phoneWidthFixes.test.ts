import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Two things seen on a farmer's phone (375 px wide) that a grid or a flex column does by default:
// a small pill that stretches across its whole row, and a text button that stretches across its cell with its label in the middle.

const css = readFileSync(join(__dirname, 'components.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function rules(selector: string): string {
  const out: string[] = [];
  for (const match of css.matchAll(/(^|\n)\s*([^{}@\n][^{}]*)\{([^}]*)\}/g)) {
    if (match[2].split(',').some((s) => s.trim() === selector)) out.push(match[3]);
  }
  return out.join('\n');
}

describe('the getting started steps on a phone', () => {
  it('put the one column rule and the pill that keeps its own width in the same narrow screen block', () => {
    const block = /@media \(max-width: 480px\) \{([^@]*onboarding-steps[^@]*)\}\s*\n/.exec(css)?.[1] ?? '';
    expect(block).toMatch(/\.onboarding-steps > li \{[^}]*grid-template-columns:\s*1fr/);
    expect(block).toMatch(/\.onboarding-mark \{[^}]*justify-self:\s*start/);
  });
});

describe('a button under a value in the account facts', () => {
  it('keeps its own width and lines up with the value, so it does not stretch with its label in the middle', () => {
    expect(rules('.identity-facts .cell-stack > .btn')).toMatch(/align-self:\s*flex-start/);
  });
});
