import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { readClosed, rememberClosed, visibleAnnouncements } from '../components/announcements/closed';
import { announcementService } from '../services/announcement.service';
import { getAccessToken } from '../services/session';
import type { Announcement } from '../types';

/**
 * `app` asks as pages change and every five minutes. `visitor-live` asks every five minutes. `visitor-once` asks once, so a
 * tab somebody forgot on the home page does not keep the free server awake. A hidden tab never asks.
 */
export type AnnouncementsMode = 'app' | 'visitor-live' | 'visitor-once';

const EVERY_MS = 5 * 60_000;
const PAGE_CHANGE_GAP_MS = 60_000;

export function useAnnouncements(mode: AnnouncementsMode) {
  const { pathname } = useLocation();
  const [list, setList] = useState<Announcement[]>([]);
  const [closed, setClosed] = useState<ReadonlySet<string>>(readClosed);
  const askIfOlderThan = useRef<(gapMs: number) => void>(() => {});

  useEffect(() => {
    const repeats = mode !== 'visitor-once';
    let askedAt: number | null = null;
    let onTheWay = false;
    let gone = false;
    let timer: number | undefined;

    const ask = async () => {
      onTheWay = true;
      const at = Date.now();
      askedAt = at;
      // The phone and closure screens look like the sign in page, but the person on them is signed in.
      const signedIn = mode === 'app' || getAccessToken() !== null;
      const news = await (signedIn ? announcementService.current() : announcementService.visitor());
      onTheWay = false;
      if (gone) return;
      if (news) setList(news);
      if (repeats) {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => maybeAsk(0), Math.max(0, at + EVERY_MS - Date.now()));
      }
    };

    const maybeAsk = (gapMs: number) => {
      if (onTheWay || document.visibilityState !== 'visible') return;
      if (askedAt !== null && (!repeats || Date.now() - askedAt < gapMs)) return;
      void ask();
    };

    const onVisibility = () => maybeAsk(EVERY_MS);
    askIfOlderThan.current = maybeAsk;
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      gone = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [mode]);

  // Declared after the effect above, so on opening the first question is already out and this adds nothing.
  useEffect(() => {
    if (mode === 'app') askIfOlderThan.current(PAGE_CHANGE_GAP_MS);
  }, [mode, pathname]);

  const close = useCallback((item: Announcement) => {
    const kept = rememberClosed(item);
    // Added to what is closed already, so a device that cannot remember still keeps them all closed for this visit.
    setClosed((before) => new Set([...before, ...kept]));
  }, []);

  const items = useMemo(() => visibleAnnouncements(list, closed), [list, closed]);
  return { items, close };
}
