export type HarvestHint = { kind: 'left' | 'tomorrow' | 'today' | 'late'; days: number };

const MS_DAY = 86_400_000;

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * How long is left until a batch's expected harvest, in whole days on the person's own calendar. It goes by the day and
 * not by the hour, so a harvest due this evening is "today" all day. A batch already at the harvest stage has nothing
 * left to count, and a date that cannot be read says nothing.
 */
export function harvestHint(expectedHarvestDate: string, stage: string, now: number = Date.now()): HarvestHint | null {
  if (stage === 'HARVEST') return null;
  const expected = new Date(expectedHarvestDate).getTime();
  if (!expectedHarvestDate || Number.isNaN(expected)) return null;
  const days = Math.round((startOfDay(expected) - startOfDay(now)) / MS_DAY);
  if (days < 0) return { kind: 'late', days: -days };
  if (days === 0) return { kind: 'today', days: 0 };
  if (days === 1) return { kind: 'tomorrow', days: 1 };
  return { kind: 'left', days };
}
