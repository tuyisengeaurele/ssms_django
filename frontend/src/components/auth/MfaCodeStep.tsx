import { FormEvent, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useApiError } from '../../hooks/useApiError';
import { AuthAlert, AuthButton, AuthField } from '../../landing/auth/AuthShell';
import { mfaService, type SignInDetails } from '../../services/mfa.service';
import type { User } from '../../types';
import { mfaFailure, plain } from './mfaErrors';

interface Props extends SignInDetails {
  challenge: string;
  onSignedIn: (user: User, token: string) => void;
  /** The challenge is gone. The page goes back to the password step and shows this message. */
  onExpired: (message: string) => void;
}

/** The second step for an admin whose authenticator app is on: the 6 digit code, or a recovery code. */
export default function MfaCodeStep({ challenge, device, sharedDevice, onSignedIn, onExpired }: Props) {
  const { t } = useLanguage();
  const { getErrorMessage } = useApiError();
  const [recovery, setRecovery] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const given = recovery ? { recoveryCode: value.trim() } : { code: plain(value) };
      const res = await mfaService.verify({ challenge, ...given, device, sharedDevice });
      const { user, token } = res.data.data;
      onSignedIn(user, token);
    } catch (err: unknown) {
      const kind = mfaFailure(err);
      if (kind === 'expired') onExpired(t('adMfaExpired'));
      else setError(kind === 'wrong' ? t('adMfaWrongCode') : getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const switchKind = () => {
    setRecovery((on) => !on);
    setValue('');
    setError('');
  };

  return (
    <>
      {error ? <AuthAlert>{error}</AuthAlert> : null}
      <form onSubmit={handleSubmit}>
        {recovery ? (
          <AuthField
            id="mfa-recovery"
            label={t('adMfaRecoveryLabel')}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
            autoFocus
          />
        ) : (
          <AuthField
            id="mfa-code"
            label={t('adMfaCodeLabel')}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            autoFocus
          />
        )}
        <AuthButton loading={loading} loadingLabel={t('adMfaVerifying')}>
          {t('adMfaVerify')}
        </AuthButton>
      </form>
      <button type="button" className="l-auth__ghost" onClick={switchKind}>
        {recovery ? t('adMfaUseApp') : t('adMfaUseRecovery')}
      </button>
    </>
  );
}
