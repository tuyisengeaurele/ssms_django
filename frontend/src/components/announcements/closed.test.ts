import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Announcement, AnnouncementKind } from '../../types';
import { announcementKey, readClosed, rememberClosed, visibleAnnouncements } from './closed';

const STORE = 'ssms_closed_announcements';
const one = (id: number, kind: AnnouncementKind = 'information', version = 1): Announcement => ({
  id, kind, version, text: { en: `Notice ${id}`, fr: '', rw: '' }, showUntil: '2027-01-01T00:00:00+00:00',
});
const ids = (items: Announcement[]) => items.map((a) => a.id);

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('Which announcements are shown', () => {
  it('shows two at most, in the order they came', () => {
    expect(ids(visibleAnnouncements([one(1), one(2), one(3)], new Set()))).toEqual([1, 2]);
  });

  it('skips a closed one and brings the next', () => {
    expect(ids(visibleAnnouncements([one(1), one(2), one(3)], new Set(['1.1'])))).toEqual([2, 3]);
  });

  it('shows an urgent one whatever the device remembers', () => {
    expect(ids(visibleAnnouncements([one(1, 'urgent')], new Set(['1.1'])))).toEqual([1]);
  });

  // The server moves the version on when the type or the words change.
  it('shows a closed one again once its words have changed', () => {
    const closed = rememberClosed(one(1));
    expect(ids(visibleAnnouncements([one(1, 'information', 1)], closed))).toEqual([]);
    expect(ids(visibleAnnouncements([one(1, 'information', 2)], closed))).toEqual([1]);
  });
});

describe('What this device remembers as closed', () => {
  it('keeps the number and the version', () => {
    expect(announcementKey(one(7, 'information', 3))).toBe('7.3');
    rememberClosed(one(7, 'information', 3));
    expect([...readClosed()]).toEqual(['7.3']);
    expect(JSON.parse(localStorage.getItem(STORE)!)).toEqual(['7.3']);
  });

  it('keeps the newest fifty, so it never grows for ever', () => {
    for (let id = 1; id <= 55; id += 1) rememberClosed(one(id));
    const kept = [...readClosed()];
    expect(kept).toHaveLength(50);
    expect(kept[0]).toBe('6.1');
    expect(kept[49]).toBe('55.1');
  });

  it('writes one closed twice only once', () => {
    rememberClosed(one(1));
    rememberClosed(one(2));
    rememberClosed(one(1));
    expect([...readClosed()]).toEqual(['2.1', '1.1']);
  });

  it.each(['not json', '{"a":1}', 'null', '7'])('reads a spoiled store (%s) as nothing closed', (value) => {
    localStorage.setItem(STORE, value);
    expect(readClosed().size).toBe(0);
  });

  it('leaves out entries that are not words', () => {
    localStorage.setItem(STORE, '["1.1", 5, null, {"x":1}]');
    expect([...readClosed()]).toEqual(['1.1']);
  });

  it('does not break when storage is blocked, and still says what was just closed', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readClosed().size).toBe(0);
    expect([...rememberClosed(one(1))]).toEqual(['1.1']);
  });
});
