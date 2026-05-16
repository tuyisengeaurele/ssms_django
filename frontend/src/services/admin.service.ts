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

  updateCooperative: (userId: string, cooperativeId: string | null) =>
    api.patch<ApiResponse<User>>(`/admin/users/${userId}/cooperative`, { cooperativeId }),

  deactivateUser: (userId: string) =>
    api.delete<ApiResponse<null>>(`/admin/users/${userId}`),
};

export interface AuditLogEntry {
  id: number;
  userEmail: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'OTHER';
  resource: string;
  resourceId: string;
  detail: string;
  ipAddress: string | null;
  createdAt: string;
}

export const auditLogService = {
  getList: (params: { page?: number; action?: string; resource?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params.page)     q.set('page',     String(params.page));
    if (params.action)   q.set('action',   params.action);
    if (params.resource) q.set('resource', params.resource);
    if (params.search)   q.set('search',   params.search);
    return api.get<{ success: boolean; data: AuditLogEntry[]; pagination: { page: number; pageSize: number; totalItems: number; totalPages: number; hasNext: boolean; hasPrev: boolean } }>(`/admin/audit-log?${q.toString()}`);
  },

  exportCsv: async (params: { action?: string; resource?: string; search?: string }): Promise<void> => {
    const q = new URLSearchParams({ export: 'csv' });
    if (params.action)   q.set('action',   params.action);
    if (params.resource) q.set('resource', params.resource);
    if (params.search)   q.set('search',   params.search);
    const base  = (import.meta.env.VITE_API_BASE_URL as string) ?? '/api';
    const token = localStorage.getItem('ssms_token') ?? '';
    const res   = await fetch(`${base}/admin/audit-log?${q.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  },
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

  exportCsv: async (params: { farmId?: string; dateFrom?: string; dateTo?: string; limit?: number }): Promise<void> => {
    // Use native fetch (not Axios) — Axios interceptors don't handle blob errors well.
    // The auth token is read directly from localStorage and attached as a Bearer header.
    // Use ?export=csv (NOT ?format=csv — DRF intercepts ?format= for its own content negotiation)
    const q = new URLSearchParams({ export: 'csv' });
    if (params.farmId)   q.set('farm_id',   params.farmId);
    if (params.dateFrom) q.set('date_from', params.dateFrom);
    if (params.dateTo)   q.set('date_to',   params.dateTo);
    if (params.limit)    q.set('limit',     String(params.limit));

    const base  = (import.meta.env.VITE_API_BASE_URL as string) ?? '/api';
    const token = localStorage.getItem('ssms_token') ?? '';
    const res   = await fetch(`${base}/detections/history?${q.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => `HTTP ${res.status}`);
      throw new Error(text || `Export failed (${res.status})`);
    }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `disease_detections_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};
