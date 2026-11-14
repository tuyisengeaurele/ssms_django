import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// On some phones (older iPhones, some Android browsers) the landing page scrolled sideways. The hero clips a rotated "pile of
// paper" sheet with overflow hidden and a rounded corner, which Safari does not always honour for a transformed child, and
// `overflow-x: clip` alone is unknown to browsers before 2022. Three guards, so that one failing does not show.

const read = (name: string) => readFileSync(join(__dirname, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const landing = read('landing.css');
const hero = read('hero.css');
const cards = read('herocards.css');

function body(css: string, selector: string, from = 0): string {
  const open = css.indexOf(`${selector} {`, from);
  expect(open, selector).toBeGreaterThan(-1);
  return css.slice(open, css.indexOf('}', open));
}

describe('the landing page on a phone', () => {
  it('cuts what sticks out sideways, with a fallback for browsers that do not know clip', () => {
    const rule = body(landing, '.landing');
    expect(rule.indexOf('overflow-x: hidden')).toBeGreaterThan(-1);
    expect(rule.indexOf('overflow-x: clip')).toBeGreaterThan(rule.indexOf('overflow-x: hidden'));
  });

  it('paints the hero inside its own box, so a rotated child cannot leave it', () => {
    expect(body(hero, '.landing .l-hero__card')).toMatch(/contain:\s*paint/);
  });

  it('keeps the pile of paper inside the card on a narrow screen', () => {
    const phone = cards.indexOf('@media (max-width: 640px)');
    expect(phone).toBeGreaterThan(-1);
    expect(body(cards, '.landing .l-herocards::before', phone)).toMatch(/transform:\s*translate\(0,/);
  });
});
