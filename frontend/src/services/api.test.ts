import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api, { endSession } from './api';
import { getAccessToken, hasSessionHint, rememberSession, setAccessToken } from './session';
import { isWaiting, setWaiting } from './wake';

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

  it('says the sign in sat idle when the server says so', async () => {
    rememberSession();
    post.mockRejectedValue(new AxiosError('no', 'ERR_BAD_REQUEST', undefined, undefined, { status: 401, data: { reason: 'idle' }, statusText: '', headers: {}, config: {} as InternalAxiosRequestConfig }));
    await expect(api.request({ url: '/farms', adapter: answersWith401ThenOk([]) })).rejects.toBeInstanceOf(AxiosError);
    expect(sessionStorage.getItem('ssms_notice')).toBe('session_idle');
  });

  it.each([500, 502, 503, 504])('keeps the session when the renewal got a %i, because a host that is waking or restarting says nothing about it', async (status) => {
    rememberSession();
    post.mockRejectedValue(new AxiosError('bad gateway', 'ERR_BAD_RESPONSE', undefined, undefined, { status, data: {}, statusText: '', headers: {}, config: {} as InternalAxiosRequestConfig }));
    await expect(api.request({ url: '/farms', adapter: answersWith401ThenOk([]) })).rejects.toBeInstanceOf(AxiosError);
    expect(hasSessionHint()).toBe(true);
    expect(sessionStorage.getItem('ssms_notice')).toBeNull();
  });

  it('keeps the session when the renewal got no answer at all, because that says nothing about it', async () => {
    rememberSession();
    post.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    await expect(api.request({ url: '/farms', adapter: answersWith401ThenOk([]) })).rejects.toBeInstanceOf(AxiosError);
    expect(hasSessionHint()).toBe(true);
    expect(sessionStorage.getItem('ssms_notice')).toBeNull();
  });
});

describe('The second step of an admin sign in', () => {
  const refused = (config: InternalAxiosRequestConfig, body: object) =>
    new AxiosError('no', 'ERR_BAD_REQUEST', config, undefined, { status: 401, data: body, statusText: '', headers: {}, config });

  it('ends the session at once, without a refresh, when the server says a code is missing', async () => {
    rememberSession();
    const adapter = async (config: InternalAxiosRequestConfig) => {
      throw refused(config, { code: 'mfa_required' });
    };
    await expect(api.request({ url: '/farms', adapter })).rejects.toBeInstanceOf(AxiosError);
    expect(post).not.toHaveBeenCalled();
    expect(getAccessToken()).toBeNull();
    expect(hasSessionHint()).toBe(false);
    expect(sessionStorage.getItem('ssms_notice')).toBe('session_ended');
  });

  it.each(['/auth/mfa/verify', '/auth/mfa/setup/start', '/auth/mfa/setup/confirm'])('does not try to renew the session when %s is refused', async (url) => {
    rememberSession();
    let calls = 0;
    const adapter = async (config: InternalAxiosRequestConfig) => {
      calls += 1;
      throw refused(config, { reason: 'challenge' });
    };
    await expect(api.request({ url, method: 'post', adapter })).rejects.toBeInstanceOf(AxiosError);
    expect(calls).toBe(1);
    expect(post).not.toHaveBeenCalled();
    expect(hasSessionHint()).toBe(true);
  });

  it.each(['/auth/mfa/verify', '/auth/mfa/setup/start', '/auth/mfa/setup/confirm'])('does not send the token to %s', async (url) => {
    const headers = await sentHeaders(url, 'post');
    expect(headers.Authorization).toBeUndefined();
  });
});

describe('When the session cannot be renewed', () => {
  it('leaves a note for the login page', () => {
    endSession();
    expect(sessionStorage.getItem('ssms_notice')).toBe('session_ended');
  });

  it('leaves a different note when the page ended the sign in because nobody used it', () => {
    endSession('idle');
    expect(sessionStorage.getItem('ssms_notice')).toBe('session_idle');
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

describe('While the free server wakes up', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setWaiting(false);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const okAnswer = (config: InternalAxiosRequestConfig) => ({ data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config });
  const noAnswer = (config: InternalAxiosRequestConfig) => new AxiosError('Network Error', 'ERR_NETWORK', config);
  const withStatus = (config: InternalAxiosRequestConfig, status: number) =>
    new AxiosError('failed', 'ERR_BAD_RESPONSE', config, undefined, { status, data: {}, statusText: '', headers: {}, config });

  it('tries a read again until the server answers, and says so while it waits', async () => {
    let calls = 0;
    const adapter = async (config: InternalAxiosRequestConfig) => {
      calls += 1;
      if (calls <= 2) throw noAnswer(config);
      return okAnswer(config);
    };
    const result = api.request({ url: '/farms', adapter });
    await vi.advanceTimersByTimeAsync(0);
    expect(isWaiting()).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(3000);
    expect((await result).data).toEqual({ ok: true });
    expect(calls).toBe(3);
    expect(isWaiting()).toBe(false);
  });

  it.each([502, 503, 504])('treats a %i as a server that is still waking up', async (status) => {
    let calls = 0;
    const adapter = async (config: InternalAxiosRequestConfig) => {
      calls += 1;
      if (calls === 1) throw withStatus(config, status);
      return okAnswer(config);
    };
    const result = api.request({ url: '/alerts', adapter });
    await vi.advanceTimersByTimeAsync(2000);
    expect((await result).data).toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  it('tries a sign in again, because nothing was saved by it', async () => {
    let calls = 0;
    const adapter = async (config: InternalAxiosRequestConfig) => {
      calls += 1;
      if (calls === 1) throw withStatus(config, 503);
      return okAnswer(config);
    };
    const result = api.request({ url: '/auth/login', method: 'post', adapter });
    await vi.advanceTimersByTimeAsync(2000);
    expect((await result).data).toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  it('never repeats a write, because it could be saved twice', async () => {
    let calls = 0;
    const adapter = async (config: InternalAxiosRequestConfig) => {
      calls += 1;
      throw noAnswer(config);
    };
    await expect(api.request({ url: '/farms', method: 'post', adapter })).rejects.toBeInstanceOf(AxiosError);
    expect(calls).toBe(1);
    expect(isWaiting()).toBe(false);
  });

  it('gives up after about 90 seconds with the usual error, and stops saying it is waiting', async () => {
    let calls = 0;
    const adapter = async (config: InternalAxiosRequestConfig) => {
      calls += 1;
      throw noAnswer(config);
    };
    const settled = api.request({ url: '/farms', adapter }).then(() => 'answered', (error) => error);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await settled).toBeInstanceOf(AxiosError);
    expect(calls).toBeGreaterThan(3);
    expect(calls).toBeLessThan(20);
    expect(isWaiting()).toBe(false);
  });

  it.each([500, 404, 429])('does not wait on a %i, which is a real answer', async (status) => {
    let calls = 0;
    const adapter = async (config: InternalAxiosRequestConfig) => {
      calls += 1;
      throw withStatus(config, status);
    };
    await expect(api.request({ url: '/farms', adapter })).rejects.toBeInstanceOf(AxiosError);
    expect(calls).toBe(1);
    expect(isWaiting()).toBe(false);
  });

  it('does not repeat a request the page cancelled', async () => {
    let calls = 0;
    const adapter = async (config: InternalAxiosRequestConfig) => {
      calls += 1;
      throw new AxiosError('canceled', 'ERR_CANCELED', config);
    };
    await expect(api.request({ url: '/farms', adapter })).rejects.toBeInstanceOf(AxiosError);
    expect(calls).toBe(1);
  });
});
