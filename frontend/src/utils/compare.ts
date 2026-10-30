import type { BatchComparison } from '../types';

/**
 * The positions of the batches that did best on one measure. Batches with no value are left out. Nothing is marked when
 * fewer than two batches have a value, or when they all have the same one, since then none did better.
 */
export function bestIndexes(values: Array<number | null>, better: 'high' | 'low'): number[] {
  const known = values.filter((v): v is number => v !== null);
  if (known.length < 2) return [];
  const best = better === 'high' ? Math.max(...known) : Math.min(...known);
  if (known.every((v) => v === best)) return [];
  return values.flatMap((v, i) => (v === best ? [i] : []));
}

export type CurveRow = { day: number } & Record<string, number | null>;

/**
 * The harvest of every batch on one set of days, ready for a chart: one row for each day any batch was harvested on,
 * with the total each batch had harvested by then, keyed by batch id. A batch has no value before its first harvest.
 */
export function curveRows(batches: Array<Pick<BatchComparison, 'id' | 'harvest'>>): CurveRow[] {
  const days = [...new Set(batches.flatMap((b) => b.harvest.curve.map((p) => p.day)))].sort((a, b) => a - b);
  return days.map((day) => {
    const row: CurveRow = { day };
    for (const batch of batches) {
      const upToNow = batch.harvest.curve.filter((p) => p.day <= day);
      row[batch.id] = upToNow.length ? upToNow[upToNow.length - 1].kg : null;
    }
    return row;
  });
}
