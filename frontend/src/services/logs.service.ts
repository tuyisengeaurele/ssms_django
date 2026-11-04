import api from './api';
import { downloadFile } from './download';

export type LogStream = 'security' | 'requests' | 'jobs';

export interface LogFilters {
  page?: number;
  search?: string;
  kind?: string;
  status?: string;
  route?: string;
  reference?: string;
  from?: string;
  to?: string;
}

export interface SecurityRow {
  id: number;
  createdAt: string;
  kind: string;
  label: string;
  userEmail: string;
  ipAddress: string | null;
  requestId: string;
  detail: string;
}

export interface RequestRow {
  id: number;
  createdAt: string;
  requestId: string;
  method: string;
  route: string;
  status: number;
  durationMs: number;
  role: string;
  ipAddress: string | null;
}

export interface JobRow {
  id: number;
  createdAt: string;
  kind: string;
  subject: string;
  detail: string;
  requestId: string;
}

export interface LogPage<Row> {
  success: boolean;
  data: Row[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number; hasNext: boolean; hasPrev: boolean };
}

/** Only the filters that have a value are sent. */
function query(filters: LogFilters): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '' && name !== 'page') out[name] = String(value);
  }
  return out;
}

const today = () => new Date().toISOString().slice(0, 10);

export const logsService = {
  list: <Row = SecurityRow | RequestRow | JobRow>(stream: LogStream, filters: LogFilters) =>
    api.get<LogPage<Row>>(`/admin/logs/${stream}`, { params: { ...query(filters), ...(filters.page ? { page: filters.page } : {}) } }),

  /** The log as CSV, with the same filters as the screen. */
  exportCsv: (stream: LogStream, filters: LogFilters): Promise<void> =>
    downloadFile(`/admin/logs/${stream}`, { ...query(filters), export: 'csv' }, `${stream}_log_${today()}.csv`),
};
