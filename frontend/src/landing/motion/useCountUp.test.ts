import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setReducedMotion } from '../../test/setup';
import { useCountUp } from './useCountUp';

describe('useCountUp', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the target at once when animation is switched off', () => {
    const { result } = renderHook(() => useCountUp(120, { enabled: false }));
    expect(result.current).toBe(120);
  });

  it('returns the target at once for people who prefer reduced motion', () => {
    setReducedMotion(true);
    const { result } = renderHook(() => useCountUp(120));
    expect(result.current).toBe(120);
  });

  it('waits at zero until play is true', () => {
    const { result, rerender } = renderHook(({ play }) => useCountUp(50, { play, duration: 1000 }), {
      initialProps: { play: false },
    });
    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe(0);
    rerender({ play: true });
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(result.current).toBe(50);
  });

  it('counts up and ends exactly on the target', () => {
    const { result } = renderHook(() => useCountUp(4, { duration: 1000 }));
    expect(result.current).toBe(0);
    const seen: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      act(() => {
        vi.advanceTimersByTime(100);
      });
      seen.push(result.current);
    }
    expect(Math.max(...seen)).toBeLessThanOrEqual(4);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(result.current).toBe(4);
  });

  it('shows whole numbers while counting', () => {
    const { result } = renderHook(() => useCountUp(5, { duration: 1000 }));
    act(() => {
      vi.advanceTimersByTime(333);
    });
    expect(Number.isInteger(result.current)).toBe(true);
  });
});
