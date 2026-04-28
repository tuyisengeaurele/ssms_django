import api from './api';
import { ApiResponse, AuthResponse, User } from '../types';

export const authService = {
  register: (data: { name: string; email: string; password: string; role?: string }) =>
    api.post<ApiResponse<AuthResponse>>('/auth/register', data),

  login: (data: { email: string; password: string }) =>
    api.post<ApiResponse<AuthResponse>>('/auth/login', data),

  getProfile: () => api.get<ApiResponse<User>>('/auth/me'),
};
