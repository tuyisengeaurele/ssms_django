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

  /** POST /api/admin/contacts/<id>/replies, sends the reply to the address on the message and answers with the message. */
  reply: (id: string, sent: { body: string; language: ContactMessage['language'] }) =>
    api.post<ApiResponse<ContactMessage>>(`/admin/contacts/${id}/replies`, sent),

};
