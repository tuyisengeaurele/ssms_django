import api from './api';
import { ApiResponse, IoTDevice } from '../types';

export interface DeviceCreatePayload {
  name: string;
  farmId: string;
  roomId?: string;
  location?: string;
  deviceKey?: string;
}

export const deviceService = {
  getAll: (farmId?: string) => {
    const params = farmId ? { farm: farmId } : {};
    return api.get<ApiResponse<IoTDevice[]>>('/devices', { params });
  },

  getById: (id: string) =>
    api.get<ApiResponse<IoTDevice>>(`/devices/${id}`),

  create: (payload: DeviceCreatePayload) =>
    api.post<ApiResponse<IoTDevice>>('/devices', payload),

  /** Puts the sensor in another room of its farm. Only managers may. */
  moveToRoom: (id: string, roomId: string) =>
    api.patch<ApiResponse<IoTDevice>>(`/devices/${id}`, { roomId }),

  remove: (id: string) =>
    api.delete<ApiResponse<{ id: string }>>(`/devices/${id}`),
};
