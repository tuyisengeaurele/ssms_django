import { FormEvent, useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useApiError } from '../../hooks/useApiError';
import { adminService } from '../../services/admin.service';
import type { User } from '../../types';
import { fill } from '../../utils/fill';
import { formatRwandaMobile, phoneFieldError, samePhone } from '../../utils/phone';
import Modal from './Modal';

interface Props {
  open: boolean;
  user: User | null;
  onClose: () => void;
  /** The person as the server saved them, and what was done. */
  onSaved: (user: User, what: 'saved' | 'cleared') => void;
}

/**
 * The SSMS team sets or clears the number of someone else. There is no typed confirmation here, because this is the way
 * back for a number taken by mistake. Clearing asks once, because it sends the person to the "add your number" screen.
 */
export default function AdminPhoneDialog({ open, user, onClose, onSaved }: Props) {
  const { t } = useLanguage();
  const { getErrorMessage } = useApiError();
  const [next, setNext] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [error, setError] = useState('');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNext('');
    setFieldError('');
    setError('');
    setAsking(false);
    setBusy(false);
  }, [open, user?.id]);

  if (!user) return null;

  const send = async (phone: string | null, what: 'saved' | 'cleared') => {
    setBusy(true);
    setError('');
    try {
      const res = await adminService.setPhone(user.id, phone);
      onSaved(res.data.data, what);
    } catch (err) {
      const aboutTheNumber = phoneFieldError(err, t);
      if (aboutTheNumber) setFieldError(aboutTheNumber);
      else setError(getErrorMessage(err));
      setAsking(false);
    } finally {
      setBusy(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    const number = next.trim();
    if (!number || busy) return;
    if (samePhone(number, user.phone)) {
      setFieldError(t('apSame'));
      return;
    }
    void send(number, 'saved');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={fill(t('apTitle'), { name: user.name })}
      footer={asking ? (
        <>
          <button type="button" className="btn btn-secondary" onClick={() => setAsking(false)} disabled={busy}>{t('apKeep')}</button>
          <button type="button" className="btn btn-danger" onClick={() => void send(null, 'cleared')} disabled={busy}>
            {busy ? <><span className="spinner" />{t('pfSaving')}</> : t('apClearYes')}
          </button>
        </>
      ) : (
        <>
          {user.phone ? (
            <button type="button" className="btn btn-ghost btn-quiet-danger" onClick={() => setAsking(true)} disabled={busy}>{t('apClear')}</button>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>{t('btnCancel')}</button>
          <button type="submit" form="ap-form" className="btn btn-primary" disabled={!next.trim() || busy}>
            {busy ? <><span className="spinner" />{t('pfSaving')}</> : t('apSave')}
          </button>
        </>
      )}
    >
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      <p className="form-group">
        <span className="form-label">{t('apCurrent')}</span>
        <span className="form-static">{user.phone ? formatRwandaMobile(user.phone) : t('apNone')}</span>
      </p>
      {asking ? (
        <p>{fill(t('apClearAsk'), { name: user.name })}</p>
      ) : (
        <form id="ap-form" onSubmit={save} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="ap-new">{t('apNew')}</label>
            <input
              id="ap-new"
              className="form-input"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              maxLength={40}
              placeholder="0733000000"
              value={next}
              onChange={(e) => { setNext(e.target.value); setFieldError(''); }}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? 'ap-new-error' : undefined}
            />
            {fieldError ? <span id="ap-new-error" className="form-error" role="alert">{fieldError}</span> : null}
          </div>
        </form>
      )}
    </Modal>
  );
}
