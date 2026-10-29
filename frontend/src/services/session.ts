import axios from 'axios';

/**
 * The sign in lives in two places.
 * - The access token is held here, in memory, for this tab only. It is never written to browser storage, so a page
 *   reload starts without one and asks for a new one with the refresh cookie.
 * - The refresh token is an httpOnly cookie that scripts cannot read.
 */
let accessToken: string | null = null;

export const getAccessToken = () => accessToken;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

// A flag, not a secret. It says a sign in may still be alive, so a page does not ask for a new token for a visitor
// who never signed in. The browser may refuse storage, and nothing should break when it does.
const HINT_KEY = 'ssms_session';

export function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberSession() {
  try {
    localStorage.setItem(HINT_KEY, '1');
  } catch {
    // Without the flag, a reload simply starts signed out.
  }
}

export function forgetSession() {
  accessToken = null;
  try {
    localStorage.removeItem(HINT_KEY);
  } catch {
    // Nothing more to do.
  }
}

/** Earlier versions kept the token and the user in localStorage. They are removed so nothing old stays readable. */
export function clearLegacyStorage() {
  try {
    localStorage.removeItem('ssms_token');
    localStorage.removeItem('ssms_user');
  } catch {
    // Nothing more to do.
  }
}

const apiBase = () => import.meta.env.VITE_API_BASE_URL ?? '/api';

/** One tab at a time. The server rotates the refresh cookie and refuses the old one, so two at once would sign the person out. */
function oneTabAtATime<T>(work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? (locks.request('ssms-refresh', work) as Promise<T>) : work();
}

let inFlight: Promise<string> | null = null;

/**
 * Ask for a new access token with the refresh cookie.
 * Callers who ask while a request is out share its answer, so there is one request at a time in this tab.
 */
export function refreshAccessToken(): Promise<string> {
  if (!inFlight) {
    inFlight = oneTabAtATime(async () => {
      try {
        // The bare axios, not the shared client, so a failed refresh cannot start another refresh.
        const response = await axios.post(`${apiBase()}/auth/token/refresh`, {}, { withCredentials: true });
        const token: string = response.data.access;
        accessToken = token;
        return token;
      } catch (error) {
        accessToken = null;
        throw error;
      }
    }).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
