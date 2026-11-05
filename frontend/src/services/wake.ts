import axios from 'axios';

/**
 * The free API host sleeps when nobody has used it for a while and takes about a minute to wake. While it wakes,
 * reads are tried again and the page says so, instead of showing "We can't reach the server".
 */

/** How long a request keeps trying, counted from its first failure. */
export const WAKE_DEADLINE_MS = 90_000;

const DELAYS_MS = [2000, 3000, 5000, 8000, 10_000];

/** Seconds to wait before the next try: quick at first, then every 10 seconds. */
export function wakeDelayMs(attempt: number): number {
  return DELAYS_MS[Math.min(attempt, DELAYS_MS.length - 1)];
}

/**
 * A request that got no answer, or a 502, 503 or 504 from the host in front of a sleeping server, may be tried
 * again, but only if that cannot do harm: reads, and signing in. A write that got no answer may have been saved,
 * so it is never repeated.
 */
export function shouldWakeRetry(error: unknown): boolean {
  if (!axios.isAxiosError(error) || error.code === 'ERR_CANCELED') return false;
  if (error.response && ![502, 503, 504].includes(error.response.status)) return false;
  const method = (error.config?.method ?? 'get').toLowerCase();
  const url = error.config?.url ?? '';
  return method === 'get' || method === 'head' || (method === 'post' && url.includes('/auth/login'));
}

let waiting = false;
const listeners = new Set<() => void>();

export function isWaiting(): boolean {
  return waiting;
}

export function setWaiting(on: boolean): void {
  if (waiting === on) return;
  waiting = on;
  listeners.forEach((listener) => listener());
}

export function onWaitingChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
