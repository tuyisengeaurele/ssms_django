import api from './api';
import { ApiResponse } from '../types';

export interface ChartPoint {
  hour: string;
  avgTemp: number | null;
  avgHumidity: number | null;
}

export interface RecentDetection {
  id: string;
  result: string;
  confidence: number;
  detectedAt: string;
  batchId: string;
  farmName: string;
  farmId: string;
}

export interface ActiveBatch {
  id: string;
  farmId: string;
  stage: string;
  startDate: string;
  expectedHarvestDate: string;
  isActive: boolean;
  createdAt: string;
  farm: { id: string; name: string; location: string };
  detectionCount: number;
}

export const sensorService = {
  /** GET /api/sensors/chart?hours=N — hourly avg temp & humidity */
  getChart: (hours = 24) =>
    api.get<ApiResponse<ChartPoint[]>>(`/sensors/chart?hours=${hours}`),
};

export const detectionService2 = {
  /** GET /api/detections/recent?limit=N — supervisor-wide detections */
  getRecent: (limit = 20) =>
    api.get<ApiResponse<RecentDetection[]>>(`/detections/recent?limit=${limit}`),
};

export const batchSupervisorService = {
  /** GET /api/batches/active — all active batches */
  getActive: () =>
    api.get<ApiResponse<ActiveBatch[]>>('/batches/active'),
};
