import { describe, expect, it } from 'vitest';
import { formatRwandaMobile } from './phone';

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
