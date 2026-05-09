import api from './api';
import { ApiResponse, AlertLog } from '../types';

export const alertService = {
  /** GET /api/alerts — unread=true: only unread | unread=false: all | omit: backend default (unread) */
  getAll: (unread?: boolean) => {
    const q = unread === true ? '?unread=true' : unread === false ? '?unread=false' : '';
    return api.get<ApiResponse<AlertLog[]>>(`/alerts${q}`);
  },

  /** GET /api/alerts/batch/<batchId> */
  getByBatch: (batchId: string) =>
    api.get<ApiResponse<AlertLog[]>>(`/alerts/batch/${batchId}`),

  /** PATCH /api/alerts/<id>/read */
  markRead: (id: string) =>
    api.patch<ApiResponse<AlertLog>>(`/alerts/${id}/read`, {}),

  /** POST /api/alerts/mark-all-read */
  markAllRead: () =>
    api.post<ApiResponse<{ updated: number }>>('/alerts/mark-all-read', {}),
};

/** Build an EventSource URL for the SSE stream (token passed as query param). */
export function buildAlertStreamUrl(): string {
  const base = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api') as string;
  const token = localStorage.getItem('ssms_token') ?? '';
  return `${base}/alerts/stream?token=${encodeURIComponent(token)}`;
}
