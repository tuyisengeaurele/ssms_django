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

  // ── rooms: batches in one room share one environment, so the room is judged once ──

  const inRoom = (id: string, name = 'Rearing house 1') => ({ id, name });

  it('judges a room once, however many batches are in it', () => {
    const cold = { temperature: 19, humidity: 78, timestamp: hoursAgo(1) };
    const items = attentionFor(
      [
        batch({ id: 'a', room: inRoom('r1'), latestReading: cold }),
        batch({ id: 'b', room: inRoom('r1'), latestReading: cold }),
        batch({ id: 'c', room: inRoom('r1'), latestReading: cold }),
      ],
      ranges,
      NOW,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'tempLow', roomId: 'r1', roomName: 'Rearing house 1', farmName: 'Habimana Silk Farm' });
  });

  it('judges two rooms of one farm on their own', () => {
    const items = attentionFor(
      [
        batch({ id: 'a', room: inRoom('r1', 'House 1'), latestReading: { temperature: 19, humidity: 78, timestamp: hoursAgo(1) } }),
        batch({ id: 'b', room: inRoom('r2', 'House 2'), latestReading: { temperature: 25, humidity: 78, timestamp: hoursAgo(1) } }),
      ],
      ranges,
      NOW,
    );
    expect(items.map((i) => [i.roomName, i.kind])).toEqual([['House 1', 'tempLow']]);
  });

  it('uses the range every batch in the room can live with', () => {
    // PUPA allows 22 to 28 and LARVA 24 to 27, so 23 is fine for one and too cold for the other.
    const reading = { temperature: 23, humidity: 78, timestamp: hoursAgo(1) };
    const items = attentionFor(
      [batch({ id: 'a', stage: 'PUPA', room: inRoom('r1'), latestReading: reading }), batch({ id: 'b', stage: 'LARVA', room: inRoom('r1'), latestReading: reading })],
      ranges,
      NOW,
    );
    expect(items).toEqual([expect.objectContaining({ kind: 'tempLow', value: 23, min: 24, max: 27 })]);
  });

  it('falls back to the youngest stage when the batches in a room share no safe range', () => {
    const wide = [
      { stage: 'EGG', tempMin: 22, tempMax: 24, humMin: 70, humMax: 85 },
      { stage: 'PUPA', tempMin: 26, tempMax: 28, humMin: 70, humMax: 85 },
    ];
    const reading = { temperature: 25, humidity: 78, timestamp: hoursAgo(1) };
    const items = attentionFor(
      [batch({ id: 'a', stage: 'PUPA', room: inRoom('r1'), latestReading: reading }), batch({ id: 'b', stage: 'EGG', room: inRoom('r1'), latestReading: reading })],
      wide,
      NOW,
    );
    expect(items).toEqual([expect.objectContaining({ kind: 'tempHigh', min: 22, max: 24 })]);
  });

  it('does not let a batch at harvest change the range of its room', () => {
    const reading = { temperature: 23, humidity: 78, timestamp: hoursAgo(1) };
    const items = attentionFor(
      [batch({ id: 'a', stage: 'PUPA', room: inRoom('r1'), latestReading: reading }), batch({ id: 'b', stage: 'HARVEST', room: inRoom('r1'), latestReading: reading })],
      ranges,
      NOW,
    );
    expect(items).toEqual([]);
  });

  it('says a room has gone quiet once', () => {
    const old = { temperature: 25, humidity: 78, timestamp: hoursAgo(9) };
    const items = attentionFor([batch({ id: 'a', room: inRoom('r1'), latestReading: old }), batch({ id: 'b', room: inRoom('r1'), latestReading: old })], ranges, NOW);
    expect(items).toEqual([expect.objectContaining({ kind: 'silent', hours: 9, roomId: 'r1' })]);
  });

  it('keeps harvest lines per batch, because each batch has its own date', () => {
    const items = attentionFor(
      [batch({ id: 'a', room: inRoom('r1'), expectedHarvestDate: inDays(1) }), batch({ id: 'b', room: inRoom('r1'), expectedHarvestDate: inDays(-1) })],
      ranges,
      NOW,
    );
    expect(items.map((i) => [i.batchId, i.kind])).toEqual([['b', 'harvestLate'], ['a', 'harvestTomorrow']]);
  });

  it('links a room problem to a batch that is in the room', () => {
    const cold = { temperature: 19, humidity: 78, timestamp: hoursAgo(1) };
    const items = attentionFor([batch({ id: 'a', room: inRoom('r1'), latestReading: cold }), batch({ id: 'b', room: inRoom('r1'), latestReading: cold })], ranges, NOW);
    expect(['a', 'b']).toContain(items[0].batchId);
  });

  it('still judges a batch without a room on its own', () => {
    const cold = { temperature: 19, humidity: 78, timestamp: hoursAgo(1) };
    const items = attentionFor([batch({ id: 'a', room: null, latestReading: cold }), batch({ id: 'b', room: null, latestReading: cold })], ranges, NOW);
    expect(items.map((i) => i.batchId)).toEqual(['a', 'b']);
    expect(items[0].roomName).toBeUndefined();
  });
});
