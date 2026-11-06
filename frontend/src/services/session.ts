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

/**
 * While an admin acts as a person the page holds the person's support token in `accessToken`. The refresh cookie still
 * belongs to the admin, so nothing may renew a token with it then, or the person's request would go out as the admin.
 */
let acting = false;
export const isActing = () => acting;
export const setActing = (value: boolean) => {
  acting = value;
};

// Visits the admin has just ended and the server has not answered yet. The strip that offers an open visit after a reload
// must not offer one of these, or it would show a visit that is already over.
const endingNow = new Set<string>();
export const markEnding = (id: string) => { endingNow.add(id); };
export const doneEnding = (id: string) => { endingNow.delete(id); };
export const isEnding = (id: string) => endingNow.has(id);

// The visit ended, or its token ran out. The page goes back to the admin.
const supportEndedListeners = new Set<() => void>();
// Remembered until the admin's page has said so, because the page that shows the note appears after this runs.
let supportEndedUnseen = false;
export function onSupportEnded(listener: () => void): () => void {
  supportEndedListeners.add(listener);
  return () => {
    supportEndedListeners.delete(listener);
  };
}
export function notifySupportEnded() {
  supportEndedUnseen = true;
  supportEndedListeners.forEach((listener) => listener());
}
/** True once after a visit was ended by the server or by its time running out. */
export function takeSupportEnded(): boolean {
  const unseen = supportEndedUnseen;
  supportEndedUnseen = false;
  return unseen;
}

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

/**
 * Only a refusal ends a sign in. No answer, or a 5xx from a host that is waking up or restarting, says nothing
 * about the session, so the person keeps it and tries again.
 */
export function serverRefusedTheSession(error: unknown): boolean {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  return status === 401 || status === 403;
}

export type EndedNotice ='session_ended' | 'session_idle';

/** Why a sign in could not be renewed, from the server's answer. Sitting idle gets its own, kinder, note. */
export function endedNotice(error: unknown): EndedNotice {
  const reason = axios.isAxiosError(error) ? (error.response?.data as { reason?: string } | undefined)?.reason : undefined;
  return reason === 'idle' ? 'session_idle' : 'session_ended';
}

/** Leaves a one time note for the login page. The note is a courtesy, so a browser that refuses storage loses nothing else. */
export function leaveNotice(notice: EndedNotice) {
  try {
    sessionStorage.setItem('ssms_notice', notice);
  } catch {
    // Signing out still works without it.
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
