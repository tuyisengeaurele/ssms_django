import { useEffect, useState, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../../services/auth.service';
import { collectDeviceHints } from '../../services/clientHints';
import MfaCodeStep from '../../components/auth/MfaCodeStep';
import MfaSetup from '../../components/auth/MfaSetup';
import type { SignInDetails } from '../../services/mfa.service';
import { isMfaRequired, type MfaRequired, type User } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { AuthAlert, AuthButton, AuthField, AuthShell } from '../../landing/auth/AuthShell';
import GoogleButton from '../../landing/auth/GoogleButton';
import { homePathFor } from '../../utils/roleHome';

const NOTICE_WORDS: Record<string, string> = {
  account_ready: 'loginAccountReady',
  session_ended: 'loginSessionEnded',
  session_idle: 'loginSessionIdle',
};

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
      return found === 'session_ended' || found === 'session_idle' || found === 'account_ready' ? found : null;
    } catch {
      return null;
    }
  });

  // Shown once. It is removed after the page has drawn, because a page that is drawn twice (as React does while
  // developing) would otherwise read it the second time with nothing left.
  useEffect(() => {
    try {
      sessionStorage.removeItem('ssms_notice');
    } catch {
      // Nothing to remove.
    }
  }, []);

  const [shared, setShared] = useState(false);
  // An admin's password is only the first step. This holds the next step and what the sign in needs to carry over.
  const [second, setSecond] = useState<MfaRequired['mfa'] | null>(null);
  const [carried, setCarried] = useState<SignInDetails>({});

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

  const finishSignIn = (user: User, token: string) => {
    login(user, token);
    // Coming back from an invitation link, the person returns to it. Only that kind of address is followed.
    const next = params.get('next') ?? '';
    const path = /^\/join\/[A-Za-z0-9_-]+$/.test(next) ? next : homePathFor(user.role);
    navigate(path, { replace: true });
  };

  /** The challenge is gone. Back to the password step, with what was typed still there, and the reason. */
  const backToPassword = (message: string) => {
    setSecond(null);
    setError(message);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    forgetUnverified();
    setLoading(true);
    try {
      // The browser may say which phone this is. A sign in never waits long for it, and never fails because of it.
      const device = await collectDeviceHints().catch(() => ({ installed: false }));
      const res = await authService.login({ email, password, device, sharedDevice: shared });
      const data = res.data.data;
      if (isMfaRequired(data)) {
        setCarried({ device, sharedDevice: shared });
        setSecond(data.mfa);
        return;
      }
      finishSignIn(data.user, data.token);
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

  if (second) {
    const setup = second.step === 'setup';
    return (
      <AuthShell title={t(setup ? 'adMfaSetupTitle' : 'adMfaCodeTitle')} subtitle={setup ? undefined : t('adMfaCodeHint')}>
        {setup ? (
          <MfaSetup challenge={second.challenge} {...carried} onSignedIn={finishSignIn} onExpired={backToPassword} />
        ) : (
          <MfaCodeStep challenge={second.challenge} {...carried} onSignedIn={finishSignIn} onExpired={backToPassword} />
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('loginWelcome')} subtitle={t('loginSubtitle')}>
      {notice && !error ? (
        <p className="l-auth__note l-auth__note--gap" role="status">
          {t(NOTICE_WORDS[notice] ?? 'loginSessionEnded')}
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
        <div className="l-check">
          <input id="shared-device" type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} aria-describedby="shared-device-hint" />
          <label htmlFor="shared-device">
            {t('loginShared')}
            <span id="shared-device-hint" className="l-check__hint">{t('loginSharedHint')}</span>
          </label>
        </div>
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
