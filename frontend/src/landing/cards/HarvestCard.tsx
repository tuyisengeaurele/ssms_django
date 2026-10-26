import { useLanguage } from '../../context/LanguageContext';
import { Paper } from './Paper';

const ROWS = [
  { id: 'A', weight: '42.5 kg', grade: 'A' },
  { id: 'B', weight: '38.0 kg', grade: 'A' },
  { id: 'C', weight: '27.4 kg', grade: 'B' },
];

export function HarvestCard({ className }: { className?: string }) {
  const { t } = useLanguage();
  return (
    <Paper title={t('lpMockHarvestTitle')} label={t('lpAriaHarvest')} className={className}>
      <div className="l-paper__table l-paper__table--head">
        <span>{t('lpMockBatch')}</span>
        <span>{t('lpMockWeight')}</span>
        <span>{t('lpMockGrade')}</span>
      </div>
      {ROWS.map((row) => (
        <div key={row.id} className="l-paper__table">
          <span>{`${t('lpMockBatch')} ${row.id}`}</span>
          <span>{row.weight}</span>
          <span>
            <em className={`l-paper__grade grade-${row.grade}`}>{row.grade}</em>
          </span>
        </div>
      ))}
      <div className="l-paper__total">
        <span>{t('lpMockTotal')}</span>
        <strong>107.9 kg</strong>
      </div>
    </Paper>
  );
}
