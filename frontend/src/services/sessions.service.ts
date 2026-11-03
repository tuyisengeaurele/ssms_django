import api from './api';
import { ApiResponse, SignedInDevice } from '../types';

export const sessionsService = {
  list: () => api.get<ApiResponse<SignedInDevice[]>>('/auth/sessions'),

  rename: (id: string, customName: string) =>
    api.patch<ApiResponse<SignedInDevice>>(`/auth/sessions/${id}`, { customName }),

  revoke: (id: string) => api.delete<ApiResponse<null>>(`/auth/sessions/${id}`),

  revokeOthers: () => api.post<ApiResponse<{ revoked: number }>>('/auth/sessions/revoke-others', {}),
};
