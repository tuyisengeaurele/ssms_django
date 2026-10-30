import { describe, expect, it } from 'vitest';
import { landingTranslations } from '../i18n/landing';
import { translations } from '../i18n/translations';
import { STAGE_ORDER, stageLabel } from './constants';

const say = (locale: 'en' | 'fr' | 'rw') => (key: string) => translations[key]?.[locale] ?? key;

describe('stageLabel', () => {
  it.each([
    ['en', ['Egg', 'Larva', 'Pupa', 'Cocoon', 'Harvest']],
    ['fr', ['Œuf', 'Larve', 'Pupe', 'Cocon', 'Récolte']],
    ['rw', ['Igi', 'Larva', 'Pupa', 'Igishishwa', 'Isarura']],
  ] as const)('names the five stages in %s', (locale, names) => {
    expect(STAGE_ORDER.map((stage) => stageLabel(say(locale), stage))).toEqual(names);
  });

  it('shows an unknown stage as it came, rather than nothing', () => {
    expect(stageLabel(say('fr'), 'MYSTERY')).toBe('MYSTERY');
  });

  it('says the same words as the landing page, so a farmer meets one name for each stage', () => {
    STAGE_ORDER.forEach((stage, index) => {
      expect(translations[`stage${stage}`], stage).toEqual((landingTranslations as Record<string, unknown>)[`lpStage${index + 1}`]);
    });
  });
});
