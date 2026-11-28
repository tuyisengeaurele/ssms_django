import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// On a phone the closed menu is slid off the screen. Sliding alone leaves every link in it reachable with Tab and read
// out by a screen reader, so Tab walked through a dozen links nobody could see.

const css = readFileSync(join(__dirname, 'shell.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

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

/** The declarations of `selector` inside `text`, where it stands alone before its brace. */
const rule = (text: string, selector: string) =>
  [...text.matchAll(new RegExp(`(?:^|[{}])\\s*${selector.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join(' ');

const phone = blocks('@media (max-width: 768px) {').join('\n');
const moving = blocks('@media (max-width: 768px) and (prefers-reduced-motion: no-preference)').join('\n');

describe('the menu on a phone', () => {
  it('is hidden while it is closed, which takes its links out of the Tab order, and shown when open', () => {
    expect(rule(phone, '.app-sidebar')).toMatch(/visibility:\s*hidden/);
    expect(rule(phone, '.app-sidebar.mobile-open')).toMatch(/visibility:\s*visible/);
  });

  it('is only hidden on a phone, never on a wider screen where it is always there', () => {
    const wide = blocks('@media (max-width: 768px)').reduce((rest, block) => rest.replace(block, ''), css);
    expect(rule(wide, '.app-sidebar')).not.toMatch(/visibility/);
  });

  // A change of visibility counts as visible for the whole of its transition: shown from the first moment of opening,
  // and kept until the slide out is over.
  it('takes as long over its visibility as over its slide, so it is seen leaving', () => {
    expect(rule(moving, '.app-sidebar')).toMatch(/transition:[^;]*transform var\(--duration-slow\)[^;]*,\s*visibility var\(--duration-slow\) linear\s*;/);
    expect(rule(moving, '.app-sidebar.mobile-open')).toBe('');
  });

  // A rule for the open menu outside this block would outrank the one that stills everything for reduced motion.
  it('sets its movement only for people who have not asked for less motion', () => {
    expect(rule(phone, '.app-sidebar')).not.toMatch(/transition/);
    expect(rule(phone, '.app-sidebar.mobile-open')).not.toMatch(/transition/);
  });
});
