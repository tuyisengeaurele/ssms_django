import axios, { AxiosRequestConfig } from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ssms_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Track whether a refresh is in-flight to avoid parallel refresh attempts
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
  config: AxiosRequestConfig;
}> = [];

function processQueue(error: unknown, newToken: string | null) {
  failedQueue.forEach(({ resolve, reject, config }) => {
    if (error) {
      reject(error);
    } else if (newToken) {
      (config.headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
      resolve(api(config));
    }
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalConfig = err.config as AxiosRequestConfig & { _retry?: boolean };

    // Only attempt refresh on 401 for non-auth endpoints (avoid refresh loop)
    if (
      err.response?.status === 401 &&
      !originalConfig._retry &&
      !originalConfig.url?.includes('/auth/login') &&
      !originalConfig.url?.includes('/auth/token/refresh')
    ) {
      const refreshToken = localStorage.getItem('ssms_refresh_token');

      if (!refreshToken) {
        // No refresh token available — log out immediately
        _doLogout();
        return Promise.reject(err);
      }

      if (isRefreshing) {
        // Queue this request to retry once the refresh completes
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject, config: originalConfig });
        });
      }

      originalConfig._retry = true;
      isRefreshing = true;

      try {
        const response = await axios.post(
          `${import.meta.env.VITE_API_BASE_URL ?? '/api'}/auth/token/refresh`,
          { refresh: refreshToken },
        );
        const newAccessToken: string = response.data.access;
        localStorage.setItem('ssms_token', newAccessToken);
        api.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;
        processQueue(null, newAccessToken);
        (originalConfig.headers as Record<string, string>)['Authorization'] = `Bearer ${newAccessToken}`;
        return api(originalConfig);
      } catch (refreshError) {
        processQueue(refreshError, null);
        _doLogout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(err);
  }
);

function _doLogout() {
  localStorage.removeItem('ssms_token');
  localStorage.removeItem('ssms_user');
  localStorage.removeItem('ssms_refresh_token');
  window.location.href = '/login';
}

export default api;
