import { useLanguage } from '../../context/LanguageContext';

/** Shown in place of a list that could not be loaded, so a failed request is never read as "nothing here yet". */
export default function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="alert alert-error" role="alert">
      <span style={{ flex: 1 }}>{t('loadFailedBody')}</span>
      <button type="button" className="btn btn-secondary btn-xs" onClick={onRetry}>{t('btnRetry')}</button>
    </div>
  );
}
