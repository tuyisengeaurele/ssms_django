import { describe, expect, it } from 'vitest';
import { timeAgo } from './timeAgo';

const NOW = new Date('2026-10-08T12:00:00Z').getTime();
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

describe('timeAgo', () => {
  it('says now for a few seconds', () => {
    expect(timeAgo(ago(5), 'en', NOW)).toBe('now');
  });

  it('counts minutes, hours and days', () => {
    expect(timeAgo(ago(5 * 60), 'en', NOW)).toBe('5 minutes ago');
    expect(timeAgo(ago(3 * 3600), 'en', NOW)).toBe('3 hours ago');
    expect(timeAgo(ago(2 * 86400), 'en', NOW)).toBe('2 days ago');
  });

  it('uses the singular for one', () => {
    expect(timeAgo(ago(60), 'en', NOW)).toBe('1 minute ago');
    expect(timeAgo(ago(3600), 'en', NOW)).toBe('1 hour ago');
  });

  it('speaks French when asked', () => {
    expect(timeAgo(ago(5 * 60), 'fr', NOW)).toMatch(/5 minutes/);
    expect(timeAgo(ago(5 * 60), 'fr', NOW)).toMatch(/il y a/);
  });

  it('switches to a date after a month', () => {
    expect(timeAgo(ago(40 * 86400), 'en', NOW)).toBe('Aug 29, 2026');
  });

  it('never shows a future time as negative', () => {
    expect(timeAgo(new Date(NOW + 60_000).toISOString(), 'en', NOW)).toBe('now');
  });
});
