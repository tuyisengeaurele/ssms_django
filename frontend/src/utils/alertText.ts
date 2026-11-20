import type { AlertLog } from '../types';
import { stageLabel } from './constants';
import { fill } from './fill';

/** The text of each alert code. The server has the same words (alerts/alert_text.py) and a test compares them. */
export const ALERT_CODE_KEY: Record<string, string> = {
  temperature_low: 'alcTemperatureLow',
  temperature_high: 'alcTemperatureHigh',
  humidity_low: 'alcHumidityLow',
  humidity_high: 'alcHumidityHigh',
  disease_suspected: 'alcDiseaseSuspected',
  stage_changed: 'alcStageChanged',
  device_offline: 'alcDeviceOffline',
};

/**
 * What an alert says, in the language of the screen. An alert with a code is written from its values. One with no code (an
 * older alert) or a code this page does not know is shown by the message the server stored.
 */
export function alertText(t: (key: string) => string, alert: Pick<AlertLog, 'message'> & Partial<Pick<AlertLog, 'code' | 'params'>>): string {
  const key = alert.code ? ALERT_CODE_KEY[alert.code] : undefined;
  if (!key) return alert.message;
  const values: Record<string, string | number> = { ...(alert.params ?? {}) };
  if (typeof values.stage === 'string') values.stage = stageLabel(t, values.stage);
  return fill(t(key), values);
}
