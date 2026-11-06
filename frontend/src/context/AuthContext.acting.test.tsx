import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../types';
import { getAccessToken, isActing, notifySupportEnded, setAccessToken } from '../services/session';

const api = vi.hoisted(() => ({ get: vi.fn() }));
const auth = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock('../services/api', () => ({ default: api }));
vi.mock('../services/auth.service', () => ({ authService: auth }));

import { AuthProvider, useAuth } from './AuthContext';

const aline = { id: 'u1', name: 'Aline Uwase', email: 'aline@example.rw', role: 'FARMER' } as User;
const admin = { id: 'a1', name: 'Ange Admin', email: 'admin@example.rw', role: 'ADMIN' } as User;
const info = { id: 's1', mode: 'view' as const, endsAt: '2026-11-06T12:00:00Z' };

function ActingProbe() {
  const { user, acting, login, logout, startActing, stopActing } = useAuth();
  return (
    <div>
      <p data-testid="who">{user?.email ?? 'nobody'}</p>
      <p data-testid="acting">{acting ? `${acting.id}:${acting.person.email}:${acting.mode}` : 'no'}</p>
      <button onClick={() => login(admin, 'admin.token')}>admin in</button>
      <button onClick={() => { startActing('support.token', info).catch(() => undefined); }}>start</button>
      <button onClick={() => stopActing()}>stop</button>
      <button onClick={() => logout()}>out</button>
    </div>
  );
}

const who = () => screen.getByTestId('who').textContent;
const actingText = () => screen.getByTestId('acting').textContent;

async function signedInAsAdmin() {
  render(<AuthProvider><ActingProbe /></AuthProvider>);
  await waitFor(() => expect(who()).toBe('nobody'));
  fireEvent.click(screen.getByText('admin in'));
  expect(who()).toBe(admin.email);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  setAccessToken(null);
  auth.logout.mockResolvedValue(undefined);
});

describe('acting as a person', () => {
  it('becomes the person with the support token, and remembers the admin', async () => {
    api.get.mockResolvedValue({ data: { data: aline } });
    await signedInAsAdmin();
    fireEvent.click(screen.getByText('start'));
    await waitFor(() => expect(who()).toBe(aline.email));
    expect(actingText()).toBe(`s1:${aline.email}:view`);
    expect(getAccessToken()).toBe('support.token');
    expect(isActing()).toBe(true);
  });

  it('gives the admin back, with the admin token, when it stops', async () => {
    api.get.mockResolvedValue({ data: { data: aline } });
    await signedInAsAdmin();
    fireEvent.click(screen.getByText('start'));
    await waitFor(() => expect(who()).toBe(aline.email));
    fireEvent.click(screen.getByText('stop'));
    expect(who()).toBe(admin.email);
    expect(getAccessToken()).toBe('admin.token');
    expect(actingText()).toBe('no');
    expect(isActing()).toBe(false);
  });

  it('starts only once', async () => {
    api.get.mockResolvedValue({ data: { data: aline } });
    await signedInAsAdmin();
    fireEvent.click(screen.getByText('start'));
    fireEvent.click(screen.getByText('start'));
    await waitFor(() => expect(who()).toBe(aline.email));
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('stays the admin, with the admin token, when the person cannot be read', async () => {
    api.get.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    await signedInAsAdmin();
    fireEvent.click(screen.getByText('start'));
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    await waitFor(() => expect(getAccessToken()).toBe('admin.token'));
    expect(who()).toBe(admin.email);
    expect(actingText()).toBe('no');
    expect(isActing()).toBe(false);
  });

  it('signs the admin out, not the person, when logging out while acting', async () => {
    api.get.mockResolvedValue({ data: { data: aline } });
    const tokenSeenByLogout: Array<string | null> = [];
    auth.logout.mockImplementation(() => {
      tokenSeenByLogout.push(getAccessToken());
      return Promise.resolve();
    });
    await signedInAsAdmin();
    fireEvent.click(screen.getByText('start'));
    await waitFor(() => expect(who()).toBe(aline.email));
    fireEvent.click(screen.getByText('out'));
    expect(tokenSeenByLogout).toEqual(['admin.token']);
    expect(who()).toBe('nobody');
    expect(actingText()).toBe('no');
    expect(isActing()).toBe(false);
  });

  it('goes back to the admin when the server says the visit has ended', async () => {
    api.get.mockResolvedValue({ data: { data: aline } });
    await signedInAsAdmin();
    fireEvent.click(screen.getByText('start'));
    await waitFor(() => expect(who()).toBe(aline.email));
    act(() => notifySupportEnded());
    expect(who()).toBe(admin.email);
    expect(getAccessToken()).toBe('admin.token');
  });
});
