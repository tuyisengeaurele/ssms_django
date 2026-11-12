import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The support request asks two questions with a few answers each ("How long", "What you may do"). They were the browser's own
// blue radio buttons. Each answer is now a pill, with the real radio underneath so the keyboard and a screen reader work as
// before, and the chosen one is filled in the app's ink.

const read = (path: string) => readFileSync(join(__dirname, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const support = read('support.css');
const index = read('../index.css');

function rules(css: string, selector: string): string {
  const out: string[] = [];
  for (const match of css.matchAll(/(^|\n)\s*([^{}@\n][^{}]*)\{([^}]*)\}/g)) {
    if (match[2].split(',').some((s) => s.trim() === selector)) out.push(match[0]);
  }
  return out.join('\n');
}

describe('the answers to a support request', () => {
  it('are pills that fit a thumb, in a row that wraps', () => {
    const pill = rules(support, '.support-choice');
    expect(pill).toMatch(/border-radius:\s*999px/);
    expect(pill).toMatch(/min-height:\s*(4[0-9]|5[0-9])px/);
    expect(pill).toMatch(/position:\s*relative/);
    expect(rules(support, '.support-choices')).toMatch(/flex-wrap:\s*wrap/);
  });

  it('keep the real radio, covering the pill and unseen, so it is still the control', () => {
    const radio = rules(support, '.support-choice input');
    expect(radio).toMatch(/position:\s*absolute/);
    expect(radio).toMatch(/opacity:\s*0/);
    expect(radio).toMatch(/inset:\s*0/);
  });

  it('fill in the chosen one, and show keyboard focus on it', () => {
    expect(rules(support, '.support-choice:has(input:checked)')).toMatch(/background:\s*var\(--ink\)/);
    expect(rules(support, '.support-choice:has(input:focus-visible)')).toMatch(/outline:\s*2px solid/);
  });

  it('take their time from the duration tokens', () => {
    expect(rules(support, '.support-choice')).toMatch(/transition:[^;]*var\(--duration-/);
  });
});

describe('any other tick box or radio in the app', () => {
  it('uses the app colour and not the browser blue', () => {
    expect(rules(index, "input[type='checkbox']")).toMatch(/accent-color:\s*var\(--primary\)/);
    expect(rules(index, "input[type='radio']")).toMatch(/accent-color:\s*var\(--primary\)/);
  });
});
