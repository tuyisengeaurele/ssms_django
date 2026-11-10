import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The code boxes are rounded squares with a clear active box. They take their time from the duration tokens, show a
// blinking cursor only for people who have not asked for less motion, and keep the page light on the sign in screens.

const read = (path: string) => readFileSync(join(__dirname, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const components = read('../components/ui/codeInput.css');
const auth = read('../landing/auth/auth.css');

function rules(css: string, selector: string): string {
  const out: string[] = [];
  for (const match of css.matchAll(/(^|\n)\s*([^{}@\n][^{}]*)\{([^}]*)\}/g)) {
    if (match[2].split(',').some((s) => s.trim() === selector)) out.push(match[0]);
  }
  return out.join('\n');
}

describe('code boxes', () => {
  it('are rounded squares that share the width, with a larger digit', () => {
    const box = rules(components, '.code-input__box');
    expect(box).toMatch(/border-radius:\s*(1[2-9]|2\d)px/);
    expect(box).toMatch(/flex:\s*1 1 0/);
    expect(box).toMatch(/height:\s*5\d px|height:\s*5\dpx/);
    expect(box).toMatch(/font:[^;]*1\.[3-9]\d*rem/);
    expect(box).toMatch(/tabular-nums/);
  });

  it('sit in two groups of three', () => {
    expect(rules(components, '.code-input__box--split')).toMatch(/margin-left:\s*\d+px/);
  });

  it('take their time from the duration tokens', () => {
    expect(rules(components, '.code-input__box')).toMatch(/transition:[^;]*var\(--duration-/);
  });

  it('light the active box with a ring, and show a wrong code in the danger colour', () => {
    expect(rules(components, '.code-input__box[data-active]')).toMatch(/box-shadow:[^;]*0 0 0 3px/);
    expect(rules(components, '.code-input[data-invalid="true"] .code-input__box')).toMatch(/border-color:\s*var\(--ci-danger\)/);
    expect(rules(components, '.code-input')).toMatch(/--ci-danger:\s*var\(--danger-ink\)/);
    expect(rules(components, '.code-input[data-invalid="true"] .code-input__box[data-active]')).toMatch(/box-shadow:[^;]*var\(--ci-danger\)/);
  });

  it('keep the real field over the boxes, with its text and caret hidden', () => {
    const field = rules(components, '.code-input__field');
    expect(field).toMatch(/position:\s*absolute/);
    expect(field).toMatch(/inset:\s*0/);
    expect(field).toMatch(/color:\s*transparent/);
    expect(field).toMatch(/caret-color:\s*transparent/);
    // 16px stops phones from zooming the page on focus
    expect(field).toMatch(/font-size:\s*16px/);
  });

  it('blink the cursor only for people who have not asked for less motion', () => {
    expect(components).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{[^@]*\.code-input__caret\s*\{[^}]*animation:/);
    const outsideMedia = components.replace(/@media[^{]*\{[^{}]*\{[^}]*\}\s*\}/g, '');
    expect(rules(outsideMedia, '.code-input__caret')).not.toMatch(/animation:/);
  });

  it('use the sign in colours on the sign in pages, so a dark app theme cannot reach them', () => {
    const landing = rules(auth, '.landing .code-input');
    expect(landing).toMatch(/--ci-ink:\s*var\(--l-ink\)/);
    expect(landing).toMatch(/--ci-bg:\s*var\(--l-ivory\)/);
    expect(landing).toMatch(/--ci-focus:\s*var\(--l-leaf\)/);
  });
});

describe('the code field on the sign in pages', () => {
  // The generic sign in input rule (white ground, border, 52px) would paint over the boxes, so the field is stripped
  // back, in the normal, hover and focus states.
  it.each(['.landing .l-field .code-input__field', '.landing .l-field .code-input__field:hover', '.landing .l-field .code-input__field:focus'])(
    'is stripped of the ground, border and shadow of an ordinary field: %s',
    (selector) => {
      const rule = rules(auth, selector);
      expect(rule).toMatch(/background:\s*transparent/);
      expect(rule).toMatch(/border:\s*0/);
      expect(rule).toMatch(/box-shadow:\s*none/);
      expect(rule).toMatch(/height:\s*100%/);
      // the typed text is drawn by the boxes, so the field's own copy of it must stay invisible
      expect(rule).toMatch(/color:\s*transparent/);
      expect(rule).toMatch(/caret-color:\s*transparent/);
    },
  );
});

describe('sign in buttons that follow each other', () => {
  it('are kept apart in a group, with a gap of at least 12px', () => {
    const group = rules(auth, '.landing .l-auth__actions');
    expect(group).toMatch(/display:\s*grid/);
    // the last rule wins
    const gap = Number([...group.matchAll(/gap:\s*(\d+)px/g)].pop()?.[1] ?? 0);
    expect(gap).toBeGreaterThanOrEqual(12);
  });

  it('turn the second choice into a quiet text button, not a second big pill', () => {
    const quiet = rules(auth, '.landing .l-auth__textbtn');
    expect(quiet).toMatch(/background:\s*none/);
    expect(quiet).toMatch(/text-decoration:\s*underline/);
    expect(quiet).toMatch(/min-height:\s*44px/);
  });
});
