import api from './api';
import type { ApiResponse, AuthResponse, MfaStatus } from '../types';
import type { DeviceHints } from './clientHints';

/** The second step of an admin sign in and the care of the authenticator app. See users/mfa_views.py. */
export interface SetupStart {
  secret: string;
  otpauthUri: string;
}

export interface SignInDetails {
  device?: DeviceHints;
  sharedDevice?: boolean;
}

export const mfaService = {
  verify: (data: SignInDetails & { challenge: string; code?: string; recoveryCode?: string }) =>
    api.post<ApiResponse<AuthResponse>>('/auth/mfa/verify', data),

  setupStart: (challenge: string) => api.post<ApiResponse<SetupStart>>('/auth/mfa/setup/start', { challenge }),

  setupConfirm: (data: SignInDetails & { challenge: string; code: string }) =>
    api.post<ApiResponse<AuthResponse & { recoveryCodes: string[] }>>('/auth/mfa/setup/confirm', data),

  /** A fresh code before something sensitive. A wrong code answers 422. */
  stepUp: (code: string) => api.post<ApiResponse<null>>('/auth/mfa/step-up', { code }),

  status: () => api.get<ApiResponse<MfaStatus>>('/auth/mfa'),

  newRecoveryCodes: (code: string) => api.post<ApiResponse<{ recoveryCodes: string[] }>>('/auth/mfa/recovery-codes', { code }),

  /** Another admin resets someone's authenticator app. Needs a recent code first. */
  resetFor: (userId: string) => api.post<ApiResponse<null>>(`/admin/users/${userId}/mfa/reset`),
};
