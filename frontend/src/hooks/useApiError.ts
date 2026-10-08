import { AxiosError } from 'axios';

const GENERIC = 'Something went wrong. Please try again.';

type ServerBody = { message?: string; errors?: Record<string, unknown> };

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

    const detail = firstFieldError(body.errors);
    if (detail) return detail;

    if (status === 422 && (!body.message || body.message === 'Validation failed.')) {
      return 'Please check what you entered and try again.';
    }
    if (typeof body.message === 'string' && body.message.trim()) return body.message;

    if (status === 429) return 'Too many attempts. Please wait a moment and try again.';
    if (status >= 500) return 'Our server hit a problem. Please try again in a moment.';
    if (status === 404) return "We couldn't find what you were looking for.";
    if (status === 403) return "You don't have permission to do that.";
    if (status === 401) return 'Your session has ended. Please sign in again.';
    return GENERIC;
  };

  return { getErrorMessage };
}
