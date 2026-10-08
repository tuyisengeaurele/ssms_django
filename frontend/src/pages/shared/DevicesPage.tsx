import { useEffect, useState } from 'react';
import { deviceService } from '../../services/device.service';
import { farmService } from '../../services/farm.service';
import { IoTDevice, DeviceStatus, Farm } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';
import { fill } from '../../utils/fill';
import { timeAgo } from '../../utils/timeAgo';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import AddDeviceModal from './AddDeviceModal';
import DeviceDetailModal from './DeviceDetailModal';
import DeviceStatusBadge from './DeviceStatusBadge';

type Tab = DeviceStatus | 'all';

export default function DevicesPage() {
  const { user } = useAuth();
  const { t, locale } = useLanguage();
  const { error: showError } = useToast();
  const { getErrorMessage } = useApiError();

  const [devices, setDevices] = useState<IoTDevice[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [selected, setSelected] = useState<IoTDevice | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const canManage = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';

  const loadDevices = () =>
    deviceService.getAll()
      .then((r) => setDevices(r.data.data))
      .catch((e) => showError(getErrorMessage(e)));

  useEffect(() => {
    Promise.allSettled([
      loadDevices(),
      canManage ? farmService.getAll().then((r) => setFarms(r.data.data)) : Promise.resolve(),
    ]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const count = (status: DeviceStatus) => devices.filter((d) => d.status === status).length;
  const query = search.trim().toLowerCase();

  const visible = devices.filter((d) => {
    if (tab !== 'all' && d.status !== tab) return false;
    return !query || [d.name, d.farmName ?? '', d.location ?? '', d.deviceKey].some((v) => v.toLowerCase().includes(query));
  });

  const tabs: Array<{ id: Tab; label: string; n: number }> = [
    { id: 'all', label: t('dvTabAll'), n: devices.length },
    { id: 'online', label: t('dvTabOnline'), n: count('online') },
    { id: 'offline', label: t('dvTabOffline'), n: count('offline') },
    { id: 'error', label: t('dvTabError'), n: count('error') },
  ];

  const refresh = () => {
    setLoading(true);
    loadDevices().finally(() => setLoading(false));
  };

  return (
    <div>
      <PageHeader
        title={t('ptDevices')}
        subtitle={loading ? undefined : fill(t(devices.length === 1 ? 'dvSubtitleOne' : 'dvSubtitleMany'), { n: devices.length })}
        actions={
          <>
            {canManage && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
                <Icon name="add" size={15} />
                {t('dvAdd')}
              </button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={refresh}>
              <Icon name="refresh" size={15} />
              {t('dvRefresh')}
            </button>
          </>
        }
      />

      <Panel
        title={t('dvPanel')}
        flush
        actions={
          <div className="search-box">
            <Icon name="search" size={16} className="icon" />
            <input type="search" aria-label={t('dvSearch')} placeholder={t('dvSearch')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        }
      >
        <div className="tabs" role="tablist">
          {tabs.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} className={tab === x.id ? 'is-on' : ''} onClick={() => setTab(x.id)}>
              {x.label} ({x.n})
            </button>
          ))}
        </div>

        {loading ? (
          <SkeletonTable rows={6} cols={6} />
        ) : devices.length === 0 ? (
          <EmptyState
            icon={<Icon name="devices" size={22} />}
            title={t('dvNone')}
            description={canManage ? t('dvNoneManage') : t('dvNoneView')}
            action={canManage ? { label: t('dvRegisterFirst'), onClick: () => setShowAdd(true) } : undefined}
          />
        ) : visible.length === 0 ? (
          <EmptyState icon={<Icon name="search" size={22} />} title={t('dvNoMatch')} description={t('dvNoMatchBody')} />
        ) : (
          <div className="table-wrapper">
            <table className="table-stack">
              <thead>
                <tr>
                  <th>{t('dvColDevice')}</th>
                  <th>{t('dvColFarm')}</th>
                  <th>{t('dvColLocation')}</th>
                  <th>{t('dvColStatus')}</th>
                  <th>{t('dvColTemp')}</th>
                  <th>{t('dvColHum')}</th>
                  <th>{t('dvColSeen')}</th>
                  <th><span className="sr-only">{t('dvDetails')}</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((d) => (
                  <tr key={d.id} className="tbody-row">
                    <td className="cell-lead">
                      <div className="cell-stack">
                        <span className="cell-strong">{d.name}</span>
                        <span className="cell-sub cell-mono">{d.deviceKey}</span>
                      </div>
                    </td>
                    <td data-label={t('dvColFarm')}>{d.farmName ?? '-'}</td>
                    <td data-label={t('dvColLocation')} className="cell-muted">{d.location || '-'}</td>
                    <td data-label={t('dvColStatus')}><DeviceStatusBadge status={d.status} /></td>
                    <td data-label={t('dvColTemp')} className="cell-strong">{d.latestReading ? `${d.latestReading.temperature} °C` : '-'}</td>
                    <td data-label={t('dvColHum')} className="cell-strong">{d.latestReading ? `${d.latestReading.humidity} %` : '-'}</td>
                    <td data-label={t('dvColSeen')} className="cell-muted cell-nowrap">{d.lastSeen ? timeAgo(d.lastSeen, locale) : t('dvNever')}</td>
                    <td data-label="">
                      <div className="table-actions">
                        <button className="btn btn-ghost btn-xs" aria-label={`${t('dvDetails')} ${d.name}`} onClick={() => setSelected(d)}>
                          {t('dvDetails')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {selected && (
        <DeviceDetailModal
          device={selected}
          canManage={canManage}
          onClose={() => setSelected(null)}
          onRemoved={(id) => setDevices((prev) => prev.filter((d) => d.id !== id))}
        />
      )}

      {showAdd && (
        <AddDeviceModal
          farms={farms}
          onClose={() => setShowAdd(false)}
          onCreated={(device) => setDevices((prev) => [device, ...prev])}
        />
      )}
    </div>
  );
}
