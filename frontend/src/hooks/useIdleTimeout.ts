import { useCallback, useEffect, useRef, useState } from 'react';

const CHANNEL = 'ssms-activity';
const PING_EVERY_MS = 5 * 60_000;
const SHARE_EVERY_MS = 1_000;
const ACTIVITY = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'scroll', 'wheel'] as const;

interface Options {
  /** How long the sign in may sit unused. Null means there is no limit, so nothing runs. */
  limitSeconds: number | null;
  warnSeconds?: number;
  onExpire: () => void;
  /** Tell the server somebody is still here. Called at most every 5 minutes, and only after the person was active. */
  onPing?: () => void;
}

/**
 * Watches for a sign in that nobody is using. The server decides when it ends, so this only warns first and signs out
 * on time. Time is read from the clock, never counted in ticks, so a laptop that slept wakes up knowing the truth.
 * Activity in any tab counts for all of them.
 */
export function useIdleTimeout({ limitSeconds, warnSeconds = 60, onExpire, onPing }: Options) {
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const lastActivity = useRef(Date.now());
  const lastShared = useRef(0);
  const lastPing = useRef(Date.now());
  const activeSincePing = useRef(false);
  const warningOn = useRef(false);
  const expired = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const expireRef = useRef(onExpire);
  const pingRef = useRef(onPing);
  expireRef.current = onExpire;
  pingRef.current = onPing;

  const showWarning = (on: boolean, left = 0) => {
    warningOn.current = on;
    setWarning(on);
    setSecondsLeft(left);
  };

  const mark = useCallback((share: boolean) => {
    const now = Date.now();
    lastActivity.current = now;
    activeSincePing.current = true;
    if (share && channel.current) {
      lastShared.current = now;
      channel.current.postMessage({ type: 'activity', at: now });
    }
  }, []);

  const stay = useCallback(() => {
    expired.current = false;
    mark(true);
    showWarning(false);
    lastPing.current = Date.now();
    activeSincePing.current = false;
    pingRef.current?.();
  }, [mark]);

  useEffect(() => {
    if (limitSeconds === null) return undefined;
    const limitMs = limitSeconds * 1000;
    const warnFromMs = limitMs - warnSeconds * 1000;
    lastActivity.current = Date.now();
    lastPing.current = Date.now();
    expired.current = false;

    channel.current = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
    if (channel.current) {
      channel.current.onmessage = (event: MessageEvent) => {
        const at = (event.data as { at?: number } | null)?.at;
        if (typeof at === 'number' && at > lastActivity.current) {
          lastActivity.current = at;
          if (warningOn.current) showWarning(false);
        }
      };
    }

    const check = () => {
      if (expired.current) return;
      const now = Date.now();
      const idle = now - lastActivity.current;
      if (idle >= limitMs) {
        expired.current = true;
        showWarning(false);
        expireRef.current();
        return;
      }
      if (idle >= warnFromMs) {
        showWarning(true, Math.ceil((limitMs - idle) / 1000));
        return;
      }
      if (warningOn.current) showWarning(false);
      if (activeSincePing.current && now - lastPing.current >= PING_EVERY_MS) {
        lastPing.current = now;
        activeSincePing.current = false;
        pingRef.current?.();
      }
    };

    const onActivity = () => {
      // Once the warning is up only an answer dismisses it, so a nudge of the mouse cannot hide it unseen.
      if (warningOn.current || expired.current) return;
      if (Date.now() - lastShared.current < SHARE_EVERY_MS) return;
      mark(true);
    };

    const timer = window.setInterval(check, 1000);
    document.addEventListener('visibilitychange', check);
    ACTIVITY.forEach((type) => window.addEventListener(type, onActivity, { passive: true }));

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      ACTIVITY.forEach((type) => window.removeEventListener(type, onActivity));
      channel.current?.close();
      channel.current = null;
    };
  }, [limitSeconds, warnSeconds, mark]);

  return { warning, secondsLeft, stay };
}
