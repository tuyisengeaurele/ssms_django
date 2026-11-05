import { FormEvent, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useApiError } from '../../hooks/useApiError';
import { authService } from '../../services/auth.service';
import { setAccessToken } from '../../services/session';
import Panel from '../../components/ui/Panel';
import SignedInDevices from '../shared/SignedInDevices';
import MfaSettings from './MfaSettings';

/** The password, and the places the account is signed in. */
export default function SecuritySettings() {
  const { success } = useToast();
  const { getErrorMessage } = useApiError();
  const { t } = useLanguage();
  const { user } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [changing, setChanging] = useState(false);

  const closePassword = () => {
    setShowPassword(false);
    setCurrent('');
    setNext('');
    setRepeat('');
    setPasswordError('');
  };

  const handlePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    if (next !== repeat) {
      setPasswordError(t('pfMismatch'));
      return;
    }
    setChanging(true);
    try {
      const res = await authService.changePassword({ currentPassword: current, newPassword: next, confirmPassword: repeat });
      // Changing the password signs every other device out and gives this one a fresh session.
      if (res.data.data?.token) setAccessToken(res.data.data.token);
      success(t('pfPasswordChanged'));
      closePassword();
    } catch (err) {
      setPasswordError(getErrorMessage(err));
    } finally {
      setChanging(false);
    }
  };

  return (
    <div className="profile-stack">
      <Panel
        title={t('pfSecurity')}
        note={t('pfSecurityHint')}
        flush={!showPassword}
        actions={
          showPassword ? undefined : (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowPassword(true)}>{t('pfChangePassword')}</button>
          )
        }
      >
        {showPassword ? (
          <form onSubmit={handlePassword}>
            {passwordError && <div className="alert alert-error" role="alert">{passwordError}</div>}
            <div className="form-group">
              <label className="form-label" htmlFor="pf-current">{t('pfFieldCurrent')}</label>
              <input id="pf-current" type="password" className="form-input" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="pf-new">{t('pfFieldNew')}</label>
              <input id="pf-new" type="password" className="form-input" value={next} onChange={(e) => setNext(e.target.value)} required autoComplete="new-password" aria-describedby="pf-new-hint" />
              <span id="pf-new-hint" className="form-hint">{t('pfPasswordHint')}</span>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="pf-repeat">{t('pfFieldRepeat')}</label>
              <input id="pf-repeat" type="password" className="form-input" value={repeat} onChange={(e) => setRepeat(e.target.value)} required autoComplete="new-password" />
            </div>
            <div className="profile-actions">
              <button type="submit" className="btn btn-primary" disabled={changing}>
                {changing ? <><span className="spinner" />{t('pfUpdating')}</> : t('pfUpdatePassword')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={closePassword}>{t('btnCancel')}</button>
            </div>
          </form>
        ) : null}
      </Panel>

      {user?.role === 'ADMIN' ? <MfaSettings /> : null}

      <SignedInDevices />
    </div>
  );
}
