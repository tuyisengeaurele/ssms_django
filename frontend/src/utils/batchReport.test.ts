import { describe, expect, it } from 'vitest';
import { summariseConditions } from './batchReport';

const range = { tempMin: 22, tempMax: 28, humMin: 70, humMax: 85 };
const point = (temperature: number, humidity: number, count = 1) => ({ timestamp: '2026-10-01T09:00:00Z', temperature, humidity, count });

describe('summariseConditions', () => {
  it('has nothing to say without readings', () => {
    expect(summariseConditions([], range)).toBeNull();
  });

  it('gives the lowest, average and highest of each', () => {
    const s = summariseConditions([point(20, 60), point(24, 80), point(28, 100)], range)!;
    expect([s.tempMin, s.tempAvg, s.tempMax]).toEqual([20, 24, 28]);
    expect([s.humMin, s.humAvg, s.humMax]).toEqual([60, 80, 100]);
  });

  it('weighs each hour by how many readings it holds', () => {
    const s = summariseConditions([point(20, 70, 1), point(30, 80, 3)], range)!;
    expect(s.tempAvg).toBe(27.5);
    expect(s.humAvg).toBe(77.5);
  });

  it('rounds to one decimal place', () => {
    const s = summariseConditions([point(24, 80), point(25, 80), point(25, 80)], range)!;
    expect(s.tempAvg).toBe(24.7);
  });

  it('counts the share of hours with both inside the range', () => {
    const s = summariseConditions([point(24, 80), point(30, 80), point(24, 60), point(24, 75)], range)!;
    expect(s.hours).toBe(4);
    expect(s.inRangePct).toBe(50);
  });

  it('counts the edges of the range as inside', () => {
    expect(summariseConditions([point(22, 70), point(28, 85)], range)!.inRangePct).toBe(100);
  });

  it('treats a bucket with no count as one reading', () => {
    expect(summariseConditions([point(24, 80, 0)], range)!.tempAvg).toBe(24);
  });
});
