import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Dialogs, toasts and page changes animate in CSS (they used to need an animation library). Rules these checks hold:
// a dialog and a toast fade in and out, and only rise, grow or slide when the person has not asked for less motion (the
// movement comes from variables that are set only inside that media query); time and curve come from the tokens; a page change
// is a short fade and nothing else, and leaves nothing behind once it is over.

const read = (name: string) => readFileSync(join(__dirname, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const components = read('components.css');
const index = read('../index.css');
const toasts = read('toast.css');
const shell = read('shell.css');

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

/** The media queries for people who have not asked for less motion, joined, and the stylesheet without them. */
function split(source: string): { calm: string; rest: string } {
  const found: string[] = [];
  let rest = source;
  for (let at = rest.indexOf('@media (prefers-reduced-motion: no-preference)'); at !== -1; at = rest.indexOf('@media (prefers-reduced-motion: no-preference)')) {
    const text = block(rest, '@media (prefers-reduced-motion: no-preference)');
    found.push(text);
    rest = rest.replace(text, '');
  }
  return { calm: found.join('\n'), rest };
}

/** The declarations of the first rule with exactly this selector. */
function rule(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(source);
  expect(match, selector).not.toBeNull();
  return match![1];
}

describe('a dialog', () => {
  const { calm, rest } = split(components);

  it('fades in with the usual time and curve', () => {
    expect(rule(rest, '.modal-overlay')).toMatch(/animation:\s*pop-in var\(--duration-normal\) var\(--ease-out\) backwards/);
    expect(rule(rest, '.modal-box')).toMatch(/animation:\s*pop-in var\(--duration-normal\) var\(--ease-out\) backwards/);
  });

  it('fades out faster, so the next thing is not kept waiting, and cannot be clicked while it goes', () => {
    expect(rule(rest, '.modal-overlay[data-leaving]')).toMatch(/pointer-events:\s*none/);
    expect(rule(rest, '.modal-overlay[data-leaving]')).toMatch(/animation:\s*pop-out var\(--duration-fast\) var\(--ease-out\) forwards/);
    expect(rule(rest, '.modal-overlay[data-leaving] .modal-box')).toMatch(/animation:\s*pop-out var\(--duration-fast\) var\(--ease-out\) forwards/);
  });

  it('only grows and slides for people who have not asked for less motion', () => {
    expect(calm).toMatch(/\.modal-box\s*\{[^}]*--pop-y:\s*14px[^}]*--pop-scale:\s*0\.96/);
    expect(rest).not.toMatch(/--pop-y|--pop-scale/);
  });
});

describe('a toast', () => {
  const { calm, rest } = split(toasts);

  it('fades in with the usual time and curve, and out faster', () => {
    expect(rule(rest, '.toast')).toMatch(/animation:\s*pop-in var\(--duration-normal\) var\(--ease-out\) backwards/);
    expect(rule(rest, '.toast[data-leaving]')).toMatch(/animation:\s*pop-out var\(--duration-fast\) var\(--ease-out\) forwards/);
    expect(rule(rest, '.toast[data-leaving]')).toMatch(/pointer-events:\s*none/);
  });

  it('only rises and grows for people who have not asked for less motion', () => {
    expect(calm).toMatch(/\.toast\s*\{[^}]*--pop-y:\s*20px[^}]*--pop-scale:\s*0\.95/);
    expect(rest).not.toMatch(/--pop-y|--pop-scale/);
  });
});

// They live in index.css, which every page loads: components.css arrives only with the signed in layout, and a toast can appear before it.
describe('the shared pop keyframes', () => {
  const frames = (name: string) => block(index, `@keyframes ${name}`);

  it('fade in from nothing, with the movement and size taken from variables that default to none', () => {
    expect(frames('pop-in')).toMatch(/from\s*\{[^}]*opacity:\s*0[^}]*translate:\s*0 var\(--pop-y,\s*0px\)[^}]*scale:\s*var\(--pop-scale,\s*1\)/);
  });

  it('fade out to nothing the same way', () => {
    expect(frames('pop-out')).toMatch(/to\s*\{[^}]*opacity:\s*0[^}]*translate:\s*0 var\(--pop-out-y,\s*0px\)[^}]*scale:\s*var\(--pop-out-scale,\s*1\)/);
  });

  it('touch opacity, position and size only', () => {
    for (const name of ['pop-in', 'pop-out']) {
      expect(frames(name).replace(/opacity|translate|scale/g, '')).not.toMatch(/(width|height|top|left|margin|padding)\s*:/);
    }
  });
});

describe('a page change', () => {
  const frames = block(shell, '@keyframes app-page-in');

  it('is a short fade and nothing else', () => {
    expect(frames).not.toBe('');
    expect(frames).toMatch(/from\s*\{\s*opacity:\s*0/);
    expect(frames).not.toMatch(/transform|translate|scale/);
  });

  it('takes the usual time and curve, and leaves no effect behind once it is over', () => {
    expect(rule(shell, '.app-content')).toMatch(/animation:\s*app-page-in var\(--duration-fast\) var\(--ease-out\) backwards/);
  });
});
