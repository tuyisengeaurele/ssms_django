import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { authService } from '../../services/auth.service';
import { useAuth } from '../../context/AuthContext';
import { useApiError } from '../../hooks/useApiError';

export default function RegisterPage() {
  const [form,    setForm]    = useState({ name: '', email: '', password: '', role: 'FARMER' });
  const [showPwd, setShowPwd] = useState(false);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const { login }  = useAuth();
  const navigate   = useNavigate();
  const { getErrorMessage } = useApiError();

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authService.register(form);
      const { user, token } = res.data.data;
      login(user, token);
      const path = user.role === 'ADMIN' ? '/admin' : user.role === 'SUPERVISOR' ? '/supervisor' : '/farmer';
      navigate(path, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const ROLES = [
    { value: 'FARMER',     label: 'Farmer',     desc: 'Manage your farms and batches' },
    { value: 'SUPERVISOR', label: 'Supervisor',  desc: 'Monitor all farms & production' },
    { value: 'ADMIN',      label: 'Admin',       desc: 'Full system access & user management' },
  ];

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
            Join SSMS
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.875rem', lineHeight: 1.6 }}>
            Create your account and start monitoring your sericulture operations with AI-powered insights.
          </p>
          <div style={{ marginTop: '2rem', display: 'flex', gap: '0.875rem', justifyContent: 'center' }}>
            {['🌿', '🔬', '📊', '🚨'].map((icon, i) => (
              <motion.div key={i}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}
              >
                {icon}
              </motion.div>
            ))}
          </div>
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
          <div style={{ marginBottom: '1.75rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', marginBottom: '0.375rem' }}>
              Create account
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Fill in your details to get started
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
              <label className="form-label" htmlFor="name">Full name</label>
              <div className="input-wrapper">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="input-icon-left"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <input id="name" type="text" value={form.name} onChange={set('name')} className="form-input has-left" placeholder="Your full name" required autoComplete="name" />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-email">Email address</label>
              <div className="input-wrapper">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="input-icon-left"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                <input id="reg-email" type="email" value={form.email} onChange={set('email')} className="form-input has-left" placeholder="you@example.com" required autoComplete="email" />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-password">Password</label>
              <div className="input-wrapper">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="input-icon-left"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <input id="reg-password" type={showPwd ? 'text' : 'password'} value={form.password} onChange={set('password')} className="form-input has-left has-right" placeholder="Min 8 chars, uppercase, digit" required autoComplete="new-password" />
                <button type="button" className="input-icon-right" onClick={() => setShowPwd(s => !s)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 0 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </div>
              <span className="form-hint">Min 8 characters, one uppercase, one digit</span>
            </div>

            <div className="form-group">
              <label className="form-label">Role</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {ROLES.map(r => (
                  <label key={r.value} style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.65rem 0.875rem', border: '1.5px solid',
                    borderColor: form.role === r.value ? 'var(--brand-400)' : 'var(--border)',
                    borderRadius: 'var(--radius-md)', cursor: 'pointer',
                    background: form.role === r.value ? 'var(--brand-50)' : 'var(--surface)',
                    transition: 'all 0.15s',
                  }}>
                    <input type="radio" name="role" value={r.value} checked={form.role === r.value}
                      onChange={set('role')} style={{ accentColor: 'var(--primary)', width: 15, height: 15 }} />
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>{r.label}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{r.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading} style={{ marginTop: '0.25rem' }}>
              {loading ? <><span className="spinner" />Creating account…</> : 'Create account'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>Sign in</Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
