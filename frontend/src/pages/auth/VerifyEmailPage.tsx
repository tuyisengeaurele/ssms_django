import { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { authService } from '../../services/auth.service';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

type Status = 'loading' | 'success' | 'error';

export default function VerifyEmailPage() {
  const [params]  = useSearchParams();
  const uid       = params.get('uid')   || '';
  const token     = params.get('token') || '';
  const [status,  setStatus]  = useState<Status>('loading');
  const [message, setMessage] = useState('');
  const { login } = useAuth();
  const navigate  = useNavigate();
  const { t }     = useLanguage();

  useEffect(() => {
    if (!uid || !token) {
      setStatus('error');
      setMessage(t('verifyEmailInvalidLink'));
      return;
    }

    authService.verifyEmail({ uid, token })
      .then(res => {
        const { user, token: jwt, refreshToken } = res.data.data;
        login(user, jwt, refreshToken);
        setStatus('success');
        setTimeout(() => {
          const path = user.role === 'ADMIN' ? '/admin' : user.role === 'SUPERVISOR' ? '/supervisor' : '/farmer';
          navigate(path, { replace: true });
        }, 2500);
      })
      .catch(err => {
        const msg = err?.response?.data?.message || t('verifyEmailExpired');
        setStatus('error');
        setMessage(msg);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg, #f8faf9)', padding: '2rem' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        style={{ maxWidth: 440, width: '100%', background: 'var(--surface)', borderRadius: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '3rem 2.5rem', textAlign: 'center' }}
      >
        {status === 'loading' && (
          <>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
              <span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
            </div>
            <h2 style={{ fontWeight: 800, fontSize: '1.3rem', color: 'var(--text)', marginBottom: '0.5rem' }}>
              {t('verifyEmailVerifying')}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              {t('verifyEmailWait')}
            </p>
          </>
        )}

        {status === 'success' && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h2 style={{ fontWeight: 800, fontSize: '1.4rem', color: 'var(--text)', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
              {t('verifyEmailSuccess')}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.6 }}>
              {t('verifyEmailRedirecting')}
            </p>
          </motion.div>
        )}

        {status === 'error' && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <h2 style={{ fontWeight: 800, fontSize: '1.4rem', color: 'var(--text)', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
              {t('verifyEmailFailed')}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1.75rem' }}>
              {message}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link
                to="/check-email"
                style={{ padding: '0.6rem 1.25rem', borderRadius: 10, border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text)', fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none' }}
              >
                {t('verifyEmailResendLink')}
              </Link>
              <Link
                to="/login"
                style={{ padding: '0.6rem 1.25rem', borderRadius: 10, background: 'var(--brand-600, #16a34a)', color: '#fff', fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none' }}
              >
                {t('loginSignIn')}
              </Link>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
