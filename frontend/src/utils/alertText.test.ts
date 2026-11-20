import { describe, expect, it } from 'vitest';
import { translations } from '../i18n/translations';
import { ALERT_CODE_KEY, alertText } from './alertText';

const say = (locale: 'en' | 'fr' | 'rw') => (key: string) => translations[key]?.[locale] ?? key;

const EXAMPLE: Record<string, Record<string, string | number>> = {
  temperature_low: { value: 19.5, min: 22 },
  temperature_high: { value: 31, max: 28 },
  humidity_low: { value: 60, min: 70 },
  humidity_high: { value: 92, max: 85 },
  disease_suspected: { disease: 'Grasserie', confidence: 87 },
  stage_changed: { stage: 'COCOON' },
  device_offline: { device: 'DHT22-7', deviceId: 'abc', minutes: 30 },
};

describe('alertText', () => {
  it('knows the same seven codes the server makes', () => {
    expect(Object.keys(ALERT_CODE_KEY).sort()).toEqual(Object.keys(EXAMPLE).sort());
  });

  it.each(Object.keys(EXAMPLE))('writes %s in all three languages, with its values and nothing left to fill', (code) => {
    const texts = (['en', 'fr', 'rw'] as const).map((locale) => alertText(say(locale), { code, params: EXAMPLE[code], message: 'stored' }));
    texts.forEach((text) => {
      expect(text).not.toBe('stored');
      expect(text).not.toMatch(/[{}]/);
    });
    expect(new Set(texts).size).toBe(3);
  });

  it('says what the old English message said', () => {
    expect(alertText(say('en'), { code: 'temperature_low', params: { value: 19.5, min: 22 }, message: '' }))
      .toBe('Temperature too low: 19.5 °C (safe min is 22 °C). Check heating.');
  });

  it('names the stage in the language of the screen', () => {
    expect(alertText(say('fr'), { code: 'stage_changed', params: { stage: 'COCOON' }, message: '' })).toContain('Cocon');
    expect(alertText(say('rw'), { code: 'stage_changed', params: { stage: 'COCOON' }, message: '' })).toContain('Igishishwa');
    expect(alertText(say('en'), { code: 'stage_changed', params: { stage: 'COCOON' }, message: '' })).not.toContain('COCOON');
  });

  it('shows the stored message for an alert with no code, as an old alert has none', () => {
    expect(alertText(say('fr'), { code: null, params: {}, message: 'Temperature too low: 21 C' })).toBe('Temperature too low: 21 C');
    expect(alertText(say('fr'), { message: 'No fields at all' })).toBe('No fields at all');
  });

  it('shows the stored message for a code this version of the page does not know', () => {
    expect(alertText(say('rw'), { code: 'a_future_code', params: {}, message: 'English words' })).toBe('English words');
  });

  it('leaves the place of a missing value visible rather than failing', () => {
    expect(alertText(say('en'), { code: 'temperature_low', params: { value: 19.5 }, message: '' })).toContain('{min}');
  });
});
