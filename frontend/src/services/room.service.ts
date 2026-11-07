import api from './api';
import { ApiResponse, Room } from '../types';

export interface RoomInput {
  name: string;
  notes?: string;
  /** Square metres, 1 to 5000. A farmer's new size waits for a reviewer before it counts. */
  areaM2: number;
}

export type RoomDecision = 'approve' | 'reject';

/** A room that waits for a reviewer, with who asked and what they asked for. */
export interface WaitingRoom {
  id: string;
  name: string;
  kind: 'new' | 'size';
  approvalStatus: 'pending' | 'approved';
  areaM2: number | null;
  pendingAreaM2: number | null;
  createdAt: string;
  farm: { id: string; name: string };
  owner: { name: string; email: string };
}

export const roomService = {
  getByFarm: (farmId: string) => api.get<ApiResponse<Room[]>>(`/farms/${farmId}/rooms`),

  create: (farmId: string, data: RoomInput) => api.post<ApiResponse<Room>>(`/farms/${farmId}/rooms`, data),

  update: (id: string, data: RoomInput) => api.patch<ApiResponse<Room>>(`/rooms/${id}`, data),

  /** A supervisor or admin decides what waits on a room. A rejection needs a note. */
  review: (id: string, data: { decision: RoomDecision; note?: string }) => api.post<ApiResponse<Room>>(`/rooms/${id}/review`, data),

  /** The rooms that wait for the caller's decision, newest first. An admin may narrow to one cooperative. */
  waiting: (params?: { cooperativeId?: string }) =>
    api.get<ApiResponse<{ rooms: WaitingRoom[]; count: number }>>('/team/rooms', { params: { status: 'pending', ...params } }),

  /** Hides the room. The server refuses while a batch is still in it. */
  remove: (id: string) => api.delete<ApiResponse<null>>(`/rooms/${id}`),
};
