import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The hero arrives with a short, quiet entrance, the way good product pages do it: the photo settles, then the eyebrow, the headline
// words, the line under them, the buttons and the cards come up a little and fade in, one after another.
//
// An earlier version took two seconds and hid the headline for most of it, which on a slow phone kept the words out of sight. So
// these checks hold the entrance to its rules: all of it is over in about a second; the first words start at once; the photo is
// never hidden, only settling; it is CSS only, so it does not wait for any script; it runs only for people who have not asked for
// less motion; and it leaves nothing behind when it ends. The card and the navigation stay still.

const read = (name: string) => readFileSync(join(__dirname, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const hero = read('hero.css');
const nav = read('nav.css');

/** The text of the block that starts at `header`, braces balanced. */
function block(source: string, header: string): string {
  const start = source.indexOf(header);
  if (start === -1) return '';
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  return '';
}

const CALM = '@media (prefers-reduced-motion: no-preference)';
const calm = block(hero, CALM);
const rest = hero.replace(calm, '');

/** Every rule that names this selector, joined. A selector in a longer list is still found. */
function body(css: string, selector: string): string {
  const found: string[] = [];
  for (const match of css.matchAll(/(^|\n)\s*([^{}@\n][^{}]*)\{([^}]*)\}/g)) {
    if (match[2].split(',').some((part) => part.trim() === selector)) found.push(match[3]);
  }
  return found.join('\n');
}

const ms = (value: string) => (value.endsWith('ms') ? parseFloat(value) : parseFloat(value) * 1000);

/** [selector, duration, delay] of each entrance in the calm block, the delay of a headline word being its first word's. */
const ENTRANCES = [
  '.landing .l-hero__bg img',
  '.landing .l-hero__eyebrow',
  '.landing .l-hero__title .l-word > span',
  '.landing .l-hero__sub',
  '.landing .l-hero__actions',
  '.landing .l-hero__stack',
] as const;

function timing(selector: string): { name: string; duration: number; delay: number; fill: string } {
  const text = body(calm, selector);
  const shorthand = /animation:\s*([\w-]+)\s+([\d.]+m?s)\s+(?:var\(--l-ease\)|[\w-]+)(?:\s+([\d.]+m?s))?\s+(\w+)\s*;/.exec(text);
  expect(shorthand, `${selector} has an animation shorthand`).not.toBeNull();
  const delayLine = /animation-delay:\s*calc\(([\d.]+m?s)\s*\+/.exec(text);
  const delay = delayLine ? ms(delayLine[1]) : shorthand![3] ? ms(shorthand![3]) : 0;
  return { name: shorthand![1], duration: ms(shorthand![2]), delay, fill: shorthand![4] };
}

describe('the hero entrance', () => {
  it('has an entrance for the photo, eyebrow, headline words, line, buttons and cards', () => {
    expect(calm).not.toBe('');
    for (const selector of ENTRANCES) expect(body(calm, selector), selector).toMatch(/animation:/);
  });

  it('runs only for people who have not asked for less motion', () => {
    expect(rest).not.toMatch(/animation\s*:|animation-delay\s*:/);
  });

  it.each(ENTRANCES)('leaves nothing behind when it ends, and shows its first frame during the delay: %s', (selector) => {
    expect(timing(selector).fill).toBe('backwards');
  });

  it('is over in about a second, counting the longest headline (French, seven words) and the last piece', () => {
    const stagger = Number(/var\(--i,\s*0\)\s*\*\s*(\d+)ms/.exec(body(calm, '.landing .l-hero__title .l-word > span'))?.[1]);
    expect(stagger).toBeGreaterThan(0);
    expect(stagger).toBeLessThanOrEqual(60);
    const LONGEST_HEADLINE_IN_WORDS = 7;
    for (const selector of ENTRANCES) {
      const { duration, delay } = timing(selector);
      const extra = selector.includes('l-word') ? stagger * (LONGEST_HEADLINE_IN_WORDS - 1) : 0;
      // The photo settles slowly behind the text, which is readable all the while, so it has a longer allowance.
      const limit = selector.includes('l-hero__bg') ? 1600 : 1100;
      expect(duration + delay + extra, selector).toBeLessThanOrEqual(limit);
    }
  });

  it('starts the first headline word at once, so the words are never held back', () => {
    expect(timing('.landing .l-hero__title .l-word > span').delay).toBeLessThanOrEqual(150);
  });

  it('only settles the photo, so it is on screen from the first frame', () => {
    const photo = timing('.landing .l-hero__bg img');
    const frames = block(hero, `@keyframes ${photo.name}`);
    expect(frames).toMatch(/from\s*\{\s*scale:\s*1\.0\d?;?\s*\}/);
    expect(frames).not.toMatch(/opacity/);
  });

  it('brings the other pieces up a little (under 20 px) and from nothing, and touches no layout property', () => {
    for (const selector of ENTRANCES.slice(1)) {
      const frames = block(hero, `@keyframes ${timing(selector).name}`);
      expect(frames, selector).toMatch(/opacity:\s*0/);
      const rise = Number(/translate:\s*0\s+(\d+)(?:px|%)/.exec(frames)?.[1] ?? 0);
      expect(rise, selector).toBeGreaterThan(0);
      if (/translate:\s*0\s+\d+px/.test(frames)) expect(rise).toBeLessThan(20);
      expect(frames.replace(/opacity|translate/g, ''), selector).not.toMatch(/(width|height|top|left|margin|padding|font)[a-z-]*\s*:/);
    }
  });

  it('lifts each headline word out of its clipped line, so the rise is cut off at the line, not drawn over the text above', () => {
    expect(body(hero, '.landing .l-hero__title .l-word')).toMatch(/overflow:\s*hidden/);
  });
});

describe('the parts that stay still', () => {
  it('keeps the card itself still, since it holds everything', () => {
    expect(body(hero, '.landing .l-hero__card')).not.toMatch(/animation/);
    expect(calm).not.toMatch(/l-hero__card\s*\{/);
  });

  it('shows the navigation at once', () => {
    expect(body(nav, '.landing .l-nav')).not.toMatch(/animation/);
  });
});
