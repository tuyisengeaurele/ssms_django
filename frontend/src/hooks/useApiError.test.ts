import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useApiError } from './useApiError';

const { getErrorMessage } = renderHook(() => useApiError()).result.current;

function withResponse(status: number, data: unknown, headers: Record<string, string> = {}) {
  const config = { headers: new AxiosHeaders() };
  const response = { status, statusText: '', headers, config, data } as AxiosResponse;
  return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', config, null, response);
}

describe('getErrorMessage', () => {
  it('shows the message the server sent', () => {
    expect(getErrorMessage(withResponse(401, { message: "That email or password doesn't look right." }))).toBe(
      "That email or password doesn't look right.",
    );
  });

  it('says when the server cannot be reached', () => {
    const err = new AxiosError('Network Error', 'ERR_NETWORK');
    expect(getErrorMessage(err)).toBe("We can't reach the server. Check your internet connection and try again.");
  });

  it('says when a request takes too long', () => {
    const err = new AxiosError('timeout of 10000ms exceeded', 'ECONNABORTED');
    expect(getErrorMessage(err)).toBe('That took too long. Please try again.');
  });

  it('shows the first problem from a form that did not pass checks', () => {
    const err = withResponse(422, {
      message: 'Validation failed.',
      errors: { email: ['A user with that email already exists.'], password: ['Too short.'] },
    });
    expect(getErrorMessage(err)).toBe('A user with that email already exists.');
  });

  it('asks the person to check the form when no detail comes back', () => {
    expect(getErrorMessage(withResponse(422, {}))).toBe(
      'Please check what you entered and try again.',
    );
  });

  it.each([500, 502, 503])('apologises for a server problem (%i)', (status) => {
    expect(getErrorMessage(withResponse(status, '<html>oops</html>'))).toBe(
      'Our server hit a problem. Please try again in a moment.',
    );
  });

  it('asks for patience when there are too many requests and no wait time is known', () => {
    expect(getErrorMessage(withResponse(429, {}))).toBe('Too many requests. Please wait a moment and try again.');
  });

  describe('after too many requests', () => {
    afterEach(() => localStorage.clear());

    it('says how long to wait, from the Retry-After header', () => {
      expect(getErrorMessage(withResponse(429, {}, { 'retry-after': '12' }))).toBe('Too many requests. Try again in 12 seconds.');
    });

    it('says one second in the singular', () => {
      expect(getErrorMessage(withResponse(429, {}, { 'retry-after': '1' }))).toBe('Too many requests. Try again in 1 second.');
    });

    it('takes the wait from the body when the browser hides the header', () => {
      expect(getErrorMessage(withResponse(429, { message: 'x', retryAfter: 30 }))).toBe('Too many requests. Try again in 30 seconds.');
    });

    it('never shows the words the server sent', () => {
      const body = { message: 'Too many attempts. Please try again in 12 seconds.', retryAfter: 12 };
      expect(getErrorMessage(withResponse(429, body))).not.toContain('attempts');
    });

    it('ignores a wait that is not a sensible number', () => {
      for (const bad of ['soon', '-5', '0', '99999999']) {
        expect(getErrorMessage(withResponse(429, {}, { 'retry-after': bad }))).toBe('Too many requests. Please wait a moment and try again.');
      }
    });

    it('speaks French', () => {
      localStorage.setItem('ssms_locale', 'fr');
      expect(getErrorMessage(withResponse(429, {}, { 'retry-after': '12' }))).toBe('Trop de demandes. Réessayez dans 12 secondes.');
      expect(getErrorMessage(withResponse(429, {}))).toBe('Trop de demandes. Patientez un instant puis réessayez.');
    });

    it('speaks Kinyarwanda', () => {
      localStorage.setItem('ssms_locale', 'rw');
      expect(getErrorMessage(withResponse(429, {}, { 'retry-after': '12' }))).toContain('12');
      expect(getErrorMessage(withResponse(429, {}, { 'retry-after': '12' }))).not.toContain('Too many');
    });
  });

  it('never shows the raw library message', () => {
    expect(getErrorMessage(withResponse(418, {}))).not.toMatch(/status code/i);
  });

  it('handles errors that are not from the network', () => {
    expect(getErrorMessage(new Error('x is undefined'))).toBe('Something went wrong. Please try again.');
    expect(getErrorMessage('boom')).toBe('Something went wrong. Please try again.');
    expect(getErrorMessage(undefined)).toBe('Something went wrong. Please try again.');
  });

  it('uses no dashes', () => {
    const dashes = new RegExp('[' + String.fromCharCode(0x2013) + String.fromCharCode(0x2014) + ']');
    for (const err of [new AxiosError('x', 'ERR_NETWORK'), withResponse(500, {}), withResponse(429, {})]) {
      expect(getErrorMessage(err)).not.toMatch(dashes);
    }
  });
});
