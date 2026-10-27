import type { ActiveBatch, StageRange } from '../services/sensor.service';

export type AttentionKind =
  | 'tempLow' | 'tempHigh' | 'humLow' | 'humHigh'
  | 'silent'
  | 'harvestLate' | 'harvestToday' | 'harvestTomorrow' | 'harvestSoon';

export interface AttentionItem {
  batchId: string;
  farmName: string;
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

/** What a farmer should look at today, most urgent first. Batches already at harvest are left out. */
export function attentionFor(batches: ActiveBatch[], ranges: StageRange[], now: number = Date.now()): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const batch of batches) {
    if (batch.stage === 'HARVEST') continue;
    const base = { batchId: batch.id, farmName: batch.farm?.name ?? '' };
    const range = ranges.find((r) => r.stage === batch.stage) ?? USUAL;

    const reading = batch.latestReading;
    if (reading) {
      const hours = Math.floor((now - new Date(reading.timestamp).getTime()) / 3600_000);
      if (hours >= SILENT_AFTER_HOURS) {
        items.push({ ...base, kind: 'silent', hours });
      } else {
        const temp = { value: reading.temperature, min: range.tempMin, max: range.tempMax };
        if (reading.temperature < range.tempMin) items.push({ ...base, kind: 'tempLow', ...temp });
        else if (reading.temperature > range.tempMax) items.push({ ...base, kind: 'tempHigh', ...temp });
        const hum = { value: reading.humidity, min: range.humMin, max: range.humMax };
        if (reading.humidity < range.humMin) items.push({ ...base, kind: 'humLow', ...hum });
        else if (reading.humidity > range.humMax) items.push({ ...base, kind: 'humHigh', ...hum });
      }
    }

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
