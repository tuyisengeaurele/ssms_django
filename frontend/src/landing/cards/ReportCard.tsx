import { useLanguage } from '../../context/LanguageContext';
import { Paper, Row } from './Paper';

export function ReportCard({ className }: { className?: string }) {
  const { t } = useLanguage();
  return (
    <Paper
      title="Gasabo Silk Farm"
      tag={t('lpCardBatch')}
      tagValue="B-0004"
      label={t('lpAriaReport')}
      className={className}
    >
      <Row label={t('lpCardStage')}>{t('lpStage2')}</Row>
      <Row label={t('lpCardTemp')}>24.6 °C</Row>
      <Row label={t('lpCardHumidity')}>78 %</Row>
      <Row label={t('lpCardSafe')}>{t('lpCardRange')}</Row>
      <Row label={t('lpMockStatus')}>
        <span className="l-paper__ok">
          <i aria-hidden="true" />
          {t('lpCardInRange')}
        </span>
      </Row>
      <div className="l-paper__total">
        <span>{t('lpCardHarvestIn')}</span>
        <strong>{t('lpCardDays')}</strong>
      </div>
    </Paper>
  );
}
