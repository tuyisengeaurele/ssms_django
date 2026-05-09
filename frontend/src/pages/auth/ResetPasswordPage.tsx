import { useState, FormEvent } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { authService } from '../../services/auth.service';
import { useApiError } from '../../hooks/useApiError';
import { useToast } from '../../context/ToastContext';

const PASSWORD_RULES = [
  { test: (v: string) => v.length >= 8,         label: 'At least 8 characters' },
  { test: (v: string) => /[A-Z]/.test(v),       label: 'One uppercase letter' },
  { test: (v: string) => /[a-z]/.test(v),       label: 'One lowercase letter' },
  { test: (v: string) => /\d/.test(v),           label: 'One number' },
];

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { success } = useToast();
  const { getErrorMessage } = useApiError();

  const uid   = searchParams.get('uid')   ?? '';
  const token = searchParams.get('token') ?? '';

  const [password,  setPassword]  = useState('');
  const [showPwd,   setShowPwd]   = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  const allRulesPass = PASSWORD_RULES.every(r => r.test(password));

  if (!uid || !token) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', background: 'var(--bg)' }}>
        <div style={{ width: 60, height: 60, borderRadius: 16, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <h1 style={{ fontWeight: 800 }}>Invalid Reset Link</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>This password reset link is invalid or has expired.</p>
        <Link to="/forgot-password" className="btn btn-primary btn-sm">Request new link</Link>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!allRulesPass) return;
    setError('');
    setLoading(true);
    try {
      await authService.confirmPasswordReset({ uid, token, newPassword: password });
      success('Password reset! You can now sign in.');
      navigate('/login', { replace: true });
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
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.2 }}>
            Set New Password
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.875rem', lineHeight: 1.6, marginTop: '0.625rem' }}>
            Choose a strong password to secure your SSMS account.
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
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', marginBottom: '0.375rem' }}>
              New password
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Enter and confirm your new password below.
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
              <label className="form-label" htmlFor="password">New password</label>
              <div className="input-wrapper">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="input-icon-left"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="form-input has-left has-right"
                  placeholder="Min 8 chars, uppercase, digit"
                  required
                  autoComplete="new-password"
                />
                <button type="button" className="input-icon-right" onClick={() => setShowPwd(s => !s)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 0 }}>
                  {showPwd
                    ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>

            {/* Password strength rules */}
            {password.length > 0 && (
              <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {PASSWORD_RULES.map((rule, i) => {
                  const pass = rule.test(password);
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
                      <span style={{ width: 14, height: 14, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: pass ? '#f0fdf4' : '#fef2f2', flexShrink: 0 }}>
                        {pass
                          ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                          : <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        }
                      </span>
                      <span style={{ color: pass ? '#16a34a' : 'var(--text-faint)' }}>{rule.label}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading || !allRulesPass} style={{ marginTop: '0.25rem' }}>
              {loading ? <><span className="spinner" />Resetting…</> : 'Reset password'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Remembered it?{' '}
            <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>Sign in</Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
