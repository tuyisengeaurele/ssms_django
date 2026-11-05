import api from './api';
import { ApiResponse } from '../types';

export type HealthStatus = 'ok' | 'problem' | 'notSetUp';
export type HealthKey =
  | 'web' | 'database' | 'aiService' | 'email' | 'errorMonitoring' | 'imageStorage' | 'sensors' | 'jobs' | 'alertStream' | 'website';

/** What a check found. Only the keys that check reports are present. Never an address or a secret. */
export interface HealthValues {
  ms?: number;
  reason?: 'timeout' | 'unreachable' | 'badAnswer' | 'noAnswer' | 'error';
  sends?: boolean;
  online?: number;
  offline?: number;
  neverSeen?: number;
  lastReadingAt?: string | null;
  silentMinutes?: number | null;
  /** Hours since a scheduled job last finished. */
  hours?: number;
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

export interface HealthPoint {
  at: string;
  status: HealthStatus;
  ms: number | null;
}

export interface Uptime {
  /** Null when no check ran in the window. That is unknown, not down. */
  percent: number | null;
  samples: number;
  coverage: number;
}

export interface ServiceHistory {
  points: HealthPoint[];
  uptime: { day: Uptime; week: Uptime; month: Uptime };
}

export interface HealthHistory {
  services: Record<HealthKey, ServiceHistory>;
}

/** The test buttons, and what each can say. The screen puts the pair into words. */
export type HealthTestName = 'email' | 'storage' | 'disease-check' | 'database-write' | 'device-ingest';

export interface HealthTestResult {
  name: HealthTestName;
  ok: boolean;
  outcome: string;
  milliseconds: number;
  ranAt: string;
}

export const healthService = {
  /** GET /api/admin/health. Asks the database and the disease check service live, so it can take a few seconds. */
  get: () => api.get<ApiResponse<HealthReport>>('/admin/health'),

  /** GET /api/admin/health/history. What the scheduler wrote: the last 24 hours and the uptime. It runs no check. */
  history: () => api.get<ApiResponse<HealthHistory>>('/admin/health/history'),

  /** POST /api/admin/health/tests/<name>. Really tries the thing, and touches nobody's data. */
  runTest: (name: HealthTestName) => api.post<ApiResponse<HealthTestResult>>(`/admin/health/tests/${name}`, {}),
};
