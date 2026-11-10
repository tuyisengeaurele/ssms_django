import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Surfaces, tiles and tables carry the hierarchy of a page. They separate the same way everywhere (a hairline, the
// edge of light, a soft shadow, all from the elevation tokens), they name things in plain sentence case, they set
// numbers in tabular figures, and only a card that can be clicked reacts to the pointer.

const css = readFileSync(join(__dirname, 'components.css'), 'utf8');

/** The first rule whose selector list contains `selector`, as text. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = css.match(new RegExp(`(?:^|\\n)(?:[^{}\\n]*,\\s*)*${escaped}\\s*(?:,[^{]*)?\\{[^}]*\\}`));
  return found ? found[0] : '';
}

describe('surfaces', () => {
  it.each(['.card', '.panel', '.table-container', '.chart-card', '.stat-tile'])('%s is lifted with the raised elevation token', (selector) => {
    const text = rule(selector);
    expect(text, selector).not.toBe('');
    expect(text).toContain('var(--elev-raised)');
    expect(text).not.toMatch(/box-shadow:[^;]*rgba?\(/);
  });

  it('lifts a clickable card to the floating level and nothing else reacts to the pointer', () => {
    expect(rule('.card-hover:hover')).toContain('var(--elev-floating)');
    for (const passive of ['.card:hover', '.panel:hover', '.stat-tile:hover', '.table-container:hover']) {
      expect(css, passive).not.toContain(passive);
    }
  });

  it('sets titles in the display face from the type scale', () => {
    expect(rule('.panel-title')).toMatch(/var\(--font-display\)/);
    expect(rule('.panel-title')).toMatch(/var\(--text-lg\)/);
  });
});

describe('tiles and tables', () => {
  it('names a tile and a column in sentence case, not capitals', () => {
    expect(rule('.stat-tile-label')).not.toMatch(/text-transform:\s*uppercase/);
    expect(rule('th')).not.toMatch(/text-transform:\s*uppercase/);
  });

  it('sets a tile value and a table cell in tabular figures', () => {
    expect(rule('.stat-tile-value')).toMatch(/tabular-nums/);
    expect(rule('td')).toMatch(/tabular-nums/);
  });

  it('uses the type scale for the small text of a tile and a column', () => {
    expect(rule('.stat-tile-label')).toMatch(/var\(--text-(xs|sm)\)/);
    expect(rule('th')).toMatch(/var\(--text-(xs|sm)\)/);
  });
});

describe('the harvest hint under a date', () => {
  it('is a quiet line of text from the type scale, and turns amber or red only from tokens', () => {
    const base = rule('.cell-hint');
    expect(base).toMatch(/var\(--text-xs\)/);
    expect(base).toMatch(/color:\s*var\(--text-muted\)/);
    expect(rule('.cell-hint[data-kind="late"]')).toMatch(/color:\s*var\(--danger-ink\)/);
    expect(rule('.cell-hint[data-kind="today"]')).toMatch(/color:\s*var\(--tone-yellow\)/);
    for (const text of [base, rule('.cell-hint[data-kind="late"]'), rule('.cell-hint[data-kind="today"]')]) expect(text).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });
});
