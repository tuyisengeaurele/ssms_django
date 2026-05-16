import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { authService } from '../../services/auth.service';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');
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
            {t('forgotTitle')}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.875rem', lineHeight: 1.6 }}>
            {t('forgotDesc')}
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
          {sent ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
              <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                  </svg>
                </div>
                <h2 style={{ fontWeight: 800, fontSize: '1.25rem', marginBottom: '0.5rem', color: 'var(--text)' }}>{t('forgotCheckInbox')}</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                  If <strong>{email}</strong> is registered, you'll receive a password reset link within a few minutes.
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-faint)', marginBottom: '1.5rem' }}>
                  Didn't get it? Check your spam folder, or try again.
                </p>
                <Link to="/login" className="btn btn-primary btn-full">← Back to login</Link>
              </div>
            </motion.div>
          ) : (
            <>
              <div style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', marginBottom: '0.375rem' }}>
                  {t('forgotTitle')}
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  Enter the email address linked to your account.
                </p>
              </div>

              {error && (
                <motion.div className="alert alert-error" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {error}
                </motion.div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label className="form-label" htmlFor="email">{t('loginEmailLabel')}</label>
                  <div className="input-wrapper">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="input-icon-left"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="form-input has-left"
                      placeholder="you@example.com"
                      required
                      autoComplete="email"
                    />
                  </div>
                </div>

                <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading} style={{ marginTop: '0.5rem' }}>
                  {loading ? <><span className="spinner" />{t('forgotSending')}</> : t('forgotSendLink')}
                </button>
              </form>

              <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                {t('forgotRemember')}{' '}
                <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>{t('loginSignIn')}</Link>
              </p>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
