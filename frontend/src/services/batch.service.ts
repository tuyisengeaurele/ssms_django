import api from './api';
import { ApiResponse, Batch, BatchStage } from '../types';

export const batchService = {
  create: (data: { farmId: string; expectedHarvestDate: string; notes?: string }) =>
    api.post<ApiResponse<Batch>>('/batches', data),

  getByFarm: (farmId: string) =>
    api.get<ApiResponse<Batch[]>>(`/batches/farm/${farmId}`),

  getById: (id: string) => api.get<ApiResponse<Batch>>(`/batches/${id}`),

  updateStage: (id: string, stage: BatchStage) =>
    api.patch<ApiResponse<Batch>>(`/batches/${id}/stage`, { stage }),

  delete: (id: string) => api.delete<ApiResponse<null>>(`/batches/${id}`),
};
