import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Filters that apply themselves. There is no Apply button.
 *
 * `draft` is what the boxes show, `applied` is what the list uses. A choice from a menu or a date is applied at
 * once (`instant`). Typing is applied a moment after it stops, so the list is not reloaded on every key press.
 * `reset` puts everything back at once.
 */
export function useAutoFilters<T extends object>(initial: T, delay = 350) {
  const [draft, setDraft] = useState<T>(initial);
  const [applied, setApplied] = useState<T>(initial);
  const draftRef = useRef<T>(initial);
  const startRef = useRef<T>(initial);
  const timer = useRef<number>();

  const set = useCallback((patch: Partial<T>, instant = false) => {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
    window.clearTimeout(timer.current);
    if (instant) setApplied(next);
    else timer.current = window.setTimeout(() => setApplied(next), delay);
  }, [delay]);

  const reset = useCallback(() => {
    window.clearTimeout(timer.current);
    draftRef.current = startRef.current;
    setDraft(startRef.current);
    setApplied(startRef.current);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const changed = JSON.stringify(draft) !== JSON.stringify(startRef.current);
  return { draft, applied, set, reset, changed };
}
