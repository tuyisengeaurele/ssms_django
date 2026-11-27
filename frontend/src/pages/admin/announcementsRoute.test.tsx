import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';

// The server refuses anybody who is not an admin. The page must refuse them too, before asking for anything.

const auth = vi.hoisted(() => ({ role: 'ADMIN' }));
vi.mock('../../context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({
    isAuthenticated: true, isLoading: false, switching: false, acting: false, logout: () => {},
    user: { name: 'Aline', role: auth.role, email: 'a@x.rw', cooperativeId: null },
  }),
}));

const api = vi.hoisted(() => ({
  all: vi.fn(), current: vi.fn(), visitor: vi.fn(), create: vi.fn(), update: vi.fn(), end: vi.fn(),
}));
vi.mock('../../services/announcement.service', () => ({ announcementService: api }));
vi.mock('../../services/alert.service', () => ({ alertService: { getAll: vi.fn().mockResolvedValue({ data: { data: [] } }) } }));
vi.mock('../../services/sessions.service', () => ({ sessionsService: { ping: vi.fn().mockReturnValue(new Promise(() => {})) } }));
// The layout asks several things of support access. None of them matters here, so each one is left unanswered.
vi.mock('../../services/support.service', () => ({ supportService: new Proxy({}, { get: () => () => new Promise(() => {}) }) }));
vi.mock('../../services/supply.service', () => ({ supplyService: { decisionCount: vi.fn().mockReturnValue(new Promise(() => {})) } }));

const open = () => render(<LanguageProvider><ToastProvider><App /></ToastProvider></LanguageProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  api.all.mockResolvedValue({ data: { data: [] } });
  api.current.mockResolvedValue([]);
  window.history.pushState({}, '', '/admin/announcements');
});

afterEach(() => window.history.pushState({}, '', '/'));

describe('/admin/announcements', () => {
  it('is the announcements page for an admin', async () => {
    auth.role = 'ADMIN';
    open();
    expect(await screen.findByText('No announcements yet.', {}, { timeout: 10000 })).toBeInTheDocument();
  }, 20000);

  it.each(['SUPERVISOR', 'FARMER'])('is refused to a %s', async (role) => {
    auth.role = role;
    open();
    await vi.waitFor(() => expect(window.location.pathname).toBe('/unauthorized'), { timeout: 10000 });
    expect(api.all).not.toHaveBeenCalled();
  }, 20000);
});
