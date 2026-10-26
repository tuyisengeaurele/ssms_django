import { DeviceStatus } from '../../types';
import { useLanguage } from '../../context/LanguageContext';

const META: Record<DeviceStatus, { key: string; tone: string }> = {
  online: { key: 'dvOnline', tone: 'badge-green' },
  offline: { key: 'dvOffline', tone: 'badge-gray' },
  error: { key: 'dvError', tone: 'badge-red' },
};

export default function DeviceStatusBadge({ status }: { status: DeviceStatus }) {
  const { t } = useLanguage();
  const meta = META[status] ?? META.offline;
  return <span className={`badge badge-dot ${meta.tone}`}>{t(meta.key)}</span>;
}
