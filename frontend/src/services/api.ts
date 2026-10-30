import axios, { AxiosRequestConfig } from 'axios';
import { clearLegacyStorage, forgetSession, getAccessToken, refreshAccessToken } from './session';

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
  '/auth/token/refresh',
  '/lots/',
];

api.interceptors.request.use((config) => {
  const isPublic = PUBLIC_PATHS.some((path) => config.url?.includes(path));
  const token = getAccessToken();
  if (token && !isPublic) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalConfig = err.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;

    // Only attempt refresh on 401 for non-auth endpoints (avoid refresh loop)
    if (
      originalConfig &&
      err.response?.status === 401 &&
      !originalConfig._retry &&
      !originalConfig.url?.includes('/auth/login') &&
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
        // No answer at all (offline, server restarting) says nothing about the session, so it is kept.
        if (axios.isAxiosError(refreshError) && !refreshError.response) return Promise.reject(err);
        endSession();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(err);
  }
);

/** Forgets the sign in and sends the person to the login page with a short explanation. */
export function endSession() {
  forgetSession();
  clearLegacyStorage();
  try {
    sessionStorage.setItem('ssms_notice', 'session_ended');
  } catch {
    // The note is a courtesy. Signing out still works without it.
  }
  window.location.href = '/login';
}

export default api;
