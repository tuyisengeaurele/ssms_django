import api from './api';
import { ApiResponse } from '../types';

export type AllowanceSource = 'set' | 'default' | 'none';
export type AllowanceChangeKind = 'start' | 'amendment' | 'suggestion' | 'reduction';

/** One line of a farmer's history. The first line is the amount they started with. */
export interface AllowanceChangeLine {
  oldBoxes: number | null;
  newBoxes: number;
  kind: AllowanceChangeKind;
  reason: string;
  byName: string | null;
  at: string;
}

/** What a farmer may take per round, and how it got there. */
export interface Allowance {
  boxes: number;
  source: AllowanceSource;
  since: string | null;
  history: AllowanceChangeLine[];
  openRequest: { id: string; boxesAsked: number; reason: string; createdAt: string } | null;
  /** What the approved rooms can hold, or null while it cannot be said yet. */
  capacityBoxes: number | null;
  /** The cooperative's default, for a new farmer. */
  starterBoxes: number | null;
}

/** A request that waits for a supervisor's decision. */
export interface WaitingAllowanceRequest {
  id: string;
  boxesAsked: number;
  currentBoxes: number;
  reason: string;
  createdAt: string;
  farmer: { id: string; name: string; email: string };
}

export interface SupplySettings {
  starterBoxes: number;
  /** Room space one box of eggs needs, in square metres. Null until a sericulture officer says. */
  m2PerBox: number | null;
}

export const supplyService = {
  getAllowance: () => api.get<ApiResponse<Allowance>>('/supply/allowance'),

  ask: (data: { boxesAsked: number; reason: string }) =>
    api.post<ApiResponse<{ id: string; boxesAsked: number; status: string }>>('/supply/allowance/requests', data),

  withdraw: (id: string) => api.delete<ApiResponse<null>>(`/supply/allowance/requests/${id}`),

  /** The requests that wait for the caller's decision, oldest first. An admin may narrow to one cooperative. */
  waiting: (params?: { cooperativeId?: string }) =>
    api.get<ApiResponse<{ requests: WaitingAllowanceRequest[]; count: number }>>('/supply/allowance/requests', { params }),

  decide: (id: string, data: { decision: 'approve' | 'decline'; boxes?: number; note?: string }) =>
    api.post<ApiResponse<{ id: string; status: string; boxesGranted: number | null }>>(`/supply/allowance/requests/${id}/decision`, data),

  /** A supervisor lowers an amount, an admin sets any. A reason is required. */
  setForFarmer: (farmerId: string, data: { boxes: number; reason: string }) =>
    api.patch<ApiResponse<{ boxes: number }>>(`/supply/allowance/farmers/${farmerId}`, data),

  getSettings: (cooperativeId?: string) =>
    api.get<ApiResponse<SupplySettings>>('/supply/settings', { params: cooperativeId ? { cooperativeId } : undefined }),

  updateSettings: (data: { cooperativeId?: string; starterBoxes?: number; m2PerBox?: number | null }) =>
    api.patch<ApiResponse<SupplySettings>>('/supply/settings', data),
};
