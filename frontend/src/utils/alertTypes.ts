import type { AlertType } from '../types';

/** Translation key for the name of each alert type. */
export const ALERT_TYPE_KEY: Record<AlertType, string> = {
  TEMPERATURE: 'alTypeTemperature',
  HUMIDITY: 'alTypeHumidity',
  DISEASE: 'alTypeDisease',
  STAGE_CHANGE: 'alTypeStage',
  SYSTEM: 'alTypeSystem',
};
