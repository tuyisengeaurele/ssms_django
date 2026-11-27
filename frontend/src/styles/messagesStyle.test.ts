import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A message may be 2000 characters with no space in them, on a phone 360 wide.

const css = readFileSync(join(__dirname, '../pages/messages/messages.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function rule(selector: string): string {
  return [...css.matchAll(/(^|\n)\s*([^{}@\n][^{}]*)\{([^}]*)\}/g)]
    .filter((m) => m[2].split(',').some((s) => s.trim() === selector))
    .map((m) => m[3])
    .join('\n');
}

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

describe('message styles', () => {
  it('keep line breaks and wrap a long unbroken word', () => {
    expect(rule('.msg-body')).toMatch(/white-space:\s*pre-wrap/);
    expect(rule('.msg-body')).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule('.msg-unsent')).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it('let the words shrink, and never squeeze the Send button off the screen', () => {
    expect(rule('.msg-composer-box')).toMatch(/min-width:\s*0/);
    expect(rule('.msg-send')).toMatch(/flex:\s*none/);
    expect(rule('.msg-main')).toMatch(/min-width:\s*0/);
  });

  it('scroll the messages inside their own box, so the composer stays on screen', () => {
    expect(rule('.msg-scroll')).toMatch(/overflow-y:\s*auto/);
    expect(rule('.msg-scroll')).toMatch(/flex:\s*1/);
    expect(rule('.msg-scroll')).toMatch(/min-height:\s*0/);
  });

  it('show one view at a time on a phone, with a way back that a wide screen does not need', () => {
    const phone = blocks('@media (max-width: 767px)').join('\n');
    expect(phone).toMatch(/\.msg-layout\[data-view='thread'\] \.msg-side\s*\{\s*display:\s*none/);
    expect(phone).toMatch(/\.msg-layout\[data-view='list'\] \.msg-main\s*\{\s*display:\s*none/);
    expect(blocks('@media (min-width: 768px)').join('\n')).toMatch(/\.msg-back\s*\{\s*display:\s*none/);
  });

  // A phone held sideways, or a keyboard that takes room from the page, leaves about 400 pixels.
  it('fit a short screen, so the box to write in stays above the bottom bar', () => {
    const short = blocks('@media (max-width: 767px) and (max-height: 560px)').join('');
    expect(short).toMatch(/\.msg-layout\s*\{[^}]*height:\s*calc\(100dvh - var\(--topbar-height\) - 88px - env\(safe-area-inset-bottom, 0px\)\)/);
    expect(short).toMatch(/\.msg-layout\s*\{[^}]*min-height:\s*200px/);
    // The bar at the top already names the page, so its heading only has to stay for screen readers.
    expect(short).toMatch(/\.msg-page > \.page-header\s*\{[^}]*clip-path:\s*inset\(50%\)/);
    expect(short).not.toMatch(/\.msg-page > \.page-header\s*\{[^}]*display:\s*none/);
    expect(short).not.toMatch(/bottom-nav/);
    expect(css.indexOf('@media (max-width: 767px) and (max-height: 560px)')).toBeGreaterThan(css.indexOf('@media (max-width: 767px) {'));
  });

  // Beside Back on a phone, one line holds about eight letters: not enough to tell who is being written to.
  it('give the name above a conversation a second line before cutting it', () => {
    expect(rule('.msg-title')).toMatch(/-webkit-line-clamp:\s*2/);
    expect(rule('.msg-title')).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule('.msg-title')).not.toMatch(/nowrap/);
    expect(rule('.msg-title')).toMatch(/min-width:\s*0/);
  });

  // Without its own rule the box takes the browser's grey, which is too faint in dark mode.
  it('write the hint in the empty box in a colour that can be read in both themes', () => {
    expect(rule('.msg-input::placeholder')).toMatch(/color:\s*var\(--text-muted\)/);
  });

  it('take their colours from the theme, so dark mode follows', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('move only for people who have not asked for less motion', () => {
    const moving = blocks('@media (prefers-reduced-motion: no-preference)');
    const still = moving.reduce((rest, block) => rest.replace(block, ''), css);
    expect(still).not.toMatch(/animation:|transition:/);
  });
});
