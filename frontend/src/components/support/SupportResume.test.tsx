import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { doneEnding, markEnding, notifySupportEnded, takeSupportEnded } from '../../services/session';
import type { ActingInfo, SupportAdminRow } from '../../types';

const support = vi.hoisted(() => ({ mine: vi.fn(), token: vi.fn(), end: vi.fn() }));
const auth = vi.hoisted(() => ({
  user: { id: 'a1', role: 'ADMIN' } as { id: string; role: string } | null,
  acting: null as ActingInfo | null,
  startActing: vi.fn(),
}));
vi.mock('../../services/support.service', () => ({ supportService: support }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));

import SupportResume from './SupportResume';

const NOW = new Date('2026-11-06T10:00:00Z');
const row = (over: Partial<SupportAdminRow> = {}): SupportAdminRow => ({
  id: 'a1', status: 'active', reason: 'Please look at my batch list', minutes: 30, requestedMode: 'view', grantedMode: 'view',
  person: { id: 'p1', name: 'Aline Uwase' }, requestedAt: '2026-11-06T09:40:00Z', decidedAt: '2026-11-06T09:41:00Z',
  startedAt: '2026-11-06T09:42:00Z', endsAt: '2026-11-06T10:12:00Z', endedBy: '', endedReason: '', ...over,
});
const mine = (open: SupportAdminRow | null) => support.mine.mockResolvedValue({ data: { data: { open, recent: open ? [open] : [] } } });

const open = () => render(<LanguageProvider><ToastProvider><SupportResume /></ToastProvider></LanguageProvider>);
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  localStorage.clear();
  auth.user = { id: 'a1', role: 'ADMIN' };
  auth.acting = null;
  takeSupportEnded();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('A visit that is still open after a reload', () => {
  it('offers to continue or end it, with the person and the time left', async () => {
    mine(row());
    open();
    await settle();
    expect(screen.getByText('You have an open support session with Aline Uwase, 12 minutes left.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End' })).toBeInTheDocument();
  });

  it('continues with a new token for the same visit', async () => {
    mine(row({ grantedMode: 'edit' }));
    support.token.mockResolvedValue({ data: { data: { access: row({ grantedMode: 'edit' }), token: 'again.token' } } });
    auth.startActing.mockResolvedValue(undefined);
    open();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await settle();
    expect(support.token).toHaveBeenCalledWith('a1');
    expect(auth.startActing).toHaveBeenCalledWith('again.token', { id: 'a1', mode: 'edit', endsAt: '2026-11-06T10:12:00Z' });
  });

  it('ends it and goes away', async () => {
    mine(row());
    support.end.mockResolvedValue({ data: { data: row({ status: 'ended' }) } });
    open();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    await settle();
    expect(support.end).toHaveBeenCalledWith('a1');
    await waitFor(() => expect(screen.queryByText(/open support session/)).not.toBeInTheDocument());
  });

  it.each([
    ['there is no open request', null],
    ['the request was only allowed, not started', row({ status: 'approved', startedAt: null, endsAt: null })],
    ['the request is still waiting', row({ status: 'requested', startedAt: null, endsAt: null })],
  ])('shows nothing when %s', async (_name, value) => {
    mine(value);
    open();
    await settle();
    expect(screen.queryByText(/open support session/)).not.toBeInTheDocument();
  });

  it('asks nothing of the server, and shows nothing, for somebody who is not an admin', async () => {
    auth.user = { id: 'f1', role: 'FARMER' };
    open();
    await settle();
    expect(support.mine).not.toHaveBeenCalled();
  });

  it('asks nothing of the server while the admin is already acting', async () => {
    auth.acting = { id: 's1' } as ActingInfo;
    open();
    await settle();
    expect(support.mine).not.toHaveBeenCalled();
  });

  it('does not offer a visit that the admin has just ended, while the server is still hearing about it', async () => {
    markEnding('a1');
    mine(row());
    open();
    await settle();
    expect(support.mine).toHaveBeenCalled();
    expect(screen.queryByText(/open support session/)).not.toBeInTheDocument();
    doneEnding('a1');
  });

  it('says so, once, when a visit has just ended, and asks the server nothing then', async () => {
    notifySupportEnded();
    open();
    await settle();
    expect(screen.getByText('The support session has ended.')).toBeInTheDocument();
    expect(support.mine).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
    expect(screen.queryByText('The support session has ended.')).not.toBeInTheDocument();
  });

  it('shows nothing when the server cannot be reached', async () => {
    support.mine.mockRejectedValue(new Error('offline'));
    open();
    await settle();
    expect(screen.queryByText(/open support session/)).not.toBeInTheDocument();
  });
});
