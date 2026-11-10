import { FormEvent, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useLanguage } from '../../context/LanguageContext';
import { AuthAlert, AuthButton } from '../../landing/auth/AuthShell';
import CodeInput from '../ui/CodeInput';
import { mfaService, type SetupStart, type SignInDetails } from '../../services/mfa.service';
import type { User } from '../../types';
import { mfaFailure, plain } from './mfaErrors';
import RecoveryCodes from './RecoveryCodes';

interface Props extends SignInDetails {
  challenge: string;
  onSignedIn: (user: User, token: string) => void;
  /** The challenge is gone. The page goes back to the password step and shows this message. */
  onExpired: (message: string) => void;
}

interface Done {
  user: User;
  token: string;
  codes: string[];
}

/** The first time an admin signs in: install an app, scan the code, type a code, and keep the recovery codes. */
export default function MfaSetup({ challenge, device, sharedDevice, onSignedIn, onExpired }: Props) {
  const { t } = useLanguage();
  const [start, setStart] = useState<SetupStart | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [saved, setSaved] = useState(false);
  // The server makes a new secret every time it is asked, so asking twice (as React does while developing) would leave
  // the screen showing one secret and the server waiting for another.
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    mfaService
      .setupStart(challenge)
      .then((res) => setStart(res.data.data))
      .catch((err: unknown) => {
        if (mfaFailure(err) === 'expired') onExpired(t('adMfaExpired'));
        else setError(t('adMfaStartError'));
      });
  }, [challenge, onExpired, t]);

  const handleConfirm = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await mfaService.setupConfirm({ challenge, code: plain(code), device, sharedDevice });
      const { user, token, recoveryCodes } = res.data.data;
      setDone({ user, token, codes: recoveryCodes });
    } catch (err: unknown) {
      const kind = mfaFailure(err);
      if (kind === 'expired') onExpired(t('adMfaExpired'));
      else setError(t(kind === 'wrong' ? 'adMfaWrongCode' : 'adMfaStartError'));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <section className="l-mfa__done">
        <h2>{t('adMfaStep4Title')}</h2>
        <p>{t('adMfaCodesHint')}</p>
        <RecoveryCodes codes={done.codes} />
        <div className="l-check">
          <input id="mfa-saved" type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          <label htmlFor="mfa-saved">{t('adMfaSavedTick')}</label>
        </div>
        {/* The person cannot see the codes again, so nothing continues until they say they are kept. */}
        <button type="button" className="l-auth__submit" disabled={!saved} onClick={() => onSignedIn(done.user, done.token)}>
          {t('adMfaContinue')}
        </button>
      </section>
    );
  }

  const key = start?.secret.match(/.{1,4}/g)?.join(' ') ?? '';

  return (
    <>
      <p className="l-mfa__intro">{t('adMfaSetupHint')}</p>
      {error ? <AuthAlert>{error}</AuthAlert> : null}
      <ol className="l-mfa__steps">
        <li>
          <h2>{t('adMfaStep1Title')}</h2>
          <p>{t('adMfaStep1Hint')}</p>
        </li>
        {start ? (
          <>
            <li>
              <h2>{t('adMfaStep2Title')}</h2>
              <p>{t('adMfaStep2Hint')}</p>
              <div className="l-mfa__qr" role="img" aria-label={t('adMfaQrLabel')}>
                <QRCodeSVG value={start.otpauthUri} size={176} />
              </div>
              <p className="l-mfa__keylabel">{t('adMfaManualKey')}</p>
              <p className="l-mfa__key">{key}</p>
            </li>
            <li>
              <h2>{t('adMfaStep3Title')}</h2>
              <p>{t('adMfaStep3Hint')}</p>
              <form onSubmit={handleConfirm}>
                <div className="l-field">
                  <div className="l-field__row">
                    <label htmlFor="mfa-setup-code">{t('adMfaCodeLabel')}</label>
                  </div>
                  <CodeInput
                    id="mfa-setup-code"
                    value={code}
                    invalid={Boolean(error)}
                    onChange={(next) => { setCode(next); setError(''); }}
                    required
                  />
                </div>
                <p className="l-mfa__hint">{t('adMfaClockHint')}</p>
                <AuthButton loading={loading} loadingLabel={t('adMfaVerifying')} disabled={code.length < 6}>
                  {t('adMfaConfirm')}
                </AuthButton>
              </form>
            </li>
          </>
        ) : null}
      </ol>
    </>
  );
}
