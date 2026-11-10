import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A row of tabs may be wider than a phone, so it scrolls sideways, snaps to a tab and shows no scrollbar. Each tab shows
// keyboard focus, and the line under the chosen one slides in rather than appearing.

const css = readFileSync(join(__dirname, 'components.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function rules(selector: string): string {
  const out: string[] = [];
  for (const match of css.matchAll(/(^|\n)\s*([^{}@\n][^{}]*)\{([^}]*)\}/g)) {
    if (match[2].split(',').some((s) => s.trim() === selector)) out.push(match[0]);
  }
  return out.join('\n');
}

describe('tabs', () => {
  it('scroll sideways, snap to a tab and hide the scrollbar', () => {
    const row = rules('.tabs');
    expect(row).toMatch(/overflow-x:\s*auto/);
    expect(row).toMatch(/scroll-snap-type:\s*x proximity/);
    expect(row).toMatch(/scrollbar-width:\s*none/);
    expect(rules('.tabs::-webkit-scrollbar')).toMatch(/display:\s*none/);
    expect(rules('.tabs button')).toMatch(/scroll-snap-align:\s*start/);
  });

  it('take their colour change from the duration tokens', () => {
    expect(rules('.tabs button')).toMatch(/transition:[^;]*var\(--duration-/);
  });

  it('show keyboard focus on a tab', () => {
    expect(rules('.tabs button:focus-visible')).toMatch(/outline:\s*2px solid/);
  });

  it('slide the line under the chosen tab in with a transform, from tokens', () => {
    expect(rules('.tabs button::after')).toMatch(/transform:\s*scaleX\(0\)/);
    expect(rules('.tabs button::after')).toMatch(/transition:[^;]*transform[^;]*var\(--duration-/);
    expect(rules('.tabs button.is-on::after')).toMatch(/transform:\s*scaleX\(1\)/);
  });

  it('draw the tab labels from the type scale', () => {
    expect(rules('.tabs button')).toMatch(/var\(--text-(sm|base)\)/);
  });
});
