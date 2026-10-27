import type { ActiveBatch, StageRange } from '../services/sensor.service';

export type AttentionKind =
  | 'tempLow' | 'tempHigh' | 'humLow' | 'humHigh'
  | 'silent'
  | 'harvestLate' | 'harvestToday' | 'harvestTomorrow' | 'harvestSoon';

export interface AttentionItem {
  /** For a room problem, one of the batches in the room, so the line has somewhere to go. */
  batchId: string;
  farmName: string;
  /** Set when the line is about a whole room and not one batch. */
  roomId?: string;
  roomName?: string;
  kind: AttentionKind;
  value?: number;
  min?: number;
  max?: number;
  days?: number;
  hours?: number;
}

/** After this long without a reading, the old values say nothing about the room now. */
const SILENT_AFTER_HOURS = 6;
/** Harvest is mentioned from this many days before the expected date. */
const HARVEST_WINDOW_DAYS = 3;

// What a stage uses when it has no row of its own, the same range the server falls back to.
const USUAL = { tempMin: 22, tempMax: 28, humMin: 70, humMax: 85 };

const ORDER: Record<AttentionKind, number> = {
  tempLow: 0, tempHigh: 0, humLow: 0, humHigh: 0,
  silent: 1, harvestLate: 2, harvestToday: 3, harvestTomorrow: 4, harvestSoon: 5,
};

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

// The stages in the order a batch lives them, so "youngest" can be told apart.
const STAGE_ORDER = ['EGG', 'LARVA', 'PUPA', 'COCOON', 'HARVEST'];

type Range = typeof USUAL;

/** The range every batch in the room can live with, or the youngest batch's own range when there is none. */
function rangeForRoom(batches: ActiveBatch[], ranges: StageRange[]): Range {
  const own = batches.map((b) => ranges.find((r) => r.stage === b.stage) ?? USUAL);
  const shared = {
    tempMin: Math.max(...own.map((r) => r.tempMin)), tempMax: Math.min(...own.map((r) => r.tempMax)),
    humMin: Math.max(...own.map((r) => r.humMin)), humMax: Math.min(...own.map((r) => r.humMax)),
  };
  if (shared.tempMin <= shared.tempMax && shared.humMin <= shared.humMax) return shared;
  const youngest = batches.reduce((a, b) => (STAGE_ORDER.indexOf(b.stage) < STAGE_ORDER.indexOf(a.stage) ? b : a));
  return ranges.find((r) => r.stage === youngest.stage) ?? USUAL;
}

/** Batches that share a room, in the order they first appear. A batch with no room stands alone. */
function groupByRoom(batches: ActiveBatch[]): ActiveBatch[][] {
  const groups = new Map<string, ActiveBatch[]>();
  for (const batch of batches) {
    const key = batch.room ? `room:${batch.room.id}` : `batch:${batch.id}`;
    groups.set(key, [...(groups.get(key) ?? []), batch]);
  }
  return [...groups.values()];
}

/** What a farmer should look at today, most urgent first. Batches already at harvest are left out. */
export function attentionFor(batches: ActiveBatch[], ranges: StageRange[], now: number = Date.now()): AttentionItem[] {
  const items: AttentionItem[] = [];
  const running = batches.filter((b) => b.stage !== 'HARVEST');

  // Batches in one room share one environment, so the room is judged once and not once per batch.
  for (const group of groupByRoom(running)) {
    const first = group[0];
    const room = first.room;
    const base = {
      batchId: first.id,
      farmName: first.farm?.name ?? '',
      ...(room ? { roomId: room.id, roomName: room.name } : {}),
    };
    const range = rangeForRoom(group, ranges);

    // Every batch in a room carries the room's newest reading. Take the newest in case they differ.
    const reading = group
      .map((b) => b.latestReading)
      .filter((r): r is NonNullable<typeof r> => !!r)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    if (!reading) continue;

    const hours = Math.floor((now - new Date(reading.timestamp).getTime()) / 3600_000);
    if (hours >= SILENT_AFTER_HOURS) {
      items.push({ ...base, kind: 'silent', hours });
      continue;
    }
    const temp = { value: reading.temperature, min: range.tempMin, max: range.tempMax };
    if (reading.temperature < range.tempMin) items.push({ ...base, kind: 'tempLow', ...temp });
    else if (reading.temperature > range.tempMax) items.push({ ...base, kind: 'tempHigh', ...temp });
    const hum = { value: reading.humidity, min: range.humMin, max: range.humMax };
    if (reading.humidity < range.humMin) items.push({ ...base, kind: 'humLow', ...hum });
    else if (reading.humidity > range.humMax) items.push({ ...base, kind: 'humHigh', ...hum });
  }

  // Harvest dates belong to a batch, so these stay one line per batch.
  for (const batch of running) {
    const base = { batchId: batch.id, farmName: batch.farm?.name ?? '' };
    const left = Math.round((startOfDay(new Date(batch.expectedHarvestDate).getTime()) - startOfDay(now)) / 86400_000);
    if (left < 0) items.push({ ...base, kind: 'harvestLate', days: -left });
    else if (left === 0) items.push({ ...base, kind: 'harvestToday' });
    else if (left === 1) items.push({ ...base, kind: 'harvestTomorrow' });
    else if (left <= HARVEST_WINDOW_DAYS) items.push({ ...base, kind: 'harvestSoon', days: left });
  }

  // A stable sort keeps batches in their own order inside each group.
  return items.map((item, index) => ({ item, index }))
    .sort((a, b) => ORDER[a.item.kind] - ORDER[b.item.kind] || a.index - b.index)
    .map(({ item }) => item);
}
