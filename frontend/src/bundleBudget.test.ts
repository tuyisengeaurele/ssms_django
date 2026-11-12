import { describe, expect, it } from 'vitest';
import { evaluate } from '../scripts/bundle-math.mjs';

// The landing page is the first thing a farmer on a slow phone opens. The budget script adds up the JavaScript it loads and
// fails the build when that grows past the limit, so a heavy library cannot slip in unseen.

describe('the landing page JavaScript budget', () => {
  it('adds the chunks and passes when the total fits', () => {
    expect(evaluate([107, 59, 41], 250)).toEqual({ total: 207, ok: true });
  });

  it('fails when the total is over the budget', () => {
    expect(evaluate([200, 60], 250)).toEqual({ total: 260, ok: false });
  });

  it('treats a total equal to the budget as fitting', () => {
    expect(evaluate([100, 150], 250).ok).toBe(true);
  });

  it('passes an empty list', () => {
    expect(evaluate([], 250)).toEqual({ total: 0, ok: true });
  });
});
