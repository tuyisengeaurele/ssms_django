import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIdleTimeout } from './useIdleTimeout';

const MINUTE = 60_000;

/** A tab-to-tab channel, because jsdom has none. Every instance with the same name hears the others. */
class FakeChannel {
  static all: FakeChannel[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  closed = false;
  constructor(public name: string) {
    FakeChannel.all.push(this);
  }
  postMessage(data: unknown) {
    for (const other of FakeChannel.all) {
      if (other !== this && other.name === this.name && !other.closed) other.onmessage?.({ data });
    }
  }
  close() {
    this.closed = true;
  }
}

function setup(limitSeconds: number | null = 900) {
  const onExpire = vi.fn();
  const onPing = vi.fn();
  const view = renderHook(() => useIdleTimeout({ limitSeconds, onExpire, onPing }));
  return { ...view, onExpire, onPing };
}

const pass = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  FakeChannel.all = [];
  vi.stubGlobal('BroadcastChannel', FakeChannel);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useIdleTimeout', () => {
  it('does nothing for someone with no limit', () => {
    const { result, onExpire, onPing } = setup(null);
    pass(5 * 60 * MINUTE);
    expect(result.current.warning).toBe(false);
    expect(onExpire).not.toHaveBeenCalled();
    expect(onPing).not.toHaveBeenCalled();
    expect(FakeChannel.all).toHaveLength(0);
  });

  it('warns 60 seconds before the limit and counts down', () => {
    const { result } = setup(900);
    pass(13 * MINUTE + 59_000);
    expect(result.current.warning).toBe(false);
    pass(1_000);
    expect(result.current.warning).toBe(true);
    expect(result.current.secondsLeft).toBe(60);
    pass(10_000);
    expect(result.current.secondsLeft).toBe(50);
  });

  it('signs out once, when the limit is reached', () => {
    const { result, onExpire } = setup(900);
    pass(15 * MINUTE - 1_000);
    expect(onExpire).not.toHaveBeenCalled();
    pass(1_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    pass(5 * MINUTE);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(result.current.warning).toBe(false);
  });

  it('starts counting again after any activity before the warning', () => {
    const { result, onExpire } = setup(900);
    pass(10 * MINUTE);
    fireEvent.keyDown(window, { key: 'a' });
    pass(10 * MINUTE);
    expect(result.current.warning).toBe(false);
    expect(onExpire).not.toHaveBeenCalled();
    pass(5 * MINUTE);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it.each(['pointerdown', 'pointermove', 'keydown', 'touchstart', 'scroll'])('counts %s as activity', (type) => {
    const { onExpire } = setup(900);
    pass(13 * MINUTE);
    fireEvent(window, new Event(type));
    pass(13 * MINUTE);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('ignores activity once the warning is on, so only an answer dismisses it', () => {
    const { result } = setup(900);
    pass(14 * MINUTE);
    pass(5_000);
    expect(result.current.warning).toBe(true);
    fireEvent.pointerMove(window);
    pass(1_000);
    expect(result.current.warning).toBe(true);
  });

  it('stay clears the warning, starts the count again and pings the server', () => {
    const { result, onExpire, onPing } = setup(900);
    pass(14 * MINUTE + 10_000);
    expect(result.current.warning).toBe(true);
    act(() => result.current.stay());
    expect(result.current.warning).toBe(false);
    expect(onPing).toHaveBeenCalledTimes(1);
    pass(14 * MINUTE);
    expect(onExpire).not.toHaveBeenCalled();
    pass(1 * MINUTE);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('activity in another tab clears the warning here', () => {
    const { result } = setup(900);
    const other = new FakeChannel('ssms-activity');
    pass(14 * MINUTE + 10_000);
    expect(result.current.warning).toBe(true);
    act(() => other.postMessage({ type: 'activity', at: Date.now() }));
    pass(1_000);
    expect(result.current.warning).toBe(false);
  });

  it('shares its own activity with the other tabs, at most once a second', () => {
    setup(900);
    const heard: unknown[] = [];
    const other = new FakeChannel('ssms-activity');
    other.onmessage = (e) => heard.push(e.data);
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'b' });
    fireEvent.keyDown(window, { key: 'c' });
    expect(heard).toHaveLength(1);
    pass(1_000);
    fireEvent.keyDown(window, { key: 'd' });
    expect(heard).toHaveLength(2);
  });

  it('pings at most every 5 minutes, and only when somebody was active since the last ping', () => {
    const { onPing } = setup(900);
    pass(6 * MINUTE);
    expect(onPing).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'a' });
    pass(1_000);
    expect(onPing).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'b' });
    pass(2 * MINUTE);
    fireEvent.keyDown(window, { key: 'c' });
    pass(2 * MINUTE);
    expect(onPing).toHaveBeenCalledTimes(1);
    pass(2 * MINUTE);
    expect(onPing).toHaveBeenCalledTimes(2);
  });

  it('signs out at once when a laptop wakes after sleeping past the limit', () => {
    const { onExpire } = setup(900);
    vi.setSystemTime(Date.now() + 20 * MINUTE);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('leaves nothing running after it unmounts', () => {
    const { unmount, onExpire } = setup(900);
    unmount();
    expect(FakeChannel.all.every((c) => c.closed)).toBe(true);
    pass(30 * MINUTE);
    expect(onExpire).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps working in a browser with no tab channel', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const { result, onExpire } = setup(900);
    pass(14 * MINUTE + 5_000);
    expect(result.current.warning).toBe(true);
    pass(MINUTE);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
