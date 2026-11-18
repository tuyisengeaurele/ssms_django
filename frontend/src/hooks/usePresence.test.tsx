import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePresence, usePresenceList } from './usePresence';

// Something that leaves (a dialog, a toast) has to stay on screen long enough to play its leaving animation, then go.

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('usePresence', () => {
  it('is mounted and not leaving while present', () => {
    const { result } = renderHook(() => usePresence(true, 120));
    expect(result.current).toEqual({ mounted: true, leaving: false });
  });

  it('is not mounted at all while it has never been present', () => {
    const { result } = renderHook(() => usePresence(false, 120));
    expect(result.current).toEqual({ mounted: false, leaving: false });
  });

  it('stays mounted, marked as leaving, for the length of the animation, then goes', () => {
    const { result, rerender } = renderHook(({ present }) => usePresence(present, 120), { initialProps: { present: true } });
    rerender({ present: false });
    expect(result.current).toEqual({ mounted: true, leaving: true });
    act(() => void vi.advanceTimersByTime(119));
    expect(result.current.mounted).toBe(true);
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toEqual({ mounted: false, leaving: false });
  });

  it('comes back at once when it is shown again while it is still leaving, and is not removed later', () => {
    const { result, rerender } = renderHook(({ present }) => usePresence(present, 120), { initialProps: { present: true } });
    rerender({ present: false });
    act(() => void vi.advanceTimersByTime(60));
    rerender({ present: true });
    expect(result.current).toEqual({ mounted: true, leaving: false });
    act(() => void vi.advanceTimersByTime(500));
    expect(result.current).toEqual({ mounted: true, leaving: false });
  });
});

describe('usePresenceList', () => {
  const a = { id: 'a' };
  const b = { id: 'b' };
  const c = { id: 'c' };
  type Item = { id: string };
  const ids = (rows: Array<{ item: Item; leaving: boolean }>) => rows.map((row) => `${row.item.id}${row.leaving ? '*' : ''}`);

  it('lists what is there, none leaving', () => {
    const { result } = renderHook(() => usePresenceList([a, b], 120));
    expect(ids(result.current)).toEqual(['a', 'b']);
  });

  it('keeps an item that was removed, marked as leaving, until its animation is over', () => {
    const { result, rerender } = renderHook(({ items }) => usePresenceList(items, 120), { initialProps: { items: [a, b, c] } });
    rerender({ items: [a, c] });
    expect(ids(result.current)).toEqual(['a', 'b*', 'c']);
    act(() => void vi.advanceTimersByTime(120));
    expect(ids(result.current)).toEqual(['a', 'c']);
  });

  it('adds a new item at the end, in order', () => {
    const { result, rerender } = renderHook(({ items }) => usePresenceList(items, 120), { initialProps: { items: [a] } });
    rerender({ items: [a, b] });
    expect(ids(result.current)).toEqual(['a', 'b']);
  });

  it('removes every item that left, each after its own time', () => {
    const { result, rerender } = renderHook(({ items }) => usePresenceList(items, 120), { initialProps: { items: [a, b] } });
    rerender({ items: [b] });
    act(() => void vi.advanceTimersByTime(60));
    rerender({ items: [] });
    expect(ids(result.current)).toEqual(['a*', 'b*']);
    act(() => void vi.advanceTimersByTime(60));
    expect(ids(result.current)).toEqual(['b*']);
    act(() => void vi.advanceTimersByTime(60));
    expect(ids(result.current)).toEqual([]);
  });

  it('shows an item that returns while leaving as present again', () => {
    const { result, rerender } = renderHook(({ items }) => usePresenceList(items, 120), { initialProps: { items: [a] } });
    rerender({ items: [] });
    rerender({ items: [a] });
    expect(ids(result.current)).toEqual(['a']);
    act(() => void vi.advanceTimersByTime(500));
    expect(ids(result.current)).toEqual(['a']);
  });
});
