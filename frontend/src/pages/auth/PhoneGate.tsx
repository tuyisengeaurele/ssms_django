import { FormEvent, useState } from 'react';
import { authService } from '../../services/auth.service';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useApiError } from '../../hooks/useApiError';
import { AuthAlert, AuthButton, AuthField, AuthShell } from '../../landing/auth/AuthShell';
import { phoneFieldError } from '../../utils/phone';

/**
 * Shown instead of the app to a person whose account has no phone number: accounts made before the number was required, and
 * accounts whose number the SSMS team cleared. Saving it hands the account back to the app, which then shows the page
 * the person asked for. The server refuses everything else to such an account, so this is the only way on.
 */
export default function PhoneGate() {
  const { t } = useLanguage();
  const { updateUser, logout } = useAuth();
  const { getErrorMessage } = useApiError();
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const number = phone.trim();
    if (!number) {
      setPhoneError(t('erPhoneRequired'));
      return;
    }
    setError('');
    setPhoneError('');
    setBusy(true);
    try {
      const res = await authService.updateProfile({ phone: number });
      updateUser(res.data.data);
    } catch (err) {
      const aboutThePhone = phoneFieldError(err, t);
      if (aboutThePhone) setPhoneError(aboutThePhone);
      else setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('gateTitle')} subtitle={t('gateIntro')}>
      {error ? <AuthAlert>{error}</AuthAlert> : null}
      <form onSubmit={save}>
        <AuthField
          id="gate-phone"
          label={t('pnLabel')}
          hint={t('pnHint')}
          error={phoneError}
          aria-required="true"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0788 123 456"
          value={phone}
          onChange={(e) => { setPhone(e.target.value); setPhoneError(''); }}
        />
        <AuthButton loading={busy} loadingLabel={t('gateSave')}>{t('gateSave')}</AuthButton>
      </form>
      <p className="l-auth__alt">
        <button type="button" className="l-auth__link" onClick={logout}>{t('sdSignOut')}</button>
      </p>
    </AuthShell>
  );
}
