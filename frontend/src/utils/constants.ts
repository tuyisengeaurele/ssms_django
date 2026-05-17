export const STAGE_LABELS: Record<string, string> = {
  EGG: 'Egg',
  LARVA: 'Larva',
  PUPA: 'Pupa',
  COCOON: 'Cocoon',
  HARVEST: 'Harvest',
};

export const STAGE_ORDER = ['EGG', 'LARVA', 'PUPA', 'COCOON', 'HARVEST'] as const;

export const STAGE_COLORS: Record<string, string> = {
  EGG: '#f59e0b',
  LARVA: '#10b981',
  PUPA: '#3b82f6',
  COCOON: '#8b5cf6',
  HARVEST: '#ef4444',
};

export const ALERT_TYPE_LABELS: Record<string, string> = {
  TEMPERATURE: 'Temperature',
  HUMIDITY: 'Humidity',
  DISEASE: 'Disease',
  STAGE_CHANGE: 'Stage Change',
  SYSTEM: 'System',
};
