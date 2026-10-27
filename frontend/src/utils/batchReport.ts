import type { SeriesPoint } from '../services/sensor.service';

export interface SafeRange {
  tempMin: number;
  tempMax: number;
  humMin: number;
  humMax: number;
}

export interface Conditions {
  tempMin: number;
  tempAvg: number;
  tempMax: number;
  humMin: number;
  humAvg: number;
  humMax: number;
  /** How many hourly points the figures rest on. */
  hours: number;
  /** The share of those hours with both temperature and humidity inside the range, 0 to 100. */
  inRangePct: number;
}

const oneDecimal = (n: number) => Math.round(n * 10) / 10;

/** The lowest, average and highest of an hourly series, for the printed report. Null when there is nothing to sum up. */
export function summariseConditions(points: SeriesPoint[], range: SafeRange): Conditions | null {
  if (points.length === 0) return null;

  // An hour that holds more readings counts for more, and a bucket that reports none still counts once.
  const weight = (p: SeriesPoint) => Math.max(p.count, 1);
  const total = points.reduce((sum, p) => sum + weight(p), 0);
  const average = (pick: (p: SeriesPoint) => number) => points.reduce((sum, p) => sum + pick(p) * weight(p), 0) / total;

  const temps = points.map((p) => p.temperature);
  const hums = points.map((p) => p.humidity);
  const inside = points.filter((p) =>
    p.temperature >= range.tempMin && p.temperature <= range.tempMax && p.humidity >= range.humMin && p.humidity <= range.humMax,
  ).length;

  return {
    tempMin: Math.min(...temps),
    tempAvg: oneDecimal(average((p) => p.temperature)),
    tempMax: Math.max(...temps),
    humMin: Math.min(...hums),
    humAvg: oneDecimal(average((p) => p.humidity)),
    humMax: Math.max(...hums),
    hours: points.length,
    inRangePct: Math.round((inside / points.length) * 100),
  };
}
