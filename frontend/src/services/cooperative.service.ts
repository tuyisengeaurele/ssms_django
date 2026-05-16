import api from './api';
import { ApiResponse, Cooperative, CooperativeDetail } from '../types';

export interface CreateCooperativePayload {
  name: string;
  description?: string;
  location?: string;
}

export const cooperativeService = {
  getAll: () =>
    api.get<ApiResponse<Cooperative[]>>('/cooperatives'),

  getById: (id: string) =>
    api.get<ApiResponse<CooperativeDetail>>(`/cooperatives/${id}`),

  create: (data: CreateCooperativePayload) =>
    api.post<ApiResponse<Cooperative>>('/cooperatives', data),

  update: (id: string, data: Partial<CreateCooperativePayload>) =>
    api.patch<ApiResponse<Cooperative>>(`/cooperatives/${id}`, data),

  delete: (id: string) =>
    api.delete<ApiResponse<null>>(`/cooperatives/${id}`),
};
