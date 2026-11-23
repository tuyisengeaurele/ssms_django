import { describe, expect, it } from 'vitest';
import { formatRwandaMobile, phoneFieldError } from './phone';

describe('formatRwandaMobile', () => {
  it('writes a stored number the way a person writes it', () => {
    expect(formatRwandaMobile('+250788123456')).toBe('0788 123 456');
    expect(formatRwandaMobile('+250722000111')).toBe('0722 000 111');
  });

  it('gives an empty text for no number', () => {
    expect(formatRwandaMobile(null)).toBe('');
    expect(formatRwandaMobile(undefined)).toBe('');
    expect(formatRwandaMobile('')).toBe('');
  });

  it('leaves anything that is not a stored Rwandan number as it is', () => {
    expect(formatRwandaMobile('0788 123 456')).toBe('0788 123 456');
    expect(formatRwandaMobile('+33612345678')).toBe('+33612345678');
  });
});

describe('phoneFieldError', () => {
  const say = (key: string) => `[${key}]`;
  const refusal = (data: object) => ({ response: { data } });

  it('writes a code of ours from the page catalogue, not from the answer', () => {
    expect(phoneFieldError(refusal({ code: 'phone_taken', errors: { phone: ['Taken, in the server language'] } }), say)).toBe('[erPhoneTaken]');
    expect(phoneFieldError(refusal({ code: 'phone_required', errors: { phone: ['x'] } }), say)).toBe('[erPhoneRequired]');
    expect(phoneFieldError(refusal({ code: 'invalid_phone', errors: { phone: ['x'] } }), say)).toBe('[erBadPhone]');
  });

  it('uses the sentence of the answer when another field came first and set the code', () => {
    expect(phoneFieldError(refusal({ code: 'email_taken', errors: { email: ['e'], phone: ['Enter a Rwandan mobile number.'] } }), say)).toBe('Enter a Rwandan mobile number.');
  });

  it('says nothing when the refusal was not about the number', () => {
    expect(phoneFieldError(refusal({ code: 'email_taken', errors: { email: ['e'] } }), say)).toBeNull();
    expect(phoneFieldError(refusal({ message: 'x' }), say)).toBeNull();
    expect(phoneFieldError(new Error('network'), say)).toBeNull();
    expect(phoneFieldError(undefined, say)).toBeNull();
  });
});
