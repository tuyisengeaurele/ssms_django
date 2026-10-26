import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';
import { useApiError } from './useApiError';

const { getErrorMessage } = useApiError();

function withResponse(status: number, data: unknown) {
  const config = { headers: new AxiosHeaders() };
  const response = { status, statusText: '', headers: {}, config, data } as AxiosResponse;
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

  it('asks for patience when there are too many requests', () => {
    expect(getErrorMessage(withResponse(429, {}))).toBe('Too many attempts. Please wait a moment and try again.');
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
