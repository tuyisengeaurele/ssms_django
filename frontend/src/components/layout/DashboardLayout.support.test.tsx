import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';
import type { ActingInfo, SupportAdminRow, SupportPersonRow, User } from '../../types';

const auth = vi.hoisted(() => ({
  user: { id: 'a1', name: 'Ange Admin', role: 'ADMIN', email: 'a@x.rw' } as { id: string; name: string; role: string; email: string },
  acting: null as ActingInfo | null,
  logout: vi.fn(),
  startActing: vi.fn(),
  stopActing: vi.fn(),
}));
const support = vi.hoisted(() => ({ mine: vi.fn(), end: vi.fn(), token: vi.fn(), pending: vi.fn(), respond: vi.fn(), endOwn: vi.fn() }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../services/support.service', () => ({ supportService: support }));
vi.mock('../../services/alert.service', () => ({ alertService: { getAll: vi.fn().mockResolvedValue({ data: { data: [] } }) } }));
vi.mock('../../services/contacts.service', () => ({
  contactsService: { getUnread: vi.fn().mockResolvedValue({ data: { data: { messages: [], count: 0 } } }) },
}));
vi.mock('../../services/farm.service', () => ({ farmService: { getAll: vi.fn().mockReturnValue(new Promise(() => {})) } }));

import DashboardLayout from './DashboardLayout';

const aline = { id: 'p1', name: 'Aline Uwase', email: 'aline@example.rw', role: 'FARMER' } as User;
const active: SupportAdminRow = {
  id: 'a1', status: 'active', reason: 'Please look at my batch list', minutes: 30, requestedMode: 'view', grantedMode: 'view',
  person: { id: 'p1', name: 'Aline Uwase' }, requestedAt: '2026-11-06T09:40:00Z', decidedAt: '2026-11-06T09:41:00Z',
  startedAt: '2026-11-06T09:42:00Z', endsAt: new Date(Date.now() + 12 * 60_000).toISOString(), endedBy: '', endedReason: '',
};

const open = () => render(
  <MemoryRouter initialEntries={['/x']}>
    <LanguageProvider>
      <ToastProvider>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route path="/x" element={<p>Page body</p>} />
          </Route>
        </Routes>
      </ToastProvider>
    </LanguageProvider>
  </MemoryRouter>,
);
const settle = () => act(async () => { await Promise.resolve(); });

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  auth.user = { id: 'a1', name: 'Ange Admin', role: 'ADMIN', email: 'a@x.rw' };
  auth.acting = null;
  support.mine.mockResolvedValue({ data: { data: { open: null, recent: [] } } });
  support.pending.mockResolvedValue({ data: { data: { request: null, active: null } } });
});

const personRow = (over: Partial<SupportPersonRow> = {}): SupportPersonRow => ({
  id: 'r1', status: 'requested', reason: 'Please look at my batch list', minutes: 30, requestedMode: 'view', grantedMode: '',
  admin: { name: 'Ange Admin' }, requestedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  startedAt: null, endsAt: null, endedBy: '', endedReason: '', ...over,
});

describe('The layout during support access', () => {
  it('shows the banner for an admin who is acting as a person, above everything else', async () => {
    auth.user = aline as never;
    auth.acting = { id: 's1', person: aline, mode: 'view', endsAt: new Date(Date.now() + 24 * 60_000).toISOString() };
    const { container } = open();
    await settle();
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent(/Viewing as Aline Uwase, view only, \d+ minutes left\./);
    expect(banner).toHaveClass('support-banner');
    // The banner comes right before the top bar, so the bar can sit beneath it.
    expect(banner.nextElementSibling).toBe(container.querySelector('.app-topbar'));
  });

  it('offers to continue an open visit to an admin who is not acting', async () => {
    support.mine.mockResolvedValue({ data: { data: { open: active, recent: [active] } } });
    open();
    await settle();
    expect(screen.getByText(/You have an open support session with Aline Uwase/)).toBeInTheDocument();
  });

  it('shows neither to a farmer, and asks the server nothing about a visit to continue', async () => {
    auth.user = { id: 'f1', name: 'Aline Uwase', role: 'FARMER', email: 'aline@example.rw' };
    open();
    await settle();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(support.mine).not.toHaveBeenCalled();
  });
});

describe('The layout when the person on screen changes', () => {
  // A page that counts how many times it was drawn from scratch.
  let mounts = 0;
  function Page() {
    useEffect(() => { mounts += 1; }, []);
    return <p>Page body</p>;
  }
  const tree = () => (
    <MemoryRouter initialEntries={['/x']}>
      <LanguageProvider>
        <ToastProvider>
          <Routes>
            <Route element={<DashboardLayout />}>
              <Route path="/x" element={<Page />} />
            </Route>
          </Routes>
        </ToastProvider>
      </LanguageProvider>
    </MemoryRouter>
  );

  it('draws the page again from scratch, so nothing of the other person stays on screen', async () => {
    mounts = 0;
    const view = render(tree());
    await settle();
    expect(mounts).toBe(1);
    auth.user = aline as never;
    auth.acting = { id: 's1', person: aline, mode: 'view', endsAt: new Date(Date.now() + 24 * 60_000).toISOString() };
    view.rerender(tree());
    // The old page leaves with its exit animation, and then the new one is drawn.
    await waitFor(() => expect(mounts).toBe(2));
  });
});

describe('The layout for the person who is asked', () => {
  it.each(['FARMER', 'SUPERVISOR'])('shows the question to a %s when support asks', async (role) => {
    auth.user = { id: 'f1', name: 'Aline Uwase', role, email: 'aline@example.rw' };
    support.pending.mockResolvedValue({ data: { data: { request: personRow(), active: null } } });
    open();
    await settle();
    expect(screen.getByRole('alertdialog', { name: 'SSMS support wants to view your account' })).toBeInTheDocument();
  });

  it('shows the banner, with End now, while support is looking at the account', async () => {
    auth.user = { id: 'f1', name: 'Aline Uwase', role: 'FARMER', email: 'aline@example.rw' };
    support.pending.mockResolvedValue({ data: { data: { request: null, active: personRow({ status: 'active', grantedMode: 'view' }) } } });
    const { container } = open();
    await settle();
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('SSMS support is viewing your account (view only).');
    expect(banner.nextElementSibling).toBe(container.querySelector('.app-topbar'));
    expect(screen.getByRole('button', { name: 'End now' })).toBeInTheDocument();
  });

  it('asks nothing for an admin', async () => {
    open();
    await settle();
    expect(support.pending).not.toHaveBeenCalled();
  });

  it('asks nothing while an admin acts as a person, so the person is not asked on their own behalf', async () => {
    auth.user = aline as never;
    auth.acting = { id: 's1', person: aline, mode: 'view', endsAt: new Date(Date.now() + 24 * 60_000).toISOString() };
    open();
    await settle();
    expect(support.pending).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
