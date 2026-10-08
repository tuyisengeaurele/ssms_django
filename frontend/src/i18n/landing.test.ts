import { describe, expect, it } from 'vitest';
import { LANDING_KEYS, landingTranslations } from './landing';
import { translations } from './translations';

const LOCALES = ['en', 'fr', 'rw'] as const;
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const FILLER = /seamless|leverag|empower|revolutioni|cutting-edge|game-changer|delve/i;

const REQUIRED = [
  'lpSkip', 'lpNavProduct', 'lpNavHow', 'lpNavContact', 'lpNavLogin', 'lpNavStart',
  'lpNavMenu', 'lpNavClose', 'lpLangLabel',
  'lpHeroTitle', 'lpHeroSub', 'lpHeroCta', 'lpHeroSecondary', 'lpHeroImageAlt', 'lpGhostWord',
  'lpStat1Value', 'lpStat1Label', 'lpStat2Value', 'lpStat2Label', 'lpStat3Value', 'lpStat3Label',
  'lpPreviewDashboard', 'lpPreviewDisease', 'lpPreviewAlerts', 'lpSample',
  'lpProblem1', 'lpProblem2', 'lpProblem3',
  'lpHowTitle',
  'lpStep1Title', 'lpStep1Body', 'lpStep2Title', 'lpStep2Body',
  'lpStep3Title', 'lpStep3Body', 'lpStep4Title', 'lpStep4Body',
  'lpFeaturesTitle',
  'lpFeat1Title', 'lpFeat1Body', 'lpFeat2Title', 'lpFeat2Body', 'lpFeat3Title', 'lpFeat3Body',
  'lpFeat4Title', 'lpFeat4Body', 'lpFeat5Title', 'lpFeat5Body', 'lpFeat6Title', 'lpFeat6Body',
  'lpSpotTitle', 'lpSpotBody', 'lpSpotNote',
  'lpRwandaTitle', 'lpRwandaBody',
  'lpFaqTitle',
  'lpFaq1Q', 'lpFaq1A', 'lpFaq2Q', 'lpFaq2A', 'lpFaq3Q', 'lpFaq3A',
  'lpFaq4Q', 'lpFaq4A', 'lpFaq5Q', 'lpFaq5A', 'lpFaq6Q', 'lpFaq6A',
  'lpContactTitle', 'lpContactSub',
  'lpFormName', 'lpFormEmail', 'lpFormSubject', 'lpFormMessage', 'lpFormSend', 'lpFormSending',
  'lpFormSentTitle', 'lpFormSentBody', 'lpFormErrorGeneric', 'lpFormErrorNetwork', 'lpFormErrorBusy',
  'lpFormRequired', 'lpFormEmailInvalid', 'lpFormMessageShort',
  'lpCtaTitle', 'lpCtaButton',
  'lpFooterName', 'lpFooterTagline', 'lpFooterPrivacy', 'lpFooterTerms', 'lpFooterPhotos',
  'lpMockToday', 'lpMockBatch', 'lpMockTemperature', 'lpMockHumidity', 'lpMockInRange',
  'lpMockHarvestTitle', 'lpMockWeight', 'lpMockGrade', 'lpMockConfidence', 'lpMockResult',
  'lpMockAlert1', 'lpMockAlert2', 'lpMockAlert3', 'lpMockAgo1', 'lpMockAgo2', 'lpMockAgo3',
  'lpPreviewShow', 'lpPreviewLabel', 'lpStatsLabel',
  'lpMockAriaDashboard', 'lpMockAriaHarvest', 'lpMockAriaDisease', 'lpMockAriaAlerts',
];

describe('landing copy', () => {
  it('has every key the page needs', () => {
    for (const key of REQUIRED) {
      expect(LANDING_KEYS, key).toContain(key);
    }
  });

  it.each(LOCALES)('has non-empty text in %s for every key', (locale) => {
    for (const key of LANDING_KEYS) {
      expect(landingTranslations[key][locale].trim(), `${key} ${locale}`).not.toBe('');
    }
  });

  it('never uses em dashes or en dashes', () => {
    for (const key of LANDING_KEYS) {
      for (const locale of LOCALES) {
        const text = landingTranslations[key][locale];
        expect(text.includes(EM_DASH) || text.includes(EN_DASH), `${key} ${locale}`).toBe(false);
      }
    }
  });

  it('keeps buzzwords out', () => {
    for (const key of LANDING_KEYS) {
      for (const locale of LOCALES) {
        expect(FILLER.test(landingTranslations[key][locale]), `${key} ${locale}`).toBe(false);
      }
    }
  });

  it('keeps the email placeholder in every language', () => {
    for (const locale of LOCALES) {
      expect(landingTranslations.lpFormSentBody[locale]).toContain('{email}');
    }
  });

  it('only claims the numbers the product can back up', () => {
    expect(landingTranslations.lpStat1Value.en).toBe('4');
    expect(landingTranslations.lpStat2Value.en).toBe('5');
    expect(landingTranslations.lpStat3Value.en).toBe('3');
  });

  it('translates the stat labels instead of copying English', () => {
    for (const key of ['lpStat1Label', 'lpStat2Label', 'lpStat3Label'] as const) {
      expect(landingTranslations[key].fr).not.toBe(landingTranslations[key].en);
      expect(landingTranslations[key].rw).not.toBe(landingTranslations[key].en);
    }
  });

  it('is available through the shared translations map', () => {
    expect(translations.lpHeroTitle.en).toBe('Raise healthier silkworms.');
  });
});
