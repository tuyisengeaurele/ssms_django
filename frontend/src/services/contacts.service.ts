import api from './api';
import { ApiResponse, ContactMessage } from '../types';

export const contactsService = {
  getAll: () =>
    api.get<ApiResponse<ContactMessage[]>>('/admin/contacts'),

  markRead: (id: string) =>
    api.patch<ApiResponse<{ id: string; isRead: boolean }>>(`/admin/contacts/${id}/read`),
};
