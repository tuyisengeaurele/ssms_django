import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A number with Call and WhatsApp stays on one line. On a small phone the two buttons keep their icons and give up their words.

const css = readFileSync(join(__dirname, 'components.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function rules(selector: string): string {
  const found: string[] = [];
  for (const match of css.matchAll(/(^|\n)\s*([^{}@\n][^{}]*)\{([^}]*)\}/g)) {
    if (match[2].split(',').some((s) => s.trim() === selector)) found.push(match[3]);
  }
  return found.join('\n');
}

describe('the phone number and its buttons', () => {
  it('stay on one line', () => {
    expect(rules('.phone-link')).toMatch(/flex-wrap:\s*nowrap/);
  });

  it('never break the number apart, however narrow the room is', () => {
    expect(rules('.phone-link__number')).toMatch(/white-space:\s*nowrap/);
  });

  it('give up the words when the cell they sit in is narrow, on any screen', () => {
    expect(rules('.identity-facts > div')).toMatch(/container-type:\s*inline-size/);
    const narrow = css.match(/@container \(max-width: \d+px\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/)?.[1] ?? '';
    expect(narrow).toMatch(/\.phone-link__text\s*\{[^}]*clip:\s*rect\(0, 0, 0, 0\)/);
  });

  it('keep the icons and hide the words on a small phone, without taking the words from a screen reader', () => {
    const phone = css.match(/@media \(max-width: 430px\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/)?.[1] ?? '';
    expect(phone).toMatch(/\.phone-link__text\s*\{[^}]*clip:\s*rect\(0, 0, 0, 0\)/);
    expect(phone).not.toMatch(/\.phone-link__text\s*\{[^}]*display:\s*none/);
  });
});
