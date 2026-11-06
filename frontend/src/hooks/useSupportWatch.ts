import { useCallback, useEffect, useRef, useState } from 'react';
import { supportService } from '../services/support.service';
import type { SupportPersonRow } from '../types';

/** How often a visible page asks whether support is asking for access. */
const POLL_MS = 30_000;

interface Watched {
  request: SupportPersonRow | null;
  active: SupportPersonRow | null;
}

const NOTHING: Watched = { request: null, active: null };

/**
 * Watches for a question from SSMS support, and for a visit that is running on this account. It asks every 30 seconds
 * and when the page gets focus, and only while the tab is visible. A tab left open and hidden overnight makes no
 * calls, so it does not keep the free server awake.
 */
export function useSupportWatch(enabled: boolean): Watched & { refresh: () => Promise<void> } {
  const [state, setState] = useState<Watched>(NOTHING);
  const asking = useRef(false);

  const refresh = useCallback(async () => {
    // Focus and a visibility change often arrive together. One question is enough.
    if (asking.current) return;
    asking.current = true;
    try {
      const res = await supportService.pending();
      setState(res.data.data);
    } catch {
      // A moment without a connection says nothing about the account. Keep what was known.
    } finally {
      asking.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setState(NOTHING);
      return undefined;
    }
    const visible = () => document.visibilityState === 'visible';
    const ask = () => {
      if (visible()) void refresh();
    };
    ask();
    const timer = window.setInterval(ask, POLL_MS);
    document.addEventListener('visibilitychange', ask);
    window.addEventListener('focus', ask);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', ask);
      window.removeEventListener('focus', ask);
    };
  }, [enabled, refresh]);

  return { ...state, refresh };
}
