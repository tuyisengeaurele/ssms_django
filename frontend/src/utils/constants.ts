import { colorFor } from './chartColors';

export const STAGE_ORDER = ['EGG', 'LARVA', 'PUPA', 'COCOON', 'HARVEST'] as const;

/** The stage name in the language of the screen. A stage the app does not know is shown as it came. */
export function stageLabel(t: (key: string) => string, stage: string): string {
  return (STAGE_ORDER as readonly string[]).includes(stage) ? t(`stage${stage}`) : stage;
}

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
