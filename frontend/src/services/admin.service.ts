import api from './api';
import { ApiResponse, User, Role } from '../types';

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  role: Role;
}

export const adminService = {
  getUsers: () =>
    api.get<ApiResponse<User[]>>('/admin/users'),

  createUser: (data: CreateUserPayload) =>
    api.post<ApiResponse<User>>('/admin/users', data),

  updateRole: (userId: string, role: Role) =>
    api.patch<ApiResponse<User>>(`/admin/users/${userId}/role`, { role }),

  deactivateUser: (userId: string) =>
    api.delete<ApiResponse<null>>(`/admin/users/${userId}`),
};

export interface DetectionHistoryItem {
  id: string;
  result: string;
  confidence: number;
  detectedAt: string;
  batchId: string;
  farmName: string;
  farmId: string;
  notes?: string;
}

export interface DetectionStat {
  result: string;
  count: number;
}

export const detectionReportService = {
  getHistory: (params: { farmId?: string; dateFrom?: string; dateTo?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params.farmId)   q.set('farm_id',   params.farmId);
    if (params.dateFrom) q.set('date_from', params.dateFrom);
    if (params.dateTo)   q.set('date_to',   params.dateTo);
    if (params.limit)    q.set('limit',     String(params.limit));
    return api.get<ApiResponse<DetectionHistoryItem[]>>(`/detections/history?${q.toString()}`);
  },

  getStats: (params: { farmId?: string; dateFrom?: string; dateTo?: string }) => {
    const q = new URLSearchParams();
    if (params.farmId)   q.set('farm_id',   params.farmId);
    if (params.dateFrom) q.set('date_from', params.dateFrom);
    if (params.dateTo)   q.set('date_to',   params.dateTo);
    return api.get<ApiResponse<DetectionStat[]>>(`/detections/stats?${q.toString()}`);
  },
};
