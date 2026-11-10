/** What every caller needs from a date formatter. The browser's own `Intl.DateTimeFormat` fits it. */
export interface DateFormatter {
  format(date?: Date | number): string;
}

const MONTHS = ['Mutarama', 'Gashyantare', 'Werurwe', 'Mata', 'Gicurasi', 'Kamena', 'Nyakanga', 'Kanama', 'Nzeri', 'Ukwakira', 'Ugushyingo', 'Ukuboza'];
const MONTHS_SHORT = ['Mut', 'Gas', 'Wer', 'Mat', 'Gic', 'Kam', 'Nya', 'Kan', 'Nze', 'Ukw', 'Ugu', 'Ukb'];
// By day of the week as a date counts it: Sunday is 0.
const DAYS = ['Ku cyumweru', 'Kuwa mbere', 'Kuwa kabiri', 'Kuwa gatatu', 'Kuwa kane', 'Kuwa gatanu', 'Kuwa gatandatu'];
const DAYS_SHORT = ['Cyu', 'Mbe', 'Kab', 'Gtu', 'Kan', 'Gnu', 'Gnd'];
const ENGLISH_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** `dateStyle` and `timeStyle` spelled out as fields, so the layout does not depend on one browser's punctuation. */
function expand(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  const { dateStyle, timeStyle, ...rest } = options;
  const fields: Intl.DateTimeFormatOptions = { ...rest };
  if (dateStyle === 'full') Object.assign(fields, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (dateStyle === 'long') Object.assign(fields, { day: 'numeric', month: 'long', year: 'numeric' });
  if (dateStyle === 'medium') Object.assign(fields, { day: 'numeric', month: 'short', year: 'numeric' });
  if (dateStyle === 'short') Object.assign(fields, { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (timeStyle) Object.assign(fields, { hour: '2-digit', minute: '2-digit', ...(timeStyle === 'medium' || timeStyle === 'long' || timeStyle === 'full' ? { second: '2-digit' } : {}) });
  return fields;
}

/**
 * A date formatter for the language the person chose. English and French are the browser's own. Browsers have no Kinyarwanda
 * date data, so asking them for "rw" quietly gives English ("Nov 25, 2026"). For Kinyarwanda this keeps the browser's
 * numbers and layout (day, month, year, a 24 hour clock) and puts Kinyarwanda names in place of the month and the weekday.
 */
export function dateFormat(locale: string, options: Intl.DateTimeFormatOptions = {}): DateFormatter {
  if (locale !== 'rw') return new Intl.DateTimeFormat(locale, options);

  const fields = expand(options);
  const base = new Intl.DateTimeFormat('en-GB', fields);
  const monthOf = new Intl.DateTimeFormat('en-US', { month: 'numeric', timeZone: options.timeZone });
  const dayOf = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: options.timeZone });

  return {
    format(date: Date | number = Date.now()) {
      const moment = new Date(date);
      // An invalid date makes this throw a RangeError, as the browser's own formatter does.
      const parts = base.formatToParts(moment);
      const month = Number(monthOf.format(moment)) - 1;
      const day = ENGLISH_DAYS.indexOf(dayOf.format(moment));

      let out = '';
      let afterLongWeekday = false;
      for (const part of parts) {
        let text = part.value;
        if (part.type === 'month' && /[A-Za-z]/.test(text)) {
          text = fields.month === 'long' ? MONTHS[month] : fields.month === 'narrow' ? MONTHS[month][0] : MONTHS_SHORT[month];
        } else if (part.type === 'weekday') {
          text = fields.weekday === 'long' ? DAYS[day] : fields.weekday === 'narrow' ? DAYS_SHORT[day][0] : DAYS_SHORT[day];
          afterLongWeekday = fields.weekday === 'long';
          out += text;
          continue;
        } else if (part.type === 'literal') {
          // "Wednesday, 25 November" reads without the comma; "25 November 2026 at 14:05" reads with a comma.
          if (afterLongWeekday && text.startsWith(',')) text = text.replace(/^,\s*/, ' ');
          if (/^\s+at\s+$/.test(text)) text = ', ';
        }
        afterLongWeekday = false;
        out += text;
      }
      return out;
    },
  };
}
