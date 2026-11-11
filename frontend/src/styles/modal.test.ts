import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A dialog is a header, a body and a footer. Only the body scrolls, so the title and the buttons stay where they are on a
// short screen and the person never has to scroll to find Save. On a phone the dialog is a sheet from the bottom, sized
// by the visible height (dvh) so the browser's own bars do not cover the buttons, with room for the home bar.

const css = readFileSync(join(__dirname, 'components.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function rules(source: string, selector: string): string {
  const out: string[] = [];
  for (const match of source.matchAll(/(^|\n)\s*([^{}@\n][^{}]*)\{([^}]*)\}/g)) {
    if (match[2].split(',').some((s) => s.trim() === selector)) out.push(match[0]);
  }
  return out.join('\n');
}

const phone = [...css.matchAll(/@media \(max-width: 640px\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)].map((m) => m[1]).join('\n');
const print = [...css.matchAll(/@media print\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)].map((m) => m[1]).join('\n');

describe('the dialog box', () => {
  it('is a column that never grows past the screen, and does not scroll as a whole', () => {
    const box = rules(css, '.modal-box');
    expect(box).toMatch(/display:\s*flex/);
    expect(box).toMatch(/flex-direction:\s*column/);
    expect(box).toMatch(/overflow:\s*hidden/);
    expect(box).toMatch(/max-height:\s*min\(90vh,\s*calc\(100dvh - 32px\)\)/);
  });

  it('keeps the title and the buttons in place', () => {
    expect(rules(css, '.modal-header')).toMatch(/flex:\s*none/);
    expect(rules(css, '.modal-footer')).toMatch(/flex:\s*none/);
  });

  it('scrolls only the body, and does not pass the scroll on to the page behind', () => {
    const body = rules(css, '.modal-body');
    expect(body).toMatch(/flex:\s*1 1 auto/);
    expect(body).toMatch(/min-height:\s*0/);
    expect(body).toMatch(/overflow-y:\s*auto/);
    expect(body).toMatch(/overscroll-behavior:\s*contain/);
  });

  it('shows a soft shadow at the edge where more is hidden, with no script', () => {
    const body = rules(css, '.modal-body');
    expect(body).toMatch(/background-attachment:\s*local,\s*local,\s*scroll,\s*scroll/);
  });

  it('hides those shadows completely at rest, so no faint line shows under the title', () => {
    // The cover that scrolls with the text must be taller than the shadow it hides, and opaque across the shadow's height.
    const body = rules(css, '.modal-body');
    const group = String.raw`\((?:[^()]|\([^()]*\))*\)`;
    const sized = (kind: string, attachment: string) => [...body.matchAll(new RegExp(String.raw`${kind}-gradient${group} (?:top|bottom) / 100% (\d+)px no-repeat ${attachment}`, 'g'))].map((m) => Number(m[1]));
    const covers = sized('linear', 'local');
    const shadows = sized('radial', 'scroll');
    expect(covers).toHaveLength(2);
    expect(shadows).toHaveLength(2);
    // 30% of the cover is fully opaque, and that has to reach past the shadow
    for (const cover of covers) for (const shadow of shadows) expect(cover * 0.3).toBeGreaterThan(shadow);
  });

  it('gives a dialog with no footer its own room at the bottom', () => {
    expect(rules(css, '.modal-box:not(:has(.modal-footer)) .modal-body')).toMatch(/padding-bottom:\s*28px/);
  });

  it('separates the footer from the body with a hairline', () => {
    expect(rules(css, '.modal-footer')).toMatch(/border-top:\s*1px solid var\(--border-light\)/);
  });
});

describe('the dialog on a phone', () => {
  it('is a sheet from the bottom, sized by the visible height', () => {
    expect(phone).toMatch(/\.modal-box\s*\{[^}]*max-height:\s*min\(92vh,\s*92dvh\)/);
    expect(phone).toMatch(/\.modal-box\s*\{[^}]*border-radius:\s*24px 24px 0 0/);
  });

  it('keeps the buttons clear of the home bar', () => {
    expect(phone).toMatch(/\.modal-footer\s*\{[^}]*padding-bottom:\s*max\(16px,\s*env\(safe-area-inset-bottom\)\)/);
  });

  it('does not add a second padding around the sections', () => {
    expect(phone).toMatch(/\.modal-box\s*\{[^}]*padding:\s*0/);
  });
});

describe('printing a code from a dialog', () => {
  it('lets the sheet run the whole page, with no cut or scroll', () => {
    expect(print).toMatch(/\.modal-box\s*\{[^}]*overflow:\s*visible/);
    expect(print).toMatch(/\.modal-box\s*\{[^}]*max-height:\s*none/);
    expect(print).toMatch(/\.modal-body\s*\{[^}]*overflow:\s*visible/);
  });
});
