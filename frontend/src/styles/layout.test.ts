import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A dashboard is a strip of what needs attention, then a body: the data in the main column and the calendar in a rail.
// On a phone it is one column with the rail first, because the next days matter more than a chart. Quick actions are
// links that look like cards and react to the pointer, so they get the raised and floating levels and a focus ring.

const source = readFileSync(join(__dirname, 'components.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The stylesheet without its media blocks, balanced braces and all. What is left is what applies everywhere. */
function withoutMedia(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('@media', i)) {
      let depth = 0;
      let j = text.indexOf('{', i);
      for (; j < text.length; j += 1) {
        if (text[j] === '{') depth += 1;
        if (text[j] === '}' && --depth === 0) break;
      }
      i = j + 1;
    } else {
      out += text[i];
      i += 1;
    }
  }
  return out;
}

const css = source;
const base = withoutMedia(source);

function rules(selector: string, from = base): string {
  const out: string[] = [];
  for (const match of from.matchAll(/(^|\n)\s*([^{}@\n][^{}]*)\{([^}]*)\}/g)) {
    if (match[2].split(',').some((s) => s.trim() === selector)) out.push(match[0]);
  }
  return out.join('\n');
}

const wide = css.match(/@media \(min-width: 1100px\)\s*\{[^@]*?\.dash-body[\s\S]*?\n\}/)?.[0] ?? '';

describe('dashboard layout', () => {
  it('is one column by default, with the rail before the data', () => {
    expect(rules('.dash-body')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/);
    expect(rules('.dash-rail')).toMatch(/order:\s*-1/);
  });

  it('puts the rail beside the data from 1100 px, and keeps it in view only there', () => {
    expect(wide).toMatch(/\.dash-body\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*340px/);
    expect(wide).toMatch(/\.dash-rail\s*\{[^}]*order:\s*0/);
    expect(wide).toMatch(/\.dash-rail\s*\{[^}]*position:\s*sticky/);
    expect(rules('.dash-rail')).not.toMatch(/position:\s*sticky/);
  });

  it('lets a column shrink instead of pushing the page sideways', () => {
    expect(rules('.dash-body')).toMatch(/minmax\(0,\s*1fr\)/);
    expect(rules('.dash-main')).toMatch(/min-width:\s*0/);
  });
});

describe('quick actions', () => {
  it('are cards laid out in as many columns as fit', () => {
    expect(rules('.qa-list')).toMatch(/grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(/);
  });

  it('are at least 44 px tall, raised, and float on hover', () => {
    expect(rules('.qa-card')).toMatch(/min-height:\s*(4[4-9]|5\d)px/);
    expect(rules('.qa-card')).toContain('var(--elev-raised)');
    expect(rules('.qa-card:hover')).toContain('var(--elev-floating)');
  });

  it('show keyboard focus', () => {
    expect(rules('.qa-card:focus-visible')).toMatch(/outline:\s*2px solid/);
  });

  it('lift by a pixel only for people who have not asked for less motion', () => {
    const calm = css.split('@media (prefers-reduced-motion: no-preference)').slice(1).join('\n');
    expect(calm).toMatch(/\.qa-card:hover\s*\{[^}]*translateY\(-1px\)/);
    expect(css.split('@media (prefers-reduced-motion: no-preference)')[0]).not.toMatch(/\.qa-card:hover\s*\{[^}]*transform/);
  });

  it('are coloured from tokens only', () => {
    expect(['.qa-card', '.qa-icon', '.qa-count'].map((s) => rules(s)).join('\n')).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });
});
