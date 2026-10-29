import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearLegacyStorage, forgetSession, getAccessToken, hasSessionHint, refreshAccessToken, rememberSession, setAccessToken,
} from './session';

const post = vi.spyOn(axios, 'post');

beforeEach(() => {
  localStorage.clear();
  setAccessToken(null);
  post.mockReset();
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'locks');
});

describe('the access token', () => {
  it('starts empty and keeps what it is given', () => {
    expect(getAccessToken()).toBeNull();
    setAccessToken('abc');
    expect(getAccessToken()).toBe('abc');
    setAccessToken(null);
    expect(getAccessToken()).toBeNull();
  });

  it('is not written to any browser storage', () => {
    setAccessToken('very.secret.token');
    expect(JSON.stringify({ ...localStorage })).not.toContain('very.secret.token');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('very.secret.token');
  });
});

describe('the hint that a session may exist', () => {
  it('is off until a sign in is remembered', () => {
    expect(hasSessionHint()).toBe(false);
    rememberSession();
    expect(hasSessionHint()).toBe(true);
  });

  it('is cleared with the token when the session is forgotten', () => {
    rememberSession();
    setAccessToken('abc');
    forgetSession();
    expect(hasSessionHint()).toBe(false);
    expect(getAccessToken()).toBeNull();
  });

  it('holds nothing but a flag', () => {
    rememberSession();
    expect(Object.values({ ...localStorage })).toEqual(['1']);
  });

  it('survives a browser that will not let it be read or written', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(hasSessionHint()).toBe(false);
    expect(() => rememberSession()).not.toThrow();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});

describe('the keys older versions left behind', () => {
  it('removes a saved token and a saved user, and nothing else', () => {
    localStorage.setItem('ssms_token', 'old.token');
    localStorage.setItem('ssms_user', '{"email":"a@b.rw"}');
    localStorage.setItem('ssms_locale', 'fr');
    clearLegacyStorage();
    expect(localStorage.getItem('ssms_token')).toBeNull();
    expect(localStorage.getItem('ssms_user')).toBeNull();
    expect(localStorage.getItem('ssms_locale')).toBe('fr');
  });
});

describe('asking for a new access token', () => {
  it('sends the refresh cookie, keeps the token in memory and hands it back', async () => {
    post.mockResolvedValue({ data: { access: 'fresh.token' } });
    await expect(refreshAccessToken()).resolves.toBe('fresh.token');
    expect(getAccessToken()).toBe('fresh.token');
    expect(post).toHaveBeenCalledWith(expect.stringContaining('/auth/token/refresh'), {}, { withCredentials: true });
  });

  it('asks the server once when several parts of the page ask together', async () => {
    let finish: (v: unknown) => void = () => {};
    post.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const all = Promise.all([refreshAccessToken(), refreshAccessToken(), refreshAccessToken()]);
    finish({ data: { access: 'one.token' } });
    await expect(all).resolves.toEqual(['one.token', 'one.token', 'one.token']);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('asks again the next time, once the first answer is in', async () => {
    post.mockResolvedValueOnce({ data: { access: 'first' } }).mockResolvedValueOnce({ data: { access: 'second' } });
    await refreshAccessToken();
    await expect(refreshAccessToken()).resolves.toBe('second');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('says it failed, and leaves no token behind', async () => {
    setAccessToken('old');
    post.mockRejectedValue(new Error('401'));
    await expect(refreshAccessToken()).rejects.toThrow('401');
    expect(getAccessToken()).toBeNull();
  });

  it('can be tried again after a failure', async () => {
    post.mockRejectedValueOnce(new Error('401')).mockResolvedValueOnce({ data: { access: 'later' } });
    await expect(refreshAccessToken()).rejects.toThrow();
    await expect(refreshAccessToken()).resolves.toBe('later');
  });

  it('takes a lock shared by every tab, so two tabs never rotate the cookie at once', async () => {
    const request = vi.fn(async (_name: string, callback: () => Promise<unknown>) => callback());
    Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });
    post.mockResolvedValue({ data: { access: 'locked.token' } });
    await refreshAccessToken();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe('ssms-refresh');
  });

  it('still works in a browser without locks', async () => {
    post.mockResolvedValue({ data: { access: 'plain.token' } });
    await expect(refreshAccessToken()).resolves.toBe('plain.token');
  });
});
