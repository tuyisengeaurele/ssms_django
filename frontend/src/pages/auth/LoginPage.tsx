import { useState, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../../services/auth.service';
import { useAuth } from '../../context/AuthContext';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { AuthAlert, AuthButton, AuthField, AuthShell } from '../../landing/auth/AuthShell';
import GoogleButton from '../../landing/auth/GoogleButton';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // The account exists but its email was never verified. Said here, with a way to get a new link, so nothing typed is lost.
  const [unverified, setUnverified] = useState(false);
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [resendError, setResendError] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { getErrorMessage } = useApiError();
  const { t } = useLanguage();
  // Set when a saved session could not be renewed, or when an account was just made from an invitation. Shown once.
  const [notice] = useState<string | null>(() => {
    try {
      const found = sessionStorage.getItem('ssms_notice');
      sessionStorage.removeItem('ssms_notice');
      return found === 'session_ended' || found === 'account_ready' ? found : null;
    } catch {
      return null;
    }
  });

  const forgetUnverified = () => {
    setUnverified(false);
    setResend('idle');
    setResendError(false);
  };

  const sendNewLink = async () => {
    if (resend !== 'idle') return;
    setResendError(false);
    setResend('sending');
    try {
      await authService.resendVerification(email.trim());
      setResend('sent');
    } catch {
      setResend('idle');
      setResendError(true);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    forgetUnverified();
    setLoading(true);
    try {
      const res = await authService.login({ email, password });
      const { user, token } = res.data.data;
      login(user, token);
      // Coming back from an invitation link, the person returns to it. Only that kind of address is followed.
      const next = params.get('next') ?? '';
      const path = /^\/join\/[A-Za-z0-9_-]+$/.test(next) ? next : user.role === 'ADMIN' ? '/admin' : user.role === 'SUPERVISOR' ? '/supervisor' : '/farmer';
      navigate(path, { replace: true });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || '';
      if (msg === 'email_not_verified') {
        setUnverified(true);
        return;
      }
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title={t('loginWelcome')} subtitle={t('loginSubtitle')}>
      {notice && !error ? (
        <p className="l-auth__note l-auth__note--gap" role="status">
          {t(notice === 'account_ready' ? 'loginAccountReady' : 'loginSessionEnded')}
        </p>
      ) : null}
      {error ? <AuthAlert>{error}</AuthAlert> : null}
      {unverified ? (
        <div className="l-auth__note l-auth__note--gap" role="status">
          <p>{t('loginUnverified')}</p>
          {resend === 'sent' ? (
            <p className="l-auth__ok">{t('loginResent')}</p>
          ) : (
            <button type="button" className="l-auth__ghost" onClick={sendNewLink} disabled={resend === 'sending'}>
              {t(resend === 'sending' ? 'loginSending' : 'loginResend')}
            </button>
          )}
        </div>
      ) : null}
      {resendError ? <AuthAlert>{t('loginResendError')}</AuthAlert> : null}

      <form onSubmit={handleSubmit}>
        <AuthField
          id="email"
          label={t('loginEmailLabel')}
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); forgetUnverified(); }}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        <AuthField
          id="password"
          label={t('loginPasswordLabel')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          aside={
            <Link className="l-auth__link" to="/forgot-password">
              {t('loginForgot')}
            </Link>
          }
        />
        <AuthButton loading={loading} loadingLabel={t('loginSigningIn')}>
          {t('loginSignIn')}
        </AuthButton>
      </form>

      <GoogleButton />

      <p className="l-auth__alt">
        {t('loginNoAccount')}{' '}
        <Link className="l-auth__link" to="/register">
          {t('loginCreateAccount')}
        </Link>
      </p>
    </AuthShell>
  );
}
