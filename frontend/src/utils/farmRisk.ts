import { FarmRisk } from '../types';
import type { PluralText } from '../i18n/plural';

/** The translation key for each level's name. */
export const LEVEL_KEY = { HIGH: 'fkHigh', MEDIUM: 'fkMedium', OK: 'fkOk' } as const;

/** Why a farm is where it is in the ranking, in words, with the right plural. Empty for a farm with nothing wrong. */
export function riskReasons(r: FarmRisk, tn: PluralText): string[] {
  return [
    r.diseaseAlerts > 0 && tn(r.diseaseAlerts, 'fkDiseaseOne', 'fkDisease'),
    r.openAirAlerts > 0 && tn(r.openAirAlerts, 'fkAirOne', 'fkAir'),
    r.offlineDevices > 0 && tn(r.offlineDevices, 'fkDevicesOne', 'fkDevices'),
  ].filter(Boolean) as string[];
}
