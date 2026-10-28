import api from './api';
import { ApiResponse, ContactMessage } from '../types';

export interface UnreadContactsResponse {
  count: number;
  messages: ContactMessage[];
}

export const contactsService = {
  getAll: () =>
    api.get<ApiResponse<ContactMessage[]>>('/admin/contacts'),

  getUnread: () =>
    api.get<ApiResponse<UnreadContactsResponse>>('/admin/contacts/unread'),

  markRead: (id: string) =>
    api.patch<ApiResponse<{ id: string; isRead: boolean }>>(`/admin/contacts/${id}/read`),

  /** POST /api/admin/contacts/<id>/replied, says the message was answered. It also marks it read. */
  markReplied: (id: string) =>
    api.post<ApiResponse<ContactMessage>>(`/admin/contacts/${id}/replied`),

  /** DELETE /api/admin/contacts/<id>/replied, the undo of markReplied */
  unmarkReplied: (id: string) =>
    api.delete<ApiResponse<ContactMessage>>(`/admin/contacts/${id}/replied`),
};
