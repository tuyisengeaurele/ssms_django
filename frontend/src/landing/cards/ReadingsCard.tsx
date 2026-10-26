import { useLanguage } from '../../context/LanguageContext';
import { Paper } from './Paper';

export function ReadingsCard({ className }: { className?: string }) {
  const { t } = useLanguage();
  return (
    <Paper
      title={t('lpMockReadings')}
      tag={t('lpCardBatch')}
      tagValue="B-0004"
      label={t('lpAriaReadings')}
      className={className}
    >
      <div className="l-paper__nums">
        <span>
          <small>{t('lpCardTemp')}</small>
          <b>24.6</b>
          <i>°C</i>
        </span>
        <span>
          <small>{t('lpCardHumidity')}</small>
          <b>78</b>
          <i>%</i>
        </span>
      </div>
      <div className="l-paper__chart">
        <small>{t('lpMockLast24')}</small>
        <svg viewBox="0 0 320 110" preserveAspectRatio="none" focusable="false" aria-hidden="true">
          <rect x="0" y="26" width="320" height="52" className="l-paper__band" />
          <path
            d="M0 70 C24 66 40 48 66 52 S110 74 138 58 S186 34 214 46 S268 62 320 40"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
        <span className="l-paper__axis">
          <i>{t('lpCardRange')}</i>
        </span>
      </div>
    </Paper>
  );
}
