import { describe, expect, it } from 'vitest';
import type { BatchComparison } from '../types';
import { bestIndexes, curveRows } from './compare';

describe('bestIndexes', () => {
  it('picks the highest when more is better', () => {
    expect(bestIndexes([10, 14.5, 12], 'high')).toEqual([1]);
  });

  it('picks the lowest when less is better', () => {
    expect(bestIndexes([5, 2, 9], 'low')).toEqual([1]);
  });

  it('marks every batch that shares the best value', () => {
    expect(bestIndexes([8, 3, 8], 'high')).toEqual([0, 2]);
  });

  it('marks nothing when every batch has the same value, since none did better', () => {
    expect(bestIndexes([4, 4, 4], 'high')).toEqual([]);
    expect(bestIndexes([0, 0], 'low')).toEqual([]);
  });

  it('skips batches that have no value', () => {
    expect(bestIndexes([null, 7, 3], 'high')).toEqual([1]);
    expect(bestIndexes([null, 7, 3], 'low')).toEqual([2]);
  });

  it('marks nothing when fewer than two batches have a value, since there is nothing to compare', () => {
    expect(bestIndexes([null, 7, null], 'high')).toEqual([]);
    expect(bestIndexes([null, null], 'high')).toEqual([]);
    expect(bestIndexes([], 'high')).toEqual([]);
  });

  it('treats zero as a real value', () => {
    expect(bestIndexes([0, 3], 'low')).toEqual([0]);
    expect(bestIndexes([0, 3], 'high')).toEqual([1]);
  });
});

const batch = (id: string, curve: Array<{ day: number; kg: number }>) => ({ id, harvest: { curve } }) as Pick<BatchComparison, 'id' | 'harvest'>;

describe('curveRows', () => {
  it('has a row for each day any batch was harvested on, oldest first', () => {
    const rows = curveRows([batch('a', [{ day: 30, kg: 6 }]), batch('b', [{ day: 25, kg: 2 }, { day: 31, kg: 5 }])]);
    expect(rows.map((r) => r.day)).toEqual([25, 30, 31]);
  });

  it('keeps what a batch had harvested so far on days it was not harvested', () => {
    const rows = curveRows([batch('a', [{ day: 30, kg: 6 }, { day: 33, kg: 10 }]), batch('b', [{ day: 31, kg: 4 }])]);
    expect(rows).toEqual([
      { day: 30, a: 6, b: null },
      { day: 31, a: 6, b: 4 },
      { day: 33, a: 10, b: 4 },
    ]);
  });

  it('shows nothing for a batch before its first harvest', () => {
    const rows = curveRows([batch('a', [{ day: 40, kg: 1 }]), batch('b', [{ day: 20, kg: 3 }])]);
    expect(rows[1]).toEqual({ day: 40, a: 1, b: 3 });
    expect(rows[0]).toEqual({ day: 20, a: null, b: 3 });
  });

  it('uses the last total of a day when a batch was harvested twice that day', () => {
    const rows = curveRows([batch('a', [{ day: 30, kg: 6 }, { day: 30, kg: 9 }]), batch('b', [{ day: 30, kg: 1 }])]);
    expect(rows).toEqual([{ day: 30, a: 9, b: 1 }]);
  });

  it('is empty when nothing was harvested', () => {
    expect(curveRows([batch('a', []), batch('b', [])])).toEqual([]);
  });
});
