import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api, { endSession } from './api';
import { getAccessToken, hasSessionHint, rememberSession, setAccessToken } from './session';

const post = vi.spyOn(axios, 'post');

/** Send a request through the real interceptors, but answer from memory. */
async function sentHeaders(url: string, method: 'get' | 'post' = 'get') {
  let seen: InternalAxiosRequestConfig | undefined;
  await api.request({
    url,
    method,
    adapter: async (config) => {
      seen = config;
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    },
  });
  return seen!.headers;
}

/** An answer of 401 the first time and 200 after, recording the token each try was sent with. */
function answersWith401ThenOk(tokensSeen: Array<string | undefined>) {
  let calls = 0;
  return async (config: InternalAxiosRequestConfig) => {
    calls += 1;
    tokensSeen.push(config.headers.Authorization as string | undefined);
    if (calls === 1) {
      throw new AxiosError('no', 'ERR_BAD_REQUEST', config, undefined, { status: 401, data: {}, statusText: '', headers: {}, config });
    }
    return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
  };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setAccessToken('held.in.memory');
  post.mockReset();
});

describe('API client', () => {
  it('sends the token held in memory to private pages', async () => {
    const headers = await sentHeaders('/farms');
    expect(headers.Authorization).toBe('Bearer held.in.memory');
  });

  it('never looks for a token in browser storage', async () => {
    setAccessToken(null);
    localStorage.setItem('ssms_token', 'left.in.storage');
    const headers = await sentHeaders('/farms');
    expect(headers.Authorization).toBeUndefined();
  });

  it.each([
    '/auth/login',
    '/auth/register',
    '/auth/password-reset/request',
    '/auth/password-reset/confirm',
    '/auth/resend-verification',
    '/auth/verify-email',
    '/lots/abc123tokenXYZ',
  ])('does not send the token to %s', async (url) => {
    const headers = await sentHeaders(url, 'post');
    expect(headers.Authorization).toBeUndefined();
  });
});

describe('When the access token has run out', () => {
  it('asks for a new one and sends the same request again with it', async () => {
    post.mockResolvedValue({ data: { access: 'new.token' } });
    const seen: Array<string | undefined> = [];
    const res = await api.request({ url: '/farms', adapter: answersWith401ThenOk(seen) });
    expect(res.data).toEqual({ ok: true });
    expect(seen).toEqual(['Bearer held.in.memory', 'Bearer new.token']);
    expect(getAccessToken()).toBe('new.token');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('asks for one new token when several requests run out together', async () => {
    let finish: (v: unknown) => void = () => {};
    post.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const seen: Array<string | undefined> = [];
    const three = Promise.all([
      api.request({ url: '/a', adapter: answersWith401ThenOk(seen) }),
      api.request({ url: '/b', adapter: answersWith401ThenOk(seen) }),
      api.request({ url: '/c', adapter: answersWith401ThenOk(seen) }),
    ]);
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    finish({ data: { access: 'shared.token' } });
    await three;
    expect(post).toHaveBeenCalledTimes(1);
    expect(seen.filter((s) => s === 'Bearer shared.token')).toHaveLength(3);
  });

  it('does not try to renew a failed sign in', async () => {
    const adapter = async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError('no', 'ERR_BAD_REQUEST', config, undefined, { status: 401, data: {}, statusText: '', headers: {}, config });
    };
    await expect(api.request({ url: '/auth/login', method: 'post', adapter })).rejects.toBeInstanceOf(AxiosError);
    expect(post).not.toHaveBeenCalled();
  });

  it('gives up after one renewal, so a request refused twice does not loop', async () => {
    post.mockResolvedValue({ data: { access: 'new.token' } });
    let calls = 0;
    const adapter = async (config: InternalAxiosRequestConfig) => {
      calls += 1;
      throw new AxiosError('no', 'ERR_BAD_REQUEST', config, undefined, { status: 401, data: {}, statusText: '', headers: {}, config });
    };
    await expect(api.request({ url: '/farms', adapter })).rejects.toBeInstanceOf(AxiosError);
    expect(calls).toBe(2);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('ends the session when the server refuses the renewal', async () => {
    rememberSession();
    post.mockRejectedValue(new AxiosError('no', 'ERR_BAD_REQUEST', undefined, undefined, { status: 401, data: {}, statusText: '', headers: {}, config: {} as InternalAxiosRequestConfig }));
    await expect(api.request({ url: '/farms', adapter: answersWith401ThenOk([]) })).rejects.toBeInstanceOf(AxiosError);
    expect(getAccessToken()).toBeNull();
    expect(hasSessionHint()).toBe(false);
    expect(sessionStorage.getItem('ssms_notice')).toBe('session_ended');
  });

  it('keeps the session when the renewal got no answer at all, because that says nothing about it', async () => {
    rememberSession();
    post.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    await expect(api.request({ url: '/farms', adapter: answersWith401ThenOk([]) })).rejects.toBeInstanceOf(AxiosError);
    expect(hasSessionHint()).toBe(true);
    expect(sessionStorage.getItem('ssms_notice')).toBeNull();
  });
});

describe('When the session cannot be renewed', () => {
  it('leaves a note for the login page', () => {
    endSession();
    expect(sessionStorage.getItem('ssms_notice')).toBe('session_ended');
  });

  it('forgets the token, the hint and anything older versions saved', () => {
    rememberSession();
    localStorage.setItem('ssms_token', 'old.token');
    localStorage.setItem('ssms_user', '{}');
    endSession();
    expect(getAccessToken()).toBeNull();
    expect(hasSessionHint()).toBe(false);
    expect(localStorage.getItem('ssms_token')).toBeNull();
    expect(localStorage.getItem('ssms_user')).toBeNull();
  });
});
