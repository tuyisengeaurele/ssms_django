import { FormEvent, useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useApiError } from '../../hooks/useApiError';
import { authService } from '../../services/auth.service';
import type { User } from '../../types';
import { fill } from '../../utils/fill';
import { formatRwandaMobile, phoneFieldError, samePhone } from '../../utils/phone';
import Modal from './Modal';

interface Props {
  open: boolean;
  /** The number the account holds now, as the server keeps it (+250 and nine digits). */
  currentPhone: string;
  onClose: () => void;
  /** The account as the server saved it, with the new number. */
  onSaved: (user: User) => void;
}

/**
 * Changing the number someone is reached on asks for the number it is today, typed, the way deleting a repository asks for its
 * name. A stray click or an unattended screen cannot do it. The server checks the typed number too, so this is not the only guard.
 */
export default function ConfirmPhoneChangeDialog({ open, currentPhone, onClose, onSaved }: Props) {
  const { t } = useLanguage();
  const { getErrorMessage } = useApiError();
  const shown = formatRwandaMobile(currentPhone);
  const [next, setNext] = useState('');
  const [typed, setTyped] = useState('');
  const [nextError, setNextError] = useState('');
  const [typedError, setTypedError] = useState('');
  const [busy, setBusy] = useState(false);

  // A dialog opened again starts empty, not with what was typed last time.
  useEffect(() => {
    if (!open) return;
    setNext('');
    setTyped('');
    setNextError('');
    setTypedError('');
    setBusy(false);
  }, [open]);

  const confirmed = samePhone(typed, currentPhone);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!confirmed || busy) return;
    const number = next.trim();
    if (!number) {
      setNextError(t('erPhoneRequired'));
      return;
    }
    if (samePhone(number, currentPhone)) {
      setNextError(t('cpSame'));
      return;
    }
    setBusy(true);
    try {
      const res = await authService.updateProfile({ phone: number, confirmPhone: typed.trim() });
      onSaved(res.data.data);
    } catch (err) {
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
      const aboutTheNumber = phoneFieldError(err, t);
      if (code === 'phone_confirm_mismatch') setTypedError(t('erPhoneConfirm'));
      else if (aboutTheNumber) setNextError(aboutTheNumber);
      else setNextError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('cpTitle')}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t('btnCancel')}</button>
          <button type="submit" form="cp-form" className="btn btn-primary" disabled={!confirmed || busy}>
            {busy ? <><span className="spinner" />{t('pfSaving')}</> : t('cpSubmit')}
          </button>
        </>
      )}
    >
      <form id="cp-form" onSubmit={submit} noValidate>
        <div className="form-group">
          <label className="form-label" htmlFor="cp-new">{t('cpNew')}</label>
          <input
            id="cp-new"
            className="form-input"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            maxLength={40}
            placeholder="0733 000 000"
            value={next}
            onChange={(e) => { setNext(e.target.value); setNextError(''); }}
            aria-invalid={nextError ? true : undefined}
            aria-describedby={nextError ? 'cp-new-error' : undefined}
          />
          {nextError ? <span id="cp-new-error" className="form-error" role="alert">{nextError}</span> : null}
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="cp-confirm">{fill(t('cpConfirm'), { number: shown })}</label>
          <input
            id="cp-confirm"
            className="form-input"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            maxLength={40}
            value={typed}
            onChange={(e) => { setTyped(e.target.value); setTypedError(''); }}
            aria-invalid={typedError ? true : undefined}
            aria-describedby={typedError ? 'cp-confirm-error cp-confirm-why' : 'cp-confirm-why'}
          />
          {typedError ? <span id="cp-confirm-error" className="form-error" role="alert">{typedError}</span> : null}
          <span id="cp-confirm-why" className="form-hint">{t('cpWhy')}</span>
        </div>
      </form>
    </Modal>
  );
}
