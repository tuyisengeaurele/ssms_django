import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ count: vi.fn() }));
vi.mock('../services/supply.service', () => ({ supplyService: { decisionCount: api.count } }));

import { useDecisionCount } from './useDecisionCount';

const answer = (count: number) => api.count.mockResolvedValue({ data: { data: { count, rooms: count, allowance: 0 } } });

beforeEach(() => {
  vi.clearAllMocks();
  answer(3);
});

describe('useDecisionCount', () => {
  it('asks for nothing and says zero when it is not wanted, so a farmer makes no request', async () => {
    const { result } = renderHook(() => useDecisionCount(false));
    expect(result.current).toBe(0);
    await new Promise((r) => setTimeout(r, 20));
    expect(api.count).not.toHaveBeenCalled();
  });

  it('gives the count once it is known', async () => {
    const { result } = renderHook(() => useDecisionCount(true));
    expect(result.current).toBe(0);
    await waitFor(() => expect(result.current).toBe(3));
  });

  it('counts again when the Decisions page says something was decided', async () => {
    const { result } = renderHook(() => useDecisionCount(true));
    await waitFor(() => expect(result.current).toBe(3));
    answer(2);
    act(() => { window.dispatchEvent(new Event('ssms:decisions')); });
    await waitFor(() => expect(result.current).toBe(2));
  });

  it('counts again when the page changes', async () => {
    const { result, rerender } = renderHook(({ at }) => useDecisionCount(true, at), { initialProps: { at: '/a' } });
    await waitFor(() => expect(result.current).toBe(3));
    answer(5);
    rerender({ at: '/b' });
    await waitFor(() => expect(result.current).toBe(5));
  });

  it('keeps the last count when a request fails', async () => {
    const { result } = renderHook(() => useDecisionCount(true));
    await waitFor(() => expect(result.current).toBe(3));
    api.count.mockRejectedValue(new Error('down'));
    act(() => { window.dispatchEvent(new Event('ssms:decisions')); });
    await waitFor(() => expect(api.count).toHaveBeenCalledTimes(2));
    expect(result.current).toBe(3);
  });

  it('stops listening when it goes away', async () => {
    const { result, unmount } = renderHook(() => useDecisionCount(true));
    await waitFor(() => expect(result.current).toBe(3));
    unmount();
    window.dispatchEvent(new Event('ssms:decisions'));
    expect(api.count).toHaveBeenCalledTimes(1);
  });
});
