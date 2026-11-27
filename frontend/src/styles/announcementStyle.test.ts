import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The banner sits at the top of every page, so it must hold any words at 360 wide, stay still for people who asked for
// less motion, and stay off paper.

const css = readFileSync(join(__dirname, '../components/announcements/announcements.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Every block that starts with `opening`, nested braces and all. */
function blocks(opening: string): string[] {
  const out: string[] = [];
  for (let at = css.indexOf(opening); at !== -1; at = css.indexOf(opening, at + 1)) {
    let depth = 0;
    for (let i = css.indexOf('{', at); i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      if (css[i] === '}' && (depth -= 1) === 0) {
        out.push(css.slice(at, i + 1));
        break;
      }
    }
  }
  return out;
}

function rule(selector: string): string {
  const found = [...css.matchAll(/(^|\n)\s*([^{}@\n][^{}]*)\{([^}]*)\}/g)].filter((m) => m[2].split(',').some((s) => s.trim() === selector));
  return found.map((m) => m[3]).join('\n');
}

const read = (path: string) => readFileSync(join(__dirname, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('announcements in the fixed public header', () => {
  const nav = read('../landing/nav.css');
  const landing = read('../landing/landing.css');

  // A margin, because the legal, lot and status pages already use the top padding of `main` to clear the menu.
  it('push the page down by their own height, so nothing hides under them', () => {
    expect(landing).toMatch(/\.landing \.l-nav ~ main\s*\{\s*margin-top:\s*var\(--announcement-height, 0px\);\s*\}/);
    for (const page of ['../landing/legal/legal.css', '../landing/lot.css', '../landing/status.css']) {
      const ownMain = [...read(page).matchAll(/\bmain\s*\{([^}]*)\}/g)].map((m) => m[1]).join('');
      expect(ownMain, page).not.toMatch(/margin/);
    }
    // A jump to a section scrolls the banners away, so it needs no room for them.
    expect(landing).toMatch(/section\[id\]\s*\{\s*scroll-margin-top:\s*24px;\s*\}/);
  });

  const block = (selector: string) => new RegExp(`(^|\\n)${selector.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`).exec(nav.replace(/\r/g, ''))?.[2] ?? '';

  // The header stays put, so it moves up by as much of the banners as has been scrolled past. Only the menu stays behind.
  it('scroll away with the page, leaving the menu at the top', () => {
    expect(block('.landing .l-nav')).toMatch(/top:\s*calc\(-1 \* var\(--announcement-gone, 0px\)\)/);
  });

  it('are shown whole, with nothing cut off, and can be clicked', () => {
    expect(block('.landing .l-nav__announcements')).toMatch(/pointer-events:\s*auto/);
    expect(block('.landing .l-nav__announcements')).not.toMatch(/max-height|overflow/);
  });

  // Hidden is not enough: their space would leave the menu bar, and its close button, across the middle of the menu.
  it('are moved off the screen, all of them, while the phone menu is open', () => {
    expect(block('.landing .l-nav.is-open')).toMatch(/top:\s*calc\(-1 \* var\(--announcement-height, 0px\)\)/);
    expect(block('.landing .l-nav.is-open .l-nav__announcements')).toMatch(/visibility:\s*hidden/);
  });
});

describe('announcement styles', () => {
  // The shared text box style asks for a taller box and may load after this one, so one class alone would lose to it.
  it('keep the three text boxes of the form short', () => {
    expect(css).toMatch(/\.form-textarea\.announcement-input\s*\{[^}]*min-height:\s*64px/);
  });

  it('wrap a long unbroken word, and let the words shrink beside the icon', () => {
    expect(rule('.announcement-text')).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule('.announcement-body')).toMatch(/min-width:\s*0/);
  });

  it('colour each type from the theme, so dark mode follows', () => {
    for (const [kind, token] of [['information', 'info'], ['maintenance', 'warning'], ['urgent', 'danger']]) {
      expect(rule(`.announcement--${kind}`), kind).toContain(`var(--${token}-bg)`);
    }
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('give the close button a target a thumb can hit and a ring a keyboard can see', () => {
    expect(rule('.announcement-close')).toMatch(/width:\s*4\dpx/);
    expect(rule('.announcement-close')).toMatch(/height:\s*4\dpx/);
    expect(rule('.announcement-close:focus-visible')).toMatch(/outline:\s*2px solid/);
  });

  it('move only for people who have not asked for less motion', () => {
    const moving = blocks('@media (prefers-reduced-motion: no-preference)');
    const still = moving.reduce((rest, block) => rest.replace(block, ''), css);
    expect(moving.join('\n')).toMatch(/animation:/);
    expect(still).not.toMatch(/animation:|transition:/);
  });

  it('are left out when the page is printed', () => {
    expect(blocks('@media print').join('\n')).toMatch(/\.announcements\s*\{[^}]*display:\s*none/);
  });
});
