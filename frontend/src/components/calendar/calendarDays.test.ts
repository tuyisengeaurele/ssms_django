import { describe, expect, it } from 'vitest';
import { addDays, addMonths, daysBetween, fetchWindow, gridDays, localIsoDay, weekdayIndex } from './calendarDays';

// The calendar thinks in whole days written like 2026-11-05, never in moments, so a time zone or a clock change cannot
// move an event to another square.

describe('gridDays', () => {
  it('is six weeks of seven days, Monday first, with the edge days of the months around', () => {
    const days = gridDays(2026, 10);
    expect(days).toHaveLength(42);
    // 1 November 2026 is a Sunday, so the grid starts on the Monday before it.
    expect(days[0]).toBe('2026-10-26');
    expect(days[6]).toBe('2026-11-01');
    expect(days[41]).toBe('2026-12-06');
    expect(days.filter((d) => d.startsWith('2026-11'))).toHaveLength(30);
  });

  it('starts on the 1st when the month begins on a Monday', () => {
    expect(gridDays(2026, 5)[0]).toBe('2026-06-01');
  });

  it('can start the week on Sunday', () => {
    expect(gridDays(2026, 10, false)[0]).toBe('2026-11-01');
  });

  it('crosses a year without a gap', () => {
    const days = gridDays(2026, 11);
    expect(days.includes('2026-12-31')).toBe(true);
    expect(days.includes('2027-01-01')).toBe(true);
    expect(new Set(days).size).toBe(42);
  });
});

describe('dates', () => {
  it('adds days across month and year ends and in a leap year', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-11-05', -5)).toBe('2026-10-31');
  });

  it('adds months and keeps the day inside a shorter month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('counts the days between two days', () => {
    expect(daysBetween('2026-11-01', '2026-11-30')).toBe(29);
    expect(daysBetween('2026-11-30', '2026-11-01')).toBe(-29);
  });

  it('numbers the weekday from Monday', () => {
    expect(weekdayIndex('2026-11-02')).toBe(0);
    expect(weekdayIndex('2026-11-08')).toBe(6);
  });

  it('writes the local day of a date the way the person sees it', () => {
    expect(localIsoDay(new Date(2026, 10, 5, 23, 30))).toBe('2026-11-05');
    expect(localIsoDay(new Date(2026, 0, 2, 0, 5))).toBe('2026-01-02');
  });
});

describe('fetchWindow', () => {
  const days = gridDays(2026, 10);

  it('covers the whole grid, so the days of the months around show their events', () => {
    expect(fetchWindow(days, '2026-11-12')).toEqual({ from: '2026-10-26', to: '2026-12-06' });
  });

  it('also covers the next 14 days from today, which the phone agenda shows', () => {
    expect(fetchWindow(days, '2026-12-01')).toEqual({ from: '2026-10-26', to: '2026-12-14' });
  });

  it('reaches back to today when the month on screen is later', () => {
    const later = gridDays(2027, 0);
    const window = fetchWindow(later, '2026-11-12');
    expect(window.from).toBe('2026-11-12');
    expect(daysBetween(window.from, window.to)).toBeLessThan(100);
  });

  it('never asks for more than the server allows, and then keeps the grid', () => {
    const far = gridDays(2027, 6);
    const window = fetchWindow(far, '2026-11-12');
    expect(daysBetween(window.from, window.to)).toBeLessThan(100);
    expect(window.from <= far[0] && window.to >= far[41]).toBe(true);
  });
});
