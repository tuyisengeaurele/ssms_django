import axios, { AxiosRequestConfig } from 'axios';
import { loadLocale } from '../context/LanguageContext';
import { setWaiting, shouldWakeRetry, WAKE_DEADLINE_MS, wakeDelayMs } from './wake';
import {
  clearLegacyStorage, endedNotice, forgetSession, getAccessToken, isActing, leaveNotice, notifySupportEnded, refreshAccessToken,
  serverRefusedTheSession,
} from './session';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,  // send httpOnly refresh cookie on every request
});

// Pages anyone can open. A token must not be sent to them.
const PUBLIC_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/password-reset',
  '/auth/resend-verification',
  '/auth/verify-email',
  // The links in the emails about a change of login email. Asking for one (/auth/email-change itself) needs the person.
  '/auth/email-change/confirm',
  '/auth/email-change/undo',
  '/auth/token/refresh',
  // The second step of an admin sign in is proved by a challenge, not a token.
  '/auth/mfa/verify',
  '/auth/mfa/setup',
  '/lots/',
];

api.interceptors.request.use((config) => {
  // From the start of the address: a private address can have "/lots/" inside it (the staff lot trace, /supply/lots/...).
  const isPublic = PUBLIC_PATHS.some((path) => config.url?.startsWith(path));
  const token = getAccessToken();
  if (token && !isPublic) config.headers.Authorization = `Bearer ${token}`;
  // The language of the screen, so the server writes its sentences in it (and so does a page that cannot read the code).
  config.headers['Accept-Language'] = loadLocale();
  return config;
});

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

api.interceptors.response.use(
  (res) => {
    setWaiting(false);
    return res;
  },
  async (err) => {
    const originalConfig = err.config as (AxiosRequestConfig & { _retry?: boolean; _wakeStartedAt?: number; _wakeTry?: number }) | undefined;

    // A sleeping free server: try again, up to a deadline, and let the page say so. Never for a write.
    if (originalConfig && shouldWakeRetry(err)) {
      const started = originalConfig._wakeStartedAt ?? Date.now();
      if (Date.now() - started >= WAKE_DEADLINE_MS) {
        setWaiting(false);
        return Promise.reject(err);
      }
      originalConfig._wakeStartedAt = started;
      const attempt = originalConfig._wakeTry ?? 0;
      originalConfig._wakeTry = attempt + 1;
      setWaiting(true);
      await sleep(wakeDelayMs(attempt));
      return api(originalConfig);
    }

    // A request the page made on its own may renew a sign in that ran out, and nothing more. Whatever else a 401 means
    // is left for a request the person made, which says so.
    const silent = originalConfig?.silent === true;
    if (silent && err.response?.status === 401) {
      const code = (err.response.data as { code?: string } | undefined)?.code ?? '';
      if (isActing() || ['support_ended', 'mfa_required', 'session_idle'].includes(code)) return Promise.reject(err);
    }

    // An admin acting as a person holds a token that cannot be renewed. The refresh cookie is the admin's, and using it
    // would send the person's request as the admin. So a 401 here, whatever the reason, is the end of the visit.
    if (err.response?.status === 401 && (isActing() || (err.response?.data as { code?: string } | undefined)?.code === 'support_ended')) {
      notifySupportEnded();
      return Promise.reject(err);
    }

    // An admin session that never passed a code cannot be renewed into one. Sign in again, which asks for the code.
    if (err.response?.status === 401 && (err.response?.data as { code?: string } | undefined)?.code === 'mfa_required') {
      endSession('ended');
      return Promise.reject(err);
    }

    // Only attempt refresh on 401 for non-auth endpoints (avoid refresh loop)
    if (
      originalConfig &&
      err.response?.status === 401 &&
      !originalConfig._retry &&
      !originalConfig.url?.includes('/auth/login') &&
      !originalConfig.url?.includes('/auth/mfa/verify') &&
      !originalConfig.url?.includes('/auth/mfa/setup') &&
      !originalConfig.url?.includes('/auth/token/refresh') &&
      !originalConfig.url?.includes('/auth/logout')
    ) {
      originalConfig._retry = true;
      try {
        // Requests that run out together share one renewal, and only one tab renews at a time.
        const newAccessToken = await refreshAccessToken();
        (originalConfig.headers as Record<string, string>)['Authorization'] = `Bearer ${newAccessToken}`;
        return api(originalConfig);
      } catch (refreshError) {
        // No answer, or a 5xx while the server wakes or restarts, says nothing about the session, so it is kept.
        if (silent || !serverRefusedTheSession(refreshError)) return Promise.reject(err);
        endSession(endedNotice(refreshError) === 'session_idle' ? 'idle' : 'ended');
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(err);
  }
);

/** Forgets the sign in and sends the person to the login page with a short explanation. */
export function endSession(reason: 'ended' | 'idle' = 'ended') {
  forgetSession();
  clearLegacyStorage();
  leaveNotice(reason === 'idle' ? 'session_idle' : 'session_ended');
  window.location.href = '/login';
}

export default api;
