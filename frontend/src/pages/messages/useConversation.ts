import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useMessages, type ConversationNews } from '../../context/MessagesContext';
import { useApiError } from '../../hooks/useApiError';
import { messageService } from '../../services/message.service';
import type { ChatMessage, ConversationRow } from '../../types';

/** A message the page has and the server has not confirmed. */
export interface Pending {
  /** Made once, and sent again with every try, so that a message whose answer was lost is never saved twice. */
  clientId: string;
  body: string;
  failed: boolean;
  problem: string;
}

export interface ConversationOptions {
  conversationId?: string;
  /** Who a first message goes to, when there is no conversation yet. A farmer names nobody. */
  farmerId?: string;
  asFarmer: boolean;
  /** A first message made the conversation. */
  onStarted: (id: string) => void;
  /** Something changed that the list shows. */
  onChanged: () => void;
  /** A new message from the other side arrived while the page was open. */
  onArrived: (message: ChatMessage) => void;
  /** Whether the newest message is on the screen. */
  atEnd: () => boolean;
}

const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/** Each message once, in the order they were saved. */
function merge(held: ChatMessage[], more: ChatMessage[]): ChatMessage[] {
  const all = new Map(held.map((m) => [m.id, m]));
  for (const m of more) all.set(m.id, m);
  return [...all.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
}

export function useConversation({ conversationId, farmerId, asFarmer, onStarted, onChanged, onArrived, atEnd }: ConversationOptions) {
  const { watch, setUnread } = useMessages();
  const { getErrorMessage } = useApiError();
  const [conversation, setConversation] = useState<ConversationRow | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [otherReadAt, setOtherReadAt] = useState<string | null>(null);
  const [isOpen, setOpen] = useState(true);
  const [state, setState] = useState<'loading' | 'ready' | 'failed' | 'missing'>(conversationId ? 'loading' : 'ready');
  const [pending, setPending] = useState<Pending[]>([]);

  // Kept in step by hand, so what arrives is compared with what is held right now.
  const held = useRef<ChatMessage[]>([]);
  const heldFor = useRef<string | null>(null);
  const waitingToBeRead = useRef(false);
  const latest = useRef({ onStarted, onChanged, onArrived, atEnd });
  latest.current = { onStarted, onChanged, onArrived, atEnd };

  const keep = useCallback((more: ChatMessage[]) => {
    held.current = merge(held.current, more);
    setMessages(held.current);
  }, []);

  /** Marks the newest message read, when somebody can see it: the tab is visible and it is on the screen. */
  const markIfSeen = useCallback(() => {
    const id = heldFor.current;
    const newest = held.current[held.current.length - 1];
    if (!waitingToBeRead.current || !id || !newest) return;
    if (document.visibilityState !== 'visible' || !latest.current.atEnd()) return;
    waitingToBeRead.current = false;
    messageService.read(id, newest.id).then(
      (res) => {
        setUnread(res.data.data.unreadTotal);
        latest.current.onChanged();
      },
      () => { waitingToBeRead.current = true; },   // tried again the next time it is looked at
    );
  }, [setUnread]);

  const load = useCallback(async (id: string) => {
    setState('loading');
    try {
      const found = (await messageService.one(id)).data.data;
      heldFor.current = id;
      held.current = [];
      keep(found.messages);
      setConversation(found.conversation);
      setHasOlder(found.hasOlder);
      setOtherReadAt(found.otherReadAt);
      setOpen(found.conversation.isOpen);
      waitingToBeRead.current = found.conversation.unread > 0;
      setState('ready');
    } catch (error) {
      setState(axios.isAxiosError(error) && error.response?.status === 404 ? 'missing' : 'failed');
    }
  }, [keep]);

  useEffect(() => {
    // After a first message the address gains the new conversation's number. What is on the screen is that conversation.
    if (conversationId && heldFor.current !== conversationId) void load(conversationId);
  }, [conversationId, load]);

  const shownId = state === 'ready' ? conversation?.id : undefined;

  useEffect(() => {
    if (!shownId) return undefined;
    const arrived = (news: ConversationNews) => {
      setOpen(news.isOpen);
      setOtherReadAt(news.otherReadAt);
      const known = new Set(held.current.map((m) => m.id));
      const fresh = news.messages.filter((m) => !known.has(m.id));
      if (fresh.length === 0) return;
      const fromThem = fresh.filter((m) => m.fromFarmer !== asFarmer);
      if (fromThem.length > 0) waitingToBeRead.current = true;
      keep(fresh);
      const said = fresh.filter((m) => !m.mine);
      if (said.length > 0) latest.current.onArrived(said[said.length - 1]);
      latest.current.onChanged();
    };
    return watch({ id: shownId, since: () => held.current[held.current.length - 1]?.createdAt ?? new Date(0).toISOString() }, arrived);
  }, [shownId, watch, keep, asFarmer]);

  useEffect(() => {
    document.addEventListener('visibilitychange', markIfSeen);
    return () => document.removeEventListener('visibilitychange', markIfSeen);
  }, [markIfSeen]);

  const deliver = useCallback(async (item: Pending) => {
    const where = heldFor.current ? { conversationId: heldFor.current } : farmerId ? { farmerId } : {};
    try {
      const { conversation: now, message } = (await messageService.send({ body: item.body, clientId: item.clientId, ...where })).data.data;
      const first = heldFor.current === null;
      heldFor.current = now.id;
      keep([message]);
      setPending((list) => list.filter((p) => p.clientId !== item.clientId));
      setConversation(now);
      setOpen(now.isOpen);
      if (first) latest.current.onStarted(now.id);
      latest.current.onChanged();
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.code === 'conversation_closed') setOpen(false);
      const problem = getErrorMessage(error);
      setPending((list) => list.map((p) => (p.clientId === item.clientId ? { ...p, failed: true, problem } : p)));
    }
  }, [farmerId, keep, getErrorMessage]);

  const send = useCallback((body: string) => {
    const item: Pending = { clientId: newId(), body, failed: false, problem: '' };
    setPending((list) => [...list, item]);
    void deliver(item);
  }, [deliver]);

  const retry = useCallback((item: Pending) => {
    setPending((list) => list.map((p) => (p.clientId === item.clientId ? { ...p, failed: false, problem: '' } : p)));
    void deliver(item);
  }, [deliver]);

  const loadOlder = useCallback(async () => {
    const id = heldFor.current;
    const first = held.current[0];
    if (!id || !first) return false;
    try {
      const found = (await messageService.one(id, first.id)).data.data;
      keep(found.messages);
      setHasOlder(found.hasOlder);
      return true;
    } catch {
      return false;
    }
  }, [keep]);

  const reload = useCallback(() => { if (conversationId) void load(conversationId); }, [conversationId, load]);

  return { state, conversation, messages, pending, hasOlder, otherReadAt, isOpen, send, retry, loadOlder, reload, markIfSeen };
}
