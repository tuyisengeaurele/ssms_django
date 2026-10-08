import { describe, expect, it } from 'vitest';
import { LANDING_KEYS, landingTranslations } from './landing';
import { translations } from './translations';

const LOCALES = ['en', 'fr', 'rw'] as const;
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const FILLER = /seamless|leverag|empower|revolutioni|cutting-edge|game-changer|delve/i;

const REQUIRED = [
  'lpSkip', 'lpNavAbout', 'lpNavProduct', 'lpNavHow', 'lpNavFaq', 'lpNavContact', 'lpNavLogin',
  'lpNavStart', 'lpNavMenu', 'lpNavClose', 'lpLangLabel',
  'lpHeroEyebrow', 'lpHeroTitle', 'lpHeroSub', 'lpHeroCta', 'lpHeroSecondary', 'lpHeroNote',
  'lpHeroImageAlt', 'lpGhostWord',
  'lpCardReport', 'lpCardBatch', 'lpCardStage', 'lpCardTemp', 'lpCardHumidity', 'lpCardSafe',
  'lpCardHarvestIn', 'lpCardInRange', 'lpCardDays', 'lpCardDisease', 'lpCardResult',
  'lpCardConfidence', 'lpCardHealthy',
  'lpMockNewBatch', 'lpMockFarm', 'lpMockStartDate', 'lpMockExpected', 'lpMockCreate',
  'lpMockReadings', 'lpMockNow', 'lpMockLast24', 'lpMockBatch', 'lpMockWeight', 'lpMockGrade',
  'lpMockYield', 'lpMockHarvestTitle', 'lpCardRange', 'lpMockInDays', 'lpMockTotal', 'lpMockStatus', 'lpMockAttention', 'lpMockAlert1', 'lpMockAgo1',
  'lpAriaReport', 'lpAriaNewBatch', 'lpAriaReadings', 'lpAriaDisease', 'lpAriaHarvest',
  'lpAboutEyebrow', 'lpAboutTitle', 'lpAboutBody1', 'lpAboutBody2', 'lpAboutBody3', 'lpStagesLabel',
  'lpStage1', 'lpStage2', 'lpStage3', 'lpStage4', 'lpStage5',
  'lpChallengeEyebrow', 'lpChallengeTitle', 'lpChallengeIntro',
  'lpChallenge1Title', 'lpChallenge1Body', 'lpChallenge2Title', 'lpChallenge2Body',
  'lpChallenge3Title', 'lpChallenge3Body',
  'lpSolutionEyebrow', 'lpSolutionTitle',
  'lpFeat1Title', 'lpFeat1Body', 'lpFeat2Title', 'lpFeat2Body', 'lpFeat3Title', 'lpFeat3Body',
  'lpFeat4Title', 'lpFeat4Body', 'lpFeat5Title', 'lpFeat5Body',
  'lpHowEyebrow', 'lpHowTitle',
  'lpStep1Title', 'lpStep1Body', 'lpStep2Title', 'lpStep2Body',
  'lpStep3Title', 'lpStep3Body', 'lpStep4Title', 'lpStep4Body',
  'lpSpotEyebrow', 'lpSpotTitle', 'lpSpotBody', 'lpSpotNote',
  'lpCoopEyebrow', 'lpCoopTitle', 'lpCoopBody', 'lpCoopPoint1', 'lpCoopPoint2',
  'lpFaqEyebrow', 'lpFaqTitle',
  'lpFaq1Q', 'lpFaq1A', 'lpFaq2Q', 'lpFaq2A', 'lpFaq3Q', 'lpFaq3A',
  'lpFaq4Q', 'lpFaq4A', 'lpFaq5Q', 'lpFaq5A', 'lpFaq6Q', 'lpFaq6A',
  'lpContactTitle', 'lpContactSub',
  'lpFormName', 'lpFormEmail', 'lpFormSubject', 'lpFormMessage', 'lpFormSend', 'lpFormSending',
  'lpFormSentTitle', 'lpFormSentBody', 'lpFormErrorGeneric', 'lpFormErrorNetwork', 'lpFormErrorBusy',
  'lpFormRequired', 'lpFormEmailInvalid', 'lpFormMessageShort',
  'lpCtaTitle', 'lpCtaButton',
  'lpFooterName', 'lpFooterTagline', 'lpFooterBlurb', 'lpFooterExplore', 'lpFooterAccount',
  'lpFooterLegal', 'lpFooterCreate', 'lpFooterPrivacy', 'lpFooterTerms', 'lpFooterPhotos',
  'lpAuthBack', 'lpAuthShowPwd', 'lpAuthHidePwd',
  'lpNotFoundTitle', 'lpNotFoundBody', 'lpGoBack', 'lpGoHome', 'lpDashboard',
  'lpDeniedTitle', 'lpDeniedBody',
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

  it('names the full project in the hero eyebrow in every language', () => {
    for (const locale of LOCALES) {
      expect(landingTranslations.lpHeroEyebrow[locale]).toBe('Smart Sericulture Management System');
    }
  });

  it('has no hero statistic', () => {
    expect(LANDING_KEYS.filter((key) => key.startsWith('lpStat'))).toEqual([]);
  });

  it('keeps the wording the owner rejected out', () => {
    const banned = /rural famil|familles rurales|imiryango yo mu cyaro|bad night|mauvaise nuit|ijoro rimwe ribi|Silk farming software for Rwanda/i;
    for (const key of LANDING_KEYS) {
      for (const locale of LOCALES) {
        expect(banned.test(landingTranslations[key][locale]), `${key} ${locale}`).toBe(false);
      }
    }
  });

  it('says the disease check can make mistakes, in every language', () => {
    expect(landingTranslations.lpSpotNote.en).toMatch(/can make mistakes/);
    expect(landingTranslations.lpFaq3A.en).toMatch(/can make mistakes/);
    expect(landingTranslations.lpFaq3A.fr).toMatch(/se tromper/);
  });

  it('is available through the shared translations map', () => {
    expect(translations.lpHeroTitle.en).toBe('Raise healthier silkworms.');
  });
});
