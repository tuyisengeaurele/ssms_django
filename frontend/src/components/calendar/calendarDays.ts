/**
 * The calendar thinks in whole days written like 2026-11-05. A day is never a moment, so a time zone or a clock
 * change cannot move an event to another square. All arithmetic is done in UTC on purpose, for the same reason.
 */

const MS_DAY = 86_400_000;
/** What the server accepts for one window, less one so a window is always allowed. */
const MAX_SPAN = 99;
/** The phone agenda shows today and the 13 days after it. */
const AGENDA_DAYS = 14;

const parse = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

const write = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export const addDays = (iso: string, n: number): string => write(parse(iso) + n * MS_DAY);

export const daysBetween = (from: string, to: string): number => Math.round((parse(to) - parse(from)) / MS_DAY);

/** Monday is 0 and Sunday is 6. */
export const weekdayIndex = (iso: string): number => (new Date(parse(iso)).getUTCDay() + 6) % 7;

/** The same day of another month, or the last day of it when that month is shorter. */
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const first = Date.UTC(y, m - 1 + n, 1);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return write(first + (Math.min(d, last) - 1) * MS_DAY);
}

/** Today (or any date) as the person sees it on their own clock. */
export function localIsoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Six weeks of days that show a month, with the edge days of the months around it. `monthIndex` is 0 for January. */
export function gridDays(year: number, monthIndex: number, mondayFirst = true): string[] {
  const first = write(Date.UTC(year, monthIndex, 1));
  const lead = mondayFirst ? weekdayIndex(first) : new Date(parse(first)).getUTCDay();
  const start = addDays(first, -lead);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/**
 * The days to ask the server for: the whole grid and, when it fits in one window, today and the 13 days after it for the
 * phone agenda. A month far from today asks for the grid alone.
 */
export function fetchWindow(days: string[], today: string): { from: string; to: string } {
  const grid = { from: days[0], to: days[days.length - 1] };
  const from = today < grid.from ? today : grid.from;
  const agendaEnd = addDays(today, AGENDA_DAYS - 1);
  const to = agendaEnd > grid.to ? agendaEnd : grid.to;
  return daysBetween(from, to) <= MAX_SPAN ? { from, to } : grid;
}
