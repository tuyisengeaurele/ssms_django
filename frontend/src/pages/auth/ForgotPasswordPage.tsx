import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { authService } from '../../services/auth.service';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { AuthAlert, AuthButton, AuthField, AuthShell } from '../../landing/auth/AuthShell';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const { getErrorMessage } = useApiError();
  const { t } = useLanguage();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authService.requestPasswordReset({ email });
      setSent(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthShell
        title={t('forgotCheckInbox')}
        subtitle={
          <>
            If <strong>{email}</strong> is registered, a password reset link will arrive within a few minutes.
          </>
        }
      >
        <div className="l-auth__status">
          <p className="l-auth__note">Did not get it? Check your spam folder, or try again.</p>
          <Link to="/login" className="l-auth__submit">
            <span aria-hidden="true">&larr;</span> Back to login
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('forgotTitle')} subtitle="Enter the email address linked to your account.">
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
        <AuthButton loading={loading} loadingLabel={t('forgotSending')}>
          {t('forgotSendLink')}
        </AuthButton>
      </form>

      <p className="l-auth__alt">
        {t('forgotRemember')}{' '}
        <Link className="l-auth__link" to="/login">
          {t('loginSignIn')}
        </Link>
      </p>
    </AuthShell>
  );
}
