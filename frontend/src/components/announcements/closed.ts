import type { Announcement } from '../../types';

// What this device has closed. It stays on the device: closing a banner says nothing to the server.

const STORE = 'ssms_closed_announcements';
const KEPT = 50;
const AT_MOST = 2;

/** The number and the version, so a banner whose words changed is a new one to somebody who closed the old one. */
export const announcementKey = (item: Announcement): string => `${item.id}.${item.version}`;

function readList(): string[] {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(STORE) ?? '[]');
    return Array.isArray(kept) ? kept.filter((key): key is string => typeof key === 'string') : [];
  } catch {
    return [];
  }
}

export const readClosed = (): Set<string> => new Set(readList());

export function rememberClosed(item: Announcement): Set<string> {
  const key = announcementKey(item);
  const list = [...readList().filter((kept) => kept !== key), key].slice(-KEPT);
  try {
    localStorage.setItem(STORE, JSON.stringify(list));
  } catch {
    // Storage is blocked or full. The banner stays closed until the page is loaded again.
  }
  return new Set(list);
}

/** The first two that are not closed. An urgent one counts as not closed, whatever the device remembers. */
export function visibleAnnouncements(items: Announcement[], closed: ReadonlySet<string>): Announcement[] {
  return items.filter((item) => item.kind === 'urgent' || !closed.has(announcementKey(item))).slice(0, AT_MOST);
}
