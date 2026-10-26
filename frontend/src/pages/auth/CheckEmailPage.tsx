import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authService } from '../../services/auth.service';
import { useLanguage } from '../../context/LanguageContext';
import { AuthAlert, AuthShell } from '../../landing/auth/AuthShell';

export default function CheckEmailPage() {
  const [params] = useSearchParams();
  const email = params.get('email') || '';
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendErr, setResendErr] = useState('');
  const { t } = useLanguage();

  const handleResend = async () => {
    if (!email || resending || resent) return;
    setResendErr('');
    setResending(true);
    try {
      await authService.resendVerification(email);
      setResent(true);
    } catch {
      setResendErr(t('checkEmailResendError'));
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell
      title={t('checkEmailHeading')}
      subtitle={
        <>
          {t('checkEmailSent')} {email ? <strong>{email}</strong> : null}
        </>
      }
    >
      <div className="l-auth__status">
        <p className="l-auth__note">{t('checkEmailSpam')}</p>

        {resendErr ? <AuthAlert>{resendErr}</AuthAlert> : null}

        {resent ? (
          <p className="l-auth__ok" role="status">
            <span aria-hidden="true">&#10003;</span> {t('checkEmailResentOk')}
          </p>
        ) : (
          <button type="button" className="l-auth__ghost" onClick={handleResend} disabled={resending || !email}>
            {resending ? (
              <>
                <span className="l-auth__spinner" aria-hidden="true" />
                {t('checkEmailResending')}
              </>
            ) : (
              t('checkEmailResend')
            )}
          </button>
        )}

        <Link to="/login" className="l-auth__submit">
          <span aria-hidden="true">&larr;</span> {t('loginSignIn')}
        </Link>
      </div>
    </AuthShell>
  );
}
