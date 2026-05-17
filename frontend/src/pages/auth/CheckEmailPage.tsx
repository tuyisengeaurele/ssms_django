import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { authService } from '../../services/auth.service';
import { useLanguage } from '../../context/LanguageContext';

export default function CheckEmailPage() {
  const [params] = useSearchParams();
  const email = params.get('email') || '';
  const [resending, setResending]   = useState(false);
  const [resent,    setResent]      = useState(false);
  const [resendErr, setResendErr]   = useState('');
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
    <div className="auth-layout">
      {/* Left panel */}
      <div className="auth-panel-left">
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: '-80px', right: '-80px', width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.03)' }} />
          <div style={{ position: 'absolute', bottom: '-60px', left: '-60px', width: 240, height: 240, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 380 }}
        >
          <img src="/logo.png" alt="SSMS Logo" style={{ width: 90, height: 90, objectFit: 'contain', marginBottom: '1.5rem', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.3))' }} />
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: '0.625rem' }}>
            {t('checkEmailTitle')}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.875rem', lineHeight: 1.6 }}>
            {t('checkEmailDesc')}
          </p>
        </motion.div>
      </div>

      {/* Right panel */}
      <div className="auth-panel-right">
        <motion.div
          className="auth-card"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            {/* Email icon */}
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>

            <h2 style={{ fontWeight: 800, fontSize: '1.4rem', marginBottom: '0.625rem', color: 'var(--text)', letterSpacing: '-0.02em' }}>
              {t('checkEmailHeading')}
            </h2>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.65, marginBottom: '0.5rem' }}>
              {t('checkEmailSent')}
            </p>
            {email && (
              <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
                {email}
              </p>
            )}
            <p style={{ color: 'var(--text-faint)', fontSize: '0.8rem', lineHeight: 1.6, marginBottom: '1.75rem' }}>
              {t('checkEmailSpam')}
            </p>

            {/* Resend */}
            {resent ? (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ fontSize: '0.85rem', color: '#16a34a', fontWeight: 600, marginBottom: '1.5rem' }}
              >
                ✓ {t('checkEmailResentOk')}
              </motion.p>
            ) : (
              <div style={{ marginBottom: '1.5rem' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  {t('checkEmailNoEmail')}
                </p>
                {resendErr && (
                  <p style={{ fontSize: '0.8rem', color: '#dc2626', marginBottom: '0.5rem' }}>{resendErr}</p>
                )}
                <button
                  onClick={handleResend}
                  disabled={resending || !email}
                  style={{
                    background: 'none', border: '1.5px solid var(--border)', borderRadius: 10,
                    padding: '0.5rem 1.25rem', fontSize: '0.875rem', fontWeight: 600,
                    color: 'var(--text)', cursor: email ? 'pointer' : 'default', opacity: resending ? 0.6 : 1,
                  }}
                >
                  {resending ? <><span className="spinner" />{t('checkEmailResending')}</> : t('checkEmailResend')}
                </button>
              </div>
            )}

            <Link to="/login" className="btn btn-primary btn-full">
              ← {t('loginSignIn')}
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
