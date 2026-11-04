import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { setReducedMotion } from '../../test/setup';

const session = vi.hoisted(() => ({ role: 'ADMIN', logout: vi.fn() }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Auris Tuyisenge', role: session.role, email: 'a@x.rw' }, logout: session.logout }),
}));
vi.mock('../../services/alert.service', () => ({ alertService: { getAll: vi.fn().mockResolvedValue({ data: { data: [] } }) } }));
vi.mock('../../services/contacts.service', () => ({
  contactsService: { getUnread: vi.fn().mockResolvedValue({ data: { data: { messages: [], count: 0 } } }) },
}));
vi.mock('../../services/farm.service', () => ({ farmService: { getAll: vi.fn().mockReturnValue(new Promise(() => {})) } }));

const api = vi.hoisted(() => ({ ping: vi.fn(), logout: vi.fn(), endSession: vi.fn() }));
vi.mock('../../services/sessions.service', () => ({ sessionsService: { ping: api.ping } }));
vi.mock('../../services/auth.service', () => ({ authService: { logout: api.logout } }));
vi.mock('../../services/api', async (original) => ({ ...(await original<object>()), endSession: api.endSession }));

import DashboardLayout from './DashboardLayout';

const MINUTE = 60_000;

async function open() {
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <LanguageProvider>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route path="/admin" element={<p>Page body</p>} />
          </Route>
        </Routes>
      </LanguageProvider>
    </MemoryRouter>,
  );
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
}

const pass = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  setReducedMotion(true);
  session.role = 'ADMIN';
  session.logout = vi.fn();
  api.ping.mockReset().mockResolvedValue({ data: { data: { idleLimitSeconds: 900, idleSecondsLeft: 900 } } });
  api.logout.mockReset().mockResolvedValue({});
  api.endSession.mockReset();
});

afterEach(() => vi.useRealTimers());

describe('The idle sign out in the signed in layout', () => {
  it('asks the server for the limit when the page opens, which counts as activity', async () => {
    await open();
    expect(api.ping).toHaveBeenCalledTimes(1);
  });

  it('warns an admin after 14 minutes of nothing, and signs them out after 15', async () => {
    await open();
    await pass(13 * MINUTE);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await pass(1 * MINUTE + 5_000);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await pass(MINUTE);
    expect(api.endSession).toHaveBeenCalledWith('idle');
    expect(api.logout).toHaveBeenCalled();
  });

  it('keeps the person signed in when they say so, and tells the server', async () => {
    await open();
    await pass(14 * MINUTE + 5_000);
    fireEvent.click(screen.getByRole('button', { name: 'Stay signed in' }));
    await pass(1_000);
    expect(api.ping).toHaveBeenCalledTimes(2);
    await pass(14 * MINUTE);
    expect(api.endSession).not.toHaveBeenCalled();
  });

  it('signs out without the idle note when the person chooses Sign out now', async () => {
    await open();
    await pass(14 * MINUTE + 5_000);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out now' }));
    expect(session.logout).toHaveBeenCalledTimes(1);
    expect(api.endSession).not.toHaveBeenCalled();
  });

  it('never warns a farmer, who has no limit', async () => {
    session.role = 'FARMER';
    api.ping.mockResolvedValue({ data: { data: { idleLimitSeconds: null, idleSecondsLeft: null } } });
    await open();
    await pass(120 * MINUTE);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(api.endSession).not.toHaveBeenCalled();
  });

  it('keeps working when the server cannot be reached for the limit', async () => {
    api.ping.mockRejectedValue(new Error('offline'));
    await open();
    await pass(120 * MINUTE);
    expect(screen.getByText('Page body')).toBeInTheDocument();
    expect(api.endSession).not.toHaveBeenCalled();
  });

  it('signs out even if telling the server fails', async () => {
    api.logout.mockRejectedValue(new Error('offline'));
    await open();
    await pass(15 * MINUTE + 5_000);
    expect(api.endSession).toHaveBeenCalledWith('idle');
  });
});
