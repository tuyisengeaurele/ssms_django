import type { ApiResponse, ChatMessage, ConversationPage, ConversationRow, MessageNews, PaginatedMessages } from '../types';
import api from './api';

/** On a weak connection a send can hang. It has to fail in the end, so the page can offer to try again. */
const SEND_TIMEOUT_MS = 30_000;
const QUIET_TIMEOUT_MS = 15_000;

export interface NewMessage {
  body: string;
  /** Made once for each message. Sending the same one again saves nothing twice. */
  clientId: string;
  conversationId?: string;
  farmerId?: string;
}

export const messageService = {
  list: (page = 1) => api.get<PaginatedMessages<ConversationRow>>('/messages/conversations', { params: { page } }),

  one: (id: string, before?: string) =>
    api.get<ApiResponse<ConversationPage>>(`/messages/conversations/${id}`, { params: before ? { before } : undefined }),

  send: (message: NewMessage) =>
    api.post<ApiResponse<{ conversation: ConversationRow; message: ChatMessage }>>('/messages/send', message, { timeout: SEND_TIMEOUT_MS }),

  /** The page marks by itself, so this never speaks and never signs anyone out (see api.ts). */
  read: (conversationId: string, messageId: string) =>
    api.post<ApiResponse<{ unreadTotal: number }>>('/messages/read', { conversationId, messageId }, { silent: true, timeout: QUIET_TIMEOUT_MS }),

  /** The check the page makes by itself. It never fails: `null` means "no news". */
  async updates(conversationId?: string, since?: string): Promise<MessageNews | null> {
    try {
      const response = await api.get('/messages/updates', {
        silent: true,
        timeout: QUIET_TIMEOUT_MS,
        params: conversationId ? { conversation: conversationId, since } : undefined,
      });
      const news = (response.data as { data?: MessageNews } | null)?.data;
      return typeof news?.unreadTotal === 'number' ? news : null;
    } catch {
      return null;
    }
  },
};
