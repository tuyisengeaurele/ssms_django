import { colorFor } from './chartColors';

export const STAGE_LABELS: Record<string, string> = {
  EGG: 'Egg',
  LARVA: 'Larva',
  PUPA: 'Pupa',
  COCOON: 'Cocoon',
  HARVEST: 'Harvest',
};

export const STAGE_ORDER = ['EGG', 'LARVA', 'PUPA', 'COCOON', 'HARVEST'] as const;

/** One colour per life stage, shared by badges, charts and timelines. */
export const STAGE_COLORS: Record<string, string> = Object.fromEntries(
  STAGE_ORDER.map((stage) => [stage, colorFor('stage', stage)]),
);

export const ALERT_TYPE_LABELS: Record<string, string> = {
  TEMPERATURE: 'Temperature',
  HUMIDITY: 'Humidity',
  DISEASE: 'Disease',
  STAGE_CHANGE: 'Stage Change',
  SYSTEM: 'System',
};
