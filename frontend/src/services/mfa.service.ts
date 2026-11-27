import api from './api';
import type { ApiResponse, AuthResponse, MfaStatus, MfaTrigger } from '../types';
import type { DeviceHints } from './clientHints';

/** The second step of a sign in and the care of the authenticator app. See users/mfa_views.py and mfa_enroll_views.py. */
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

  /** With a trigger, the answer also says whether to show the reminder at that moment. */
  status: (trigger?: MfaTrigger) => api.get<ApiResponse<MfaStatus>>('/auth/mfa', trigger ? { params: { trigger } } : undefined),

  /** Turning it on from inside the app: the password first, then a code from the new secret. A wrong entry answers 422. */
  enrollStart: (password: string) => api.post<ApiResponse<SetupStart>>('/auth/mfa/enroll/start', { password }),

  enrollConfirm: (code: string) => api.post<ApiResponse<{ recoveryCodes: string[] }>>('/auth/mfa/enroll/confirm', { code }),

  disable: (data: { password: string; code?: string; recoveryCode?: string }) => api.post<ApiResponse<null>>('/auth/mfa/disable', data),

  /** "Remind me later". */
  snooze: () => api.post<ApiResponse<{ snoozedUntil: string }>>('/auth/mfa/prompt', { action: 'snooze' }),

  /** The reminder was shown, so it is not shown again for a day. */
  seen: () => api.post<ApiResponse<null>>('/auth/mfa/prompt/seen'),

  newRecoveryCodes: (code: string) => api.post<ApiResponse<{ recoveryCodes: string[] }>>('/auth/mfa/recovery-codes', { code }),

  /** Another admin resets someone's authenticator app. Needs a recent code first. */
  resetFor: (userId: string) => api.post<ApiResponse<null>>(`/admin/users/${userId}/mfa/reset`),
};
