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
};
