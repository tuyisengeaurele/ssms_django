import { FarmRisk } from '../types';
import { fill } from './fill';

/** The translation key for each level's name. */
export const LEVEL_KEY = { HIGH: 'fkHigh', MEDIUM: 'fkMedium', OK: 'fkOk' } as const;

/** Why a farm is where it is in the ranking, in words, with the right plural. Empty for a farm with nothing wrong. */
export function riskReasons(r: FarmRisk, t: (key: string) => string): string[] {
  return [
    r.diseaseAlerts > 0 && fill(t(r.diseaseAlerts === 1 ? 'fkDiseaseOne' : 'fkDisease'), { n: r.diseaseAlerts }),
    r.openAirAlerts > 0 && fill(t(r.openAirAlerts === 1 ? 'fkAirOne' : 'fkAir'), { n: r.openAirAlerts }),
    r.offlineDevices > 0 && fill(t(r.offlineDevices === 1 ? 'fkDevicesOne' : 'fkDevices'), { n: r.offlineDevices }),
  ].filter(Boolean) as string[];
}
