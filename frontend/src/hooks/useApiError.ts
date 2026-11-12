import { AxiosError } from 'axios';
import { loadLocale } from '../context/LanguageContext';
import { translations } from '../i18n/translations';
import { fill } from '../utils/fill';

/** One of the app's own sentences, in the language of the screen. */
function say(key: string): string {
  const entry = translations[key];
  return entry[loadLocale()] ?? entry.en;
}

// Sentences the server sends all the time, and so the ones a person meets most. The rest of the server's words stay as sent.
const KNOWN_SERVER_SENTENCES: Record<string, string> = {
  "That email or password doesn't look right. Please try again.": 'erBadLogin',
  'An account with this email already exists. Try signing in instead.': 'erEmailTaken',
};

function fromServer(message: string): string {
  const key = KNOWN_SERVER_SENTENCES[message.trim()];
  return key ? say(key) : message;
}

type ServerBody = { message?: string; errors?: Record<string, unknown>; retryAfter?: number; reference?: string };

const REFERENCE = /^[A-Za-z0-9._-]{8,64}$/;

// A wait of more than a day is a mistake somewhere, so it is not shown.
const LONGEST_WAIT = 86_400;

/** How many seconds to wait, from the Retry-After header or the body. Null when neither gives a sensible number. */
function secondsToWait(headers: unknown, body: ServerBody): number | null {
  const header = (headers as Record<string, unknown> | undefined)?.['retry-after'];
  for (const raw of [header, body.retryAfter]) {
    const n = Math.ceil(Number(raw));
    if (Number.isFinite(n) && n >= 1 && n <= LONGEST_WAIT) return n;
  }
  return null;
}

/** Said in the person's language, never in the server's words. */
function tooManyRequests(seconds: number | null): string {
  const key = seconds === null ? 'rlWaitUnknown' : seconds === 1 ? 'rlWaitOne' : 'rlWait';
  const entry = translations[key];
  const text = entry[loadLocale()] ?? entry.en;
  return seconds === null ? text : fill(text, { n: seconds });
}

/** The reference to quote when asking for help, from the body or the header. Only a plain one is shown. */
function referenceOf(headers: unknown, body: ServerBody): string | null {
  const fromHeader = (headers as Record<string, unknown> | undefined)?.['x-request-id'];
  for (const raw of [body.reference, fromHeader]) {
    if (typeof raw === 'string' && REFERENCE.test(raw)) return raw;
  }
  return null;
}

function withReference(message: string, reference: string | null): string {
  if (!reference) return message;
  const entry = translations.erReference;
  return `${message} ${fill(entry[loadLocale()] ?? entry.en, { ref: reference })}`;
}

/** First readable sentence from a field error list such as { email: ['Already taken.'] }. */
function firstFieldError(errors: ServerBody['errors']): string | null {
  if (!errors || typeof errors !== 'object') return null;
  for (const value of Object.values(errors)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === 'string' && first.trim()) return first;
  }
  return null;
}

export function useApiError() {
  const getErrorMessage = (err: unknown): string => {
    if (!(err instanceof AxiosError)) return say('erGeneric');

    // The request never got an answer.
    if (!err.response) {
      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return say('erTooSlow');
      return say('erNoServer');
    }

    const { status, data } = err.response;
    const body: ServerBody = data && typeof data === 'object' ? (data as ServerBody) : {};

    if (status === 429) return tooManyRequests(secondsToWait(err.response.headers, body));

    const detail = firstFieldError(body.errors);
    if (detail) return fromServer(detail);

    if (status === 422 && !body.message) {
      return say('erCheckInput');
    }
    const reference = status >= 500 ? referenceOf(err.response.headers, body) : null;
    if (typeof body.message === 'string' && body.message.trim()) return withReference(fromServer(body.message), reference);

    if (status >= 500) return withReference(say('erServer'), reference);
    if (status === 404) return say('erNotFound');
    if (status === 403) return say('erForbidden');
    if (status === 401) return say('erSession');
    return say('erGeneric');
  };

  return { getErrorMessage };
}
