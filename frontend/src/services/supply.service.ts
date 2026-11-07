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

/** What a supervisor looks at before deciding about a request: the farmer's card and their rooms. */
export interface AllowanceEvidence extends Allowance {
  farmer: { id: string; name: string; email: string };
  rooms: {
    id: string;
    name: string;
    approvalStatus: 'approved' | 'pending' | 'rejected';
    areaM2: number | null;
    pendingAreaM2: number | null;
    /** Null for a room that is not approved, or while the space per box is not known. */
    capacityBoxes: number | null;
  }[];
}

export interface DecisionCount {
  count: number;
  rooms: number;
  allowance: number;
  /** Rounds whose requests are closed and wait for the split. */
  rounds: number;
}

export type RoundStatus = 'draft' | 'open' | 'closed' | 'allocated' | 'done' | 'cancelled';

/** A scheduled supply of eggs. */
export interface SupplyRound {
  id: string;
  name: string;
  stockBoxes: number;
  requestDeadline: string;
  deliveryDate: string;
  deliveryPlace: string;
  expectedHarvestDate: string;
  lotCode: string | null;
  /** An open round past its deadline already reads as closed. */
  status: RoundStatus;
  paused: boolean;
  createdAt: string;
  allocatedAt: string | null;
  requestCount?: number;
  approvedBoxes?: number;
}

export type EggRequestStatus = 'submitted' | 'approved' | 'part_approved' | 'waitlisted' | 'declined' | 'received' | 'not_collected' | 'cancelled';

/** A farmer's ask inside a round. */
export interface EggRequestRow {
  id: string;
  status: EggRequestStatus;
  boxesAsked: number;
  note: string;
  boxesApproved: number | null;
  decisionNote: string;
  boxesReceived: number | null;
  condition: '' | 'good' | 'damaged';
  receivedAt: string | null;
  batchId: string | null;
  createdAt: string;
  farmer: { id: string; name: string; email: string };
  room: { id: string; name: string };
  farm: { id: string; name: string };
}

/** What a farmer may ask for with one room, and which bound sets it. */
export interface RoomLimit {
  id: string;
  name: string;
  farmName: string;
  limit: number;
  allowance: number;
  /** Null while the space one box needs is not set, or the room has no size. */
  roomFree: number | null;
  stock: number;
  binding: 'allowance' | 'room' | 'stock';
}

export interface CurrentRound {
  round: SupplyRound | null;
  myRequest: EggRequestRow | null;
  rooms: RoomLimit[];
}

/** One line of the split the system proposes, which the supervisor may edit. */
export interface SplitRow {
  id: string;
  farmer: { id: string; name: string; email: string };
  room: { id: string; name: string };
  asked: number;
  allowance: number;
  roomFree: number | null;
  ceiling: number;
  proposed: number;
  note: string;
  createdAt: string;
}

export interface RoundFacts {
  name: string;
  stockBoxes: number;
  /** An ISO date and time. */
  requestDeadline: string;
  /** A date, YYYY-MM-DD. */
  deliveryDate: string;
  deliveryPlace: string;
  expectedHarvestDate: string;
}

export type OnboardingState = string;

/** One step of a new farmer's getting started list. The page words each state, and `detail` holds what the words need. */
export interface OnboardingStep {
  key: 'cooperative' | 'farm' | 'room' | 'eggs';
  state: OnboardingState;
  detail: {
    farmId?: string;
    waitingFor?: string[];
    note?: string;
    roundName?: string;
    boxes?: number;
    deliveryDate?: string;
    deliveryPlace?: string;
  };
}

export interface Onboarding {
  /** True when the farmer is past every step, so the list is not shown. */
  complete: boolean;
  steps: OnboardingStep[];
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

  /** The farmer's card and rooms, for a supervisor or admin who is deciding about their request. */
  getFarmerAllowance: (farmerId: string) => api.get<ApiResponse<AllowanceEvidence>>(`/supply/allowance/farmers/${farmerId}`),

  /** How many things wait for the caller's decision. The route is the team's, because a supervisor's team is the scope. */
  decisionCount: (params?: { cooperativeId?: string }) => api.get<ApiResponse<DecisionCount>>('/team/decisions', { params }),

  currentRound: () => api.get<ApiResponse<CurrentRound>>('/supply/rounds/current'),

  requestEggs: (roundId: string, data: { roomId: string; boxes: number; note?: string }) =>
    api.post<ApiResponse<{ id: string; boxesAsked: number; status: string }>>(`/supply/rounds/${roundId}/requests`, data),

  cancelRequest: (id: string) => api.delete<ApiResponse<null>>(`/supply/requests/${id}`),

  /** The farmer, or a supervisor for them, says how many boxes arrived and in what state. This starts the batch. */
  receive: (id: string, data: { boxes: number; condition: 'good' | 'damaged' }) =>
    api.post<ApiResponse<{ id: string; status: string; boxesReceived: number; batchId: string }>>(`/supply/requests/${id}/receipt`, data),

  listRounds: (params?: { cooperativeId?: string }) => api.get<ApiResponse<{ rounds: SupplyRound[] }>>('/supply/rounds', { params }),

  createRound: (data: RoundFacts & { cooperativeId?: string }) => api.post<ApiResponse<SupplyRound>>('/supply/rounds', data),

  getRound: (id: string) => api.get<ApiResponse<{ round: SupplyRound; requests: EggRequestRow[] }>>(`/supply/rounds/${id}`),

  updateRound: (id: string, data: Partial<RoundFacts>) => api.patch<ApiResponse<SupplyRound>>(`/supply/rounds/${id}`, data),

  roundAction: (id: string, data: { action: 'open' | 'close' | 'cancel' | 'pause' | 'resume'; note?: string }) =>
    api.post<ApiResponse<SupplyRound>>(`/supply/rounds/${id}/action`, data),

  roundProposal: (id: string) => api.get<ApiResponse<{ requests: SplitRow[]; stock: number; total: number }>>(`/supply/rounds/${id}/proposal`),

  confirmRound: (id: string, items: { id: string; boxes: number; declineNote?: string }[]) =>
    api.post<ApiResponse<{ round: SupplyRound; total: number }>>(`/supply/rounds/${id}/confirm`, { items }),

  notCollected: (requestId: string) => api.post<ApiResponse<{ id: string; status: string }>>(`/supply/requests/${requestId}/not-collected`),

  onboarding: () => api.get<ApiResponse<Onboarding>>('/supply/onboarding'),

  getSettings: (cooperativeId?: string) =>
    api.get<ApiResponse<SupplySettings>>('/supply/settings', { params: cooperativeId ? { cooperativeId } : undefined }),

  updateSettings: (data: { cooperativeId?: string; starterBoxes?: number; m2PerBox?: number | null }) =>
    api.patch<ApiResponse<SupplySettings>>('/supply/settings', data),
};
