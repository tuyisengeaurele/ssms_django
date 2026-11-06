import { FormEvent, useEffect, useId, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useApiError } from '../../hooks/useApiError';
import type { SupportMinutes, SupportMode, User } from '../../types';
import { fill } from '../../utils/fill';
import Modal from '../ui/Modal';
import '../../styles/support.css';

const LENGTHS: SupportMinutes[] = [15, 30, 60];
const REASON_MIN = 10;
const REASON_MAX = 300;

interface Props {
  open: boolean;
  person: User | null;
  onClose: () => void;
  /** Rejects when the server says no, and the form shows why and keeps what was typed. */
  onSubmit: (data: { reason: string; minutes: SupportMinutes; mode: SupportMode }) => Promise<void>;
}

/** An admin asks a farmer or supervisor to let support look at their account. The person reads the reason. */
export default function SupportAskModal({ open, person, onClose, onSubmit }: Props) {
  const { t } = useLanguage();
  const { getErrorMessage } = useApiError();
  const formId = useId();
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState<SupportMinutes>(30);
  const [mode, setMode] = useState<SupportMode>('view');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Each time it opens it starts clean.
  useEffect(() => {
    if (open) {
      setReason('');
      setMinutes(30);
      setMode('view');
      setError('');
      setBusy(false);
    }
  }, [open]);

  if (!person) return null;
  const name = person.name;
  const trimmed = reason.trim();
  const ready = trimmed.length >= REASON_MIN && trimmed.length <= REASON_MAX;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setError('');
    setBusy(true);
    try {
      await onSubmit({ reason: trimmed, minutes, mode });
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={fill(t('adSupportAskTitle'), { name })}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t('btnCancel')}</button>
          <button type="submit" form={formId} className="btn btn-primary" disabled={!ready || busy}>
            {busy ? <><span className="spinner" />{t('adSupportSending')}</> : t('adSupportSend')}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit}>
        {error ? <div className="alert alert-error" role="alert">{error}</div> : null}

        <div className="form-group">
          <label className="form-label" htmlFor={`${formId}-reason`}>{t('adSupportReasonLabel')}</label>
          <textarea
            id={`${formId}-reason`}
            className="form-textarea"
            rows={4}
            maxLength={REASON_MAX}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-describedby={`${formId}-help`}
          />
          <span id={`${formId}-help`} className="form-hint">{fill(t('adSupportReasonHelp'), { name })}</span>
          <span className="support-counter">{fill(t('adSupportReasonCount'), { count: reason.length })}</span>
        </div>

        <fieldset className="support-choices">
          <legend className="form-label">{t('adSupportLengthLabel')}</legend>
          {LENGTHS.map((length) => (
            <label key={length} className="support-choice">
              <input type="radio" name={`${formId}-minutes`} checked={minutes === length} onChange={() => setMinutes(length)} />
              {fill(t('adSupportMinutes'), { minutes: length })}
            </label>
          ))}
        </fieldset>

        <fieldset className="support-choices">
          <legend className="form-label">{t('adSupportModeLabel')}</legend>
          <label className="support-choice">
            <input type="radio" name={`${formId}-mode`} checked={mode === 'view'} onChange={() => setMode('view')} />
            {t('adSupportModeView')}
          </label>
          <label className="support-choice">
            <input type="radio" name={`${formId}-mode`} checked={mode === 'edit'} onChange={() => setMode('edit')} />
            {t('adSupportModeEdit')}
          </label>
        </fieldset>
      </form>
    </Modal>
  );
}
