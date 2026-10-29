import api from './api';
import { ApiResponse, DiseaseDetection } from '../types';

export interface DetectionResult extends DiseaseDetection {
  allScores?: Record<string, number>;
  /** True when this check named a disease and so raised an alert on the batch. */
  alertRaised?: boolean;
}

/** What comes back for a photo that is not a clear silkworm. Nothing was saved, so there is no id. */
export interface UnclearResult {
  result: 'NotSilkworm' | 'Uncertain';
  confidence: number | null;
  allScores?: Record<string, number>;
}

export const detectionService = {
  /** POST /api/detections — multipart form with image file + batchId */
  create: (batchId: string, image: File, notes?: string) => {
    const form = new FormData();
    form.append('batchId', batchId);
    form.append('image', image);
    if (notes) form.append('notes', notes);
    return api.post<ApiResponse<DetectionResult | UnclearResult>>('/detections', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /** POST /api/detections/<id>/feedback: was the result right, and if not, what was it? */
  sendFeedback: (id: string, answer: { isCorrect: boolean; actualResult?: string }) =>
    api.post<ApiResponse<DiseaseDetection>>(`/detections/${id}/feedback`, answer),

  /** GET /api/detections/batch/<batchId> */
  getByBatch: (batchId: string) =>
    api.get<ApiResponse<DiseaseDetection[]>>(`/detections/batch/${batchId}`),
};
