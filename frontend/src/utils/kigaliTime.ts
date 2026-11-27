// Announcement times are written and read in Kigali time, wherever the admin's computer thinks it is. Rwanda is two hours
// ahead of UTC all year, so the offset is fixed and the computer's time zone is never read.
const AHEAD_MS = 2 * 60 * 60_000;

/** A moment as a `datetime-local` box shows it, in Kigali time. */
export const toKigaliInput = (iso: string): string => new Date(new Date(iso).getTime() + AHEAD_MS).toISOString().slice(0, 16);

/** What such a box holds, as a moment the server can read. */
export const fromKigaliInput = (value: string): string => `${value}:00+02:00`;
