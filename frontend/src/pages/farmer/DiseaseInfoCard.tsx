import { useLanguage } from '../../context/LanguageContext';
import Panel from '../../components/ui/Panel';

/**
 * What a result may mean and what to do about it, for the four diseases the check can name.
 *
 * This is general guidance and it stays general on purpose: no product, no dose, no number. Treatment and disinfection
 * are for the supervisor or a sericulture officer to advise on. The wording is meant to be read by a sericulture
 * officer before it is relied on (see docs/disease-guidance.md for where each line comes from).
 */
const DISEASES: Record<string, { about: string; extra: string[] }> = {
  Grasserie: { about: 'diAboutGrasserie', extra: ['diExtraGrasserie'] },
  Flacherie: { about: 'diAboutFlacherie', extra: ['diExtraFlacherie'] },
  Muscardine: { about: 'diAboutMuscardine', extra: ['diExtraMuscardine'] },
  Pebrine: { about: 'diAboutPebrine', extra: ['diExtraPebrine1', 'diExtraPebrine2'] },
};

// The steps that are the same for every disease. Asking an officer comes last, after the steps of the disease itself.
const FIRST_STEPS = ['diStep1', 'diStep2', 'diStep3', 'diStep4', 'diStep5'];
const LAST_STEP = 'diStep6';

export default function DiseaseInfoCard({ result }: { result: string }) {
  const { t } = useLanguage();
  // A healthy worm, a class the page does not know and an empty result get no card.
  if (!Object.prototype.hasOwnProperty.call(DISEASES, result)) return null;
  const disease = DISEASES[result];

  return (
    <Panel title={t('diTitle')}>
      <p className="disease-about">{t(disease.about)}</p>
      <h3 className="subhead">{t('diStepsTitle')}</h3>
      <ul className="disease-steps" aria-label={t('diStepsTitle')}>
        {[...FIRST_STEPS, ...disease.extra, LAST_STEP].map((key) => <li key={key}>{t(key)}</li>)}
      </ul>
      <p className="form-hint">{t('diSource')}</p>
    </Panel>
  );
}
