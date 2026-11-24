import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { AlertLog } from '../../types';
import { alertText } from '../../utils/alertText';
import { timeAgo } from '../../utils/timeAgo';
import EmptyState from '../ui/EmptyState';
import { Icon } from '../ui/Icon';
import Panel from '../ui/Panel';

/** The latest alerts, short, for the side column of a dashboard. */
export default function AlertsPanel({ alerts, limit = 6 }: { alerts: AlertLog[]; limit?: number }) {
  const { t, locale } = useLanguage();
  return (
    <Panel
      title={t('svAlertsTitle')}
      flush
      actions={<Link to="/alerts" className="btn btn-secondary btn-sm">{t('svAllAlerts')}<Icon name="forward" size={14} /></Link>}
    >
      {alerts.length === 0 ? (
        <EmptyState icon={<Icon name="alerts" size={22} />} title={t('svNoAlerts')} description={t('svNoAlertsBody')} />
      ) : (
        <ul className="alert-feed alert-feed--short" aria-label={t('svAlertsTitle')}>
          {alerts.slice(0, limit).map((a) => (
            <li key={a.id} className={a.isRead ? 'is-read' : ''}>
              <div className="alert-feed-main">
                <p className="alert-feed-message">{alertText(t, a)}</p>
                <p className="alert-feed-meta"><span>{timeAgo(a.createdAt, locale)}</span></p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
