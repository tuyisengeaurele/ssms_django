import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../types';
import { getAccessToken, hasSessionHint, rememberSession, setAccessToken } from '../services/session';

const api = vi.hoisted(() => ({ get: vi.fn() }));
const auth = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock('../services/api', () => ({ default: api }));
vi.mock('../services/auth.service', () => ({ authService: auth }));

import { AuthProvider, useAuth } from './AuthContext';

const post = vi.spyOn(axios, 'post');

const aline = { id: 'u1', name: 'Aline Uwase', email: 'aline@example.rw', role: 'FARMER' } as User;
const bosco = { id: 'u2', name: 'Bosco Mugisha', email: 'bosco@example.rw', role: 'SUPERVISOR' } as User;

const refused = () => new AxiosError('no', 'ERR_BAD_REQUEST', undefined, undefined, { status: 401, data: {}, statusText: '', headers: {}, config: {} as InternalAxiosRequestConfig });
const offline = () => new AxiosError('Network Error', 'ERR_NETWORK');

function Probe() {
  const { user, isLoading, isAuthenticated, login, logout, updateUser, refreshUser } = useAuth();
  return (
    <div>
      <p data-testid="state">{isLoading ? 'loading' : isAuthenticated ? `in:${user?.email}` : 'out'}</p>
      <button onClick={() => login(aline, 'jwt.from.login')}>log in</button>
      <button onClick={() => logout()}>log out</button>
      <button onClick={() => updateUser(bosco)}>update</button>
      <button onClick={() => refreshUser()}>refresh</button>
    </div>
  );
}

const open = (strict = false) => {
  const tree = <AuthProvider><Probe /></AuthProvider>;
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
};

const state = () => screen.getByTestId('state').textContent;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  post.mockReset();
  setAccessToken(null);
  auth.logout.mockResolvedValue(undefined);
});

describe('opening the app', () => {
  it('asks nothing of the server for a visitor who never signed in', async () => {
    open();
    await waitFor(() => expect(state()).toBe('out'));
    expect(post).not.toHaveBeenCalled();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('restores a sign in with the refresh cookie, so a reload keeps the person signed in', async () => {
    rememberSession();
    post.mockResolvedValue({ data: { access: 'restored.token' } });
    api.get.mockResolvedValue({ data: { data: aline } });
    open();
    await waitFor(() => expect(state()).toBe('in:aline@example.rw'));
    expect(getAccessToken()).toBe('restored.token');
    expect(api.get).toHaveBeenCalledWith('/auth/me');
  });

  it('says it is loading until the sign in is known, so no page flashes the login screen', async () => {
    rememberSession();
    let finish: (v: unknown) => void = () => {};
    post.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    api.get.mockResolvedValue({ data: { data: aline } });
    open();
    expect(state()).toBe('loading');
    await act(async () => finish({ data: { access: 't' } }));
    await waitFor(() => expect(state()).toBe('in:aline@example.rw'));
  });

  it('signs out, forgets, and leaves a note when the server says the session is over', async () => {
    rememberSession();
    post.mockRejectedValue(refused());
    open();
    await waitFor(() => expect(state()).toBe('out'));
    expect(hasSessionHint()).toBe(false);
    expect(getAccessToken()).toBeNull();
    expect(sessionStorage.getItem('ssms_notice')).toBe('session_ended');
  });

  it('is signed out for now but keeps trying later when the server could not be reached', async () => {
    rememberSession();
    post.mockRejectedValue(offline());
    open();
    await waitFor(() => expect(state()).toBe('out'));
    expect(hasSessionHint()).toBe(true);
    expect(sessionStorage.getItem('ssms_notice')).toBeNull();
  });

  it('signs out and forgets when the token was renewed but the account cannot be read', async () => {
    rememberSession();
    post.mockResolvedValue({ data: { access: 'restored.token' } });
    api.get.mockRejectedValue(refused());
    open();
    await waitFor(() => expect(state()).toBe('out'));
    expect(hasSessionHint()).toBe(false);
    expect(getAccessToken()).toBeNull();
  });

  it('removes the token and the user that older versions saved', async () => {
    localStorage.setItem('ssms_token', 'old.token');
    localStorage.setItem('ssms_user', JSON.stringify(aline));
    open();
    await waitFor(() => expect(state()).toBe('out'));
    expect(localStorage.getItem('ssms_token')).toBeNull();
    expect(localStorage.getItem('ssms_user')).toBeNull();
  });

  it('does not sign anyone in from a user an older version saved', async () => {
    localStorage.setItem('ssms_token', 'old.token');
    localStorage.setItem('ssms_user', JSON.stringify(aline));
    open();
    await waitFor(() => expect(state()).toBe('out'));
  });

  it('asks the server once when React mounts the app twice in development', async () => {
    rememberSession();
    post.mockResolvedValue({ data: { access: 'restored.token' } });
    api.get.mockResolvedValue({ data: { data: aline } });
    open(true);
    await waitFor(() => expect(state()).toBe('in:aline@example.rw'));
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe('signing in and out', () => {
  it('keeps the token in memory and remembers only that a session exists', async () => {
    open();
    await waitFor(() => expect(state()).toBe('out'));
    fireEvent.click(screen.getByText('log in'));
    expect(state()).toBe('in:aline@example.rw');
    expect(getAccessToken()).toBe('jwt.from.login');
    expect(hasSessionHint()).toBe(true);
    expect(Object.keys({ ...localStorage })).toEqual(['ssms_session']);
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('jwt.from.login');
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('aline@example.rw');
  });

  it('forgets everything on sign out and tells the server to end the session', async () => {
    open();
    await waitFor(() => expect(state()).toBe('out'));
    fireEvent.click(screen.getByText('log in'));
    fireEvent.click(screen.getByText('log out'));
    expect(state()).toBe('out');
    expect(getAccessToken()).toBeNull();
    expect(hasSessionHint()).toBe(false);
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });

  it('signs out even when the server cannot be told', async () => {
    auth.logout.mockRejectedValue(new Error('down'));
    open();
    await waitFor(() => expect(state()).toBe('out'));
    fireEvent.click(screen.getByText('log in'));
    fireEvent.click(screen.getByText('log out'));
    expect(state()).toBe('out');
    expect(getAccessToken()).toBeNull();
  });
});

describe('the person on screen', () => {
  it('changes when the account is edited, and is not saved to the browser', async () => {
    open();
    await waitFor(() => expect(state()).toBe('out'));
    fireEvent.click(screen.getByText('log in'));
    fireEvent.click(screen.getByText('update'));
    expect(state()).toBe('in:bosco@example.rw');
    expect(JSON.stringify({ ...localStorage })).not.toContain('bosco@example.rw');
  });

  it('is read again from the server on request', async () => {
    open();
    await waitFor(() => expect(state()).toBe('out'));
    fireEvent.click(screen.getByText('log in'));
    api.get.mockResolvedValue({ data: { data: bosco } });
    fireEvent.click(screen.getByText('refresh'));
    await waitFor(() => expect(state()).toBe('in:bosco@example.rw'));
  });

  it('is kept as it was when the server cannot be read', async () => {
    open();
    await waitFor(() => expect(state()).toBe('out'));
    fireEvent.click(screen.getByText('log in'));
    api.get.mockRejectedValue(new Error('down'));
    fireEvent.click(screen.getByText('refresh'));
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(state()).toBe('in:aline@example.rw');
  });
});

describe('using the context', () => {
  it('needs a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useAuth must be used within AuthProvider');
    spy.mockRestore();
  });
});
