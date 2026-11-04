import api from './api';
import { ApiResponse, SignedInDevice } from '../types';

export const sessionsService = {
  list: () => api.get<ApiResponse<SignedInDevice[]>>('/auth/sessions'),

  revoke: (id: string) => api.delete<ApiResponse<null>>(`/auth/sessions/${id}`),

  revokeOthers: () => api.post<ApiResponse<{ revoked: number }>>('/auth/sessions/revoke-others', {}),
};
