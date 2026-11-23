import { ERROR_CODE_KEY } from './errorCodes';

/** A number as the server keeps it (+250 and nine digits) written the way it is shown: 0788123456, no spaces. Anything else is returned as it is. */
export function formatRwandaMobile(stored: string | null | undefined): string {
  if (!stored) return '';
  const match = /^\+250(\d{9})$/.exec(stored);
  return match ? `0${match[1]}` : stored;
}

const PHONE_CODES = new Set(['invalid_phone', 'phone_required', 'phone_taken']);

/**
 * What the server said about the phone number field, in the language of the screen, or null when the refusal was about
 * something else. A code of ours is written from the page's own catalogue; otherwise the server's sentence is used.
 */
export function phoneFieldError(err: unknown, say: (key: string) => string): string | null {
  const body = (err as { response?: { data?: { code?: string; errors?: { phone?: unknown } } } })?.response?.data;
  const sentences = body?.errors?.phone;
  if (!Array.isArray(sentences) || sentences.length === 0) return null;
  const key = body?.code && PHONE_CODES.has(body.code) ? ERROR_CODE_KEY[body.code] : undefined;
  return key ? say(key) : String(sentences[0]);
}

/** A number written any usual way as +250 and nine digits, or null when it is not a Rwandan mobile. The server's rule, kept in step. */
function canonical(text: string | null | undefined): string | null {
  const cleaned = (text ?? '').replace(/[\s\-().]/g, '');
  const candidate = cleaned.startsWith('+') ? cleaned
    : cleaned.startsWith('250') ? `+${cleaned}`
      : cleaned.startsWith('0') ? `+250${cleaned.slice(1)}`
        : `+250${cleaned}`;
  return /^\+250(7[2389]\d{7})$/.test(candidate) ? candidate : null;
}

/** Whether two texts are the same Rwandan mobile number, however each was written. Text that is not a number is never the same. */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const first = canonical(a);
  return first !== null && first === canonical(b);
}
