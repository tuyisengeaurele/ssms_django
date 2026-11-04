import { AxiosError } from 'axios';
import { loadLocale } from '../context/LanguageContext';
import { translations } from '../i18n/translations';
import { fill } from '../utils/fill';

const GENERIC = 'Something went wrong. Please try again.';

type ServerBody = { message?: string; errors?: Record<string, unknown>; retryAfter?: number };

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
    if (!(err instanceof AxiosError)) return GENERIC;

    // The request never got an answer.
    if (!err.response) {
      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return 'That took too long. Please try again.';
      return "We can't reach the server. Check your internet connection and try again.";
    }

    const { status, data } = err.response;
    const body: ServerBody = data && typeof data === 'object' ? (data as ServerBody) : {};

    if (status === 429) return tooManyRequests(secondsToWait(err.response.headers, body));

    const detail = firstFieldError(body.errors);
    if (detail) return detail;

    if (status === 422 && !body.message) {
      return 'Please check what you entered and try again.';
    }
    if (typeof body.message === 'string' && body.message.trim()) return body.message;

    if (status >= 500) return 'Our server hit a problem. Please try again in a moment.';
    if (status === 404) return "We couldn't find what you were looking for.";
    if (status === 403) return "You don't have permission to do that.";
    if (status === 401) return 'Your session has ended. Please sign in again.';
    return GENERIC;
  };

  return { getErrorMessage };
}
