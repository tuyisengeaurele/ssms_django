import api from './api';
import { downloadFile } from './download';
import { ApiResponse, CoopReport } from '../types';

/** What the report is asked for: the days, both included, and for an admin the cooperative (left out means all of them). */
export interface CoopReportParams {
  from: string;
  to: string;
  cooperative?: string;
}

export const coopReportService = {
  /** GET /api/reports/cooperative, the numbers. Supervisors and admins only. */
  get: (params: CoopReportParams) =>
    api.get<ApiResponse<CoopReport>>('/reports/cooperative', { params }),

  /** The same report as a CSV or a PDF on the SSMS letterhead. The PDF is in the language of the screen. */
  download: (params: CoopReportParams, kind: 'csv' | 'pdf', lang: string) =>
    downloadFile('/reports/cooperative', { ...params, export: kind, lang }, `cooperative_report.${kind}`),
};
