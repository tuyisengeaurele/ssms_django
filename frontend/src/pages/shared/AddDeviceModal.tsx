import { FormEvent, useState } from 'react';
import { deviceService } from '../../services/device.service';
import { Farm, IoTDevice } from '../../types';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/ui/Modal';

interface Props {
  farms: Farm[];
  /** Pre-selects a farm, when the dialog is opened from that farm's page. */
  defaultFarmId?: string;
  onClose: () => void;
  onCreated: (device: IoTDevice) => void;
}

export default function AddDeviceModal({ farms, defaultFarmId = '', onClose, onCreated }: Props) {
  const { t } = useLanguage();
  const { success, error: showError } = useToast();
  const { getErrorMessage } = useApiError();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', farmId: defaultFarmId, location: '', deviceKey: '' });

  const change = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await deviceService.create({
        name: form.name.trim(),
        farmId: form.farmId,
        location: form.location.trim(),
        deviceKey: form.deviceKey.trim() || undefined,
      });
      success(t('dvRegistered'));
      onCreated(res.data.data);
      onClose();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('dvAddTitle')}
      footer={
        <>
          <button className="btn btn-secondary" type="button" onClick={onClose}>{t('btnCancel')}</button>
          <button className="btn btn-primary" form="add-device-form" type="submit" disabled={saving}>
            {saving ? <><span className="spinner" />{t('dvRegistering')}</> : t('dvRegister')}
          </button>
        </>
      }
    >
      <form id="add-device-form" onSubmit={submit}>
        <div className="form-group">
          <label className="form-label" htmlFor="dv-name">{t('dvFieldName')} <span className="required" aria-hidden="true">*</span></label>
          <input id="dv-name" className="form-input" value={form.name} onChange={change('name')} required maxLength={100} placeholder={t('dvPlaceholderName')} aria-describedby="dv-name-hint" />
          <p id="dv-name-hint" className="form-hint">{t('dvNameHint')}</p>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="dv-farm">{t('dvFieldFarm')} <span className="required" aria-hidden="true">*</span></label>
          <select id="dv-farm" className="form-select" value={form.farmId} onChange={change('farmId')} required>
            <option value="">{t('dvSelectFarm')}</option>
            {farms.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.location})</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="dv-place">{t('dvFieldPlace')}</label>
          <input id="dv-place" className="form-input" value={form.location} onChange={change('location')} maxLength={200} placeholder={t('dvPlaceholderPlace')} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="dv-key">{t('dvFieldKey')}</label>
          <input id="dv-key" className="form-input cell-mono" value={form.deviceKey} onChange={change('deviceKey')} maxLength={80} placeholder="ssms-abc123" aria-describedby="dv-key-hint" />
          <p id="dv-key-hint" className="form-hint">{t('dvKeyHint')}</p>
        </div>
      </form>
    </Modal>
  );
}
