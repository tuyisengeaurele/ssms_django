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

/**
 * The address of the live alert stream, with a ticket in it.
 * An EventSource cannot send headers, so the signed in page first asks for a ticket that works for
 * 30 seconds and one connection. The sign in token itself never goes into the address.
 */
export async function getAlertStreamUrl(): Promise<string> {
  const res = await api.post<ApiResponse<{ ticket: string; expiresIn: number }>>('/alerts/stream-ticket', {});
  const base = (import.meta.env.VITE_API_BASE_URL ?? '/api') as string;
  return `${base}/alerts/stream?ticket=${encodeURIComponent(res.data.data.ticket)}`;
}
