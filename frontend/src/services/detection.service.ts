import api from './api';
import { ApiResponse, DiseaseDetection } from '../types';

export interface DetectionResult extends DiseaseDetection {
  allScores?: Record<string, number>;
}

export const detectionService = {
  /** POST /api/detections — multipart form with image file + batchId */
  create: (batchId: string, image: File, notes?: string) => {
    const form = new FormData();
    form.append('batchId', batchId);
    form.append('image', image);
    if (notes) form.append('notes', notes);
    return api.post<ApiResponse<DetectionResult>>('/detections', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /** GET /api/detections/batch/<batchId> */
  getByBatch: (batchId: string) =>
    api.get<ApiResponse<DiseaseDetection[]>>(`/detections/batch/${batchId}`),
};
