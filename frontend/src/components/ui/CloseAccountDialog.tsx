import { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useApiError } from '../../hooks/useApiError';
import { accountService } from '../../services/account.service';
import { fill } from '../../utils/fill';
import ConfirmByTypingDialog from './ConfirmByTypingDialog';

interface Props {
  open: boolean;
  /** The login email. The person types it to confirm. */
  email: string;
  /** How many batches are still running, when that is known. Only a number above zero is said. */
  openBatches?: number;
  onClose: () => void;
  /** The day the account will be removed (YYYY-MM-DD), once the server has scheduled it. */
  onClosed: (deletionDate: string) => void;
}

/** What the server said about one field, in the language of the screen, or '' when it said nothing about it. */
function about(err: unknown, field: string): string {
  const errors = (err as { response?: { data?: { errors?: Record<string, unknown> } } })?.response?.data?.errors;
  const sentences = errors?.[field];
  return Array.isArray(sentences) && sentences.length > 0 ? String(sentences[0]) : '';
}

/**
 * A farmer closes their own account. The dialog lists what happens, then asks for the email typed out and the password, the
 * way GitHub asks before it deletes something. The server schedules the removal thirty days on, and until then the farmer can
 * take it back, so nothing here is final.
 */
export default function CloseAccountDialog({ open, email, openBatches, onClose, onClosed }: Props) {
  const { t, tn } = useLanguage();
  const { getErrorMessage } = useApiError();
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [typedError, setTypedError] = useState('');
  const [alert, setAlert] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPassword('');
    setPasswordError('');
    setTypedError('');
    setAlert('');
    setBusy(false);
  }, [open]);

  const submit = async (typed: string) => {
    setBusy(true);
    setAlert('');
    try {
      const res = await accountService.closeAccount({ confirmEmail: typed.trim(), password });
      onClosed(res.data.data.deletionDate);
    } catch (err) {
      const forPassword = about(err, 'password');
      const forTyped = about(err, 'confirmEmail');
      setPasswordError(forPassword);
      setTypedError(forTyped);
      if (!forPassword && !forTyped) setAlert(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmByTypingDialog
      open={open}
      title={t('caTitle')}
      intro={(
        <>
          <p className="form-hint">{t('caIntro')}</p>
          <ul className="cbt-list">
            <li>{t('caWhat1')}</li>
            <li>{t('caWhat2')}</li>
            <li>{t('caWhat3')}</li>
            <li>{t('caWhat4')}</li>
            {openBatches ? <li>{tn(openBatches, 'caWhat5One', 'caWhat5', { n: openBatches })}</li> : null}
          </ul>
          <p className="form-hint">{t('caNote')}</p>
        </>
      )}
      confirmLabel={fill(t('caTyped'), { email })}
      expected={email}
      typedError={typedError}
      onTypedEdit={() => setTypedError('')}
      submitLabel={t('caSubmit')}
      busyLabel={t('caBusy')}
      danger
      busy={busy}
      canSubmit={password !== ''}
      onSubmit={submit}
      onClose={onClose}
    >
      {alert ? <div className="alert alert-error" role="alert">{alert}</div> : null}
      <div className="form-group">
        <label className="form-label" htmlFor="ca-password">{t('caPassword')}</label>
        <input
          id="ca-password"
          className="form-input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }}
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordError ? 'ca-password-error' : undefined}
        />
        {passwordError ? <span id="ca-password-error" className="form-error" role="alert">{passwordError}</span> : null}
      </div>
    </ConfirmByTypingDialog>
  );
}
