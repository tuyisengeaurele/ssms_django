import { useLanguage } from '../../context/LanguageContext';
import { Icon } from '../ui/Icon';
import { useMfaReminder } from './mfaReminderContext';

/** The quiet reminder on a dashboard, for somebody who put the dialog off. It asks for nothing until it is pressed. */
export default function TwoStepLine() {
  const { t } = useLanguage();
  const { line, setUp } = useMfaReminder();
  if (!line) return null;
  return (
    <div className="two-step-line" role="note">
      <Icon name="lock" size={18} />
      <span>{t('mfaLine')}</span>
      <button type="button" className="btn btn-secondary btn-sm" onClick={setUp}>
        <Icon name="next" size={13} />
        {t('mfaLineSetUp')}
      </button>
    </div>
  );
}
