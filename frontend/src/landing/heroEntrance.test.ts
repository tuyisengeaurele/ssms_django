import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The hero used to play about two seconds of entrance animation: the card faded in, the nav dropped, the headline rose word by
// word out of a clipped box, and the lines and buttons faded up one after another. On a slow phone the page is ready long before
// that, so the choreography only kept the words out of sight. The first screen now simply is there.

const read = (name: string) => readFileSync(join(__dirname, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const hero = read('hero.css');
const nav = read('nav.css');

/** Every rule whose selector list names this selector, joined. A selector that sits in a longer list is still found. */
function body(css: string, selector: string): string {
  const found: string[] = [];
  for (const match of css.matchAll(/(^|\n)\s*([^{}@\n][^{}]*)\{([^}]*)\}/g)) {
    if (match[2].split(',').some((part) => part.trim() === selector)) found.push(match[3]);
  }
  expect(found.length, selector).toBeGreaterThan(0);
  return found.join('\n');
}

describe('the first screen of the landing page', () => {
  const ABOVE_THE_FOLD = [
    '.landing .l-hero__card',
    '.landing .l-hero__bg img',
    '.landing .l-hero__eyebrow',
    '.landing .l-hero__title .l-word > span',
    '.landing .l-hero__sub',
    '.landing .l-hero__actions',
    '.landing .l-hero__stack',
  ];

  it.each(ABOVE_THE_FOLD)('does not animate its arrival: %s', (selector) => {
    expect(body(hero, selector)).not.toMatch(/animation/);
  });

  it('does not push the headline words out of sight to bring them back later', () => {
    expect(body(hero, '.landing .l-hero__title .l-word > span')).not.toMatch(/translateY\(115%\)/);
  });

  it('shows the navigation at once', () => {
    expect(body(nav, '.landing .l-nav')).not.toMatch(/animation/);
  });
});
