import { useLanguage } from '../../context/LanguageContext';
import { supportService } from '../../services/support.service';
import type { SupportPersonRow } from '../../types';
import { fill } from '../../utils/fill';
import SupportBanner from './SupportBanner';

interface Props {
  /** The visit running on this person's account, or null. */
  active: SupportPersonRow | null;
  /** Called after the person ends it, so the page can ask the server again and the banner goes away. */
  onEnded: () => void;
}

/** On the person's own screen for as long as SSMS support is looking at their account. They can end it at once. */
export default function SupportActiveBanner({ active, onEnded }: Props) {
  const { t } = useLanguage();
  if (!active) return null;

  const end = async () => {
    try {
      await supportService.endOwn(active.id);
    } catch {
      // It may have ended a moment ago. Either way the page asks the server again.
    }
    onEnded();
  };

  const mode = active.grantedMode === 'edit' ? t('supportModeEdit') : t('supportModeView');
  return <SupportBanner text={fill(t('supportBannerPerson'), { mode })} endLabel={t('supportEndNow')} onEnd={end} />;
}
