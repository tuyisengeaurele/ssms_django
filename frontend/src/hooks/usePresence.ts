import { useEffect, useRef, useState } from 'react';

// Something that leaves (a dialog, a toast) is kept on screen, marked as leaving, long enough for its leaving animation to play.
// The animation itself is CSS: the stylesheet reacts to `data-leaving`. This only decides how long the element stays.

/** For one thing that is shown or hidden. */
export function usePresence(present: boolean, exitMs: number): { mounted: boolean; leaving: boolean } {
  const [mounted, setMounted] = useState(present);

  useEffect(() => {
    if (present) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(timer);
  }, [present, exitMs]);

  return { mounted: present || mounted, leaving: !present && mounted };
}

interface Row<T> {
  item: T;
  leaving: boolean;
}

/** For a list. An item that left stays in its place, marked as leaving, until its animation is over. */
export function usePresenceList<T extends { id: string }>(items: readonly T[], exitMs: number): Array<Row<T>> {
  const [rows, setRows] = useState<Array<Row<T>>>(() => items.map((item) => ({ item, leaving: false })));
  const shown = useRef(rows);
  shown.current = rows;
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // A caller may hand over a new array on every render. Only a change in who is in the list matters.
  const who = items.map((item) => item.id).join('\u0000');

  useEffect(() => {
    const live = new Map(items.map((item) => [item.id, item]));

    setRows((before) => {
      const next: Array<Row<T>> = before.map((row) => {
        const now = live.get(row.item.id);
        return now ? { item: now, leaving: false } : { item: row.item, leaving: true };
      });
      const known = new Set(before.map((row) => row.item.id));
      for (const item of items) if (!known.has(item.id)) next.push({ item, leaving: false });
      return next;
    });

    for (const [id, timer] of timers.current) {
      if (live.has(id)) {
        clearTimeout(timer);
        timers.current.delete(id);
      }
    }
    for (const { item } of shown.current) {
      if (live.has(item.id) || timers.current.has(item.id)) continue;
      const id = item.id;
      timers.current.set(
        id,
        setTimeout(() => {
          timers.current.delete(id);
          setRows((now) => now.filter((row) => !(row.item.id === id && row.leaving)));
        }, exitMs),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `who` stands for the ids of `items`
  }, [who, exitMs]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  return rows;
}
