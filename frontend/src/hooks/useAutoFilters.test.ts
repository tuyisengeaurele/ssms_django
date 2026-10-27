import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoFilters } from './useAutoFilters';

const start = { search: '', action: '' };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useAutoFilters', () => {
  it('starts with the same filters shown and applied', () => {
    const { result } = renderHook(() => useAutoFilters(start));
    expect(result.current.draft).toEqual(start);
    expect(result.current.applied).toEqual(start);
  });

  it('applies a choice at once when it is made instantly', () => {
    const { result } = renderHook(() => useAutoFilters(start));
    act(() => result.current.set({ action: 'LOGIN' }, true));
    expect(result.current.draft.action).toBe('LOGIN');
    expect(result.current.applied.action).toBe('LOGIN');
  });

  it('shows typing at once but applies it only after a short pause', () => {
    const { result } = renderHook(() => useAutoFilters(start, 300));
    act(() => result.current.set({ search: 'b' }));
    act(() => result.current.set({ search: 'br' }));
    expect(result.current.draft.search).toBe('br');
    expect(result.current.applied.search).toBe('');
    act(() => vi.advanceTimersByTime(299));
    expect(result.current.applied.search).toBe('');
    act(() => vi.advanceTimersByTime(2));
    expect(result.current.applied.search).toBe('br');
  });

  it('applies the typing together with a choice made in the meantime', () => {
    const { result } = renderHook(() => useAutoFilters(start, 300));
    act(() => result.current.set({ search: 'bruce' }));
    act(() => result.current.set({ action: 'CREATE' }, true));
    expect(result.current.applied).toEqual({ search: 'bruce', action: 'CREATE' });
    act(() => vi.advanceTimersByTime(400));
    expect(result.current.applied).toEqual({ search: 'bruce', action: 'CREATE' });
  });

  it('says whether anything differs from the start', () => {
    const { result } = renderHook(() => useAutoFilters(start));
    expect(result.current.changed).toBe(false);
    act(() => result.current.set({ action: 'LOGIN' }, true));
    expect(result.current.changed).toBe(true);
  });

  it('puts everything back at once with reset, and drops a typing that was waiting', () => {
    const { result } = renderHook(() => useAutoFilters(start, 300));
    act(() => result.current.set({ search: 'bruce' }));
    act(() => result.current.reset());
    expect(result.current.draft).toEqual(start);
    expect(result.current.applied).toEqual(start);
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.applied).toEqual(start);
  });

  it('does nothing after it is unmounted', () => {
    const { result, unmount } = renderHook(() => useAutoFilters(start, 300));
    act(() => result.current.set({ search: 'x' }));
    unmount();
    expect(() => vi.advanceTimersByTime(500)).not.toThrow();
  });
});
