/**
 * Wakes the API before a person needs it.
 *
 * On the free plan the API sleeps after 15 minutes without a visit, and waking takes about a minute. A visitor who is about to
 * sign in gives some warning: they hover or touch the Log in button, or they have opened the sign in page and are typing
 * their email. This sends one quiet request to the health route at that moment, so the wake has already started when they
 * press Sign in. It changes nothing for a server that is awake.
 *
 * It is not called when the landing page merely loads: search engines and link previews run pages too, and every call of a
 * sleeping free server uses some of the month's free hours.
 */

let asked = false;

/** Forget that the API was asked. For tests: in the app, each page load starts fresh anyway. */
export function resetWarmUp(): void {
  asked = false;
}

function saveDataRequested(): boolean {
  const connection = (typeof navigator !== 'undefined' ? navigator : undefined) as
    | (Navigator & { connection?: { saveData?: boolean } })
    | undefined;
  return connection?.connection?.saveData === true;
}

/** Ask the health route once. Never throws, never shows anything, sends no cookie and no token. */
export function warmUp(): void {
  if (asked) return;
  asked = true;
  if (typeof fetch !== 'function' || saveDataRequested()) return;
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';
  try {
    fetch(`${base}/health`, { method: 'GET', credentials: 'omit', keepalive: true }).catch(() => {});
  } catch {
    // A browser that refuses the request still signs in normally. The wake banner covers the wait.
  }
}

/** Handlers for a button that leads to signing in or creating an account: a pointer, a keyboard and a finger. */
export const warmOnIntent = {
  onPointerEnter: warmUp,
  onFocus: warmUp,
  onTouchStart: warmUp,
};
