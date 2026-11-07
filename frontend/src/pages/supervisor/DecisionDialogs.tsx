import { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { fill } from '../../utils/fill';
import Modal from '../../components/ui/Modal';

interface Props {
  /** Runs the decision. Returns the message to show inside the dialog, or null when it worked and the dialog may close. */
  onSend: (value: string) => Promise<string | null>;
  onClose: () => void;
}

/** A refusal needs a reason, because the farmer reads it and needs to know what to change. */
export function NoteDialog({ title, sendLabel, farmerName, onSend, onClose }: Props & { title: string; sendLabel: string; farmerName: string }) {
  const { t } = useLanguage();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    const message = await onSend(note.trim());
    if (message) {
      setError(message);
      setSending(false);
    } else {
      onClose();
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>{t('btnCancel')}</button>
          <button className="btn btn-danger" onClick={send} disabled={sending || note.trim() === ''}>
            {sending ? <span className="spinner" aria-hidden="true" /> : null}
            {sendLabel}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="form-group">
        <label className="form-label" htmlFor="decision-note">{fill(t('alwFieldLowerReason'), { name: farmerName })}</label>
        <textarea id="decision-note" className="form-textarea" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}

/** Approve a request at an amount other than the one asked. The note is optional. */
export function AmountDialog({ asked, onSend, onClose }: { asked: number; onSend: (boxes: number, note: string) => Promise<string | null>; onClose: () => void }) {
  const { t } = useLanguage();
  const [boxes, setBoxes] = useState(String(asked));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    const amount = boxes.trim() === '' ? NaN : Number(boxes);
    if (!Number.isInteger(amount) || amount < 0 || amount > 100) return setError(t('alwNeedBoxes'));
    setError('');
    setSending(true);
    const message = await onSend(amount, note.trim());
    if (message) {
      setError(message);
      setSending(false);
    } else {
      onClose();
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('dcsAmountTitle')}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>{t('btnCancel')}</button>
          <button className="btn btn-primary" onClick={send} disabled={sending}>
            {sending ? <span className="spinner" aria-hidden="true" /> : null}
            {t('dcsAmountSend')}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="form-group">
        <label className="form-label" htmlFor="decision-boxes">{t('dcsAmountLabel')}</label>
        <input id="decision-boxes" type="number" inputMode="numeric" className="form-input" min={0} max={100} step={1} value={boxes} onChange={(e) => setBoxes(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="decision-amount-note">{t('dcsAmountNote')}</label>
        <textarea id="decision-amount-note" className="form-textarea" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}
