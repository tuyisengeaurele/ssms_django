import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupportPersonRow } from '../types';

const support = vi.hoisted(() => ({ pending: vi.fn() }));
vi.mock('../services/support.service', () => ({ supportService: support }));

import { useSupportWatch } from './useSupportWatch';

const waiting = { id: 'r1', status: 'requested', admin: { name: 'Ange Admin' } } as SupportPersonRow;
const running = { id: 'r2', status: 'active', admin: { name: 'Ange Admin' } } as SupportPersonRow;
const answer = (request: SupportPersonRow | null, active: SupportPersonRow | null) => ({ data: { data: { request, active } } });

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  support.pending.mockResolvedValue(answer(null, null));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Watching for a support request', () => {
  it('asks at once and then every 30 seconds while the tab is visible', async () => {
    renderHook(() => useSupportWatch(true));
    await tick(0);
    expect(support.pending).toHaveBeenCalledTimes(1);
    await tick(30_000);
    expect(support.pending).toHaveBeenCalledTimes(2);
    await tick(30_000);
    expect(support.pending).toHaveBeenCalledTimes(3);
  });

  it('makes no call at all while the tab is hidden', async () => {
    setVisibility('hidden');
    renderHook(() => useSupportWatch(true));
    await tick(0);
    await tick(120_000);
    expect(support.pending).not.toHaveBeenCalled();
  });

  it('asks once when a hidden tab becomes visible', async () => {
    setVisibility('hidden');
    renderHook(() => useSupportWatch(true));
    await tick(60_000);
    setVisibility('visible');
    await tick(0);
    expect(support.pending).toHaveBeenCalledTimes(1);
  });

  it('asks once when the window gets focus', async () => {
    renderHook(() => useSupportWatch(true));
    await tick(0);
    support.pending.mockClear();
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await tick(0);
    expect(support.pending).toHaveBeenCalledTimes(1);
  });

  it('never asks when it is not enabled, such as for an admin or while acting', async () => {
    renderHook(() => useSupportWatch(false));
    await tick(0);
    await tick(90_000);
    expect(support.pending).not.toHaveBeenCalled();
  });

  it('gives back the waiting request and the running visit', async () => {
    support.pending.mockResolvedValue(answer(waiting, running));
    const { result } = renderHook(() => useSupportWatch(true));
    await tick(0);
    expect(result.current.request).toEqual(waiting);
    expect(result.current.active).toEqual(running);
  });

  it('keeps what it had when the server cannot be reached', async () => {
    support.pending.mockResolvedValueOnce(answer(waiting, null)).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useSupportWatch(true));
    await tick(0);
    await tick(30_000);
    expect(result.current.request).toEqual(waiting);
  });

  it('forgets everything when it is switched off', async () => {
    support.pending.mockResolvedValue(answer(waiting, null));
    const { result, rerender } = renderHook(({ on }) => useSupportWatch(on), { initialProps: { on: true } });
    await tick(0);
    expect(result.current.request).toEqual(waiting);
    rerender({ on: false });
    expect(result.current.request).toBeNull();
  });

  it('refreshes on demand', async () => {
    const { result } = renderHook(() => useSupportWatch(true));
    await tick(0);
    support.pending.mockResolvedValue(answer(null, running));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.active).toEqual(running);
  });

  it('stops asking when the page goes away', async () => {
    const { unmount } = renderHook(() => useSupportWatch(true));
    await tick(0);
    unmount();
    support.pending.mockClear();
    await tick(120_000);
    expect(support.pending).not.toHaveBeenCalled();
  });
});
