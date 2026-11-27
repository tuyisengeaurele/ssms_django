import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Announcement, AnnouncementKind } from '../types';

const service = vi.hoisted(() => ({ current: vi.fn(), visitor: vi.fn() }));
vi.mock('../services/announcement.service', () => ({ announcementService: service }));

import { readClosed } from '../components/announcements/closed';
import { setAccessToken } from '../services/session';
import { useAnnouncements, type AnnouncementsMode } from './useAnnouncements';

const MINUTE = 60_000;
const one = (id: number, kind: AnnouncementKind = 'information'): Announcement => ({
  id, kind, version: 1, text: { en: `Notice ${id}`, fr: '', rw: '' }, showUntil: '2027-01-01T00:00:00+00:00',
});

let visibility: DocumentVisibilityState = 'visible';
const turn = async (to: DocumentVisibilityState) => {
  visibility = to;
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
  });
};
const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

const wrapper = ({ children }: { children: ReactNode }) => createElement(MemoryRouter, null, children);

async function open(mode: AnnouncementsMode) {
  const view = renderHook(() => ({ ...useAnnouncements(mode), go: useNavigate() }), { wrapper });
  await wait(0);
  const go = async (to: string) => {
    act(() => { view.result.current.go(to); });
    await wait(0);
  };
  const shown = () => view.result.current.items.map((a) => a.id);
  return { ...view, go, shown };
}

const asked = () => service.current.mock.calls.length + service.visitor.mock.calls.length;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  setAccessToken(null);
  service.current.mockResolvedValue([one(1)]);
  service.visitor.mockResolvedValue([one(2)]);
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('Which route is asked', () => {
  it('is the signed in one in the app', async () => {
    const view = await open('app');
    expect(view.shown()).toEqual([1]);
    expect(service.visitor).not.toHaveBeenCalled();
  });

  it.each(['visitor-live', 'visitor-once'] as const)('is the public one for a visitor (%s)', async (mode) => {
    const view = await open(mode);
    expect(view.shown()).toEqual([2]);
    expect(service.current).not.toHaveBeenCalled();
  });

  // The phone and closure screens look like the sign in page but the person is signed in.
  it('is the signed in one on a public looking page when the person holds a token', async () => {
    setAccessToken('held');
    const view = await open('visitor-live');
    expect(view.shown()).toEqual([1]);
    expect(service.visitor).not.toHaveBeenCalled();
  });
});

describe('When it asks', () => {
  it.each(['app', 'visitor-live'] as const)('asks once on opening, then every five minutes (%s)', async (mode) => {
    await open(mode);
    expect(asked()).toBe(1);
    await wait(5 * MINUTE - 1);
    expect(asked()).toBe(1);
    await wait(1);
    expect(asked()).toBe(2);
    await wait(5 * MINUTE);
    expect(asked()).toBe(3);
  });

  it('asks nothing while the tab is hidden, and once on coming back after a long absence', async () => {
    await open('app');
    await turn('hidden');
    await wait(60 * MINUTE);
    expect(asked()).toBe(1);
    await turn('visible');
    expect(asked()).toBe(2);
    await wait(5 * MINUTE);
    expect(asked()).toBe(3);
  });

  it('does not ask again after a short look away', async () => {
    await open('app');
    await turn('hidden');
    await wait(MINUTE);
    await turn('visible');
    expect(asked()).toBe(1);
    await wait(4 * MINUTE);
    expect(asked()).toBe(2);
  });

  it.each(['app', 'visitor-once'] as const)('waits until a tab opened in the background is looked at (%s)', async (mode) => {
    visibility = 'hidden';
    await open(mode);
    await wait(30 * MINUTE);
    expect(asked()).toBe(0);
    await turn('visible');
    expect(asked()).toBe(1);
  });

  it('asks on a change of page in the app, at most once a minute', async () => {
    const view = await open('app');
    await view.go('/farms');
    expect(asked()).toBe(1);
    await wait(MINUTE);
    await view.go('/batches');
    expect(asked()).toBe(2);
    await view.go('/alerts');
    expect(asked()).toBe(2);
  });

  it('pays no attention to a change of page for a visitor', async () => {
    const view = await open('visitor-live');
    await wait(2 * MINUTE);
    await view.go('/register');
    expect(asked()).toBe(1);
  });

  it('asks once and no more where a forgotten tab must not keep the server awake', async () => {
    const view = await open('visitor-once');
    await wait(60 * MINUTE);
    await turn('hidden');
    await wait(60 * MINUTE);
    await turn('visible');
    await view.go('/privacy');
    await wait(60 * MINUTE);
    expect(asked()).toBe(1);
  });

  it('does not ask again while an answer is on its way', async () => {
    service.current.mockReturnValue(new Promise(() => {}));
    await open('app');
    await wait(20 * MINUTE);
    await turn('hidden');
    await turn('visible');
    expect(asked()).toBe(1);
  });

  it('stops when the page goes away', async () => {
    const view = await open('app');
    view.unmount();
    await wait(60 * MINUTE);
    await turn('visible');
    expect(asked()).toBe(1);
  });
});

describe('What it shows', () => {
  it('keeps what it had when there is no news', async () => {
    const view = await open('app');
    service.current.mockResolvedValue(null);
    await wait(5 * MINUTE);
    expect(view.shown()).toEqual([1]);
  });

  it('takes down what has ended', async () => {
    const view = await open('app');
    service.current.mockResolvedValue([]);
    await wait(5 * MINUTE);
    expect(view.shown()).toEqual([]);
  });

  it('closes one, remembers it on this device, and brings the next', async () => {
    service.current.mockResolvedValue([one(1, 'urgent'), one(2), one(3)]);
    const view = await open('app');
    expect(view.shown()).toEqual([1, 2]);
    act(() => { view.result.current.close(one(2)); });
    expect(view.shown()).toEqual([1, 3]);
    expect([...readClosed()]).toEqual(['2.1']);
  });

  it('starts with what the device had closed before', async () => {
    localStorage.setItem('ssms_closed_announcements', '["1.1"]');
    expect((await open('app')).shown()).toEqual([]);
  });

  it('keeps earlier ones closed when the device cannot remember', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    service.current.mockResolvedValue([one(1), one(2), one(3)]);
    const view = await open('app');
    act(() => { view.result.current.close(one(1)); });
    act(() => { view.result.current.close(one(2)); });
    expect(view.shown()).toEqual([3]);
    vi.restoreAllMocks();
  });
});
