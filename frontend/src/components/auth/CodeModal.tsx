import { FormEvent, useEffect, useId, useState } from 'react';
import axios from 'axios';
import { useLanguage } from '../../context/LanguageContext';
import { useApiError } from '../../hooks/useApiError';
import Modal from '../ui/Modal';
import { plain } from './mfaErrors';

interface Props {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  /** Called with the code as typed, without spaces. It rejects when the code is not accepted, and the dialog says why. */
  onSubmit: (code: string) => Promise<void>;
  onCancel: () => void;
}

/** Asks a signed in admin for a code from the authenticator app, inside the app (not on the public sign in pages). */
export default function CodeModal({ open, title, body, confirmLabel, onSubmit, onCancel }: Props) {
  const { t } = useLanguage();
  const { getErrorMessage } = useApiError();
  const formId = useId();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Each time it opens it starts clean, so an old code or an old complaint is never shown.
  useEffect(() => {
    if (open) {
      setCode('');
      setError('');
      setBusy(false);
    }
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSubmit(plain(code));
    } catch (err: unknown) {
      const wrong = axios.isAxiosError(err) && err.response?.status === 422;
      setError(wrong ? t('adMfaWrongCode') : getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>{t('btnCancel')}</button>
          <button type="submit" form={formId} className="btn btn-primary" disabled={busy || !code.trim()}>
            {busy ? <><span className="spinner" />{t('adMfaVerifying')}</> : confirmLabel}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit}>
        <p className="modal-text">{body}</p>
        {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
        <div className="form-group">
          <label className="form-label" htmlFor={`${formId}-code`}>{t('adMfaCodeLabel')}</label>
          <input
            id={`${formId}-code`}
            className="form-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
          />
        </div>
      </form>
    </Modal>
  );
}
