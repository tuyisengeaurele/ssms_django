import { describe, expect, it } from 'vitest';
import { dateFormat } from './dateFormat';

// Browsers have no Kinyarwanda date data, so asking for "rw" quietly gives English ("Nov 25, 2026"). dateFormat gives
// Kinyarwanda month and weekday names, in the order people write them (day, month, year, 24 hour clock). English and French
// are left to the browser exactly as they were.

const wed = new Date(2026, 10, 25, 14, 5); // Wednesday 25 November 2026, 14:05
const same = (locale: string, options: Intl.DateTimeFormatOptions) => {
  expect(dateFormat(locale, options).format(wed)).toBe(new Intl.DateTimeFormat(locale, options).format(wed));
};

describe('dateFormat for English and French', () => {
  it.each(['en', 'fr'])('is the browser own formatter, unchanged, for %s', (locale) => {
    same(locale, { dateStyle: 'medium' });
    same(locale, { dateStyle: 'medium', timeStyle: 'short' });
    same(locale, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    same(locale, { hour: '2-digit', minute: '2-digit' });
  });
});

describe('dateFormat for Kinyarwanda', () => {
  const rw = (options: Intl.DateTimeFormatOptions, date = wed) => dateFormat('rw', options).format(date);

  it('writes a medium date as day, short month, year', () => {
    expect(rw({ dateStyle: 'medium' })).toBe('25 Ugu 2026');
  });

  it('writes a long date with the full month, and a full date with the weekday as well', () => {
    expect(rw({ dateStyle: 'long' })).toBe('25 Ugushyingo 2026');
    expect(rw({ dateStyle: 'full' })).toBe('Kuwa gatatu 25 Ugushyingo 2026');
  });

  it('adds the time on a 24 hour clock', () => {
    expect(rw({ dateStyle: 'medium', timeStyle: 'short' })).toBe('25 Ugu 2026, 14:05');
    expect(rw({ hour: '2-digit', minute: '2-digit' })).toBe('14:05');
  });

  it('names the month for a month and year, as a calendar title does', () => {
    expect(rw({ month: 'long', year: 'numeric' })).toBe('Ugushyingo 2026');
  });

  it('writes a short day and month, with or without a time', () => {
    expect(rw({ month: 'short', day: 'numeric' })).toBe('25 Ugu');
    expect(rw({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })).toBe('25 Ugu, 14:05');
  });

  it('names every month', () => {
    const long = Array.from({ length: 12 }, (_, i) => rw({ month: 'long' }, new Date(2026, i, 15)));
    expect(long).toEqual(['Mutarama', 'Gashyantare', 'Werurwe', 'Mata', 'Gicurasi', 'Kamena', 'Nyakanga', 'Kanama', 'Nzeri', 'Ukwakira', 'Ugushyingo', 'Ukuboza']);
    const short = Array.from({ length: 12 }, (_, i) => rw({ month: 'short' }, new Date(2026, i, 15)));
    expect(short).toEqual(['Mut', 'Gas', 'Wer', 'Mat', 'Gic', 'Kam', 'Nya', 'Kan', 'Nze', 'Ukw', 'Ugu', 'Ukb']);
  });

  it('names every weekday, Monday first in the week and Sunday last', () => {
    const days = Array.from({ length: 7 }, (_, i) => new Date(2026, 10, 23 + i)); // Mon 23 to Sun 29
    expect(days.map((d) => rw({ weekday: 'long' }, d))).toEqual(['Kuwa mbere', 'Kuwa kabiri', 'Kuwa gatatu', 'Kuwa kane', 'Kuwa gatanu', 'Kuwa gatandatu', 'Ku cyumweru']);
    expect(days.map((d) => rw({ weekday: 'short' }, d))).toEqual(['Mbe', 'Kab', 'Gtu', 'Kan', 'Gnu', 'Gnd', 'Cyu']);
  });

  it('writes a short weekday with a date', () => {
    expect(rw({ weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })).toBe('Gtu, 25 Ugu 2026');
  });

  it('leaves a numeric month as digits', () => {
    expect(rw({ day: '2-digit', month: '2-digit', year: 'numeric' })).toBe('25/11/2026');
  });

  it('accepts a number of milliseconds, and no argument for now, like the browser formatter', () => {
    expect(dateFormat('rw', { dateStyle: 'medium' }).format(wed.getTime())).toBe('25 Ugu 2026');
    expect(dateFormat('rw', { year: 'numeric' }).format()).toMatch(/^\d{4}$/);
  });

  it('stays an error for a date that is not a date, as the browser formatter does', () => {
    expect(() => dateFormat('rw', { dateStyle: 'medium' }).format(new Date('nope'))).toThrow(RangeError);
  });
});
