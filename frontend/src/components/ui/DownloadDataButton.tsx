import { FormEvent, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';
import { accountService } from '../../services/account.service';
import Modal from './Modal';

/** What the server said about the password, in the language of the screen, or '' when it said nothing about it. */
function aboutPassword(err: unknown): string {
  const errors = (err as { response?: { data?: { errors?: Record<string, unknown> } } })?.response?.data?.errors;
  const sentences = errors?.password;
  return Array.isArray(sentences) && sentences.length > 0 ? String(sentences[0]) : '';
}

/** A button that asks for the password, then saves one file with everything SSMS holds about the person. */
export default function DownloadDataButton() {
  const { t } = useLanguage();
  const { success } = useToast();
  const { getErrorMessage } = useApiError();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [alert, setAlert] = useState('');
  const [busy, setBusy] = useState(false);

  const show = () => {
    setPassword('');
    setPasswordError('');
    setAlert('');
    setBusy(false);
    setOpen(true);
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setAlert('');
    try {
      await accountService.downloadMyData(password);
      setOpen(false);
      success(t('ddDone'));
    } catch (err) {
      const forPassword = aboutPassword(err);
      setPasswordError(forPassword);
      if (!forPassword) setAlert(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={show}>{t('ddOpen')}</button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('ddTitle')}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} disabled={busy}>{t('btnCancel')}</button>
            <button type="submit" form="dd-form" className="btn btn-primary" disabled={!password || busy}>
              {busy ? <><span className="spinner" />{t('ddBusy')}</> : t('ddSubmit')}
            </button>
          </>
        )}
      >
        <p className="form-hint form-hint--gap">{t('ddIntro')}</p>
        {alert ? <div className="alert alert-error" role="alert">{alert}</div> : null}
        <form id="dd-form" onSubmit={submit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="dd-password">{t('ddPassword')}</label>
            <input
              id="dd-password"
              className="form-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }}
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={passwordError ? 'dd-password-error' : undefined}
            />
            {passwordError ? <span id="dd-password-error" className="form-error" role="alert">{passwordError}</span> : null}
          </div>
        </form>
      </Modal>
    </>
  );
}
