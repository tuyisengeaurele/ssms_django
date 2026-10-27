import { describe, expect, it } from 'vitest';
import type { ActiveBatch, StageRange } from '../services/sensor.service';
import { attentionFor } from './attention';

const NOW = new Date('2026-10-27T10:00:00').getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();
const inDays = (d: number) => new Date(NOW + d * 86400_000).toISOString();

const ranges: StageRange[] = [
  { stage: 'EGG', tempMin: 22, tempMax: 28, humMin: 70, humMax: 85 },
  { stage: 'LARVA', tempMin: 24, tempMax: 27, humMin: 75, humMax: 85 },
  { stage: 'PUPA', tempMin: 22, tempMax: 28, humMin: 70, humMax: 85 },
];

function batch(over: Partial<ActiveBatch> = {}): ActiveBatch {
  return {
    id: 'b1', farmId: 'f1', stage: 'PUPA', startDate: hoursAgo(24 * 10), expectedHarvestDate: inDays(15), isActive: true,
    createdAt: hoursAgo(24 * 10), farm: { id: 'f1', name: 'Habimana Silk Farm', location: 'Gatsibo' }, detectionCount: 0,
    openAlerts: 0, latestReading: { temperature: 25, humidity: 78, timestamp: hoursAgo(1) }, ...over,
  };
}

describe('attentionFor', () => {
  it('has nothing to say about a batch in range with a recent reading and a far harvest', () => {
    expect(attentionFor([batch()], ranges, NOW)).toEqual([]);
  });

  it('flags a temperature below and above the range of the batch stage', () => {
    const cold = attentionFor([batch({ latestReading: { temperature: 20.5, humidity: 78, timestamp: hoursAgo(1) } })], ranges, NOW);
    expect(cold).toEqual([{ batchId: 'b1', farmName: 'Habimana Silk Farm', kind: 'tempLow', value: 20.5, min: 22, max: 28 }]);
    const hot = attentionFor([batch({ latestReading: { temperature: 29, humidity: 78, timestamp: hoursAgo(1) } })], ranges, NOW);
    expect(hot[0].kind).toBe('tempHigh');
  });

  it('flags humidity below and above the range', () => {
    expect(attentionFor([batch({ latestReading: { temperature: 25, humidity: 60, timestamp: hoursAgo(1) } })], ranges, NOW)[0]).toMatchObject({ kind: 'humLow', value: 60, min: 70, max: 85 });
    expect(attentionFor([batch({ latestReading: { temperature: 25, humidity: 90, timestamp: hoursAgo(1) } })], ranges, NOW)[0].kind).toBe('humHigh');
  });

  it('judges a batch by the range of its own stage', () => {
    const reading = { temperature: 23, humidity: 78, timestamp: hoursAgo(1) };
    expect(attentionFor([batch({ stage: 'PUPA', latestReading: reading })], ranges, NOW)).toEqual([]);
    expect(attentionFor([batch({ stage: 'LARVA', latestReading: reading })], ranges, NOW)[0].kind).toBe('tempLow');
  });

  it('falls back to the usual range when a stage has no row', () => {
    const reading = { temperature: 20, humidity: 78, timestamp: hoursAgo(1) };
    expect(attentionFor([batch({ stage: 'COCOON', latestReading: reading })], [], NOW)[0]).toMatchObject({ kind: 'tempLow', min: 22, max: 28 });
  });

  it('reports both a temperature and a humidity problem on the same batch', () => {
    const items = attentionFor([batch({ latestReading: { temperature: 20, humidity: 90, timestamp: hoursAgo(1) } })], ranges, NOW);
    expect(items.map((i) => i.kind)).toEqual(['tempLow', 'humHigh']);
  });

  it('says a batch has gone quiet after six hours, and stops judging the old values', () => {
    const items = attentionFor([batch({ latestReading: { temperature: 10, humidity: 10, timestamp: hoursAgo(8) } })], ranges, NOW);
    expect(items).toEqual([{ batchId: 'b1', farmName: 'Habimana Silk Farm', kind: 'silent', hours: 8 }]);
  });

  it('says nothing about a batch that never had a sensor', () => {
    expect(attentionFor([batch({ latestReading: null })], ranges, NOW)).toEqual([]);
    expect(attentionFor([batch({ latestReading: undefined })], ranges, NOW)).toEqual([]);
  });

  it('tells when harvest is late, today, tomorrow or within three days', () => {
    const kind = (days: number) => attentionFor([batch({ expectedHarvestDate: inDays(days) })], ranges, NOW)[0]?.kind;
    expect(kind(-2)).toBe('harvestLate');
    expect(kind(0)).toBe('harvestToday');
    expect(kind(1)).toBe('harvestTomorrow');
    expect(kind(3)).toBe('harvestSoon');
    expect(kind(4)).toBeUndefined();
  });

  it('counts the days to harvest in whole calendar days', () => {
    const items = attentionFor([batch({ expectedHarvestDate: inDays(-2) })], ranges, NOW);
    expect(items[0]).toMatchObject({ kind: 'harvestLate', days: 2 });
    expect(attentionFor([batch({ expectedHarvestDate: inDays(3) })], ranges, NOW)[0]).toMatchObject({ kind: 'harvestSoon', days: 3 });
  });

  it('leaves batches that are already at harvest alone', () => {
    const done = batch({ stage: 'HARVEST', expectedHarvestDate: inDays(-5), latestReading: { temperature: 10, humidity: 10, timestamp: hoursAgo(30) } });
    expect(attentionFor([done], ranges, NOW)).toEqual([]);
  });

  it('puts problems with the room first, then silence, then harvest, across batches', () => {
    const items = attentionFor(
      [
        batch({ id: 'harvest', expectedHarvestDate: inDays(1) }),
        batch({ id: 'quiet', latestReading: { temperature: 25, humidity: 78, timestamp: hoursAgo(9) } }),
        batch({ id: 'cold', latestReading: { temperature: 19, humidity: 78, timestamp: hoursAgo(1) } }),
        batch({ id: 'late', expectedHarvestDate: inDays(-1) }),
      ],
      ranges,
      NOW,
    );
    expect(items.map((i) => i.batchId)).toEqual(['cold', 'quiet', 'late', 'harvest']);
  });
});
