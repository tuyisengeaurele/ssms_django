import { useLanguage } from '../../context/LanguageContext';
import { fill } from '../../utils/fill';
import { STAGE_LABELS, STAGE_ORDER } from '../../utils/constants';
import { BatchStage } from '../../types';
import { Icon } from '../../components/ui/Icon';

interface Props {
  current: BatchStage;
  /** Only people who may edit the batch get the button. */
  canAdvance: boolean;
  busy: boolean;
  onAdvance: (stage: BatchStage) => void;
}

/** Five steps in one calm colour. A batch only moves forward, so only the next step is a button. */
export default function StageStepper({ current, canAdvance, busy, onAdvance }: Props) {
  const { t } = useLanguage();
  const at = STAGE_ORDER.indexOf(current);

  return (
    <ol className="stepper" aria-label={t('bdLifecycle')}>
      {STAGE_ORDER.map((stage, i) => {
        const state = i < at ? 'done' : i === at ? 'now' : i === at + 1 ? 'next' : 'later';
        const label = STAGE_LABELS[stage];
        return (
          <li key={stage} className={`stepper-step is-${state}`} aria-current={state === 'now' ? 'step' : undefined}>
            <span className="stepper-dot" aria-hidden="true">
              {state === 'done' ? <Icon name="check" size={14} /> : i + 1}
            </span>
            <span className="stepper-label">{label}</span>
            {state === 'done' && <span className="stepper-state">{t('bdStepDone')}</span>}
            {state === 'now' && <span className="stepper-state">{t('bdStepNow')}</span>}
            {state === 'next' && canAdvance ? (
              <button type="button" className="btn btn-secondary btn-xs" disabled={busy} onClick={() => onAdvance(stage)} aria-label={fill(t('bdMoveTo'), { stage: label })}>
                {t('bdStepNext')}
                <Icon name="forward" size={13} />
              </button>
            ) : (
              state === 'next' && <span className="stepper-state">{t('bdStepNext')}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
