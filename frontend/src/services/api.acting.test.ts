import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from './api';
import { onSupportEnded, setAccessToken, setActing } from './session';

const post = vi.spyOn(axios, 'post');

/** Answers 401 and records the token each try was sent with. */
const answers401 = (data: object, tokensSeen: Array<string | undefined>) => async (config: InternalAxiosRequestConfig) => {
  tokensSeen.push(config.headers.Authorization as string | undefined);
  throw new AxiosError('no', 'ERR_BAD_REQUEST', config, undefined, { status: 401, data, statusText: '', headers: {}, config });
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  post.mockReset();
  setAccessToken('support.token');
  setActing(true);
});

afterEach(() => {
  setActing(false);
});

describe('While an admin is acting as a person', () => {
  it('tells the page when the server says the support session has ended, and never refreshes or retries', async () => {
    const ended = vi.fn();
    const stop = onSupportEnded(ended);
    const seen: Array<string | undefined> = [];
    await expect(api.request({ url: '/farms', adapter: answers401({ code: 'support_ended' }, seen) })).rejects.toBeTruthy();
    stop();
    expect(ended).toHaveBeenCalledTimes(1);
    expect(post).not.toHaveBeenCalled();
    expect(seen).toEqual(['Bearer support.token']);
  });

  it('treats any plain 401 as the end of the visit, because the cookie belongs to the admin and must not be used', async () => {
    // The support token simply ran out. Renewing it with the admin cookie would send the person's request as the admin.
    const ended = vi.fn();
    const stop = onSupportEnded(ended);
    const seen: Array<string | undefined> = [];
    await expect(api.request({ url: '/farms', adapter: answers401({}, seen) })).rejects.toBeTruthy();
    stop();
    expect(ended).toHaveBeenCalledTimes(1);
    expect(post).not.toHaveBeenCalled();
    expect(seen).toEqual(['Bearer support.token']);
  });

  it('still renews the token of an ordinary sign in', async () => {
    setActing(false);
    setAccessToken('held.in.memory');
    post.mockResolvedValue({ data: { access: 'new.token' } });
    const seen: Array<string | undefined> = [];
    let calls = 0;
    await api.request({
      url: '/farms',
      adapter: async (config) => {
        calls += 1;
        seen.push(config.headers.Authorization as string | undefined);
        if (calls === 1) {
          throw new AxiosError('no', 'ERR_BAD_REQUEST', config, undefined, { status: 401, data: {}, statusText: '', headers: {}, config });
        }
        return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
      },
    });
    expect(seen).toEqual(['Bearer held.in.memory', 'Bearer new.token']);
  });
});
