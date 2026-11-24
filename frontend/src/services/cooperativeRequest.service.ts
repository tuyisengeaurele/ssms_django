import api from './api';
import { ApiResponse } from '../types';

export type CooperativeRequestStatus = 'requested' | 'approved' | 'declined' | 'withdrawn';

export interface CooperativeName {
  id: string;
  name: string;
}

/** A person's request to move to another cooperative (`to`), or to leave theirs (`to` is null). */
export interface CooperativeRequest {
  id: string;
  status: CooperativeRequestStatus;
  reason: string;
  from: CooperativeName | null;
  to: CooperativeName | null;
  decisionNote: string;
  createdAt: string;
  decidedAt: string | null;
}

/** A request as the SSMS team sees it: who asked, and whether leaving empties the cooperative of supervisors. */
export interface AdminCooperativeRequest extends CooperativeRequest {
  person: { id: string; name: string; email: string; phone?: string; photoUrl?: string | null; role: 'FARMER' | 'SUPERVISOR' | 'ADMIN' };
  onlySupervisor: boolean;
  decidedBy: string | null;
}

export const cooperativeRequestService = {
  /** The names a person may ask to join, and nothing else about the cooperatives. */
  options: () => api.get<ApiResponse<CooperativeName[]>>('/cooperatives/options'),

  /** The open request, or the last decided one, or null. */
  mine: () => api.get<ApiResponse<CooperativeRequest | null>>('/account/cooperative-request'),

  /** `toCooperativeId` null asks to leave the cooperative. */
  ask: (data: { toCooperativeId: string | null; reason: string }) =>
    api.post<ApiResponse<CooperativeRequest>>('/account/cooperative-request', data),

  withdraw: () => api.delete<ApiResponse<null>>('/account/cooperative-request'),

  list: (status: CooperativeRequestStatus = 'requested') =>
    api.get<ApiResponse<{ requests: AdminCooperativeRequest[]; count: number }>>('/admin/cooperative-requests', { params: { status } }),

  decide: (id: string, data: { decision: 'approve' | 'decline'; note?: string }) =>
    api.post<ApiResponse<{ id: string; status: CooperativeRequestStatus }>>(`/admin/cooperative-requests/${id}/decision`, data),
};
