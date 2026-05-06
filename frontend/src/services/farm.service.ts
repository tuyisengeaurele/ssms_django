import api from './api';
import { ApiResponse, Farm } from '../types';

export const farmService = {
  create: (data: { name: string; location: string }) =>
    api.post<ApiResponse<Farm>>('/farms', data),

  getAll: () => api.get<ApiResponse<Farm[]>>('/farms'),

  getById: (id: string) => api.get<ApiResponse<Farm>>(`/farms/${id}`),

  update: (id: string, data: { name?: string; location?: string }) =>
    api.patch<ApiResponse<Farm>>(`/farms/${id}`, data),

  delete: (id: string) => api.delete<ApiResponse<null>>(`/farms/${id}`),
};
