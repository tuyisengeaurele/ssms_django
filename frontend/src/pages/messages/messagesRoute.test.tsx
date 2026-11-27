import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';

// The server refuses an admin. The page does too, before asking for anything.

const auth = vi.hoisted(() => ({ role: 'FARMER' }));
vi.mock('../../context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({
    isAuthenticated: true, isLoading: false, switching: false, acting: null, logout: () => {},
    user: { id: 'u1', name: 'Aline', role: auth.role, email: 'a@x.rw', cooperativeId: 'k1', cooperativeName: 'Abahuje' },
  }),
}));

const api = vi.hoisted(() => ({ list: vi.fn(), one: vi.fn(), send: vi.fn(), read: vi.fn(), updates: vi.fn() }));
vi.mock('../../services/message.service', () => ({ messageService: api }));
vi.mock('../../services/announcement.service', () => ({ announcementService: { current: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../services/alert.service', () => ({ alertService: { getAll: vi.fn().mockResolvedValue({ data: { data: [] } }) } }));
vi.mock('../../services/sessions.service', () => ({ sessionsService: { ping: vi.fn().mockReturnValue(new Promise(() => {})) } }));
vi.mock('../../services/support.service', () => ({ supportService: new Proxy({}, { get: () => () => new Promise(() => {}) }) }));
vi.mock('../../services/supply.service', () => ({ supplyService: { decisionCount: vi.fn().mockReturnValue(new Promise(() => {})) } }));
vi.mock('../../services/mfa.service', () => ({ mfaService: { status: vi.fn().mockReturnValue(new Promise(() => {})) } }));

const open = () => render(<LanguageProvider><ToastProvider><App /></ToastProvider></LanguageProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  api.list.mockResolvedValue({ data: { data: [], pagination: { page: 1, hasNext: false } } });
  api.updates.mockResolvedValue(null);
  window.history.pushState({}, '', '/messages');
});

afterEach(() => window.history.pushState({}, '', '/'));

describe('/messages', () => {
  it.each([['FARMER', 'No messages yet.'], ['SUPERVISOR', 'No conversations yet.']])('is the Messages page for a %s', async (role, words) => {
    auth.role = role;
    open();
    expect(await screen.findByText(words, {}, { timeout: 10000 })).toBeInTheDocument();
  }, 20000);

  it('is refused to an admin, who is asked nothing about it', async () => {
    auth.role = 'ADMIN';
    open();
    await vi.waitFor(() => expect(window.location.pathname).toBe('/unauthorized'), { timeout: 10000 });
    expect(api.list).not.toHaveBeenCalled();
    expect(api.updates).not.toHaveBeenCalled();
  }, 20000);
});
