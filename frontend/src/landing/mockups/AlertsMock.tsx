import { useLanguage } from '../../context/LanguageContext';
import { Window } from './Window';

export function AlertsMock({ className }: { className?: string }) {
  const { t } = useLanguage();
  const rows = [
    { tone: 'hot', text: t('lpMockAlert1'), when: t('lpMockAgo1') },
    { tone: 'dry', text: t('lpMockAlert2'), when: t('lpMockAgo2') },
    { tone: 'info', text: t('lpMockAlert3'), when: t('lpMockAgo3') },
  ];
  return (
    <Window title={t('lpPreviewAlerts')} label={t('lpMockAriaAlerts')} className={className}>
      {rows.map((row) => (
        <div key={row.text} data-row className="l-mock__alert">
          <i className={`l-mock__dot l-mock__dot--${row.tone}`} aria-hidden="true" />
          <span>{row.text}</span>
          <small>{row.when}</small>
        </div>
      ))}
    </Window>
  );
}
