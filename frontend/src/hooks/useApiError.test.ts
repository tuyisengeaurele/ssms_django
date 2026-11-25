import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODE_KEY } from '../utils/errorCodes';
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
    expect(getErrorMessage(err)).toBe("Can't reach the server. Check your connection and try again.");
  });

  it('says when a request takes too long', () => {
    const err = new AxiosError('timeout of 10000ms exceeded', 'ECONNABORTED');
    expect(getErrorMessage(err)).toBe('That took too long. Try again.');
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
      'Check what you entered and try again.',
    );
  });

  it.each([500, 502, 503])('apologises for a server problem (%i)', (status) => {
    expect(getErrorMessage(withResponse(status, '<html>oops</html>'))).toBe(
      'Server problem. Try again in a moment.',
    );
  });

  it('asks for patience when there are too many requests and no wait time is known', () => {
    expect(getErrorMessage(withResponse(429, {}))).toBe('Too many requests. Wait a moment and try again.');
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
      const body = { message: 'Too many attempts. Try again in 12 seconds.', retryAfter: 12 };
      expect(getErrorMessage(withResponse(429, body))).not.toContain('attempts');
    });

    it('ignores a wait that is not a sensible number', () => {
      for (const bad of ['soon', '-5', '0', '99999999']) {
        expect(getErrorMessage(withResponse(429, {}, { 'retry-after': bad }))).toBe('Too many requests. Wait a moment and try again.');
      }
    });

    it('speaks French', () => {
      localStorage.setItem('ssms_locale', 'fr');
      expect(getErrorMessage(withResponse(429, {}, { 'retry-after': '12' }))).toBe('Trop de demandes. Réessayez dans 12 secondes.');
      expect(getErrorMessage(withResponse(429, {}))).toBe('Trop de demandes. Patientez puis réessayez.');
    });

    it('speaks Kinyarwanda', () => {
      localStorage.setItem('ssms_locale', 'rw');
      expect(getErrorMessage(withResponse(429, {}, { 'retry-after': '12' }))).toContain('12');
      expect(getErrorMessage(withResponse(429, {}, { 'retry-after': '12' }))).not.toContain('Too many');
    });
  });

  describe('the reference of a server problem', () => {
    afterEach(() => localStorage.clear());

    it('is shown after the message, from the body', () => {
      const message = getErrorMessage(withResponse(500, { message: 'Something went wrong. Try again in a moment.', reference: 'A1B2C3D4E5F6' }));
      expect(message).toBe('Something went wrong. Try again in a moment. Reference: A1B2C3D4E5F6');
    });

    it('is read from the header when the body has none', () => {
      expect(getErrorMessage(withResponse(502, '<html>bad gateway</html>', { 'x-request-id': 'ABCDEF123456' }))).toBe(
        'Server problem. Try again in a moment. Reference: ABCDEF123456',
      );
    });

    it('is left out of a mistake the person can fix', () => {
      expect(getErrorMessage(withResponse(422, { message: 'Please enter a name.', reference: 'A1B2C3D4E5F6' }))).toBe('Please enter a name.');
      expect(getErrorMessage(withResponse(403, { reference: 'A1B2C3D4E5F6' }))).toBe("You don't have permission to do that.");
    });

    it('is never shown when it does not look like one', () => {
      expect(getErrorMessage(withResponse(500, { reference: '<b>bad</b>' }))).toBe('Server problem. Try again in a moment.');
    });

    it('is worded in French', () => {
      localStorage.setItem('ssms_locale', 'fr');
      expect(getErrorMessage(withResponse(500, { reference: 'A1B2C3D4E5F6' }))).toMatch(/Référence : A1B2C3D4E5F6$/);
    });
  });

  it('never shows the raw library message', () => {
    expect(getErrorMessage(withResponse(418, {}))).not.toMatch(/status code/i);
  });

  it('handles errors that are not from the network', () => {
    expect(getErrorMessage(new Error('x is undefined'))).toBe('Something went wrong. Try again.');
    expect(getErrorMessage('boom')).toBe('Something went wrong. Try again.');
    expect(getErrorMessage(undefined)).toBe('Something went wrong. Try again.');
  });

  it('uses no dashes', () => {
    const dashes = new RegExp('[' + String.fromCharCode(0x2013) + String.fromCharCode(0x2014) + ']');
    for (const err of [new AxiosError('x', 'ERR_NETWORK'), withResponse(500, {}), withResponse(429, {})]) {
      expect(getErrorMessage(err)).not.toMatch(dashes);
    }
  });
});

// The sentences the app writes itself, and the few the server sends all the time, follow the language of the screen.
describe('getErrorMessage in French and Kinyarwanda', () => {
  afterEach(() => localStorage.clear());

  it('says in French that the server cannot be reached, and that the session ended', () => {
    localStorage.setItem('ssms_locale', 'fr');
    expect(getErrorMessage(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe('Serveur injoignable. Vérifiez votre connexion puis réessayez.');
    expect(getErrorMessage(withResponse(401, {}))).toBe('Session expirée. Reconnectez-vous.');
  });

  it('translates the other sentences the app writes itself', () => {
    localStorage.setItem('ssms_locale', 'rw');
    const sentences = [
      getErrorMessage(new AxiosError('x', 'ECONNABORTED')),
      getErrorMessage(withResponse(422, {})),
      getErrorMessage(withResponse(500, '<html>')),
      getErrorMessage(withResponse(404, {})),
      getErrorMessage(withResponse(403, {})),
      getErrorMessage(withResponse(400, {})),
      getErrorMessage(new Error('plain')),
    ];
    for (const sentence of sentences) expect(sentence).not.toMatch(/\b(please|try again|server|session|permission)\b/i);
  });

  it('translates a wrong password, the message people meet most often', () => {
    localStorage.setItem('ssms_locale', 'rw');
    const server = { message: "That email or password doesn't look right. Please try again." };
    expect(getErrorMessage(withResponse(400, server))).not.toContain('password');
    localStorage.setItem('ssms_locale', 'fr');
    expect(getErrorMessage(withResponse(400, server))).toBe('E-mail ou mot de passe incorrect. Réessayez.');
  });

  it('goes by the code the server sends, in the language of the screen, whatever language the sentence came in', () => {
    localStorage.setItem('ssms_locale', 'fr');
    expect(getErrorMessage(withResponse(401, { code: 'bad_login', message: 'Words in some other language.' })))
      .toBe('E-mail ou mot de passe incorrect. Réessayez.');
    expect(getErrorMessage(withResponse(422, { code: 'email_taken', message: 'Please check what you entered.', errors: { email: ['x'] } })))
      .toContain('a déjà un compte');
  });

  it.each(Object.keys(ERROR_CODE_KEY))('has a sentence for the code %s in all three languages', (code) => {
    const sentences = (['en', 'fr', 'rw'] as const).map((locale) => {
      localStorage.setItem('ssms_locale', locale);
      return getErrorMessage(withResponse(code === 'server_error' ? 500 : 400, { code, message: 'stored words' }));
    });
    for (const sentence of sentences) {
      expect(sentence).not.toContain('stored words');
      expect(sentence).not.toMatch(/^(er|ae)[A-Z]/);
    }
    expect(new Set(sentences).size).toBe(3);
  });

  it('shows the first field problem rather than the general sentence of an invalid form', () => {
    expect(getErrorMessage(withResponse(422, { code: 'invalid_input', message: 'Please check what you entered.', errors: { name: ['Enter your name.'] } })))
      .toBe('Enter your name.');
  });

  it('says the general sentence of an invalid form when no field gives one', () => {
    localStorage.setItem('ssms_locale', 'fr');
    expect(getErrorMessage(withResponse(422, { code: 'invalid_input', message: 'x' }))).toBe('Vérifiez votre saisie puis réessayez.');
  });

  it('leaves the codes that belong to a flow alone, and shows the message the server sent', () => {
    expect(getErrorMessage(withResponse(403, { code: 'mfa_recent_required', message: 'Please confirm with a code.' }))).toBe('Please confirm with a code.');
    expect(getErrorMessage(withResponse(409, { code: 'stale', message: 'That moved on.' }))).toBe('That moved on.');
  });

  it('keeps the reference on a server error that has a code', () => {
    expect(getErrorMessage(withResponse(500, { code: 'server_error', message: 'x', reference: 'ABCDEF123456' }))).toContain('ABCDEF123456');
  });

  it('translates an email that is already taken, and leaves other server words as they are', () => {
    localStorage.setItem('ssms_locale', 'fr');
    expect(getErrorMessage(withResponse(422, { errors: { email: ['An account with this email already exists. Try signing in instead.'] } }))).toContain('a déjà un compte');
    expect(getErrorMessage(withResponse(400, { message: 'Some sentence only the server knows.' }))).toBe('Some sentence only the server knows.');
  });
});

