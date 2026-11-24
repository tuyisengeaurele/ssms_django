import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useApiError } from '../../hooks/useApiError';
import { AuthAlert, AuthButton, AuthShell } from '../../landing/auth/AuthShell';
import { accountService } from '../../services/account.service';
import { dateFormat } from '../../utils/dateFormat';
import { fill } from '../../utils/fill';
import { Icon } from '../../components/ui/Icon';

/**
 * Shown instead of the app to a farmer whose account is scheduled to be removed. The server refuses everything else to such
 * an account, so this is the only way on: keep the account, or sign out and let the date come.
 */
export default function ClosureScheduledPage() {
  const { t, locale } = useLanguage();
  const { user, updateUser, logout } = useAuth();
  const { getErrorMessage } = useApiError();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // The date has no time, so it is read at noon: a viewer in any time zone sees the same day.
  const date = user?.deletionDate ? dateFormat(locale, { dateStyle: 'medium' }).format(new Date(`${user.deletionDate}T12:00:00`)) : '';

  const keep = async () => {
    if (!user) return;
    setError('');
    setBusy(true);
    try {
      await accountService.cancelClosure();
      updateUser({ ...user, deletionDate: null });
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('csTitle')} subtitle={fill(t('csBody'), { date })}>
      {error ? <AuthAlert>{error}</AuthAlert> : null}
      <AuthButton type="button" loading={busy} loadingLabel={t('csKeep')} onClick={keep}>{t('csKeep')}</AuthButton>
      <p className="l-auth__alt">
        <button type="button" className="l-auth__ghost" onClick={logout}><Icon name="logout" size={18} />{t('sdSignOut')}</button>
      </p>
    </AuthShell>
  );
}
