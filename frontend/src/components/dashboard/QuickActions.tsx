import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { Icon, IconName } from '../ui/Icon';

/** `ADMIN_MONITOR` is an admin looking at every farm, on the page a supervisor uses for their own. */
type Role = 'FARMER' | 'SUPERVISOR' | 'ADMIN' | 'ADMIN_MONITOR';
type Count = 'alerts' | 'decisions';

interface Action {
  to: string;
  /** The same word the sidebar and the page title use, so a place has one name everywhere. */
  label: string;
  icon: IconName;
  count?: Count;
}

const ACTIONS: Record<Role, Action[]> = {
  FARMER: [
    { to: '/farms', label: 'ptFarms', icon: 'farms' },
    { to: '/batches', label: 'ptBatches', icon: 'batches' },
    { to: '/detections/reports', label: 'ptDetectionReports', icon: 'detections' },
    { to: '/harvests', label: 'ptHarvests', icon: 'harvests' },
    { to: '/alerts', label: 'ptAlerts', icon: 'alerts', count: 'alerts' },
    { to: '/batches/compare', label: 'ptCompare', icon: 'overview' },
  ],
  SUPERVISOR: [
    { to: '/decisions', label: 'ptDecisions', icon: 'inbox', count: 'decisions' },
    { to: '/supply', label: 'ptSupply', icon: 'leaf' },
    { to: '/supervisor/cooperative', label: 'ptMyCooperative', icon: 'cooperatives' },
    { to: '/alerts', label: 'ptAlerts', icon: 'alerts', count: 'alerts' },
    { to: '/detections/reports', label: 'ptDetectionReports', icon: 'detections' },
    { to: '/batches/compare', label: 'ptCompare', icon: 'overview' },
  ],
  ADMIN_MONITOR: [
    { to: '/decisions', label: 'ptDecisions', icon: 'inbox' },
    { to: '/supply', label: 'ptSupply', icon: 'leaf' },
    { to: '/alerts', label: 'ptAlerts', icon: 'alerts', count: 'alerts' },
    { to: '/detections/reports', label: 'ptDetectionReports', icon: 'detections' },
    { to: '/batches/compare', label: 'ptCompare', icon: 'overview' },
    { to: '/admin/cooperatives', label: 'ptCooperatives', icon: 'cooperatives' },
  ],
  ADMIN: [
    { to: '/admin/users', label: 'ptUsers', icon: 'users' },
    { to: '/admin/cooperatives', label: 'ptCooperatives', icon: 'cooperatives' },
    { to: '/admin/contacts', label: 'ptMessages', icon: 'messages' },
    { to: '/admin/system', label: 'ptSystem', icon: 'systemReport' },
    { to: '/alerts', label: 'ptAlerts', icon: 'alerts', count: 'alerts' },
    { to: '/admin/system/logs', label: 'ptAudit', icon: 'audit' },
    { to: '/detections/reports', label: 'ptDetectionReports', icon: 'detections' },
    { to: '/supervisor', label: 'ptFarmMonitoring', icon: 'farms' },
  ],
};

/**
 * The places a person goes most, one tap from their dashboard. Six to eight per role, in the order that matters to them, each
 * named with the same word as the sidebar. A number appears only for what is waiting, and it is part of the link's name.
 */
export default function QuickActions({ role, counts = {} }: { role: Role; counts?: Partial<Record<Count, number>> }) {
  const { t } = useLanguage();
  return (
    <nav className="qa" aria-label={t('qaTitle')}>
      <ul className="qa-list">
        {ACTIONS[role].map((action) => {
          const n = action.count ? counts[action.count] ?? 0 : 0;
          return (
            <li key={action.to + action.label}>
              <Link to={action.to} className="qa-card">
                <span className="qa-icon"><Icon name={action.icon} size={18} /></span>
                <span className="qa-label">{t(action.label)}</span>
                {n > 0 && <span className="qa-count">{n}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
