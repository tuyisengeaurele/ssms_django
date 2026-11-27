import { FormEvent, useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useApiError } from '../../hooks/useApiError';
import { mfaService } from '../../services/mfa.service';
import CodeInput from '../ui/CodeInput';
import { Icon } from '../ui/Icon';
import Modal from '../ui/Modal';
import { plain } from './mfaErrors';

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

const CODE_LENGTH = 6;

/** Turning two-step sign in off: the password, and a code from the app or a recovery code. */
export default function TurnOffTwoStepDialog({ open, onClose, onDone }: Props) {
  const { t } = useLanguage();
  const { getErrorMessage } = useApiError();
  const [password, setPassword] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Nothing typed is kept once the dialog is gone.
  useEffect(() => {
    if (open) return;
    setPassword('');
    setRecovery(false);
    setValue('');
    setError('');
  }, [open]);

  const ready = Boolean(password) && (recovery ? value.trim().length > 0 : value.length >= CODE_LENGTH);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setError('');
    setBusy(true);
    try {
      await mfaService.disable(recovery ? { password, recoveryCode: value.trim() } : { password, code: plain(value) });
      onDone();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('mfaTurnOffTitle')}
      dismissible={!busy}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>{t('btnCancel')}</button>
          <button type="submit" form="two-step-off" className="btn btn-danger" disabled={!ready || busy}>
            {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="deactivate" size={14} />}
            {t('mfaTurnOff')}
          </button>
        </>
      }
    >
      <form id="two-step-off" className="two-step" onSubmit={submit}>
        {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
        <p className="modal-text">{t('mfaOthersOut')}</p>
        <div className="form-group">
          <label className="form-label" htmlFor="two-step-off-password">{t('mfaPassword')}</label>
          <input
            id="two-step-off-password"
            type="password"
            className="form-input"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="two-step-off-code">{t(recovery ? 'adMfaRecoveryLabel' : 'adMfaCodeLabel')}</label>
          {recovery ? (
            <input
              id="two-step-off-code"
              className="form-input"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          ) : (
            <CodeInput id="two-step-off-code" value={value} invalid={Boolean(error)} onChange={(next) => { setValue(next); setError(''); }} />
          )}
        </div>
        <button type="button" className="btn btn-secondary btn-sm two-step__switch" onClick={() => { setRecovery((on) => !on); setValue(''); setError(''); }}>
          {t(recovery ? 'adMfaUseApp' : 'adMfaUseRecovery')}
        </button>
      </form>
    </Modal>
  );
}
