import { FormEvent, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useLanguage } from '../../context/LanguageContext';
import { useApiError } from '../../hooks/useApiError';
import { mfaService, type SetupStart } from '../../services/mfa.service';
import CodeInput from '../ui/CodeInput';
import { plain } from './mfaErrors';
import RecoveryCodes from './RecoveryCodes';

interface Props {
  onDone: () => void;
  onCancel: () => void;
  /** The code was accepted and the recovery codes are on screen. The dialog around this must stop being closable. */
  onCodesShown?: () => void;
}

const CODE_LENGTH = 6;

/** The code the server answers with when the set-up it began is gone. */
const isStartAgain = (err: unknown) =>
  (err as { response?: { data?: { code?: string } } })?.response?.data?.code === 'mfa_start_again';

/**
 * Turning two-step sign in on from inside the app, as the body of a dialog: the password, the authenticator app, then the
 * recovery codes. It is on once the code is accepted, so from there the only way forward is to keep the codes.
 */
export default function TwoStepSetup({ onDone, onCancel, onCodesShown }: Props) {
  const { t } = useLanguage();
  const { getErrorMessage } = useApiError();
  const [password, setPassword] = useState('');
  const [start, setStart] = useState<SetupStart | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [wrongCode, setWrongCode] = useState(false);
  const [busy, setBusy] = useState(false);

  const askForSecret = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setError('');
    setBusy(true);
    try {
      const res = await mfaService.enrollStart(password);
      setStart(res.data.data);
      // The password has done its work and is not kept around.
      setPassword('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length < CODE_LENGTH || busy) return;
    setError('');
    setWrongCode(false);
    setBusy(true);
    try {
      const res = await mfaService.enrollConfirm(plain(code));
      setCodes(res.data.data.recoveryCodes);
      onCodesShown?.();
    } catch (err) {
      setError(getErrorMessage(err));
      if (isStartAgain(err)) {
        setStart(null);
        setCode('');
      } else {
        setWrongCode(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const problem = error ? <div className="alert alert-error" role="alert">{error}</div> : null;

  if (codes) {
    return (
      <div className="two-step">
        <h3>{t('adMfaStep4Title')}</h3>
        <p className="modal-text">{t('adMfaCodesHint')}</p>
        <RecoveryCodes codes={codes} variant="app" />
        <label className="two-step__tick">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          <span>{t('adMfaSavedTick')}</span>
        </label>
        <div className="two-step__actions">
          <button type="button" className="btn btn-primary" disabled={!saved} onClick={onDone}>{t('adMfaDone')}</button>
        </div>
      </div>
    );
  }

  if (!start) {
    return (
      // A key of its own, so this field is new when the set-up starts again and takes the cursor.
      <form key="password" className="two-step" onSubmit={askForSecret}>
        {problem}
        <p className="modal-text">{t('mfaOthersOut')}</p>
        <div className="form-group">
          <label className="form-label" htmlFor="two-step-password">{t('mfaPassword')}</label>
          <input
            id="two-step-password"
            type="password"
            className="form-input"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </div>
        <div className="two-step__actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>{t('btnCancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={!password || busy}>
            {busy ? <span className="spinner" aria-hidden="true" /> : null}
            {t('adMfaContinue')}
          </button>
        </div>
      </form>
    );
  }

  const key = start.secret.match(/.{1,4}/g)?.join(' ') ?? '';

  return (
    <form key="scan" className="two-step" onSubmit={confirm}>
      {problem}
      <h3>{t('adMfaStep2Title')}</h3>
      <p className="modal-text">{t('adMfaStep1Hint')} {t('adMfaStep2Hint')}</p>
      {/* Dark on white whatever the theme, since a camera reads it that way round. */}
      <div className="two-step__qr" role="img" aria-label={t('adMfaQrLabel')}>
        <QRCodeSVG value={start.otpauthUri} size={168} marginSize={2} bgColor="#ffffff" fgColor="#000000" />
      </div>
      <p className="two-step__keylabel">{t('adMfaManualKey')}</p>
      <p className="two-step__key">{key}</p>
      <div className="form-group">
        <label className="form-label" htmlFor="two-step-code">{t('adMfaCodeLabel')}</label>
        <CodeInput
          id="two-step-code"
          value={code}
          invalid={wrongCode && Boolean(error)}
          onChange={(next) => { setCode(next); setError(''); }}
          required
          autoFocus
        />
      </div>
      {wrongCode ? <p className="form-hint">{t('adMfaClockHint')}</p> : null}
      <div className="two-step__actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>{t('btnCancel')}</button>
        <button type="submit" className="btn btn-primary" disabled={code.length < CODE_LENGTH || busy}>
          {busy ? <span className="spinner" aria-hidden="true" /> : null}
          {t('adMfaConfirm')}
        </button>
      </div>
    </form>
  );
}
