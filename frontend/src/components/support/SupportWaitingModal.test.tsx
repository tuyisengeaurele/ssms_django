import { act, fireEvent, render, screen } from '@testing-library/react';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import type { SupportAdminRow } from '../../types';

const support = vi.hoisted(() => ({ get: vi.fn(), start: vi.fn(), cancel: vi.fn() }));
const mfa = vi.hoisted(() => ({ stepUp: vi.fn() }));
const auth = vi.hoisted(() => ({ startActing: vi.fn() }));
vi.mock('../../services/support.service', () => ({ supportService: support }));
vi.mock('../../services/mfa.service', () => ({ mfaService: mfa }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));

import SupportWaitingModal from './SupportWaitingModal';

const row = (over: Partial<SupportAdminRow> = {}): SupportAdminRow => ({
  id: 'a1', status: 'requested', reason: 'Please look at my batch list', minutes: 30, requestedMode: 'view', grantedMode: '',
  person: { id: 'p1', name: 'Aline Uwase' }, requestedAt: '2026-11-06T10:00:00Z', decidedAt: null, startedAt: null, endsAt: null,
  endedBy: '', endedReason: '', ...over,
});
const answer = (over: Partial<SupportAdminRow>) => ({ data: { data: row(over) } });
const needsCode = () => new AxiosError('no', 'ERR_BAD_REQUEST', undefined, undefined, {
  status: 403, data: { code: 'mfa_recent_required' }, statusText: '', headers: {}, config: {} as InternalAxiosRequestConfig,
});

function open(onClose = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/admin/users']}>
      <LanguageProvider>
        <Routes>
          <Route path="/admin/users" element={<SupportWaitingModal open accessId="a1" personName="Aline Uwase" onClose={onClose} />} />
          <Route path="/" element={<p>Home of the person</p>} />
        </Routes>
      </LanguageProvider>
    </MemoryRouter>,
  );
  return onClose;
}

const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  support.get.mockResolvedValue(answer({}));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Waiting for the person to answer', () => {
  it('names the person, says how long they have, and asks the server at once', async () => {
    open();
    await tick(0);
    expect(screen.getByRole('dialog', { name: 'Waiting for Aline Uwase' })).toBeInTheDocument();
    expect(screen.getByText('Aline Uwase has 5 minutes to answer. You can leave this open.')).toBeInTheDocument();
    expect(support.get).toHaveBeenCalledWith('a1');
  });

  it('asks again every 3 seconds while nobody has answered', async () => {
    open();
    await tick(0);
    await tick(3000);
    await tick(3000);
    expect(support.get).toHaveBeenCalledTimes(3);
  });

  it('shows Start when the person allows, and stops asking', async () => {
    support.get.mockResolvedValueOnce(answer({})).mockResolvedValue(answer({ status: 'approved', grantedMode: 'view' }));
    open();
    await tick(0);
    await tick(3000);
    expect(screen.getByText('Aline Uwase allowed it. You may start now.')).toBeInTheDocument();
    expect(screen.getByText('View only.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    const calls = support.get.mock.calls.length;
    await tick(9000);
    expect(support.get.mock.calls.length).toBe(calls);
  });

  it('says so when changes are allowed too', async () => {
    support.get.mockResolvedValue(answer({ status: 'approved', requestedMode: 'edit', grantedMode: 'edit' }));
    open();
    await tick(0);
    expect(screen.getByText('Changes are allowed too.')).toBeInTheDocument();
  });

  it('starts the visit: takes the token, becomes the person and goes to their pages', async () => {
    support.get.mockResolvedValue(answer({ status: 'approved', grantedMode: 'edit', requestedMode: 'edit' }));
    support.start.mockResolvedValue({
      data: { data: { access: row({ status: 'active', grantedMode: 'edit', endsAt: '2026-11-06T10:30:00Z' }), token: 'support.token' } },
    });
    auth.startActing.mockResolvedValue(undefined);
    const onClose = open();
    await tick(0);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await tick(0);
    expect(support.start).toHaveBeenCalledWith('a1');
    expect(auth.startActing).toHaveBeenCalledWith('support.token', { id: 'a1', mode: 'edit', endsAt: '2026-11-06T10:30:00Z' });
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByText('Home of the person')).toBeInTheDocument();
  });

  it('asks for a fresh code first when the server wants one, then starts', async () => {
    support.get.mockResolvedValue(answer({ status: 'approved', grantedMode: 'view' }));
    support.start.mockRejectedValueOnce(needsCode()).mockResolvedValue({
      data: { data: { access: row({ status: 'active', grantedMode: 'view', endsAt: '2026-11-06T10:30:00Z' }), token: 'support.token' } },
    });
    mfa.stepUp.mockResolvedValue({ data: {} });
    auth.startActing.mockResolvedValue(undefined);
    open();
    await tick(0);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await tick(0);
    expect(screen.getByRole('dialog', { name: 'Confirm with a code' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('6 digit code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await tick(0);
    expect(mfa.stepUp).toHaveBeenCalledWith('123456');
    expect(auth.startActing).toHaveBeenCalledTimes(1);
  });

  it('says so when the person said no, and offers neither Start nor Withdraw, only the window\'s own Close', async () => {
    support.get.mockResolvedValue(answer({ status: 'rejected' }));
    open();
    await tick(0);
    expect(screen.getByText('Aline Uwase said no.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Withdraw the request' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('says so when the request ran out of time', async () => {
    support.get.mockResolvedValue(answer({ status: 'expired' }));
    open();
    await tick(0);
    expect(screen.getByText('Aline Uwase did not answer in time.')).toBeInTheDocument();
  });

  it('withdraws the request and closes', async () => {
    support.cancel.mockResolvedValue({ data: { data: row({ status: 'cancelled' }) } });
    const onClose = open();
    await tick(0);
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw the request' }));
    await tick(0);
    expect(support.cancel).toHaveBeenCalledWith('a1');
    expect(onClose).toHaveBeenCalled();
  });

  it('stops asking when it is closed', async () => {
    const { unmount } = render(
      <MemoryRouter>
        <LanguageProvider>
          <SupportWaitingModal open accessId="a1" personName="Aline Uwase" onClose={vi.fn()} />
        </LanguageProvider>
      </MemoryRouter>,
    );
    await tick(0);
    unmount();
    const calls = support.get.mock.calls.length;
    await tick(9000);
    expect(support.get.mock.calls.length).toBe(calls);
  });
});
