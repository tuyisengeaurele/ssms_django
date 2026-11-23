import { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useApiError } from '../../hooks/useApiError';
import { authService } from '../../services/auth.service';
import type { User } from '../../types';
import { fill } from '../../utils/fill';
import { formatRwandaMobile, phoneFieldError, samePhone } from '../../utils/phone';
import ConfirmByTypingDialog from './ConfirmByTypingDialog';

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
  const [next, setNext] = useState('');
  const [nextError, setNextError] = useState('');
  const [typedError, setTypedError] = useState('');
  const [busy, setBusy] = useState(false);

  // A dialog opened again starts empty, not with what was typed last time.
  useEffect(() => {
    if (!open) return;
    setNext('');
    setNextError('');
    setTypedError('');
    setBusy(false);
  }, [open]);

  const submit = async (typed: string) => {
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
    <ConfirmByTypingDialog
      open={open}
      title={t('cpTitle')}
      confirmLabel={fill(t('cpConfirm'), { number: formatRwandaMobile(currentPhone) })}
      expected={currentPhone}
      matches={samePhone}
      hint={t('cpWhy')}
      typedError={typedError}
      onTypedEdit={() => setTypedError('')}
      submitLabel={t('cpSubmit')}
      busy={busy}
      onSubmit={submit}
      onClose={onClose}
    >
      <div className="form-group">
        <label className="form-label" htmlFor="cp-new">{t('cpNew')}</label>
        <input
          id="cp-new"
          className="form-input"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          maxLength={40}
          placeholder="0733000000"
          value={next}
          onChange={(e) => { setNext(e.target.value); setNextError(''); }}
          aria-invalid={nextError ? true : undefined}
          aria-describedby={nextError ? 'cp-new-error' : undefined}
        />
        {nextError ? <span id="cp-new-error" className="form-error" role="alert">{nextError}</span> : null}
      </div>
    </ConfirmByTypingDialog>
  );
}
