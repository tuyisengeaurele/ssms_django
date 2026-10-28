import api from './api';
import { ApiResponse } from '../types';

export type HealthStatus = 'ok' | 'problem' | 'notSetUp';
export type HealthKey = 'database' | 'aiService' | 'email' | 'errorMonitoring' | 'imageStorage' | 'sensors';

/** What a check found. Only the keys that check reports are present. Never an address or a secret. */
export interface HealthValues {
  ms?: number;
  reason?: 'timeout' | 'unreachable' | 'badAnswer';
  sends?: boolean;
  online?: number;
  offline?: number;
  neverSeen?: number;
  lastReadingAt?: string | null;
  silentMinutes?: number | null;
}

export interface HealthCheck {
  key: HealthKey;
  status: HealthStatus;
  values: HealthValues;
}

export interface HealthReport {
  checkedAt: string;
  overall: 'ok' | 'problem';
  checks: HealthCheck[];
  numbers: { unreadAlerts: number; openAirAlerts: number; unansweredMessages: number };
}

export const healthService = {
  /** GET /api/admin/health. Asks the database and the disease check service live, so it can take a few seconds. */
  get: () => api.get<ApiResponse<HealthReport>>('/admin/health'),
};
