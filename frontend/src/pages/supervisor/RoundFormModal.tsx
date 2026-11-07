import { useState } from 'react';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { RoundFacts, SupplyRound, supplyService } from '../../services/supply.service';
import Modal from '../../components/ui/Modal';

const STOCK_MAX = 100_000;

/** An ISO moment as the value of a datetime-local field, in the person's own time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  /** The round being changed. Without it the form makes a new one. */
  round?: SupplyRound;
  onClose: () => void;
  onSaved: (round: SupplyRound) => void;
}

/** The facts of a round. The page says what is wrong before anything is sent. */
export default function RoundFormModal({ round, onClose, onSaved }: Props) {
  const { t } = useLanguage();
  const { getErrorMessage } = useApiError();
  const [name, setName] = useState(round?.name ?? '');
  const [stock, setStock] = useState(round ? String(round.stockBoxes) : '');
  const [deadline, setDeadline] = useState(round ? toLocalInput(round.requestDeadline) : '');
  const [delivery, setDelivery] = useState(round?.deliveryDate ?? '');
  const [place, setPlace] = useState(round?.deliveryPlace ?? '');
  const [harvest, setHarvest] = useState(round?.expectedHarvestDate ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const boxes = stock.trim() === '' ? NaN : Number(stock);
    if (name.trim() === '') return setError(t('rsNeedName'));
    if (!Number.isInteger(boxes) || boxes < 0 || boxes > STOCK_MAX) return setError(t('rsNeedStock'));
    if (deadline === '') return setError(t('rsNeedDeadline'));
    if (place.trim() === '') return setError(t('rsNeedPlace'));
    if (delivery === '') return setError(t('rsNeedDeliveryDay'));
    // The day part of a datetime-local value is the person's own day, which is the day the deadline falls on for them.
    if (delivery < deadline.slice(0, 10)) return setError(t('rsNeedDelivery'));
    if (harvest === '') return setError(t('rsNeedHarvestDay'));
    if (harvest <= delivery) return setError(t('rsNeedHarvest'));
    setError('');
    setSaving(true);
    const facts: RoundFacts = {
      name: name.trim(), stockBoxes: boxes, requestDeadline: new Date(deadline).toISOString(), deliveryDate: delivery,
      deliveryPlace: place.trim(), expectedHarvestDate: harvest,
    };
    try {
      const res = round ? await supplyService.updateRound(round.id, facts) : await supplyService.createRound(facts);
      onSaved(res.data.data);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={round ? t('rsFormEdit') : t('rsFormNew')}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>{t('btnCancel')}</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <span className="spinner" aria-hidden="true" /> : null}
            {t('rsFSave')}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="form-group">
        <label className="form-label" htmlFor="round-name">{t('rsFName')}</label>
        <input id="round-name" className="form-input" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="round-stock">{t('rsFStock')}</label>
        <input id="round-stock" type="number" inputMode="numeric" className="form-input" min={0} max={STOCK_MAX} step={1} value={stock} onChange={(e) => setStock(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="round-deadline">{t('rsFDeadline')}</label>
        <input id="round-deadline" type="datetime-local" className="form-input" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="round-delivery">{t('rsFDelivery')}</label>
        <input id="round-delivery" type="date" className="form-input" value={delivery} onChange={(e) => setDelivery(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="round-place">{t('rsFPlace')}</label>
        <input id="round-place" className="form-input" maxLength={200} value={place} onChange={(e) => setPlace(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="round-harvest">{t('rsFHarvest')}</label>
        <input id="round-harvest" type="date" className="form-input" value={harvest} aria-describedby="round-harvest-hint" onChange={(e) => setHarvest(e.target.value)} />
        <span id="round-harvest-hint" className="form-hint">{t('rsFHarvestHint')}</span>
      </div>
    </Modal>
  );
}
