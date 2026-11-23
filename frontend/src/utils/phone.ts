import { ERROR_CODE_KEY } from './errorCodes';

/** A number as the server keeps it (+250 and nine digits) written the way a person writes it: 0788 123 456. Anything else is returned as it is. */
export function formatRwandaMobile(stored: string | null | undefined): string {
  if (!stored) return '';
  const match = /^\+250(\d{3})(\d{3})(\d{3})$/.exec(stored);
  return match ? `0${match[1]} ${match[2]} ${match[3]}` : stored;
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
