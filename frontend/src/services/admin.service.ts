import api from './api';
import { downloadFile } from './download';
import { ApiResponse, User, Role } from '../types';

/** Today as YYYY-MM-DD, for the name of a downloaded file. */
const today = () => new Date().toISOString().slice(0, 10);

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

  /** A soft delete: the account is switched off and can be restored. */
  deactivateUser: (userId: string) =>
    api.delete<ApiResponse<null>>(`/admin/users/${userId}`),

  restoreUser: (userId: string) =>
    api.post<ApiResponse<User>>(`/admin/users/${userId}/restore`),
};

export interface AuditLogEntry {
  id: number;
  userName: string;
  userEmail: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'OTHER';
  resource: string;
  resourceId: string;
  detail: string;
  ipAddress: string | null;
  createdAt: string;
}

export interface ReportSummary {
  generatedAt: string;
  users: {
    total: number;
    byRole: { role: string; count: number }[];
    registrations30d: { day: string; count: number }[];
  };
  farms: { total: number };
  batches: { total: number; byStage: { stage: string; count: number }[] };
  harvests: { total: number; totalKg: number; totalSilkG: number; avgKg: number; byGrade: { grade: string; count: number; totalKg: number }[] };
  detections: { total: number; byResult: { result: string; count: number }[]; detections30d: { day: string; count: number }[] };
  audit: { actions30d: { action: string; count: number }[] };
  topFarmers: { name: string; email: string; farmCount: number }[];
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

  /** The audit log as a PDF on the SSMS letterhead, with the same filters as the screen. */
  exportPdf: (params: { action?: string; resource?: string; search?: string }): Promise<void> => {
    const query: Record<string, string> = { export: 'pdf' };
    if (params.action)   query.action   = params.action;
    if (params.resource) query.resource = params.resource;
    if (params.search)   query.search   = params.search;
    return downloadFile('/admin/audit-log', query, 'audit_log.pdf');
  },

  /** The audit log as CSV, with the same filters as the screen. */
  exportCsv: (params: { action?: string; resource?: string; search?: string }): Promise<void> => {
    const query: Record<string, string> = { export: 'csv' };
    if (params.action)   query.action   = params.action;
    if (params.resource) query.resource = params.resource;
    if (params.search)   query.search   = params.search;
    return downloadFile('/admin/audit-log', query, `audit_log_${today()}.csv`);
  },
};

export const reportService = {
  getSummary: () =>
    api.get<ApiResponse<ReportSummary>>('/admin/reports'),

  /** The system report as a PDF on the SSMS letterhead. */
  exportPdf: (): Promise<void> => downloadFile('/admin/reports', { export: 'pdf' }, 'ssms_report.pdf'),

  exportCsv: (): Promise<void> => downloadFile('/admin/reports', { export: 'csv' }, `ssms_report_${today()}.csv`),
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

  /** The disease checks as CSV. Uses ?export=csv, not ?format=csv, because DRF takes ?format= for its own content negotiation. */
  exportCsv: (params: { farmId?: string; dateFrom?: string; dateTo?: string; limit?: number }): Promise<void> => {
    const query: Record<string, string> = { export: 'csv' };
    if (params.farmId)   query.farm_id   = params.farmId;
    if (params.dateFrom) query.date_from = params.dateFrom;
    if (params.dateTo)   query.date_to   = params.dateTo;
    if (params.limit)    query.limit     = String(params.limit);
    return downloadFile('/detections/history', query, `disease_detections_${today()}.csv`);
  },
};
