import api from './api';
import { ApiResponse, AuthResponse, User } from '../types';

export interface RegisterResponse { user: User }

export const authService = {
  register: (data: { name: string; email: string; password: string; role?: string }) =>
    api.post<ApiResponse<RegisterResponse>>('/auth/register', data),

  login: (data: { email: string; password: string }) =>
    api.post<ApiResponse<AuthResponse>>('/auth/login', data),

  verifyEmail: (data: { uid: string; token: string }) =>
    api.post<ApiResponse<AuthResponse>>('/auth/verify-email', data),

  resendVerification: (email: string) =>
    api.post<ApiResponse<null>>('/auth/resend-verification', { email }),

  getProfile: () => api.get<ApiResponse<User>>('/auth/me'),

  updateProfile: (data: { name: string }) =>
    api.patch<ApiResponse<User>>('/auth/me', data),

  requestPasswordReset: (data: { email: string }) =>
    api.post<ApiResponse<null>>('/auth/password-reset/request', data),

  confirmPasswordReset: (data: { uid: string; token: string; newPassword: string }) =>
    api.post<ApiResponse<null>>('/auth/password-reset/confirm', data),

  changePassword: (data: { currentPassword: string; newPassword: string; confirmPassword: string }) =>
    api.patch<ApiResponse<null>>('/auth/change-password', data),

  logout: () =>
    api.post<ApiResponse<null>>('/auth/logout', {}),
};
