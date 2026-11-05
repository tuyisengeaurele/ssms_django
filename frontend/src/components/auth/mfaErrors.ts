import axios from 'axios';

/**
 * How the second step of an admin sign in failed, from the server's answer.
 *  expired: the challenge is gone (too slow, used, or killed by wrong codes), so the password step starts again.
 *  wrong:   a code that is not right, which the person may try again.
 *  other:   anything else, such as a lockout or no connection, shown with the server's own words.
 */
export function mfaFailure(error: unknown): 'expired' | 'wrong' | 'other' {
  if (!axios.isAxiosError(error) || !error.response) return 'other';
  const { status, data } = error.response;
  if ((data as { reason?: string } | undefined)?.reason === 'challenge') return 'expired';
  if (status === 401 || status === 422) return 'wrong';
  return 'other';
}

/** What people type in groups ("123 456") or with a dash is sent as plain characters. */
export function plain(code: string): string {
  return code.replace(/\s/g, '');
}
