import { useState } from 'react';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { Allowance, supplyService } from '../../services/supply.service';
import { fill } from '../../utils/fill';
import Modal from '../ui/Modal';

const MAX = 100;
const REASON_MIN = 10;
const REASON_MAX = 500;

interface Props {
  allowance: Allowance;
  onClose: () => void;
  /** Called after the request was saved, so the card can show it. */
  onSent: () => void;
}

/** A farmer asks for a different allowance. The page says why it refuses before anything is sent. */
export default function AllowanceRequestModal({ allowance, onClose, onSent }: Props) {
  const { t } = useLanguage();
  const { success } = useToast();
  const { getErrorMessage } = useApiError();
  const [boxes, setBoxes] = useState(String(allowance.boxes));
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    const asked = boxes.trim() === '' ? NaN : Number(boxes);
    const text = reason.trim();
    if (!Number.isInteger(asked) || asked < 0 || asked > MAX) return setError(t('alwNeedBoxes'));
    if (asked === allowance.boxes) return setError(t('alwSame'));
    if (text.length < REASON_MIN || text.length > REASON_MAX) return setError(t('alwNeedReason'));
    setError('');
    setSending(true);
    try {
      await supplyService.ask({ boxesAsked: asked, reason: text });
      success(t('alwSent'));
      onSent();
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
      title={t('alwAsk')}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>{t('btnCancel')}</button>
          <button className="btn btn-primary" onClick={send} disabled={sending}>
            {sending ? <span className="spinner" aria-hidden="true" /> : null}
            {t('alwSend')}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {allowance.capacityBoxes != null && <p className="form-hint form-hint--gap">{fill(t('alwCapacity'), { n: allowance.capacityBoxes })}</p>}
      <div className="form-group">
        <label className="form-label" htmlFor="alw-boxes">{t('alwFieldBoxes')}</label>
        <input id="alw-boxes" type="number" inputMode="numeric" className="form-input" min={0} max={MAX} step={1} value={boxes} onChange={(e) => setBoxes(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="alw-reason">{t('alwFieldReason')} <span className="required" aria-hidden="true">*</span></label>
        <textarea id="alw-reason" className="form-textarea" rows={3} maxLength={REASON_MAX} value={reason} aria-describedby="alw-reason-hint" onChange={(e) => setReason(e.target.value)} />
        <span id="alw-reason-hint" className="form-hint">{t('alwReasonHint')}</span>
      </div>
    </Modal>
  );
}
