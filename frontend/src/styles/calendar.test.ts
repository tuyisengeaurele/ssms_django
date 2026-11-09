import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The calendar is a grid of buttons. Each day is a comfortable target, shows keyboard focus, and is coloured only from
// tokens. On a phone the grid gives way to the agenda, and on a wide screen the agenda gives way to the grid.

const css = readFileSync(join(__dirname, 'components.css'), 'utf8');

/** All rules whose selector contains `selector`, joined. */
function rules(selector: string): string {
  const out: string[] = [];
  for (const match of css.matchAll(/(^|\n)([^{}@\n][^{}]*)\{([^}]*)\}/g)) {
    if (match[2].includes(selector)) out.push(match[0]);
  }
  return out.join('\n');
}

const calendarCss = css.slice(css.indexOf('/* ── Calendar'), css.indexOf('/* ── Calendar') + 9000);

describe('calendar styles', () => {
  it('has a calendar section', () => {
    expect(css).toContain('/* ── Calendar');
  });

  it('makes a day a touch target of at least 44 px', () => {
    expect(rules('.cal-day')).toMatch(/min-height:\s*(44px|2\.75rem)/);
  });

  it('shows keyboard focus on a day with the ring', () => {
    expect(rules('.cal-day:focus-visible')).toMatch(/outline:\s*2px solid/);
  });

  it('marks today and the chosen day, and tones down the days of the other months', () => {
    expect(rules('.cal-day[data-today="true"]')).not.toBe('');
    expect(rules('.cal-day[data-selected="true"]')).not.toBe('');
    expect(rules('.cal-day[data-outside="true"]')).not.toBe('');
  });

  it('draws a dot for each kind of event from the chart tokens', () => {
    for (const kind of ['batch_started', 'harvest_expected', 'harvest_recorded', 'disease_check', 'stage_changed', 'round_deadline', 'round_delivery']) {
      expect(rules(`.cal-dot[data-kind="${kind}"]`), kind).toMatch(/var\(--chart-\d\)/);
    }
  });

  it('is coloured from tokens and never by hand', () => {
    expect(calendarCss).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });

  it('takes its transition times from the duration tokens', () => {
    for (const line of calendarCss.split('\n').filter((l) => /transition\s*:/.test(l))) expect(line).toMatch(/var\(--duration-/);
  });

  it('shows the agenda and hides the grid on a phone, and the other way round on a wide screen', () => {
    expect(css).toMatch(/@media \(max-width: 700px\)\s*\{[^@]*\.cal-grid-wrap[^{]*\{[^}]*display:\s*none/);
    expect(css).toMatch(/@media \(max-width: 700px\)\s*\{[^@]*\.cal-day-list[^{]*\{[^}]*display:\s*none/);
    expect(css).toMatch(/@media \(min-width: 701px\)\s*\{[^@]*\.cal-agenda\s*\{[^}]*display:\s*none/);
  });

  it('lays the grid out in seven columns', () => {
    expect(rules('.cal-grid')).toMatch(/grid-template-columns:\s*repeat\(7,/);
  });
});
