import api from './api';
import { ApiResponse, IoTDevice } from '../types';

export const deviceService = {
  getAll: () =>
    api.get<ApiResponse<IoTDevice[]>>('/devices'),

  getById: (id: string) =>
    api.get<ApiResponse<IoTDevice>>(`/devices/${id}`),
};
