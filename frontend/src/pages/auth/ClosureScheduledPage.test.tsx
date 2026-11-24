import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';

const auth = vi.hoisted(() => ({
  user: { id: 'u1', name: 'Aline Uwase', email: 'aline@example.rw', role: 'FARMER', deletionDate: '2026-12-24' } as Record<string, unknown>,
  updateUser: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));

const api = vi.hoisted(() => ({ cancelClosure: vi.fn() }));
vi.mock('../../services/account.service', () => ({ accountService: api }));

import ClosureScheduledPage from './ClosureScheduledPage';

const open = () => render(
  <MemoryRouter>
    <LanguageProvider>
      <ClosureScheduledPage />
    </LanguageProvider>
  </MemoryRouter>,
);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  auth.user = { id: 'u1', name: 'Aline Uwase', email: 'aline@example.rw', role: 'FARMER', deletionDate: '2026-12-24' };
  api.cancelClosure.mockResolvedValue({ data: { data: null } });
});

describe('The closure screen', () => {
  it('says the account will be removed, and on which day', () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Your account will be removed' })).toBeInTheDocument();
    expect(screen.getByText(/It will be removed on Dec 24, 2026\./)).toBeInTheDocument();
  });

  it('offers to keep the account and to sign out, and nothing else', () => {
    open();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Keep my account', 'Sign out']);
  });

  it('keeps the account, then hands the account without a date to the app', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Keep my account' }));
    await waitFor(() => expect(api.cancelClosure).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1', deletionDate: null })));
  });

  it('says so, and stays, when the account could not be kept', async () => {
    api.cancelClosure.mockRejectedValue(new AxiosError('x', 'ERR_NETWORK'));
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Keep my account' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Keep my account' })).toBeEnabled();
  });

  it('signs out', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });
});
