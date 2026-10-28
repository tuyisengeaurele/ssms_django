import api from './api';
import { ApiResponse, AlertComment, AlertLog } from '../types';
import type { StageRange } from './sensor.service';

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

  /** PATCH /api/alerts/<id>/unread, the undo of markRead */
  markUnread: (id: string) =>
    api.patch<ApiResponse<AlertLog>>(`/alerts/${id}/unread`, {}),

  /** POST /api/alerts/<id>/acknowledge, "I'm on it". Supervisors and admins. */
  acknowledge: (id: string) =>
    api.post<ApiResponse<AlertLog>>(`/alerts/${id}/acknowledge`, {}),

  /** DELETE /api/alerts/<id>/acknowledge, the undo of acknowledge */
  unacknowledge: (id: string) =>
    api.delete<ApiResponse<AlertLog>>(`/alerts/${id}/acknowledge`),

  /** GET /api/alerts/<id>/comments, oldest first */
  getComments: (id: string) =>
    api.get<ApiResponse<AlertComment[]>>(`/alerts/${id}/comments`),

  /** POST /api/alerts/<id>/comments. A comment from someone other than the owner is emailed to the owner. */
  addComment: (id: string, body: string) =>
    api.post<ApiResponse<AlertComment>>(`/alerts/${id}/comments`, { body }),

  /** DELETE /api/alerts/<id>/comments/<commentId>. The author may, and so may an admin. */
  deleteComment: (id: string, commentId: string) =>
    api.delete<ApiResponse<null>>(`/alerts/${id}/comments/${commentId}`),

  /** PUT /api/alerts/thresholds/<stage>, change the safe range of one stage. Admin only. */
  updateThreshold: (stage: string, range: { tempMin: number; tempMax: number; humMin: number; humMax: number }) =>
    api.put<ApiResponse<StageRange>>(`/alerts/thresholds/${stage}`, range),

  /** GET /api/alerts/thresholds, the safe range of every stage */
  getThresholds: () =>
    api.get<ApiResponse<StageRange[]>>('/alerts/thresholds'),

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
