import type { AdminAnnouncement, Announcement, AnnouncementBody, ApiResponse } from '../types';
import api from './api';

/**
 * Asking for the SSMS team's announcements. Nobody pressed anything for this, so neither way ever fails out loud: any
 * problem answers `null`, which means "no news", and the page keeps what it had.
 */

// Long enough for a slow phone connection. A server that is still waking is not waited for, so no banner drops in late.
const TIMEOUT_MS = 10_000;

const KINDS = new Set<unknown>(['information', 'maintenance', 'urgent']);

/** A newer server may send something this page cannot draw. That row is left out, the rest are shown. */
function drawable(value: unknown): value is Announcement {
  const row = value as Partial<Announcement> | null;
  return typeof row?.id === 'number' && typeof row.version === 'number' && KINDS.has(row.kind) && typeof row.text?.en === 'string';
}

function rowsOf(body: unknown): Announcement[] | null {
  const data = (body as { data?: unknown } | null)?.data;
  return Array.isArray(data) ? data.filter(drawable) : null;
}

export const announcementService = {
  // The admin's page. These are ordinary requests that a person made, so they may fail out loud.
  all: () => api.get<ApiResponse<AdminAnnouncement[]>>('/admin/announcements'),
  create: (body: AnnouncementBody) => api.post<ApiResponse<AdminAnnouncement>>('/admin/announcements', body),
  update: (id: number, changes: Partial<AnnouncementBody>) => api.patch<ApiResponse<AdminAnnouncement>>(`/admin/announcements/${id}`, changes),
  end: (id: number) => api.post<ApiResponse<AdminAnnouncement>>(`/admin/announcements/${id}/end`),

  /** For somebody signed in. `silent` keeps the shared client from retrying, speaking or signing out (see api.ts). */
  async current(): Promise<Announcement[] | null> {
    try {
      const response = await api.get('/announcements', { silent: true, timeout: TIMEOUT_MS });
      return rowsOf(response.data);
    } catch {
      return null;
    }
  },

  /** For a visitor. Plain fetch with no token and no cookie, so it has nothing to do with any sign in. */
  async visitor(): Promise<Announcement[] | null> {
    const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';
    const giveUp = new AbortController();
    const timer = window.setTimeout(() => giveUp.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${base}/announcements/public`, { credentials: 'omit', signal: giveUp.signal });
      return response.ok ? rowsOf(await response.json()) : null;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timer);
    }
  },
};
