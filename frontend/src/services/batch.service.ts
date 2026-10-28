import api from './api';
import { downloadFile } from './download';
import { ApiResponse, Batch, BatchStage, MortalityEntry, QuantityUnit } from '../types';

export interface BatchDetails {
  /** The room a new batch goes in. The server picks it when the farm has one room or none. */
  roomId?: string;
  breed?: string;
  quantity?: number | null;
  quantityUnit?: QuantityUnit;
  notes?: string;
}

export const batchService = {
  create: (data: { farmId: string; expectedHarvestDate: string } & BatchDetails) =>
    api.post<ApiResponse<Batch>>('/batches', data),

  getByFarm: (farmId: string) =>
    api.get<ApiResponse<Batch[]>>(`/batches/farm/${farmId}`),

  getById: (id: string) => api.get<ApiResponse<Batch>>(`/batches/${id}`),

  /** POST /api/batches/<id>/room, move to another room of the same farm. Where it has been is kept. */
  moveToRoom: (id: string, roomId: string) =>
    api.post<ApiResponse<Batch>>(`/batches/${id}/room`, { roomId }),

  /** PATCH /api/batches/<id>, correct the breed, quantity, unit or notes. */
  update: (id: string, data: BatchDetails) =>
    api.patch<ApiResponse<Batch>>(`/batches/${id}`, data),

  getMortality: (id: string) =>
    api.get<ApiResponse<MortalityEntry[]>>(`/batches/${id}/mortality`),

  addMortality: (id: string, data: { count: number; recordedOn?: string; note?: string }) =>
    api.post<ApiResponse<MortalityEntry>>(`/batches/${id}/mortality`, data),

  deleteMortality: (id: string, recordId: string) =>
    api.delete<ApiResponse<null>>(`/batches/${id}/mortality/${recordId}`),

  /** The batch report as a PDF on the SSMS letterhead, in the language of the screen. */
  downloadReport: (id: string, lang: string) =>
    downloadFile(`/batches/${id}/report`, { lang }, 'batch_report.pdf'),

  updateStage: (id: string, stage: BatchStage) =>
    api.patch<ApiResponse<Batch>>(`/batches/${id}/stage`, { stage }),

  delete: (id: string) => api.delete<ApiResponse<null>>(`/batches/${id}`),
};
