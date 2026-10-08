import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setReducedMotion } from '../../test/setup';
import { progressFor, useScrollProgress } from './useScrollProgress';

describe('progressFor', () => {
  it('leave: 0 while the element is below the top, 1 once it has fully left', () => {
    expect(progressFor({ top: 200, height: 800 }, 800, 'leave')).toBe(0);
    expect(progressFor({ top: 0, height: 800 }, 800, 'leave')).toBe(0);
    expect(progressFor({ top: -400, height: 800 }, 800, 'leave')).toBe(0.5);
    expect(progressFor({ top: -800, height: 800 }, 800, 'leave')).toBe(1);
    expect(progressFor({ top: -2000, height: 800 }, 800, 'leave')).toBe(1);
  });

  it('pin: runs across the extra height of a tall pinned section', () => {
    expect(progressFor({ top: 0, height: 3200 }, 800, 'pin')).toBe(0);
    expect(progressFor({ top: -1200, height: 3200 }, 800, 'pin')).toBe(0.5);
    expect(progressFor({ top: -2400, height: 3200 }, 800, 'pin')).toBe(1);
    expect(progressFor({ top: -3000, height: 3200 }, 800, 'pin')).toBe(1);
  });

  it('never divides by zero or returns a bad number', () => {
    expect(progressFor({ top: -10, height: 800 }, 800, 'pin')).toBe(0);
    expect(progressFor({ top: -10, height: 0 }, 800, 'leave')).toBe(0);
    expect(Number.isFinite(progressFor({ top: Number.NaN, height: 800 }, 800, 'leave'))).toBe(true);
  });
});

function Probe({ onProgress, mode }: { onProgress: (p: number) => void; mode: 'leave' | 'pin' }) {
  const ref = useScrollProgress<HTMLDivElement>(onProgress, mode);
  return <div ref={ref} data-testid="probe" />;
}

describe('useScrollProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports the starting position and then follows the scroll', () => {
    const seen: number[] = [];
    const { getByTestId } = render(<Probe onProgress={(p) => seen.push(p)} mode="leave" />);
    const el = getByTestId('probe');
    let top = 0;
    el.getBoundingClientRect = () => ({ top, height: 800 }) as DOMRect;

    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(seen.at(-1)).toBe(0);

    top = -400;
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(20);
    });
    expect(seen.at(-1)).toBe(0.5);
  });

  it('does not report again when nothing changed', () => {
    const onProgress = vi.fn();
    const { getByTestId } = render(<Probe onProgress={onProgress} mode="leave" />);
    getByTestId('probe').getBoundingClientRect = () => ({ top: 0, height: 800 }) as DOMRect;
    act(() => {
      vi.advanceTimersByTime(20);
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(20);
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(20);
    });
    expect(onProgress).toHaveBeenCalledTimes(1);
  });

  it('stays at zero and ignores scrolling when motion is reduced', () => {
    setReducedMotion(true);
    const onProgress = vi.fn();
    const { getByTestId } = render(<Probe onProgress={onProgress} mode="leave" />);
    getByTestId('probe').getBoundingClientRect = () => ({ top: -400, height: 800 }) as DOMRect;
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(40);
    });
    expect(onProgress).toHaveBeenCalledWith(0);
    expect(onProgress).toHaveBeenCalledTimes(1);
  });

  it('stops listening when it unmounts', () => {
    const onProgress = vi.fn();
    const { unmount, getByTestId } = render(<Probe onProgress={onProgress} mode="leave" />);
    getByTestId('probe').getBoundingClientRect = () => ({ top: 0, height: 800 }) as DOMRect;
    act(() => {
      vi.advanceTimersByTime(20);
    });
    const calls = onProgress.mock.calls.length;
    unmount();
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(40);
    });
    expect(onProgress.mock.calls.length).toBe(calls);
  });
});
