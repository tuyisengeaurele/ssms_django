import { describe, expect, it } from 'vitest';
import { fill } from './fill';

describe('fill', () => {
  it('puts values into the braces', () => {
    expect(fill('{name} ({email})', { name: 'Auris', email: 'a@b.rw' })).toBe('Auris (a@b.rw)');
  });

  it('uses a value more than once', () => {
    expect(fill('{n} and {n}', { n: 2 })).toBe('2 and 2');
  });

  it('leaves an unknown brace alone so the gap is easy to spot', () => {
    expect(fill('Hello {who}', {})).toBe('Hello {who}');
  });

  it('does nothing to text without braces', () => {
    expect(fill('Plain', { x: 1 })).toBe('Plain');
  });
});
