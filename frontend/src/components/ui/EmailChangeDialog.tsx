import { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useApiError } from '../../hooks/useApiError';
import { accountService, EmailChangePending } from '../../services/account.service';
import { fill } from '../../utils/fill';
import ConfirmByTypingDialog from './ConfirmByTypingDialog';

interface Props {
  open: boolean;
  /** The login email now. The person types it to confirm. */
  currentEmail: string;
  onClose: () => void;
  /** The request the server made. Nothing has changed yet: a link went to the new address. */
  onStarted: (change: EmailChangePending) => void;
}

/** What the server said about one field, in the language of the screen, or '' when it said nothing about it. */
function about(err: unknown, field: string): string {
  const errors = (err as { response?: { data?: { errors?: Record<string, unknown> } } })?.response?.data?.errors;
  const sentences = errors?.[field];
  return Array.isArray(sentences) && sentences.length > 0 ? String(sentences[0]) : '';
}

/**
 * Asks to change the login email. The person types their current email and gives their password, as GitHub asks before
 * something that locks people out. The login changes only when the link sent to the new address is opened.
 */
export default function EmailChangeDialog({ open, currentEmail, onClose, onStarted }: Props) {
  const { t } = useLanguage();
  const { getErrorMessage } = useApiError();
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newError, setNewError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [typedError, setTypedError] = useState('');
  const [alert, setAlert] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNewEmail('');
    setPassword('');
    setNewError('');
    setPasswordError('');
    setTypedError('');
    setAlert('');
    setBusy(false);
  }, [open]);

  const submit = async (typed: string) => {
    setBusy(true);
    setAlert('');
    try {
      const res = await accountService.startEmailChange({ newEmail: newEmail.trim(), confirmEmail: typed.trim(), password });
      onStarted(res.data.data);
    } catch (err) {
      const forNew = about(err, 'newEmail');
      const forPassword = about(err, 'password');
      const forTyped = about(err, 'confirmEmail');
      setNewError(forNew);
      setPasswordError(forPassword);
      setTypedError(forTyped);
      if (!forNew && !forPassword && !forTyped) setAlert(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmByTypingDialog
      open={open}
      title={t('ecTitle')}
      intro={<p className="form-hint">{t('ecIntro')}</p>}
      confirmLabel={fill(t('ecConfirm'), { email: currentEmail })}
      expected={currentEmail}
      typedError={typedError}
      onTypedEdit={() => setTypedError('')}
      submitLabel={t('ecSubmit')}
      busyLabel={t('ecBusy')}
      busy={busy}
      canSubmit={newEmail.trim() !== '' && password !== ''}
      onSubmit={submit}
      onClose={onClose}
    >
      {alert ? <div className="alert alert-error" role="alert">{alert}</div> : null}
      <div className="form-group">
        <label className="form-label" htmlFor="ec-new">{t('ecNew')}</label>
        <input
          id="ec-new"
          className="form-input"
          type="email"
          autoComplete="off"
          maxLength={254}
          value={newEmail}
          onChange={(e) => { setNewEmail(e.target.value); setNewError(''); }}
          aria-invalid={newError ? true : undefined}
          aria-describedby={newError ? 'ec-new-error' : undefined}
        />
        {newError ? <span id="ec-new-error" className="form-error" role="alert">{newError}</span> : null}
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="ec-password">{t('ecPassword')}</label>
        <input
          id="ec-password"
          className="form-input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }}
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordError ? 'ec-password-error' : undefined}
        />
        {passwordError ? <span id="ec-password-error" className="form-error" role="alert">{passwordError}</span> : null}
      </div>
    </ConfirmByTypingDialog>
  );
}
