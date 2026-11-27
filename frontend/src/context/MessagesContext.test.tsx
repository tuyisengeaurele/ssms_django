import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({ updates: vi.fn() }));
vi.mock('../services/message.service', () => ({ messageService: service }));
const auth = vi.hoisted(() => ({ value: { user: { id: 'u1', role: 'FARMER' } as { id: string; role: string } | null, acting: null as null | object } }));
vi.mock('./AuthContext', () => ({ useAuth: () => auth.value }));

import { MessagesProvider, useMessages } from './MessagesContext';

const news = (unreadTotal: number, conversation: object | null = null) => ({ unreadTotal, conversation });
const watched = { isOpen: true, otherReadAt: null, messages: [] };

let visibility: DocumentVisibilityState = 'visible';
const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const turn = async (to: DocumentVisibilityState) => {
  visibility = to;
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    if (to === 'visible') window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
  });
};

const wrapper = ({ children }: { children: ReactNode }) => createElement(MessagesProvider, null, children);
async function open() {
  const view = renderHook(() => useMessages(), { wrapper });
  await wait(0);
  return view;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  auth.value = { user: { id: 'u1', role: 'FARMER' }, acting: null };
  service.updates.mockResolvedValue(news(3));
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('The one check for new messages', () => {
  it.each(['FARMER', 'SUPERVISOR'])('asks on opening and then every 30 seconds, for a %s', async (role) => {
    auth.value = { user: { id: 'u1', role }, acting: null };
    const view = await open();
    expect(service.updates).toHaveBeenCalledTimes(1);
    expect(view.result.current.unread).toBe(3);
    await wait(29_999);
    expect(service.updates).toHaveBeenCalledTimes(1);
    await wait(1);
    expect(service.updates).toHaveBeenCalledTimes(2);
    await wait(60_000);
    expect(service.updates).toHaveBeenCalledTimes(4);
  });

  it('asks nothing while the tab is hidden, and once on coming back', async () => {
    await open();
    await turn('hidden');
    await wait(10 * 60_000);
    expect(service.updates).toHaveBeenCalledTimes(1);
    await turn('visible');
    expect(service.updates).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['an admin', { user: { id: 'a', role: 'ADMIN' }, acting: null }],
    ['an admin looking at an account', { user: { id: 'u1', role: 'FARMER' }, acting: { id: 'a' } }],
    ['nobody', { user: null, acting: null }],
  ])('never asks for %s', async (_, value) => {
    auth.value = value;
    const view = await open();
    await wait(5 * 60_000);
    await turn('hidden');
    await turn('visible');
    expect(service.updates).not.toHaveBeenCalled();
    expect(view.result.current.unread).toBe(0);
  });

  it('keeps the last count when there is no news', async () => {
    const view = await open();
    service.updates.mockResolvedValue(null);
    await wait(30_000);
    expect(view.result.current.unread).toBe(3);
  });

  it('has one request on its way at a time', async () => {
    service.updates.mockReturnValue(new Promise(() => {}));
    await open();
    await wait(5 * 60_000);
    await turn('hidden');
    await turn('visible');
    expect(service.updates).toHaveBeenCalledTimes(1);
  });

  it('stops when the app is left', async () => {
    const view = await open();
    view.unmount();
    await wait(5 * 60_000);
    expect(service.updates).toHaveBeenCalledTimes(1);
  });

  it('takes a count the page already knows, at once', async () => {
    const view = await open();
    act(() => { view.result.current.setUnread(0); });
    expect(view.result.current.unread).toBe(0);
  });
});

describe('The open conversation', () => {
  it('is asked about with where the page has got to, and told what came', async () => {
    const view = await open();
    let since = '2026-11-27T10:00:00+00:00';
    const told = vi.fn();
    service.updates.mockResolvedValue(news(1, watched));
    act(() => { view.result.current.watch({ id: 'c1', since: () => since }, told); });
    await wait(30_000);
    expect(service.updates).toHaveBeenLastCalledWith('c1', since);
    expect(told).toHaveBeenCalledWith(watched);
    since = '2026-11-27T10:05:00+00:00';
    await wait(30_000);
    expect(service.updates).toHaveBeenLastCalledWith('c1', since);
    expect(view.result.current.unread).toBe(1);
  });

  it('is no longer asked about once it is closed', async () => {
    const view = await open();
    let stop = () => {};
    act(() => { stop = view.result.current.watch({ id: 'c1', since: () => 'x' }, vi.fn()); });
    act(() => { stop(); });
    await wait(30_000);
    expect(service.updates).toHaveBeenLastCalledWith(undefined, undefined);
  });

  // The person moves to another conversation while the question about the first one is still on its way.
  it('is not told what came for the one that was open before', async () => {
    const view = await open();
    let answer: (value: unknown) => void = () => {};
    service.updates.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    const first = vi.fn();
    const second = vi.fn();
    let stop = () => {};
    act(() => { stop = view.result.current.watch({ id: 'c1', since: () => 'x' }, first); });
    await wait(30_000);
    act(() => { stop(); view.result.current.watch({ id: 'c2', since: () => 'y' }, second); });
    await act(async () => { answer(news(2, watched)); await vi.advanceTimersByTimeAsync(0); });
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    expect(view.result.current.unread).toBe(2);
  });

  // Closing the one before must not stop the watch on the one open now.
  it('keeps watching the new one when the old one is closed late', async () => {
    const view = await open();
    let stopFirst = () => {};
    act(() => { stopFirst = view.result.current.watch({ id: 'c1', since: () => 'x' }, vi.fn()); });
    act(() => { view.result.current.watch({ id: 'c2', since: () => 'y' }, vi.fn()); stopFirst(); });
    await wait(30_000);
    expect(service.updates).toHaveBeenLastCalledWith('c2', 'y');
  });
});

describe('Without the provider', () => {
  it('reads as nothing unread, and watching does nothing', () => {
    const view = renderHook(() => useMessages());
    expect(view.result.current.unread).toBe(0);
    expect(() => view.result.current.watch(null, vi.fn())()).not.toThrow();
  });
});
