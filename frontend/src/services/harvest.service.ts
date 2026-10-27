import api from './api';
import { ApiResponse, HarvestRecord, HarvestStats, PageMeta } from '../types';

export const harvestService = {
  getAll: () =>
    api.get<ApiResponse<HarvestRecord[]>>('/harvest'),

  /** One page of records, newest first. The answer carries a `pagination` block beside `data`. */
  getPage: (page: number, search = '') => {
    const query = new URLSearchParams({ page: String(page) });
    if (search) query.set('search', search);
    return api.get<ApiResponse<HarvestRecord[]> & { pagination: PageMeta }>(`/harvest?${query}`);
  },

  getByBatch: (batchId: string) =>
    api.get<ApiResponse<HarvestRecord[]>>(`/harvest/batch/${batchId}`),

  create: (batchId: string, data: {
    cocoonWeightKg: number;
    silkYieldG?: number | null;
    qualityGrade: string;
    notes?: string;
  }) =>
    api.post<ApiResponse<HarvestRecord>>(`/harvest/batch/${batchId}`, data),

  getStats: () =>
    api.get<ApiResponse<HarvestStats>>('/harvest/stats'),

  delete: (id: string) =>
    api.delete<ApiResponse<null>>(`/harvest/${id}`),

  exportCsv: () =>
    api.get('/harvest?export=csv', { responseType: 'blob' }),
};
