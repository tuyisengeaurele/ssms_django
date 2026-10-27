import api from './api';
import { ApiResponse, Room } from '../types';

export interface RoomInput {
  name: string;
  notes?: string;
}

export const roomService = {
  getByFarm: (farmId: string) => api.get<ApiResponse<Room[]>>(`/farms/${farmId}/rooms`),

  create: (farmId: string, data: RoomInput) => api.post<ApiResponse<Room>>(`/farms/${farmId}/rooms`, data),

  update: (id: string, data: RoomInput) => api.patch<ApiResponse<Room>>(`/rooms/${id}`, data),

  /** Hides the room. The server refuses while a batch is still in it. */
  remove: (id: string) => api.delete<ApiResponse<null>>(`/rooms/${id}`),
};
