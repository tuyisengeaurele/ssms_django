import api from './api';
import { ApiResponse } from '../types';

/** A request to change the login email that has not been confirmed yet. The new address is masked: a***@example.rw. */
export interface EmailChangePending {
  id: string;
  newEmail: string;
  createdAt: string;
  expiresAt: string;
}

/** What a person does to their own account and has to prove: a new login email. */
export const accountService = {
  startEmailChange: (data: { newEmail: string; confirmEmail: string; password: string }) =>
    api.post<ApiResponse<EmailChangePending>>('/auth/email-change', data),

  getEmailChange: () => api.get<ApiResponse<EmailChangePending | null>>('/auth/email-change'),

  cancelEmailChange: () => api.delete<ApiResponse<null>>('/auth/email-change'),

  /** The link in the email sent to the new address. Public: it is opened in a browser that may hold no sign in. */
  confirmEmailChange: (token: string) => api.post<ApiResponse<null>>('/auth/email-change/confirm', { token }),

  /** The link in the email sent to the old address, good for seven days. Public too. */
  undoEmailChange: (token: string) => api.post<ApiResponse<null>>('/auth/email-change/undo', { token }),
};
