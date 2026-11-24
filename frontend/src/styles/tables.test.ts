import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A table should fit its card on a laptop screen without a slider. Layout cannot be measured in jsdom, so these
// rules pin the CSS that keeps the tables narrow. The real check is the overflow report in the browser.

const css = readFileSync(join(__dirname, 'components.css'), 'utf8');

function block(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  if (start === -1) return '';
  return source.slice(start, source.indexOf('}', start) + 1);
}

describe('Tables', () => {
  it('tightens cell padding on laptop screens', () => {
    const media = css.match(/@media \(max-width: 1280px\) \{[\s\S]*?\n\}/);
    expect(media).not.toBeNull();
    expect(media![0]).toMatch(/td[^{]*\{[^}]*padding/);
    expect(media![0]).toMatch(/th[^{]*\{[^}]*padding/);
  });

  it('caps the long text columns so they cannot push a table wider than its card', () => {
    const detail = block(css, '\n.cell-detail');
    const max = Number(detail.match(/max-width:\s*(\d+)px/)?.[1] ?? 9999);
    expect(max).toBeLessThanOrEqual(240);
  });

  it('turns a cramped table card into the phone list, whatever the screen width', () => {
    const phone = css.match(/@media \(max-width: 720px\) \{[\s\S]*?\r?\n\}\r?\n/)![0];
    const phoneRules = [...phone.matchAll(/^ {2}(\.table-stack[^{]*?)\{/gm)].map((m) => m[1].trim());
    expect(phoneRules.length).toBeGreaterThan(5);
    for (const selector of phoneRules) {
      const first = selector.split(',')[0].trim();
      expect(css, first).toContain(`.table-wrapper[data-cramped] ${first}`);
    }
  });

  // In a card (a phone, or a table card too narrow for its columns) the label and the value share one line. A 240 pixel cap with
  // hidden overflow cut the Detail of a security event to "img-src blocked https://live-", the one thing the log is for.
  it('lets a long cell use the whole card and wrap, in a phone card and in a cramped table card', () => {
    const phone = css.match(/@media \(max-width: 720px\) \{[\s\S]*?\r?\n\}\r?\n/)![0];
    expect(phone).toMatch(/\.table-stack td\.cell-detail[^{]*\{[^}]*max-width:\s*none/);
    expect(phone).toMatch(/\.table-stack td\.cell-detail[^{]*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(css).toMatch(/\.table-wrapper\[data-cramped\] \.table-stack td\.cell-detail[^{]*\{[^}]*max-width:\s*none/);
    expect(css).toMatch(/\.table-wrapper\[data-cramped\] \.table-stack td\.cell-detail[^{]*\{[^}]*overflow-wrap:\s*anywhere/);
  });

  // A cell with an empty label is the one that holds the buttons of a row (Edit, Delete, Open). On a phone only its empty label is
  // dropped, because there is nothing to print before the buttons. Hiding the cell itself took the buttons off the phone.
  it('hides only the empty label of a cell with no label, never the cell itself', () => {
    const hiding = [...css.matchAll(/([^{}]+)\{\s*display:\s*none;\s*\}/g)].flatMap((m) => m[1].split(',').map((s) => s.trim()));
    const aboutEmptyLabels = hiding.filter((selector) => selector.includes("[data-label='']"));
    expect(aboutEmptyLabels.length).toBeGreaterThanOrEqual(2);
    for (const selector of aboutEmptyLabels) expect(selector).toMatch(/::before$/);
  });

  // The buttons of a row (Edit access, Number, Support access, Delete) are four across on a laptop. On a phone they wrap, and each
  // is tall enough for a finger.
  it('wraps the buttons of a row and makes them finger sized, in a phone card and in a cramped table card', () => {
    const phone = css.match(/@media \(max-width: 720px\) \{[\s\S]*?\r?\n\}\r?\n/)![0];
    expect(phone).toMatch(/\.table-stack \.table-actions \{[^}]*flex-wrap:\s*wrap/);
    expect(phone).toMatch(/\.table-stack \.table-actions \.btn \{[^}]*min-height:\s*36px/);
    expect(css).toMatch(/\.table-wrapper\[data-cramped\] \.table-stack \.table-actions \{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.table-wrapper\[data-cramped\] \.table-stack \.table-actions \.btn \{[^}]*min-height:\s*36px/);
  });

  it('wraps a long detail in a wide table instead of cutting it with dots', () => {
    expect(block(css, '\n.cell-detail')).toMatch(/overflow-wrap:\s*anywhere/);
  });
});
