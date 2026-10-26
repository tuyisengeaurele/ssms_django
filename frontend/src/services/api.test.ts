import type { InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it } from 'vitest';
import api from './api';

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

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('ssms_token', 'old.stale.token');
});

describe('API client', () => {
  it('sends the saved token to private pages', async () => {
    const headers = await sentHeaders('/farms');
    expect(headers.Authorization).toBe('Bearer old.stale.token');
  });

  it.each([
    '/auth/login',
    '/auth/register',
    '/auth/password-reset/request',
    '/auth/password-reset/confirm',
    '/auth/resend-verification',
    '/auth/verify-email',
  ])('does not send a saved token to %s', async (url) => {
    const headers = await sentHeaders(url, 'post');
    expect(headers.Authorization).toBeUndefined();
  });
});

describe('When the session cannot be renewed', () => {
  it('leaves a note for the login page', async () => {
    const { endSession } = await import('./api');
    endSession();
    expect(sessionStorage.getItem('ssms_notice')).toBe('session_ended');
    expect(localStorage.getItem('ssms_token')).toBeNull();
  });
});
