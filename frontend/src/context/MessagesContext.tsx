import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { messageService } from '../services/message.service';
import type { MessageNews } from '../types';
import { useAuth } from './AuthContext';

/** How often a visible page asks. The same as the check for a support request, so it keeps no server awake for longer. */
const POLL_MS = 30_000;

export type ConversationNews = NonNullable<MessageNews['conversation']>;

export interface OpenConversation {
  id: string;
  /** The time of the latest message the page holds. Asked for each time, because it moves. */
  since: () => string;
}

interface Value {
  unread: number;
  /** Also ask about this conversation, until the returned function is called. */
  watch: (open: OpenConversation | null, onNews: (news: ConversationNews) => void) => () => void;
  /** For a count the page has just learned, such as after marking something read. */
  setUnread: (count: number) => void;
}

const NOTHING: Value = { unread: 0, watch: () => () => {}, setUnread: () => {} };

export const MessagesContext = createContext<Value>(NOTHING);

export const useMessages = () => useContext(MessagesContext);

/**
 * One check for new messages for the whole signed in layout: the menu's count and the open conversation both come from it.
 * It asks only while the tab is visible. An admin has no conversations, and support access may not look at any.
 */
export function MessagesProvider({ children }: { children: ReactNode }) {
  const { user, acting } = useAuth();
  const enabled = !acting && (user?.role === 'FARMER' || user?.role === 'SUPERVISOR');
  const [unread, setUnread] = useState(0);
  const watching = useRef<{ open: OpenConversation; onNews: (news: ConversationNews) => void } | null>(null);

  const watch = useCallback<Value['watch']>((open, onNews) => {
    const mine = open ? { open, onNews } : null;
    watching.current = mine;
    // Only its own watch is ended: the page may start the next one before it stops the last.
    return () => {
      if (watching.current === mine) watching.current = null;
    };
  }, []);

  useEffect(() => {
    setUnread(0);
    if (!enabled) return undefined;
    let gone = false;
    let asking = false;

    const ask = async () => {
      // Focus and a visibility change often arrive together. One question is enough.
      if (asking || document.visibilityState !== 'visible') return;
      asking = true;
      const about = watching.current;
      const news = await messageService.updates(about?.open.id, about?.open.since());
      asking = false;
      if (gone || !news) return;
      setUnread(news.unreadTotal);
      // What came for a conversation the person has left since is not for the one open now.
      if (about && news.conversation && watching.current === about) about.onNews(news.conversation);
    };

    void ask();
    const timer = window.setInterval(() => void ask(), POLL_MS);
    const look = () => void ask();
    document.addEventListener('visibilitychange', look);
    window.addEventListener('focus', look);
    return () => {
      gone = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', look);
      window.removeEventListener('focus', look);
    };
  }, [enabled, user?.id]);

  const value = useMemo(() => ({ unread, watch, setUnread }), [unread, watch]);
  return <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>;
}
