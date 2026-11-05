import { useSyncExternalStore } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { isWaiting, onWaitingChange } from '../../services/wake';

/** Shown while the free server wakes up and the page keeps trying. Styled in toast.css. */
export default function WakeBanner() {
  const { t } = useLanguage();
  const waiting = useSyncExternalStore(onWaitingChange, isWaiting, () => false);
  if (!waiting) return null;
  return (
    <div className="wake-banner" role="status">
      {t('wakeBanner')}
    </div>
  );
}
