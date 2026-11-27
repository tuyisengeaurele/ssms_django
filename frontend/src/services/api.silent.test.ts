import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from './api';
import { getAccessToken, hasSessionHint, onSupportEnded, rememberSession, setAccessToken, setActing } from './session';
import { isWaiting, setWaiting } from './wake';

// A request the page makes on its own, such as the check for announcements, is marked `silent`. Nobody asked for it, so it
// must never speak: no retry, no note about the server, and it never signs anyone out.

const post = vi.spyOn(axios, 'post');

/** An adapter that always fails, counting the tries. No status means no answer at all. */
function failing(status?: number, data: unknown = {}) {
  const seen = { tries: 0 };
  const adapter = async (config: InternalAxiosRequestConfig) => {
    seen.tries += 1;
    const answer = status === undefined ? undefined : { status, data, statusText: '', headers: {}, config };
    throw new AxiosError('no', status === undefined ? 'ERR_NETWORK' : 'ERR_BAD_RESPONSE', config, undefined, answer);
  };
  return { adapter, seen };
}

const ask = (adapter: (config: InternalAxiosRequestConfig) => Promise<never>) => api.get('/announcements', { silent: true, adapter });

const refused = () => new AxiosError('no', 'ERR_BAD_REQUEST', undefined, undefined, {
  status: 401, data: {}, statusText: '', headers: {}, config: {} as InternalAxiosRequestConfig,
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setAccessToken('held.in.memory');
  rememberSession();
  setWaiting(false);
  post.mockReset();
});

afterEach(() => setActing(false));

describe('A silent request', () => {
  it.each([502, 503, 504, undefined])('is tried once when the server does not answer (%s), with no note about it', async (status) => {
    const { adapter, seen } = failing(status);
    await expect(ask(adapter)).rejects.toThrow();
    expect(seen.tries).toBe(1);
    expect(isWaiting()).toBe(false);
  });

  it('renews a sign in that ran out, like any request', async () => {
    post.mockResolvedValue({ data: { access: 'renewed' } });
    const sent: unknown[] = [];
    const answer = await api.get('/announcements', {
      silent: true,
      adapter: async (config) => {
        sent.push(config.headers.Authorization);
        if (sent.length === 1) {
          throw new AxiosError('no', 'ERR_BAD_REQUEST', config, undefined, { status: 401, data: { code: 'session_ended' }, statusText: '', headers: {}, config });
        }
        return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
      },
    });
    expect(answer.data.ok).toBe(true);
    expect(sent).toEqual(['Bearer held.in.memory', 'Bearer renewed']);
  });

  it('does not sign anyone out when the renewal is refused', async () => {
    post.mockRejectedValue(refused());
    const { adapter } = failing(401, { code: 'session_ended' });
    await expect(ask(adapter)).rejects.toThrow();
    expect(hasSessionHint()).toBe(true);
    expect(sessionStorage.getItem('ssms_notice')).toBeNull();
  });

  // The sign in has sat too long. The page's own warning, or the next thing the person does, says so.
  it.each(['session_idle', 'mfa_required'])('leaves %s for a request the person made', async (code) => {
    const { adapter, seen } = failing(401, { code });
    await expect(ask(adapter)).rejects.toThrow();
    expect(seen.tries).toBe(1);
    expect(post).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe('held.in.memory');
    expect(hasSessionHint()).toBe(true);
    expect(sessionStorage.getItem('ssms_notice')).toBeNull();
  });

  it.each([['a support visit', true, 'session_ended'], ['a visit the server ended', false, 'support_ended']])(
    'does not end %s by itself',
    async (_, acting, code) => {
      setActing(acting as boolean);
      const heard = vi.fn();
      const stop = onSupportEnded(heard);
      const { adapter } = failing(401, { code });
      await expect(ask(adapter)).rejects.toThrow();
      expect(heard).not.toHaveBeenCalled();
      expect(post).not.toHaveBeenCalled();
      stop();
    },
  );
});
