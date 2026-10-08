/** "5 minutes ago" in the reader's language. After a month it shows the date. */
export function timeAgo(iso: string, locale: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (seconds < 45) return rtf.format(0, 'second');
  if (seconds < 3600) return rtf.format(-Math.max(1, Math.round(seconds / 60)), 'minute');
  if (seconds < 86400) return rtf.format(-Math.round(seconds / 3600), 'hour');
  if (seconds < 30 * 86400) return rtf.format(-Math.round(seconds / 86400), 'day');
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
}
