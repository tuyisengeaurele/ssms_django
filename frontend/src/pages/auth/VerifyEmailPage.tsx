import { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { authService } from '../../services/auth.service';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { AuthShell } from '../../landing/auth/AuthShell';

type Status = 'loading' | 'success' | 'error';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const uid = params.get('uid') || '';
  const token = params.get('token') || '';
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  useEffect(() => {
    if (!uid || !token) {
      setStatus('error');
      setMessage(t('verifyEmailInvalidLink'));
      return;
    }

    let redirect: ReturnType<typeof setTimeout> | undefined;
    authService.verifyEmail({ uid, token })
      .then((res) => {
        const { user, token: jwt } = res.data.data;
        login(user, jwt);
        setStatus('success');
        redirect = setTimeout(() => {
          const path = user.role === 'ADMIN' ? '/admin' : user.role === 'SUPERVISOR' ? '/supervisor' : '/farmer';
          navigate(path, { replace: true });
        }, 2500);
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err?.response?.data?.message || t('verifyEmailExpired'));
      });
    return () => clearTimeout(redirect);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'loading') {
    return (
      <AuthShell title={t('verifyEmailVerifying')} subtitle={t('verifyEmailWait')}>
        <p className="l-auth__status" role="status">
          <span className="l-auth__spinner l-auth__spinner--dark" aria-hidden="true" />
        </p>
      </AuthShell>
    );
  }

  if (status === 'success') {
    return (
      <AuthShell title={t('verifyEmailSuccess')} subtitle={t('verifyEmailRedirecting')}>
        <div className="l-auth__badge" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('verifyEmailFailed')} subtitle={message}>
      <div className="l-auth__actions">
        <Link to="/check-email" className="l-auth__ghost">
          {t('verifyEmailResendLink')}
        </Link>
        <Link to="/login" className="l-auth__submit">
          {t('loginSignIn')}
        </Link>
      </div>
    </AuthShell>
  );
}
