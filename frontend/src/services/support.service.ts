import api from './api';
import type { ApiResponse, SupportAdminRow, SupportMinutes, SupportMode, SupportPersonRow } from '../types';

/** An admin looking at an account with the person's consent. See support_access/views.py. */
export const supportService = {
  // The admin's side
  request: (data: { personId: string; reason: string; minutes: SupportMinutes; mode: SupportMode }) =>
    api.post<ApiResponse<SupportAdminRow>>('/support-access', data),

  mine: () => api.get<ApiResponse<{ open: SupportAdminRow | null; recent: SupportAdminRow[] }>>('/support-access/mine'),

  get: (id: string) => api.get<ApiResponse<SupportAdminRow>>(`/support-access/${id}`),

  cancel: (id: string) => api.post<ApiResponse<SupportAdminRow>>(`/support-access/${id}/cancel`),

  /** Needs a fresh code from the authenticator app. Returns the access token for the person's view. */
  start: (id: string) => api.post<ApiResponse<{ access: SupportAdminRow; token: string }>>(`/support-access/${id}/start`),

  /** A new token for a visit that is running, after a reload lost the old one. */
  token: (id: string) => api.post<ApiResponse<{ access: SupportAdminRow; token: string }>>(`/support-access/${id}/token`),

  end: (id: string) => api.post<ApiResponse<SupportAdminRow>>(`/support-access/${id}/end`),

  // The person's side
  pending: () =>
    api.get<ApiResponse<{ request: SupportPersonRow | null; active: SupportPersonRow | null }>>('/support-access/for-me/pending'),

  respond: (id: string, data: { decision: 'allow' | 'reject'; allowEdit: boolean }) =>
    api.post<ApiResponse<SupportPersonRow>>(`/support-access/for-me/${id}/respond`, data),

  endOwn: (id: string) => api.post<ApiResponse<SupportPersonRow>>(`/support-access/for-me/${id}/end`),

  history: () => api.get<ApiResponse<SupportPersonRow[]>>('/support-access/for-me/history'),
};
