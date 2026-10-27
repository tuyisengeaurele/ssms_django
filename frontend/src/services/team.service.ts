import api from './api';
import { ApiResponse } from '../types';

export interface TeamFarmer {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  farmCount: number;
}

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface TeamInvitation {
  id: string;
  /** Empty when the link was not made for one address. */
  email: string;
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string;
  invitedByName: string;
  acceptedByName: string;
  /** Only in the answer to creating it. The server never shows it again. */
  link?: string;
}

/** A supervisor's farmers and invitation links. */
export const teamService = {
  getFarmers: () => api.get<ApiResponse<TeamFarmer[]>>('/team/farmers'),

  /** Takes the farmer out of the cooperative. Their account and farms stay. */
  removeFarmer: (id: string) => api.delete<ApiResponse<null>>(`/team/farmers/${id}`),

  getInvitations: () => api.get<ApiResponse<TeamInvitation[]>>('/team/invitations'),

  createInvitation: (email?: string) =>
    api.post<ApiResponse<TeamInvitation>>('/team/invitations', email ? { email } : {}),

  revokeInvitation: (id: string) => api.delete<ApiResponse<null>>(`/team/invitations/${id}`),
};

export interface InvitationDetails {
  cooperativeName: string;
  invitedByName: string;
  email: string;
}

/** The page behind an invitation link. */
export const invitationService = {
  get: (token: string) => api.get<ApiResponse<InvitationDetails>>(`/invitations/${token}`),
  accept: (token: string) => api.post<ApiResponse<null>>(`/invitations/${token}/accept`, {}),
};
