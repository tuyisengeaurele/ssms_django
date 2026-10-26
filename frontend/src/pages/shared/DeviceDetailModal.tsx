import { useEffect, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { deviceService } from '../../services/device.service';
import { IoTDevice } from '../../types';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { fill } from '../../utils/fill';
import { timeAgo } from '../../utils/timeAgo';
import { Icon } from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import DeviceStatusBadge from './DeviceStatusBadge';

const TEMP_COLOR = '#B4472F';
const HUM_COLOR = '#2F78B5';

interface Props {
  device: IoTDevice;
  canManage: boolean;
  onClose: () => void;
  onRemoved: (id: string) => void;
}

function ReadingTip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const temp = payload.find((p) => p.dataKey === 'temp');
  const hum = payload.find((p) => p.dataKey === 'hum');
  return (
    <div className="chart-tip">
      <p className="chart-tip-label">{label}</p>
      {temp ? <p className="chart-tip-value">{temp.value} °C</p> : null}
      {hum ? <p className="chart-tip-value">{hum.value} %</p> : null}
    </div>
  );
}

/** One device: what it last measured, how it has been doing, and, for managers, a way to remove it. */
export default function DeviceDetailModal({ device, canManage, onClose, onRemoved }: Props) {
  const { t, locale } = useLanguage();
  const { success, error: showError } = useToast();
  const { getErrorMessage } = useApiError();
  const [detail, setDetail] = useState<IoTDevice | null>(null);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    setLoading(true);
    deviceService.getById(device.id)
      .then((r) => setDetail(r.data.data))
      .catch((e) => showError(getErrorMessage(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.id]);

  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  const readings = (detail?.recentReadings ?? [])
    .slice()
    .reverse()
    .map((r) => ({ time: time.format(new Date(r.timestamp)), temp: r.temperature, hum: r.humidity }));

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await deviceService.remove(device.id);
      success(t('dvRemoved'));
      onRemoved(device.id);
      onClose();
    } catch (e) {
      showError(getErrorMessage(e));
      setRemoving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={device.name} maxWidth={600}>
      <div className="device-detail">
        <p className="device-detail-status"><DeviceStatusBadge status={device.status} /></p>

        <dl className="facts">
          <div><dt>{t('dvKey')}</dt><dd className="cell-mono">{device.deviceKey}</dd></div>
          <div><dt>{t('dvColFarm')}</dt><dd>{device.farmName ?? '-'}</dd></div>
          <div><dt>{t('dvColLocation')}</dt><dd>{device.location || '-'}</dd></div>
          <div><dt>{t('dvColSeen')}</dt><dd>{device.lastSeen ? timeAgo(device.lastSeen, locale) : t('dvNever')}</dd></div>
        </dl>

        {device.latestReading && (
          <>
            <h3 className="mini-heading">{t('dvLatest')}</h3>
            <div className="reading-pair">
              <div>
                <p className="reading-value">{device.latestReading.temperature} °C</p>
                <p className="reading-label">{t('dvTemperature')}</p>
              </div>
              <div>
                <p className="reading-value">{device.latestReading.humidity} %</p>
                <p className="reading-label">{t('dvHumidity')}</p>
              </div>
            </div>
          </>
        )}

        <h3 className="mini-heading">{t('dvRecent')}</h3>
        {loading ? (
          <p className="panel-loading"><span className="spinner" /></p>
        ) : readings.length === 0 ? (
          <p className="coop-empty">{t('dvNoReadings')}</p>
        ) : (
          <div role="img" aria-label={t('dvRecent')}>
            <ResponsiveContainer width="100%" height={190}>
              <ComposedChart data={readings} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#E9E4D8" />
                <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#566760' }} interval="preserveStartEnd" />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#566760' }} />
                <Tooltip cursor={{ stroke: '#C9C2B2' }} content={<ReadingTip />} />
                <Area type="monotone" dataKey="hum" stroke="none" fill={HUM_COLOR} fillOpacity={0.08} />
                <Line type="monotone" dataKey="temp" stroke={TEMP_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
                <Line type="monotone" dataKey="hum" stroke={HUM_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
            <ul className="legend">
              <li><span className="legend-key" style={{ background: TEMP_COLOR }} />{t('dvLegendTemp')}</li>
              <li><span className="legend-key" style={{ background: HUM_COLOR }} />{t('dvLegendHum')}</li>
            </ul>
            <table className="sr-only">
              <caption>{t('dvRecent')}</caption>
              <tbody>
                {readings.map((r, i) => (
                  <tr key={i}><th scope="row">{r.time}</th><td>{r.temp} °C</td><td>{r.hum} %</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canManage && (
          <div className="danger-zone">
            {asking ? (
              <>
                <p className="modal-text">{fill(t('dvRemoveAsk'), { name: device.name, farm: device.farmName ?? '-' })}</p>
                <div className="danger-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => setAsking(false)}>{t('btnCancel')}</button>
                  <button className="btn btn-danger btn-sm" onClick={handleRemove} disabled={removing}>
                    {removing ? <><span className="spinner" />{t('dvRemoving')}</> : t('dvRemoveYes')}
                  </button>
                </div>
              </>
            ) : (
              <button className="btn btn-ghost btn-sm btn-quiet-danger" onClick={() => setAsking(true)}>
                <Icon name="remove" size={15} />
                {t('dvRemove')}
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
