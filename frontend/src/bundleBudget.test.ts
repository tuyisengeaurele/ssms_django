import { describe, expect, it } from 'vitest';
import { evaluate, overLimit } from '../scripts/bundle-math.mjs';

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

// French and Kinyarwanda are separate downloads, so a text added to either one makes the next person who switches wait longer.
// Each file has its own limit, so growth shows up here and not on a farmer's phone.

describe('the limit for each language file', () => {
  const files: Array<[string, number]> = [
    ['translations-aaa.js', 29.1],
    ['translations-bbb.js', 30.6],
  ];

  it('passes when every file is under the limit', () => {
    expect(overLimit(files, 35)).toEqual([]);
  });

  it('names each file that is over, with its size', () => {
    expect(overLimit([...files, ['translations-ccc.js', 36.4]], 35)).toEqual([['translations-ccc.js', 36.4]]);
  });

  it('treats a file exactly at the limit as fitting', () => {
    expect(overLimit([['translations-aaa.js', 35]], 35)).toEqual([]);
  });

  it('judges each file on its own, not the total', () => {
    expect(overLimit([['a.js', 34], ['b.js', 34]], 35)).toEqual([]);
  });
});
