export const STAGE_LABELS: Record<string, string> = {
  EGG: 'Egg',
  LARVA: 'Larva',
  PUPA: 'Pupa',
  COCOON: 'Cocoon',
  HARVEST: 'Harvest',
};

export const STAGE_ORDER = ['EGG', 'LARVA', 'PUPA', 'COCOON', 'HARVEST'] as const;

/** One colour per life stage, shared by badges, charts and timelines. */
export const STAGE_COLORS: Record<string, string> = {
  EGG: '#C8923A',
  LARVA: '#2D6A4F',
  PUPA: '#3A7CA5',
  COCOON: '#8F7F66',
  HARVEST: '#0B1F17',
};

export const ALERT_TYPE_LABELS: Record<string, string> = {
  TEMPERATURE: 'Temperature',
  HUMIDITY: 'Humidity',
  DISEASE: 'Disease',
  STAGE_CHANGE: 'Stage Change',
  SYSTEM: 'System',
};
