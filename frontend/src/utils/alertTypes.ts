import type { AlertType } from '../types';

/** Translation key for the name of each alert type. */
export const ALERT_TYPE_KEY: Record<AlertType, string> = {
  TEMPERATURE: 'alTypeTemperature',
  HUMIDITY: 'alTypeHumidity',
  DISEASE: 'alTypeDisease',
  STAGE_CHANGE: 'alTypeStage',
  SYSTEM: 'alTypeSystem',
};

/** Which coloured dot an alert type gets. The colours live in shell.css. */
export const ALERT_DOT: Record<AlertType, string> = {
  TEMPERATURE: 'temperature',
  HUMIDITY: 'humidity',
  DISEASE: 'disease',
  STAGE_CHANGE: 'stage',
  SYSTEM: 'system',
};
