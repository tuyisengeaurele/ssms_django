import api from './api';
import { downloadFile } from './download';
import { ApiResponse, Farm } from '../types';
import type { PlaceValue } from '../components/ui/LocationPicker';

export const farmService = {
  /** A farm's place is five codes, province down to village, and an optional street. */
  create: (data: { name: string } & PlaceValue) =>
    api.post<ApiResponse<Farm>>('/farms', data),

  getAll: (page?: number) => {
    const q = page ? `?page=${page}` : '';
    return api.get<ApiResponse<Farm[]>>(`/farms${q}`);
  },

  getById: (id: string) => api.get<ApiResponse<Farm>>(`/farms/${id}`),

  /** Send the name, the street, or all five codes together with the street to move the farm. */
  update: (id: string, data: { name?: string; street?: string } | ({ name?: string } & PlaceValue)) =>
    api.patch<ApiResponse<Farm>>(`/farms/${id}`, data),

  delete: (id: string) => api.delete<ApiResponse<null>>(`/farms/${id}`),

  /** The farm summary as a PDF on the SSMS letterhead, in the language of the screen. */
  downloadSummary: (id: string, lang: string) =>
    downloadFile(`/farms/${id}/summary`, { lang }, 'farm_summary.pdf'),
};
