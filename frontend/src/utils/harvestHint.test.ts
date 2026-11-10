import { describe, expect, it } from 'vitest';
import { harvestHint } from './harvestHint';

// "How long is left" for a batch, in whole days on the person's own calendar. A batch already at the harvest stage has
// nothing left to count, so it gets no hint.

const now = new Date(2026, 10, 10, 15, 30).getTime();
const at = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h).toISOString();

describe('harvestHint', () => {
  it('counts the whole days left', () => {
    expect(harvestHint(at(2026, 11, 25), 'LARVA', now)).toEqual({ kind: 'left', days: 15 });
  });

  it('says tomorrow and today in their own words', () => {
    expect(harvestHint(at(2026, 11, 11), 'LARVA', now)).toEqual({ kind: 'tomorrow', days: 1 });
    expect(harvestHint(at(2026, 11, 10), 'LARVA', now)).toEqual({ kind: 'today', days: 0 });
  });

  it('counts the days a harvest is late', () => {
    expect(harvestHint(at(2026, 11, 9), 'COCOON', now)).toEqual({ kind: 'late', days: 1 });
    expect(harvestHint(at(2026, 11, 1), 'COCOON', now)).toEqual({ kind: 'late', days: 9 });
  });

  it('goes by the calendar day, not by the hour, so late in the evening is still today', () => {
    expect(harvestHint(at(2026, 11, 10, 1), 'PUPA', new Date(2026, 10, 10, 23, 59).getTime())).toEqual({ kind: 'today', days: 0 });
    expect(harvestHint(at(2026, 11, 11, 23), 'PUPA', new Date(2026, 10, 10, 0, 1).getTime())).toEqual({ kind: 'tomorrow', days: 1 });
  });

  it('crosses a month and a year end', () => {
    expect(harvestHint(at(2027, 1, 5), 'EGG', new Date(2026, 11, 30, 12).getTime())).toEqual({ kind: 'left', days: 6 });
  });

  it('gives no hint for a batch at the harvest stage', () => {
    expect(harvestHint(at(2026, 11, 25), 'HARVEST', now)).toBeNull();
    expect(harvestHint(at(2026, 11, 1), 'HARVEST', now)).toBeNull();
  });

  it('gives no hint when the date cannot be read', () => {
    expect(harvestHint('', 'LARVA', now)).toBeNull();
    expect(harvestHint('not a date', 'LARVA', now)).toBeNull();
  });
});
