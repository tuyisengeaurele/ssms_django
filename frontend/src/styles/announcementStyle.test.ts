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

describe('announcement styles', () => {
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
