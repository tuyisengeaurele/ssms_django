import api from './api';
import { ApiResponse, SignedInDevice } from '../types';

export const sessionsService = {
  list: () => api.get<ApiResponse<SignedInDevice[]>>('/auth/sessions'),

  revoke: (id: string) => api.delete<ApiResponse<null>>(`/auth/sessions/${id}`),

  /** Somebody is still here. Says how long a sign in may sit idle, or null for people with no limit. */
  ping: () => api.post<ApiResponse<{ idleLimitSeconds: number | null; idleSecondsLeft: number | null }>>('/auth/session/ping', {}),

  revokeOthers: () => api.post<ApiResponse<{ revoked: number }>>('/auth/sessions/revoke-others', {}),
};
