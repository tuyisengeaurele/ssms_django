import api from './api';
import { ApiResponse } from '../types';

export type CalendarKind =
  | 'batch_started'
  | 'stage_changed'
  | 'harvest_expected'
  | 'harvest_recorded'
  | 'disease_check'
  | 'round_deadline'
  | 'round_delivery';

/** One dated fact about a farm. The page words it from the kind and the detail, so the server sends no sentences. */
export interface CalendarEvent {
  id: string;
  /** A whole day, like 2026-11-05. */
  date: string;
  kind: CalendarKind;
  /** True for a date somebody typed that has not happened yet (an expected harvest). */
  expected: boolean;
  batchId: string | null;
  farmId: string | null;
  farmName: string;
  detail: { result?: string; stage?: string | null; roundId?: string; name?: string; place?: string };
}

export interface CalendarFeed {
  events: CalendarEvent[];
  from: string;
  to: string;
  /** True when there were more events than the server sends (500). */
  truncated: boolean;
}

export const calendarService = {
  /** The events of the farms the caller may see, from one day to another, both included, at most 100 days. */
  events: (from: string, to: string) => api.get<ApiResponse<CalendarFeed>>('/calendar', { params: { from, to } }),
};
