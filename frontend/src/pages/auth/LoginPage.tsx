import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../../services/auth.service';
import { useAuth } from '../../context/AuthContext';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { AuthAlert, AuthButton, AuthField, AuthShell } from '../../landing/auth/AuthShell';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { getErrorMessage } = useApiError();
  const { t } = useLanguage();
  // Set when a saved session could not be renewed. Shown once.
  const [sessionEnded] = useState(() => {
    try {
      const found = sessionStorage.getItem('ssms_notice') === 'session_ended';
      sessionStorage.removeItem('ssms_notice');
      return found;
    } catch {
      return false;
    }
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authService.login({ email, password });
      const { user, token } = res.data.data;
      login(user, token);
      const path = user.role === 'ADMIN' ? '/admin' : user.role === 'SUPERVISOR' ? '/supervisor' : '/farmer';
      navigate(path, { replace: true });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || '';
      if (msg === 'email_not_verified') {
        navigate(`/check-email?email=${encodeURIComponent(email)}`, { replace: true });
        return;
      }
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title={t('loginWelcome')} subtitle={t('loginSubtitle')}>
      {sessionEnded && !error ? (
        <p className="l-auth__note l-auth__note--gap" role="status">
          {t('loginSessionEnded')}
        </p>
      ) : null}
      {error ? <AuthAlert>{error}</AuthAlert> : null}

      <form onSubmit={handleSubmit}>
        <AuthField
          id="email"
          label={t('loginEmailLabel')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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

      <p className="l-auth__alt">
        {t('loginNoAccount')}{' '}
        <Link className="l-auth__link" to="/register">
          {t('loginCreateAccount')}
        </Link>
      </p>
    </AuthShell>
  );
}
