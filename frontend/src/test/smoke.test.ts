import { describe, expect, it } from 'vitest';

describe('test setup', () => {
  it('runs in a browser like environment', () => {
    expect(document.body).toBeTruthy();
    expect(window.matchMedia('(min-width: 1px)').matches).toBe(false);
  });
});
