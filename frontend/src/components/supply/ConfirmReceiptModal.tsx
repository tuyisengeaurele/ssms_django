import { useState } from 'react';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { EggRequestRow, supplyService } from '../../services/supply.service';
import { fill } from '../../utils/fill';
import Modal from '../ui/Modal';

interface Props {
  request: EggRequestRow;
  onClose: () => void;
  /** Called after the receipt was saved and the batch was made. */
  onDone: () => void;
  /** Said in the toast. A supervisor recording it for a farmer may say it differently. */
  doneText?: string;
}

/** The words are lower case because they also sit inside a sentence. In a list of choices each starts with a capital. */
const upperFirst = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/** The eggs arrived. How many, and in what state. This is what starts the batch. */
export default function ConfirmReceiptModal({ request, onClose, onDone, doneText }: Props) {
  const { t } = useLanguage();
  const { success } = useToast();
  const { getErrorMessage } = useApiError();
  const promised = request.boxesApproved ?? 0;
  const [boxes, setBoxes] = useState(String(promised));
  const [condition, setCondition] = useState<'good' | 'damaged'>('good');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    const received = boxes.trim() === '' ? NaN : Number(boxes);
    if (!Number.isInteger(received) || received < 1 || received > promised) return setError(fill(t('rndNeedReceived'), { n: promised }));
    setError('');
    setSending(true);
    try {
      await supplyService.receive(request.id, { boxes: received, condition });
      success(doneText ?? fill(t('rndReceivedToast'), { room: request.room.name }));
      onDone();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
      setSending(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('rndReceiptTitle')}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>{t('btnCancel')}</button>
          <button className="btn btn-primary" onClick={send} disabled={sending}>
            {sending ? <span className="spinner" aria-hidden="true" /> : null}
            {t('rndConfirmSend')}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="form-group">
        <label className="form-label" htmlFor="receipt-boxes">{t('rndFieldReceived')}</label>
        <input id="receipt-boxes" type="number" inputMode="numeric" className="form-input" min={1} max={promised} step={1} value={boxes} onChange={(e) => setBoxes(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="receipt-condition">{t('rndFieldCondition')}</label>
        <select id="receipt-condition" className="form-select" value={condition} onChange={(e) => setCondition(e.target.value as 'good' | 'damaged')}>
          <option value="good">{upperFirst(t('rndGood'))}</option>
          <option value="damaged">{upperFirst(t('rndDamaged'))}</option>
        </select>
      </div>
    </Modal>
  );
}
