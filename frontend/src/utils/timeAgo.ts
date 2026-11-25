/** "5 minutes ago" in the reader's language. After a month it shows the date. */
import { dateFormat } from './dateFormat';

/**
 * Browsers have no Kinyarwanda time data: asking for "rw" gives English or a bare "-2 h". So the words are kept here, with the
 * number after the word as Kinyarwanda puts it. One of a thing has its own word. A native speaker still has to read these.
 */
function kinyarwandaAgo(seconds: number): string | null {
  if (seconds < 45) return 'nonaha';
  if (seconds < 3600) {
    const minutes = Math.max(1, Math.round(seconds / 60));
    return minutes === 1 ? 'hashize umunota 1' : `hashize iminota ${minutes}`;
  }
  if (seconds < 86400) {
    const hours = Math.round(seconds / 3600);
    return hours === 1 ? 'hashize isaha 1' : `hashize amasaha ${hours}`;
  }
  if (seconds < 30 * 86400) {
    const days = Math.round(seconds / 86400);
    return days === 1 ? 'ejo' : `hashize iminsi ${days}`;
  }
  return null;
}

export function timeAgo(iso: string, locale: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));

  if (locale === 'rw') {
    const words = kinyarwandaAgo(seconds);
    if (words) return words;
    return dateFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
  }

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (seconds < 45) return rtf.format(0, 'second');
  if (seconds < 3600) return rtf.format(-Math.max(1, Math.round(seconds / 60)), 'minute');
  if (seconds < 86400) return rtf.format(-Math.round(seconds / 3600), 'hour');
  if (seconds < 30 * 86400) return rtf.format(-Math.round(seconds / 86400), 'day');
  return dateFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
}
