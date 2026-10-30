import api from './api';
import type { ApiResponse, LotShare, PublicLot } from '../types';

export const lotService = {
  /** GET /api/harvest/<id>/share, the lot's QR code link, or a null token when it is not shared. Owner only. */
  getShare: (recordId: string) => api.get<ApiResponse<LotShare>>(`/harvest/${recordId}/share`),

  /** POST /api/harvest/<id>/share, makes the link, or gives the one that exists. */
  createShare: (recordId: string) => api.post<ApiResponse<LotShare>>(`/harvest/${recordId}/share`),

  /** DELETE /api/harvest/<id>/share, ends the link. Printed codes stop working. */
  stopShare: (recordId: string) => api.delete<ApiResponse<null>>(`/harvest/${recordId}/share`),

  /** GET /api/lots/<token>, the page behind a QR code. Public, so no sign in is sent. */
  getPublic: (token: string) => api.get<ApiResponse<PublicLot>>(`/lots/${token}`),
};
