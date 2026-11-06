import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import type { ActingInfo, User } from '../../types';

const support = vi.hoisted(() => ({ end: vi.fn() }));
const auth = vi.hoisted(() => ({ acting: null as ActingInfo | null, stopActing: vi.fn() }));
vi.mock('../../services/support.service', () => ({ supportService: support }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));

import ActingBanner from './ActingBanner';

const NOW = new Date('2026-11-06T10:00:00Z');
const aline = { id: 'p1', name: 'Aline Uwase', email: 'aline@example.rw', role: 'FARMER' } as User;
const acting = (over: Partial<ActingInfo> = {}): ActingInfo => ({
  id: 's1', person: aline, mode: 'view', endsAt: '2026-11-06T10:24:00Z', ...over,
});

const open = () => render(<LanguageProvider><ActingBanner /></LanguageProvider>);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  localStorage.clear();
  support.end.mockResolvedValue({ data: {} });
  auth.acting = acting();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('The banner while an admin acts as a person', () => {
  it('says who it is, the mode and the minutes left, in a status region', () => {
    open();
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Viewing as Aline Uwase, view only, 24 minutes left.');
  });

  it('says so when changes are allowed', () => {
    auth.acting = acting({ mode: 'edit' });
    open();
    expect(screen.getByRole('status')).toHaveTextContent('Viewing as Aline Uwase, can make changes, 24 minutes left.');
  });

  it('updates once a minute, not every second', () => {
    open();
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(screen.getByRole('status')).toHaveTextContent('24 minutes left');
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(screen.getByRole('status')).toHaveTextContent('23 minutes left');
  });

  it('never shows a negative time', () => {
    auth.acting = acting({ endsAt: '2026-11-06T09:00:00Z' });
    open();
    expect(screen.getByRole('status')).toHaveTextContent('0 minutes left');
  });

  it('goes back to the admin first, and then tells the server', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(auth.stopActing).toHaveBeenCalledTimes(1);
    expect(support.end).toHaveBeenCalledWith('s1');
    expect(auth.stopActing.mock.invocationCallOrder[0]).toBeLessThan(support.end.mock.invocationCallOrder[0]);
  });

  it('still goes back to the admin when the server cannot be reached', async () => {
    support.end.mockRejectedValue(new Error('offline'));
    open();
    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(auth.stopActing).toHaveBeenCalledTimes(1);
  });

  it('shows nothing when nobody is acting', () => {
    auth.acting = null;
    open();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
