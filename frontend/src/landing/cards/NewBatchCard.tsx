import { useLanguage } from '../../context/LanguageContext';
import { Paper, Row } from './Paper';

export function NewBatchCard({ className }: { className?: string }) {
  const { t } = useLanguage();
  return (
    <Paper title={t('lpMockNewBatch')} label={t('lpAriaNewBatch')} className={className}>
      <Row label={t('lpMockFarm')}>Gasabo Silk Farm</Row>
      <Row label={t('lpCardStage')}>{t('lpStage1')}</Row>
      <Row label={t('lpMockExpected')}>{t('lpMockInDays')}</Row>
      <div className="l-paper__cta">{t('lpMockCreate')}</div>
    </Paper>
  );
}
